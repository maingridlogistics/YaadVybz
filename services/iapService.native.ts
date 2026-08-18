
// ─── Vybz Hub IAP Service — Native (expo-iap 5.1.0, iOS + Android) ───────────
//
// MODEL: Lifetime Pro non-consumable ($49.99 one-time) + Boost consumables.
//
// Subscriptions have been removed. The monetization model is:
//   • com.vybzhub.pro.lifetime  — NON-CONSUMABLE, Apple type: in-app (non-consumable)
//   • com.vybzhub.boost.*       — CONSUMABLE in-app purchases (unchanged)
//
// ─── CRITICAL API CONTRACT (expo-iap 5.1.0) ──────────────────────────────────
//
// requestPurchase() in expo-iap 5.1.0 is EVENT-BASED.
// The completed Purchase (with purchaseToken as iOS JWS) arrives exclusively
// through purchaseUpdatedListener. requestPurchase() return value is DISCARDED.
//
// ─── iOS JWS FIELD (expo-iap 5.1.0) ─────────────────────────────────────────
//
// Primary:  purchase.purchaseToken  (iOS JWS / Android token)
// Fallback: getTransactionJwsIOS(purchase.productId)
//
// ─── SECURITY RULES ──────────────────────────────────────────────────────────
//   • NEVER grant entitlements based on purchase() returning success on-device.
//   • NEVER call finishTransaction before server verification succeeds.
//   • appAccountToken = userId links purchase to the Vybz Hub account.

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode,
} from 'expo-iap';
import type { Product, Purchase, PurchaseError, RequestPurchaseProps } from 'expo-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Product IDs ───────────────────────────────────────────────────────────────

export const LIFETIME_PRO_PRODUCT_ID = 'com.vybzhub.pro.lifetime' as const;
export type LifetimeProProductId = typeof LIFETIME_PRO_PRODUCT_ID;

export const BOOST_PRODUCT_IDS = [
  'com.vybzhub.boost.three_day',
  'com.vybzhub.boost.seven_day',
  'com.vybzhub.boost.until_event_end',
] as const;

export type BoostProductId = (typeof BOOST_PRODUCT_IDS)[number];
export type AppleBoostProductId = BoostProductId;

// Legacy aliases kept for any remaining imports in other files
export type SubscriptionProductId = LifetimeProProductId;
export type AppleSubscriptionProductId = LifetimeProProductId;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  localizedPrice: string;
  price: number;
  currency: string;
  isSubscription: boolean;
  subscriptionPeriod?: string;
}

export interface IAPPurchaseResult {
  ok: boolean;
  transactionId?: string;
  environment?: string;
  tier?: string;
  boostType?: string;
  boostExpiresAt?: string | null;
  cached?: boolean;
  active?: boolean;
  error?: string;
}

export interface IAPRestoreResult {
  ok: boolean;
  restoredTier?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOOST_IDS_ARRAY = BOOST_PRODUCT_IDS as readonly string[];

function extractIOSJWS(purchase: Purchase): string | null {
  if (!purchase) return null;
  const p = purchase as unknown as Record<string, unknown>;
  const jws = (p.purchaseToken as string | undefined) ?? null;
  return jws && jws.split('.').length === 3 ? jws : null;
}

async function tryGetTransactionJwsIOS(purchase: Purchase): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const p = purchase as unknown as Record<string, unknown>;
    const productId =
      (p.productId as string | undefined) ??
      (p.sku as string | undefined) ??
      null;
    if (!productId) return null;
    const expoIap = await import('expo-iap') as Record<string, unknown>;
    if (typeof expoIap.getTransactionJwsIOS !== 'function') return null;
    const jws = await (expoIap.getTransactionJwsIOS as (sku: string) => Promise<string | null>)(productId);
    return jws && jws.split('.').length === 3 ? jws : null;
  } catch {
    return null;
  }
}

function extractAndroidToken(purchase: Purchase): string | null {
  if (!purchase) return null;
  const p = purchase as unknown as Record<string, unknown>;
  return (p.purchaseTokenAndroid as string | undefined) ?? null;
}

function getPurchaseProductId(purchase: Purchase): string | null {
  const p = purchase as unknown as Record<string, unknown>;
  return (p.productId as string | undefined) ?? null;
}

function isUserCancelled(err: PurchaseError): boolean {
  return (err as any)?.code === ErrorCode.UserCancelled;
}

function isDeferredPayment(err: PurchaseError): boolean {
  return (err as any)?.code === ErrorCode.DeferredPayment;
}

