// ─── Vybz Hub IAP Service — Cross-Platform (expo-iap) ─────────────────────────
//
// Migrated from react-native-iap (separate .ios.ts / .android.ts files) to
// expo-iap, which unifies both platforms behind one API. This single file now
// replaces services/iapService.ios.ts AND services/iapService.android.ts.
// Delete both of those files after this one is in place.
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
// SECURITY RULES (unchanged from the react-native-iap version):
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
  ErrorCode, // VERIFY: confirm this is the exported error-code enum/object name
} from 'expo-iap';
import type {
  Product,
  ProductSubscription,
  Purchase,
  PurchaseError,
} from 'expo-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Product IDs ───────────────────────────────────────────────────────────────
// Same IDs across both stores — registered identically in App Store Connect
// and Google Play Console.

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

export type SubscriptionProductId = typeof SUBSCRIPTION_PRODUCT_IDS[number];
export type BoostProductId        = typeof BOOST_PRODUCT_IDS[number];

// Preserve old type names so IAPContext.tsx (and anything else importing
// these) does not need to change.
export type AppleSubscriptionProductId = SubscriptionProductId;
export type AppleBoostProductId        = BoostProductId;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IAPProduct {
  productId:          string;
  title:              string;
  description:        string;
  localizedPrice:     string;
  price:              number;
  currency:           string;
  isSubscription:     boolean;
  subscriptionPeriod?: string;
}

export interface IAPPurchaseResult {
  ok:             boolean;
  transactionId?: string;
  environment?:   string;
  tier?:          string;
  boostType?:     string;
  boostExpiresAt?: string | null;
  cached?:        boolean;
  error?:         string;
}

export interface IAPRestoreResult {
  ok:           boolean;
  restoredTier?: string;
  error?:        string;
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function assertNativePlatform(): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('[iapService] IAP is only available on iOS and Android');
  }
}

// ─── Extract platform-specific verification proof from a purchase ─────────────

function extractIOSJWS(purchase: Purchase): string | null {
<<<<<<< HEAD
  const p = purchase as unknown as Record<string, unknown>;
=======
  const p = purchase as Record<string, unknown>;
>>>>>>> b5ab1c6 (Preserve local IAP and dependency changes before rebase)
  // VERIFY: confirm this field name against the installed expo-iap types.
  // Community reports confirm `jwsRepresentationIos` as of late-2025 releases.
  const jws = (p.jwsRepresentationIos as string | undefined) ?? null;
  return jws && jws.split('.').length === 3 ? jws : null;
}

function extractAndroidToken(purchase: Purchase): string | null {
<<<<<<< HEAD
  const p = purchase as unknown as Record<string, unknown>;
=======
  const p = purchase as Record<string, unknown>;
>>>>>>> b5ab1c6 (Preserve local IAP and dependency changes before rebase)
  // VERIFY: confirm this field name against the installed expo-iap types.
  // expo-iap suffixes platform-specific fields with "Android" to mirror the
  // "Ios" convention seen on jwsRepresentationIos — expected purchaseTokenAndroid.
  return (p.purchaseTokenAndroid as string | undefined) ?? null;
}

// ─── Server verification ──────────────────────────────────────────────────────

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

async function invokeVerify(fn: string, body: Record<string, unknown>): Promise<IAPPurchaseResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase.functions.invoke(fn, { body });

  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const status = (error as any).context?.status ?? 500;
        const text   = await (error as any).context?.text?.();
        detail = `[${status}] ${text || error.message}`;
      } catch { /* noop */ }
    }
    return { ok: false, error: detail };
  }

  return data as IAPPurchaseResult;
}

// ─── IAP lifecycle ────────────────────────────────────────────────────────────

let connectionInitialized = false;

export async function initIAP(): Promise<void> {
  assertNativePlatform();
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
  assertNativePlatform();
  try {
    const subs = await fetchProducts({ skus: [...SUBSCRIPTION_PRODUCT_IDS], type: 'subs' });
    return (subs as ProductSubscription[]).map(mapSub);
  } catch (e) {
    console.error('[iapService] loadSubscriptionProducts failed:', String(e));
    return [];
  }
}

export async function loadBoostProducts(): Promise<IAPProduct[]> {
  assertNativePlatform();
  try {
    const products = await fetchProducts({ skus: [...BOOST_PRODUCT_IDS], type: 'in-app' });
    return (products as Product[]).map(mapProduct);
  } catch (e) {
    console.error('[iapService] loadBoostProducts failed:', String(e));
    return [];
  }
}

export async function loadAllProducts(): Promise<{ subscriptions: IAPProduct[]; boosts: IAPProduct[] }> {
  const [subscriptions, boosts] = await Promise.all([
    loadSubscriptionProducts(),
    loadBoostProducts(),
  ]);
  return { subscriptions, boosts };
}

function mapSub(sub: ProductSubscription): IAPProduct {
  const s = sub as unknown as Record<string, any>;
  return {
    productId:          s.productId ?? s.id,
    title:              s.title ?? s.productId ?? s.id,
    description:        s.description ?? '',
    localizedPrice:     s.localizedPrice ?? s.displayPrice ?? '',
    price:              parseFloat(s.price ?? '0'),
    currency:           s.currency ?? 'USD',
    isSubscription:     true,
    subscriptionPeriod: s.subscriptionPeriodUnitIOS ?? s.subscriptionPeriodAndroid,
  };
}

