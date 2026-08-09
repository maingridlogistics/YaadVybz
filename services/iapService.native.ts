// ─── Vybz Hub IAP Service — Native (expo-iap, iOS + Android) ─────────────────
//
// This file is selected by Metro for iOS and Android builds.
// services/iapService.web.ts is used for web.
//
// Architecture overview:
//   1. Load products from the store (Apple StoreKit 2 / Google Play Billing)
//   2. Initiate purchase via requestPurchase({ request: { ios, android }, type })
//   3. purchaseUpdatedListener fires with the completed purchase
//   4. Send platform-specific proof (iOS: signed JWS / Android: purchase token)
//      to the matching Edge Function for server-side verification
//   5. ONLY on { ok: true } from server: call finishTransaction
//   6. Server writes entitlements to user_profiles via _shared/entitlements.ts
//   7. Client reads entitlements from user_profiles via AuthContext.refreshProfile()
//
// SECURITY RULES:
//   • NEVER grant entitlements based on purchase() returning success on-device
//   • NEVER call finishTransaction before server verification succeeds
//   • appAccountToken / obfuscatedAccountIdAndroid = userId links the purchase
//     to the Vybz Hub account so the server can verify ownership

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
import type { Product, ProductSubscription, Purchase, PurchaseError } from 'expo-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Product IDs ───────────────────────────────────────────────────────────────

export const SUBSCRIPTION_PRODUCT_IDS = [
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

export type SubscriptionProductId = (typeof SUBSCRIPTION_PRODUCT_IDS)[number];
export type BoostProductId = (typeof BOOST_PRODUCT_IDS)[number];
export type AppleSubscriptionProductId = SubscriptionProductId;
export type AppleBoostProductId = BoostProductId;

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
  error?: string;
}

export interface IAPRestoreResult {
  ok: boolean;
  restoredTier?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBSCRIPTION_IDS_ARRAY = SUBSCRIPTION_PRODUCT_IDS as readonly string[];
const BOOST_IDS_ARRAY = BOOST_PRODUCT_IDS as readonly string[];

function extractIOSJWS(purchase: Purchase): string | null {
  const p = purchase as unknown as Record<string, unknown>;
  const jws = (p.jwsRepresentationIos as string | undefined) ?? null;
  return jws && jws.split('.').length === 3 ? jws : null;
}

function extractAndroidToken(purchase: Purchase): string | null {
  const p = purchase as unknown as Record<string, unknown>;
  return (p.purchaseTokenAndroid as string | undefined) ?? null;
}

function isUserCancelled(err: PurchaseError): boolean {
  return (err as any)?.code === ErrorCode.UserCancelled;
}

function isDeferredPayment(err: PurchaseError): boolean {
  return (err as any)?.code === ErrorCode.DeferredPayment;
}

function mapSub(sub: ProductSubscription): IAPProduct {
  const s = sub as unknown as Record<string, any>;
  return {
    productId: s.productId ?? s.id,
    title: s.title ?? s.productId ?? s.id,
    description: s.description ?? '',
    localizedPrice: s.localizedPrice ?? s.displayPrice ?? '',
    price: parseFloat(String(s.price ?? '0')),
    currency: s.currency ?? 'USD',
    isSubscription: true,
    subscriptionPeriod: s.subscriptionPeriodUnitIOS ?? s.subscriptionPeriodAndroid,
  };
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
      ios: {
        sku: productId,
        appAccountToken: userId.toLowerCase(),
        andDangerouslyFinishTransactionAutomatically: false,
      },
      android: {
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

async function verifyAppleWithServer(params: {
  signedTransaction: string;
  purchaseType: 'subscription' | 'consumable';
  eventId?: string;
}): Promise<IAPPurchaseResult> {
  return invokeVerify('verify-apple-transaction', params);
}

async function verifyGoogleWithServer(params: {
  purchaseToken: string;
  productId: string;
  purchaseType: 'subscription' | 'consumable';
  eventId?: string;
}): Promise<IAPPurchaseResult> {
  return invokeVerify('verify-google-purchase', params);
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

export async function loadSubscriptionProducts(): Promise<IAPProduct[]> {
  try {
    const subs = await fetchProducts({ skus: [...SUBSCRIPTION_PRODUCT_IDS], type: 'subs' });
    return (subs as ProductSubscription[]).map(mapSub);
  } catch (e) {
    console.error('[iapService] loadSubscriptionProducts failed:', String(e));
    return [];
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

export async function loadAllProducts(): Promise<{ subscriptions: IAPProduct[]; boosts: IAPProduct[] }> {
  const [subscriptions, boosts] = await Promise.all([loadSubscriptionProducts(), loadBoostProducts()]);
  return { subscriptions, boosts };
}

// ─── Subscription purchase ────────────────────────────────────────────────────

export async function purchaseAppleSubscription(
  productId: SubscriptionProductId,
  userId: string,
): Promise<IAPPurchaseResult> {
  let purchase: Purchase;
  try {
    purchase = (await requestPurchase({
      ...buildPurchaseRequest(productId, userId),
      type: 'subs',
    })) as Purchase;
  } catch (e: unknown) {
    const err = e as PurchaseError;
    if (isUserCancelled(err)) return { ok: false, error: 'Purchase cancelled' };
    if (isDeferredPayment(err)) return { ok: false, error: 'Purchase pending parental approval' };
    console.error('[iapService] requestPurchase (subscription) failed:', String(e));
    return { ok: false, error: err?.message ?? 'Purchase failed' };
  }

  let result: IAPPurchaseResult;
  if (Platform.OS === 'ios') {
    const jws = extractIOSJWS(purchase);
    if (!jws) return { ok: false, error: 'Transaction data unavailable for verification' };
    result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
  } else {
    const token = extractAndroidToken(purchase);
    if (!token) return { ok: false, error: 'Purchase token unavailable — verification failed' };
    result = await verifyGoogleWithServer({ purchaseToken: token, productId, purchaseType: 'subscription' });
  }

  if (result.ok) {
    try { await finishTransaction({ purchase, isConsumable: false }); } catch (e) {
      console.warn('[iapService] finishTransaction subscription failed:', String(e));
    }
  } else {
    console.error('[iapService] Server verification failed — transaction NOT finished:', result.error);
  }
  return result;
}

// ─── Boost consumable purchase ────────────────────────────────────────────────

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
    })) as Purchase;
  } catch (e: unknown) {
    const err = e as PurchaseError;
    if (isUserCancelled(err)) return { ok: false, error: 'Purchase cancelled' };
    if (isDeferredPayment(err)) return { ok: false, error: 'Purchase pending parental approval' };
    console.error('[iapService] requestPurchase (boost) failed:', String(e));
    return { ok: false, error: err?.message ?? 'Purchase failed' };
  }

  let result: IAPPurchaseResult;
  if (Platform.OS === 'ios') {
    const jws = extractIOSJWS(purchase);
    if (!jws) return { ok: false, error: 'Transaction data unavailable for verification' };
    result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId });
  } else {
    const token = extractAndroidToken(purchase);
    if (!token) return { ok: false, error: 'Purchase token unavailable — verification failed' };
    result = await verifyGoogleWithServer({ purchaseToken: token, productId, purchaseType: 'consumable', eventId });
  }

  if (result.ok) {
    try { await finishTransaction({ purchase, isConsumable: true }); } catch (e) {
      console.warn('[iapService] finishTransaction boost failed:', String(e));
    }
  } else {
    console.error('[iapService] Boost server verification failed — NOT finished:', result.error);
  }
  return result;
}