function mapProduct(p: Product): IAPProduct {
  const prod = p as unknown as Record<string, any>;
  return {
    productId: prod.productId ?? prod.id,
    title: prod.title ?? prod.productId ?? prod.id,
    description: prod.description ?? '',
    localizedPrice: prod.localizedPrice ?? prod.displayPrice ?? '',
    price: parseFloat(String(prod.price ?? '0')),
    currency: prod.currency ?? 'USD',
    isSubscription: false,
  };
}

function buildPurchaseRequest(productId: string, userId: string) {
  return {
    request: {
      apple: {
        sku: productId,
        appAccountToken: userId.toLowerCase(),
        andDangerouslyFinishTransactionAutomatically: false,
      },
      google: {
        skus: [productId],
        obfuscatedAccountIdAndroid: userId,
      },
    },
  };
}

// ─── Server verification ──────────────────────────────────────────────────────

async function invokeVerify(fn: string, body: Record<string, unknown>): Promise<IAPPurchaseResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase.functions.invoke(fn, { body });

  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const status = (error as any).context?.status ?? 500;
        const text = await (error as any).context?.text?.();
        detail = `[${status}] ${text || error.message}`;
      } catch { /* noop */ }
    }
    return { ok: false, error: detail };
  }

  return data as IAPPurchaseResult;
}

async function verifyAppleLifetimeProWithServer(signedTransaction: string): Promise<IAPPurchaseResult> {
  return invokeVerify('verify-apple-transaction', {
    signedTransaction,
    purchaseType: 'non_consumable',
  });
}

async function verifyAppleBoostWithServer(params: {
  signedTransaction: string;
  eventId: string;
}): Promise<IAPPurchaseResult> {
  return invokeVerify('verify-apple-transaction', {
    signedTransaction: params.signedTransaction,
    purchaseType: 'consumable',
    eventId: params.eventId,
  });
}

async function verifyGoogleBoostWithServer(params: {
  purchaseToken: string;
  productId: string;
  eventId: string;
}): Promise<IAPPurchaseResult> {
  return invokeVerify('verify-google-purchase', {
    purchaseToken: params.purchaseToken,
    productId: params.productId,
    purchaseType: 'consumable',
    eventId: params.eventId,
  });
}

// ─── IAP lifecycle ────────────────────────────────────────────────────────────

let connectionInitialized = false;

export async function initIAP(): Promise<void> {
  if (connectionInitialized) return;
  try {
    await initConnection();
    connectionInitialized = true;
    console.log('[iapService] IAP connection initialized');
  } catch (e) {
    console.error('[iapService] initConnection failed:', String(e));
    throw e;
  }
}

export async function teardownIAP(): Promise<void> {
  if (!connectionInitialized) return;
  try { await endConnection(); } catch { /* noop */ }
  connectionInitialized = false;
}

// ─── Product loading ──────────────────────────────────────────────────────────

/** Load the lifetime Pro non-consumable product from StoreKit. */
export async function loadProProduct(): Promise<IAPProduct | null> {
  try {
    const products = await fetchProducts({ skus: [LIFETIME_PRO_PRODUCT_ID], type: 'in-app' });
    const list = (products as Product[]).map(mapProduct);
    return list[0] ?? null;
  } catch (e) {
    console.error('[iapService] loadProProduct failed:', String(e));
    return null;
  }
}

export async function loadBoostProducts(): Promise<IAPProduct[]> {
  try {
    const products = await fetchProducts({ skus: [...BOOST_PRODUCT_IDS], type: 'in-app' });
    return (products as Product[]).map(mapProduct);
  } catch (e) {
    console.error('[iapService] loadBoostProducts failed:', String(e));
    return [];
  }
}

export async function loadAllProducts(): Promise<{ proProduct: IAPProduct | null; boosts: IAPProduct[] }> {
  const [proProduct, boosts] = await Promise.all([loadProProduct(), loadBoostProducts()]);
  return { proProduct, boosts };
}

// Legacy compat
export async function loadSubscriptionProducts(): Promise<IAPProduct[]> {
  const p = await loadProProduct();
  return p ? [p] : [];
}

// ─── Foreground purchase guard ────────────────────────────────────────────────

const _foregroundProductIds = new Set<string>();

async function resolveJWS(purchase: Purchase): Promise<string | null> {
  const direct = extractIOSJWS(purchase);
  if (direct) return direct;
  return tryGetTransactionJwsIOS(purchase);
}

// ─── Generic foreground purchase helper ──────────────────────────────────────