function mapProduct(p: Product): IAPProduct {
  const prod = p as unknown as Record<string, any>;
  return {
    productId:      prod.productId ?? prod.id,
    title:          prod.title ?? prod.productId ?? prod.id,
    description:    prod.description ?? '',
    localizedPrice: prod.localizedPrice ?? prod.displayPrice ?? '',
    price:          parseFloat(prod.price ?? '0'),
    currency:       prod.currency ?? 'USD',
    isSubscription: false,
  };
}

// ─── Shared purchase request builder ───────────────────────────────────────────

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

function isUserCancelled(err: PurchaseError): boolean {
  // VERIFY: confirm exact ErrorCode member name against installed types.
  return (err as any)?.code === ErrorCode.UserCancelled;
}

function isDeferredPayment(err: PurchaseError): boolean {
  // VERIFY: confirm exact ErrorCode member name against installed types.
  return (err as any)?.code === ErrorCode.DeferredPayment;
}

// ─── Subscription purchase ────────────────────────────────────────────────────

/**
 * Purchase a subscription, then verify server-side.
 * transaction/finishTransaction is called ONLY after server confirms { ok: true }.
 */
export async function purchaseAppleSubscription(
  productId: SubscriptionProductId,
  userId:    string,
): Promise<IAPPurchaseResult> {
  assertNativePlatform();
  let purchase: Purchase;
  try {
    purchase = (await requestPurchase({
      ...buildPurchaseRequest(productId, userId),
      type: 'subs',
    })) as Purchase;
  } catch (e: any) {
    const err = e as PurchaseError;
    if (isUserCancelled(err))    return { ok: false, error: 'Purchase cancelled' };
    if (isDeferredPayment(err))  return { ok: false, error: 'Purchase pending parental approval' };
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
    try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* noop */ }
  } else {
    console.error('[iapService] Server verification failed — transaction NOT finished:', result.error);
  }
  return result;
}

// ─── Boost consumable purchase ────────────────────────────────────────────────

export async function purchaseAppleBoost(
  productId: BoostProductId,
  userId:    string,
  eventId:   string,
): Promise<IAPPurchaseResult> {
  assertNativePlatform();
  let purchase: Purchase;
  try {
    purchase = (await requestPurchase({
      ...buildPurchaseRequest(productId, userId),
      type: 'in-app',
    })) as Purchase;
  } catch (e: any) {
    const err = e as PurchaseError;
    if (isUserCancelled(err))    return { ok: false, error: 'Purchase cancelled' };
    if (isDeferredPayment(err))  return { ok: false, error: 'Purchase pending parental approval' };
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
    try { await finishTransaction({ purchase, isConsumable: true }); } catch { /* noop */ }
  } else {
    console.error('[iapService] Boost server verification failed — NOT finished:', result.error);
  }
  return result;
}

// ─── Restore purchases ────────────────────────────────────────────────────────

export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  assertNativePlatform();
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    let restoredTier: string | undefined;

    for (const purchase of purchases as Purchase[]) {
      const pId = (purchase as any).productId as string | undefined;
      if (!pId || !(SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(pId)) continue;

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
        console.log(`[iapService] Restored: user=${userId.slice(0,8)} tier=${result.tier} cached=${result.cached}`);
      }
    }
    return { ok: true, restoredTier };
  } catch (e: any) {
    console.error('[iapService] restorePurchases failed:', String(e));
    return { ok: false, error: e?.message ?? 'Restore failed' };
  }
}

// ─── Background transaction listener ─────────────────────────────────────────

export function setupTransactionListener(
  _userId:   string,
  onResult:  (result: IAPPurchaseResult) => void,
  eventId?:  string,
): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => {};

  const updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    const pId = (purchase as any).productId as string | undefined;
    if (!pId) return;
    const isSubscription = (SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(pId);
    const isBoost        = (BOOST_PRODUCT_IDS        as readonly string[]).includes(pId);
    if (!isSubscription && !isBoost) return;

    let result: IAPPurchaseResult;
    if (Platform.OS === 'ios') {
      const jws = extractIOSJWS(purchase);
      if (!jws) { onResult({ ok: false, error: 'Transaction data unavailable' }); return; }
      result = isSubscription
        ? await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' })
        : eventId
          ? await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId })
          : { ok: false, error: 'No event context for boost' };
    } else {
      const token = extractAndroidToken(purchase);
      if (!token) { onResult({ ok: false, error: 'Purchase token unavailable' }); return; }
      result = isSubscription
        ? await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'subscription' })
        : eventId
          ? await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'consumable', eventId })
          : { ok: false, error: 'No event context for boost' };
    }

    if (result.ok) {
      try { await finishTransaction({ purchase, isConsumable: isBoost }); } catch { /* noop */ }
    }
    onResult(result);
  });

<<<<<<< HEAD
  const errorSub = purchaseErrorListener((error) => {
    if (!isUserCancelled(error as PurchaseError)) onResult({ ok: false, error: error.message });
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
=======
  const errorSub = purchaseErrorListener((error: PurchaseError) => {
    if (!isUserCancelled(error)) onResult({ ok: false, error: error.message });
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
>>>>>>> b5ab1c6 (Preserve local IAP and dependency changes before rebase)