// ─── Restore purchases ────────────────────────────────────────────────────────

export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    let restoredTier: string | undefined;

    for (const purchase of (purchases as Purchase[])) {
      const pId = (purchase as any).productId as string | undefined;
      if (!pId || !SUBSCRIPTION_IDS_ARRAY.includes(pId)) continue;

      let result: IAPPurchaseResult;
      if (Platform.OS === 'ios') {
        const jws = extractIOSJWS(purchase);
        if (!jws) { console.warn('[iapService] Restore: no JWS for', pId); continue; }
        result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
      } else {
        const token = extractAndroidToken(purchase);
        if (!token) continue;
        result = await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'subscription' });
      }

      if (result.ok && result.tier) {
        restoredTier = result.tier;
        console.log(`[iapService] Restored: user=${userId.slice(0, 8)} tier=${result.tier} cached=${result.cached}`);
      }
    }

    return { ok: true, restoredTier };
  } catch (e: unknown) {
    console.error('[iapService] restorePurchases failed:', String(e));
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
    const pId = (purchase as any).productId as string | undefined;
    if (!pId) return;

    const isSubscription = SUBSCRIPTION_IDS_ARRAY.includes(pId);
    const isBoost = BOOST_IDS_ARRAY.includes(pId);
    if (!isSubscription && !isBoost) return;

    let result: IAPPurchaseResult;

    if (Platform.OS === 'ios') {
      const jws = extractIOSJWS(purchase);
      if (!jws) { onResult({ ok: false, error: 'Transaction data unavailable' }); return; }

      if (isSubscription) {
        result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
      } else if (eventId) {
        result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId });
      } else {
        result = { ok: false, error: 'No event context for boost' };
      }
    } else {
      const token = extractAndroidToken(purchase);
      if (!token) { onResult({ ok: false, error: 'Purchase token unavailable' }); return; }

      if (isSubscription) {
        result = await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'subscription' });
      } else if (eventId) {
        result = await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'consumable', eventId });
      } else {
        result = { ok: false, error: 'No event context for boost' };
      }
    }

    if (result.ok) {
      try { await finishTransaction({ purchase, isConsumable: isBoost }); } catch (e) {
        console.warn('[iapService] background finishTransaction failed:', String(e));
      }
    }
    onResult(result);
  });

  const errorSub = purchaseErrorListener((error: PurchaseError) => {
    if (!isUserCancelled(error)) {
      onResult({ ok: false, error: error.message ?? 'Purchase error' });
    }
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