const PURCHASE_TIMEOUT_MS = 120_000;

interface ForegroundPurchaseOptions {
  productId: string;
  purchaseType: 'in-app';
  userId: string;
  onVerify: (purchase: Purchase, jwsOrToken: string) => Promise<IAPPurchaseResult>;
}

function foregroundPurchase(opts: ForegroundPurchaseOptions): Promise<IAPPurchaseResult> {
  const { productId, purchaseType, userId, onVerify } = opts;

  return new Promise<IAPPurchaseResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let updateSub: { remove: () => void } | null = null;
    let errorSub: { remove: () => void } | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      updateSub?.remove();
      errorSub?.remove();
      _foregroundProductIds.delete(productId);
    };

    const settle = (result: IAPPurchaseResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    _foregroundProductIds.add(productId);

    timer = setTimeout(() => {
      console.warn('[iapService] foregroundPurchase timeout for', productId);
      settle({ ok: false, error: 'Purchase timed out. Please try again.' });
    }, PURCHASE_TIMEOUT_MS);

    updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      const pId = getPurchaseProductId(purchase);
      if (pId !== productId) return;

      if (Platform.OS === 'ios') {
        const jws = await resolveJWS(purchase);
        if (!jws) {
          console.error('[iapService] foreground listener: JWS absent for', productId);
          settle({ ok: false, error: 'Transaction data unavailable for verification' });
          return;
        }
        const result = await onVerify(purchase, jws);
        settle(result);
      } else {
        const token = extractAndroidToken(purchase);
        if (!token) {
          settle({ ok: false, error: 'Purchase token unavailable — verification failed' });
          return;
        }
        const result = await onVerify(purchase, token);
        settle(result);
      }
    });

    errorSub = purchaseErrorListener((error) => {
      const err = error as PurchaseError;
      if (isUserCancelled(err)) {
        settle({ ok: false, error: 'Purchase cancelled' });
      } else if (isDeferredPayment(err)) {
        settle({ ok: false, error: 'Purchase pending parental approval' });
      } else {
        console.error('[iapService] purchaseErrorListener for', productId, String(err));
        settle({ ok: false, error: err?.message ?? 'Purchase failed' });
      }
    });

    requestPurchase({
      ...buildPurchaseRequest(productId, userId),
      type: purchaseType,
    } as RequestPurchaseProps).catch((e: unknown) => {
      const err = e as PurchaseError;
      if (isUserCancelled(err)) {
        settle({ ok: false, error: 'Purchase cancelled' });
      } else if (isDeferredPayment(err)) {
        settle({ ok: false, error: 'Purchase pending parental approval' });
      } else {
        console.error('[iapService] requestPurchase rejected for', productId, String(e));
        settle({ ok: false, error: err?.message ?? 'Purchase failed' });
      }
    });
  });
}

// ─── Lifetime Pro purchase ────────────────────────────────────────────────────

export function purchaseLifetimePro(userId: string): Promise<IAPPurchaseResult> {
  return foregroundPurchase({
    productId: LIFETIME_PRO_PRODUCT_ID,
    purchaseType: 'in-app',
    userId,
    onVerify: async (purchase, jws) => {
      // iOS only for non-consumable lifetime Pro
      const result = await verifyAppleLifetimeProWithServer(jws);
      if (result.ok) {
        try { await finishTransaction({ purchase, isConsumable: false }); } catch (e) {
          console.warn('[iapService] finishTransaction lifetimePro failed:', String(e));
        }
      } else {
        console.error('[iapService] Lifetime Pro server verification failed — NOT finished:', result.error);
      }
      return result;
    },
  });
}

// Legacy alias so existing IAPContext usage compiles without change
export function purchaseAppleSubscription(
  _productId: string,
  userId: string,
): Promise<IAPPurchaseResult> {
  return purchaseLifetimePro(userId);
}

// ─── Boost consumable purchase ────────────────────────────────────────────────

export function purchaseAppleBoost(
  productId: BoostProductId,
  userId: string,
  eventId: string,
): Promise<IAPPurchaseResult> {
  return foregroundPurchase({
    productId,
    purchaseType: 'in-app',
    userId,
    onVerify: async (purchase, jwsOrToken) => {
      let result: IAPPurchaseResult;
      if (Platform.OS === 'ios') {
        result = await verifyAppleBoostWithServer({ signedTransaction: jwsOrToken, eventId });
      } else {
        result = await verifyGoogleBoostWithServer({ purchaseToken: jwsOrToken, productId, eventId });
      }
      if (result.ok) {
        try { await finishTransaction({ purchase, isConsumable: true }); } catch (e) {
          console.warn('[iapService] finishTransaction boost failed:', String(e));
        }
      } else {
        console.error('[iapService] Boost server verification failed — NOT finished:', result.error);
      }
      return result;
    },
  });
}

