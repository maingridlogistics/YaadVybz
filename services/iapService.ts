// ─── Vybz Hub IAP Service — Unified fallback ─────────────────────────────────
//
// Metro resolves platform-specific extensions first:
//   iOS/Android  → services/iapService.native.ts
//   Web          → services/iapService.web.ts
//   Other        → this file (syntactically valid fallback)
//
// This file must remain syntactically valid so Metro can parse it during
// the module graph traversal regardless of which platform is targeted.
//
// MONETIZATION MODEL (updated):
//   • com.vybzhub.pro.lifetime — NON-CONSUMABLE one-time $49.99 lifetime Pro
//   • com.vybzhub.boost.*     — CONSUMABLE in-app boosts (unchanged)
//   • Elite = admin-granted only, not purchasable
//   • Old subscription SKUs are preserved for legacy/audit only — NOT offered.

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

/** Legacy subscription IDs — preserved for audit/historical lookups only. NOT offered to customers. */
export const LEGACY_SUBSCRIPTION_PRODUCT_IDS = [
  'com.vybzhub.subscription.promoter_pro.monthly',
  'com.vybzhub.subscription.promoter_pro.yearly',
  'com.vybzhub.subscription.elite.monthly',
  'com.vybzhub.subscription.elite.yearly',
] as const;

export const BOOST_PRODUCT_IDS = [
  'com.vybzhub.boost.three_day',
  'com.vybzhub.boost.seven_day',
  'com.vybzhub.boost.until_event_end',
] as const;

export type BoostProductId = (typeof BOOST_PRODUCT_IDS)[number];
export type SubscriptionProductId = LifetimeProProductId;
export type AppleSubscriptionProductId = LifetimeProProductId;
export type AppleBoostProductId = BoostProductId;

const BOOST_PRODUCT_ID_SET = new Set<string>(BOOST_PRODUCT_IDS);

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

function extractIOSJWS(purchase: Purchase): string | null {
  const p = purchase as unknown as Record<string, unknown>;
  const jws = (p.purchaseToken as string | undefined) ?? null;
  return jws && jws.split('.').length === 3 ? jws : null;
}