// ─── Business Promotion consumable purchase ───────────────────────────────────

export function purchaseAppleBusinessPromotion(
  productId: string,
  userId: string,
  promotionId: string,
): Promise<IAPPurchaseResult> {
  return foregroundPurchase({
    productId,
    purchaseType: 'in-app',
    userId,
    onVerify: async (purchase, jws) => {
      const result = await invokeVerify('verify-apple-business-promotion', {
        signedTransaction: jws,
        promotionId,
      });
      if (result.ok) {
        try { await finishTransaction({ purchase, isConsumable: true }); } catch (e) {
          console.warn('[iapService] finishTransaction bizpromo failed:', String(e));
        }
      } else {
        console.error('[iapService] BizPromo server verification failed — NOT finished:', result.error);
      }
      return result;
    },
  });
}

// ─── Restore Lifetime Pro ─────────────────────────────────────────────────────
//
// Non-consumable purchases appear in getAvailablePurchases() on iOS.
// We look for the lifetime Pro product ID, verify the JWS with the server,
// and let the server write lifetime_pro_owned = true if not already set.

export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    for (const purchase of (purchases as Purchase[])) {
      const pId = getPurchaseProductId(purchase);
      if (pId !== LIFETIME_PRO_PRODUCT_ID) continue;

      if (Platform.OS === 'ios') {
        const jws = await resolveJWS(purchase);
        if (!jws) { console.warn('[iapService] Restore: no JWS for lifetime pro'); continue; }
        const result = await verifyAppleLifetimeProWithServer(jws);
        if (result.ok) {
          console.log(`[iapService] Lifetime Pro restored: user=${userId.slice(0, 8)}`);
          return { ok: true, restoredTier: 'pro' };
        }
      }
    }

    return { ok: true }; // No lifetime Pro found
  } catch (e: unknown) {
    console.error('[iapService] restoreApplePurchases failed:', String(e));
    return { ok: false, error: (e as Error)?.message ?? 'Restore failed' };
  }
}

// ─── Background transaction listener ─────────────────────────────────────────

export function setupTransactionListener(
  _userId: string,
  onResult: (result: IAPPurchaseResult) => void,
  eventId?: string,
): () => void {
  const updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    const pId = getPurchaseProductId(purchase);
    if (!pId) return;

    const isLifetimePro = pId === LIFETIME_PRO_PRODUCT_ID;
    const isBoost = BOOST_IDS_ARRAY.includes(pId);
    if (!isLifetimePro && !isBoost) return;

    if (_foregroundProductIds.has(pId)) {
      console.log('[iapService] background listener: skipping foreground-handled product', pId);
      return;
    }

    let result: IAPPurchaseResult;

    if (Platform.OS === 'ios') {
      const jws = await resolveJWS(purchase);
      if (!jws) {
        console.warn('[iapService] background listener: JWS absent for', pId, '— will retry on next launch');
        return;
      }

      if (isLifetimePro) {
        result = await verifyAppleLifetimeProWithServer(jws);
      } else if (eventId) {
        result = await verifyAppleBoostWithServer({ signedTransaction: jws, eventId });
      } else {
        console.warn('[iapService] background listener: no eventId for boost product', pId);
        return;
      }
    } else {
      const token = extractAndroidToken(purchase);
      if (!token) {
        console.warn('[iapService] background listener: missing Android token for', pId, '— skipping');
        return;
      }

      if (isBoost && eventId) {
        result = await verifyGoogleBoostWithServer({ purchaseToken: token, productId: pId, eventId });
      } else {
        console.warn('[iapService] background listener: unhandled product', pId);
        return;
      }
    }

    if (result.ok) {
      try { await finishTransaction({ purchase, isConsumable: isBoost }); } catch (e) {
        console.warn('[iapService] background finishTransaction failed:', String(e));
      }
    }
    onResult(result);
  });

  const errorSub = purchaseErrorListener((error) => {
    const err = error as PurchaseError;
    if (!isUserCancelled(err)) {
      console.warn('[iapService] background purchaseErrorListener:', err.message);
      onResult({ ok: false, error: err.message ?? 'Purchase error' });
    }
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