function extractAndroidToken(purchase: Purchase): string | null {
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

// ─── Server Verification ──────────────────────────────────────────────────────

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

// ─── IAP Lifecycle ────────────────────────────────────────────────────────────

let connectionInitialized = false;

export async function initIAP(): Promise<void> {
  if (connectionInitialized) return;
  try {
    await initConnection();
    connectionInitialized = true;
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

// ─── Product Loading ──────────────────────────────────────────────────────────

export async function loadProProduct(): Promise<IAPProduct | null> {
  try {
    const products = await fetchProducts({ skus: [LIFETIME_PRO_PRODUCT_ID], type: 'in-app' });
    return (products as Product[]).map(mapProduct)[0] ?? null;
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

/** Legacy compat alias */
export async function loadSubscriptionProducts(): Promise<IAPProduct[]> {
  const p = await loadProProduct();
  return p ? [p] : [];
}

// ─── Lifetime Pro Purchase ────────────────────────────────────────────────────

export async function purchaseLifetimePro(userId: string): Promise<IAPPurchaseResult> {
  let purchase: Purchase;
  try {
    purchase = (await requestPurchase({
      ...buildPurchaseRequest(LIFETIME_PRO_PRODUCT_ID, userId),
      type: 'in-app',
    } as RequestPurchaseProps)) as Purchase;
  } catch (e: unknown) {
    const err = e as PurchaseError;
    if (isUserCancelled(err)) return { ok: false, error: 'Purchase cancelled' };
    if (isDeferredPayment(err)) return { ok: false, error: 'Purchase pending parental approval' };
    return { ok: false, error: err?.message ?? 'Purchase failed' };
  }

  const jws = extractIOSJWS(purchase);
  if (!jws) return { ok: false, error: 'Transaction data unavailable for verification' };

  const result = await invokeVerify('verify-apple-transaction', {
    signedTransaction: jws,
    purchaseType: 'non_consumable',
  });

  if (result.ok) {
    try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* noop */ }
  }
  return result;
}

/** Legacy alias */
export async function purchaseAppleSubscription(
  _productId: string,
  userId: string,
): Promise<IAPPurchaseResult> {
  return purchaseLifetimePro(userId);
}

// ─── Boost Consumable Purchase ────────────────────────────────────────────────

export async function purchaseAppleBoost(
  productId: BoostProductId,
  userId: string,
  eventId: string,
): Promise<IAPPurchaseResult> {
  let purchase: Purchase;
  try {
    purchase = (await requestPurchase({
      ...buildPurchaseRequest(productId, userId),
      type: 'in-app',
    } as RequestPurchaseProps)) as Purchase;
  } catch (e: unknown) {
    const err = e as PurchaseError;
    if (isUserCancelled(err)) return { ok: false, error: 'Purchase cancelled' };
    if (isDeferredPayment(err)) return { ok: false, error: 'Purchase pending parental approval' };
    return { ok: false, error: err?.message ?? 'Purchase failed' };
  }

  let result: IAPPurchaseResult;
  if (Platform.OS === 'ios') {
    const jws = extractIOSJWS(purchase);
    if (!jws) return { ok: false, error: 'Transaction data unavailable for verification' };
    result = await invokeVerify('verify-apple-transaction', {
      signedTransaction: jws,
      purchaseType: 'consumable',
      eventId,
    });
  } else {
    const token = extractAndroidToken(purchase);
    if (!token) return { ok: false, error: 'Purchase token unavailable — verification failed' };
    result = await invokeVerify('verify-google-purchase', {
      purchaseToken: token,
      productId,
      purchaseType: 'consumable',
      eventId,
    });
  }

  if (result.ok) {
    try { await finishTransaction({ purchase, isConsumable: true }); } catch { /* noop */ }
  }
  return result;
}

// ─── Restore Lifetime Pro ─────────────────────────────────────────────────────

export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    for (const purchase of purchases as Purchase[]) {
      const pId = getPurchaseProductId(purchase);
      if (pId !== LIFETIME_PRO_PRODUCT_ID) continue;

      if (Platform.OS === 'ios') {
        const jws = extractIOSJWS(purchase);
        if (!jws) continue;
        const result = await invokeVerify('verify-apple-transaction', {
          signedTransaction: jws,
          purchaseType: 'non_consumable',
        });
        if (result.ok) return { ok: true, restoredTier: 'pro' };
      }
    }

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? 'Restore failed' };
  }
}

// ─── Background Transaction Listener ─────────────────────────────────────────

export function setupTransactionListener(
  _userId: string,
  onResult: (result: IAPPurchaseResult) => void,
  eventId?: string,
): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => {};

  const updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    const pId = getPurchaseProductId(purchase);
    if (!pId) return;

    const isLifetimePro = pId === LIFETIME_PRO_PRODUCT_ID;
    const isBoost = BOOST_PRODUCT_ID_SET.has(pId);
    if (!isLifetimePro && !isBoost) return;

    let result: IAPPurchaseResult;
    if (Platform.OS === 'ios') {
      const jws = extractIOSJWS(purchase);
      if (!jws) return;
      if (isLifetimePro) {
        result = await invokeVerify('verify-apple-transaction', {
          signedTransaction: jws,
          purchaseType: 'non_consumable',
        });
      } else if (eventId) {
        result = await invokeVerify('verify-apple-transaction', {
          signedTransaction: jws,
          purchaseType: 'consumable',
          eventId,
        });
      } else return;
    } else {
      const token = extractAndroidToken(purchase);
      if (!token || !isBoost || !eventId) return;
      result = await invokeVerify('verify-google-purchase', {
        purchaseToken: token,
        productId: pId,
        purchaseType: 'consumable',
        eventId,
      });
    }

    if (result.ok) {
      try { await finishTransaction({ purchase, isConsumable: isBoost }); } catch { /* noop */ }
    }
    onResult(result);
  });

  const errorSub = purchaseErrorListener((error) => {
    const err = error as PurchaseError;
    if (!isUserCancelled(err)) onResult({ ok: false, error: err.message ?? 'Purchase error' });
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
