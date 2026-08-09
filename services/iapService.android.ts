// ─── Vybz Hub IAP Service — Android (Google Play Billing) ─────────────────────
//
// Metro resolves this file over services/iapService.ts on Android.
// Uses react-native-iap ^12.15.0 which wraps Google Play Billing Library v6+.
// Required package.json entry: "react-native-iap": "^12.15.0"
// Add with: pnpm add react-native-iap@^12.15.0
//
// Architecture:
//   1. Load products from Google Play (real localized prices)
//   2. Initiate purchase via requestSubscription / requestPurchase
//   3. purchaseUpdatedListener fires with purchase token
//   4. Send token to verify-google-purchase Edge Function for server-side verification
//   5. ONLY on { ok: true } from server: acknowledge / consume server-side
//      (server handles acknowledgement; client calls finishTransaction for cleanup)
//   6. Server writes entitlements to user_profiles
//   7. Client reads entitlements from user_profiles via AuthContext.refreshProfile()
//
// SECURITY RULES:
//   • NEVER grant entitlements based on purchase() returning success on-device
//   • NEVER finishTransaction before server verification succeeds

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  IAPErrorCode,
} from 'expo-iap';
import type {
  Subscription,
  Product,
  Purchase,
  SubscriptionPurchase,
  PurchaseError,
} from 'expo-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Google Play Product IDs ──────────────────────────────────────────────────
// Must match exactly what is registered in Google Play Console.

export const GOOGLE_SUBSCRIPTION_PRODUCT_IDS = [
  'com.vybzhub.subscription.promoter_pro.monthly',
  'com.vybzhub.subscription.promoter_pro.yearly',
  'com.vybzhub.subscription.elite.monthly',
  'com.vybzhub.subscription.elite.yearly',
] as const;

export const GOOGLE_BOOST_PRODUCT_IDS = [
  'com.vybzhub.boost.three_day',
  'com.vybzhub.boost.seven_day',
  'com.vybzhub.boost.until_event_end',
] as const;

export type GoogleSubscriptionProductId = typeof GOOGLE_SUBSCRIPTION_PRODUCT_IDS[number];
export type GoogleBoostProductId        = typeof GOOGLE_BOOST_PRODUCT_IDS[number];

// Re-export type aliases so IAPContext imports the same type names on all platforms
export type AppleSubscriptionProductId = GoogleSubscriptionProductId;
export type AppleBoostProductId        = GoogleBoostProductId;

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

function assertAndroid(): void {
  if (Platform.OS !== 'android') throw new Error('[iapService.android] Google Play Billing is only available on Android');
}

// ─── Server verification ──────────────────────────────────────────────────────

async function verifyWithServer(params: {
  purchaseToken:   string;
  productId:       string;
  purchaseType:    'subscription' | 'consumable';
  eventId?:        string;
}): Promise<IAPPurchaseResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase.functions.invoke('verify-google-purchase', {
    body: params,
  });

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
  assertAndroid();
  if (connectionInitialized) return;
  try {
    await initConnection();
    connectionInitialized = true;
    console.log('[iapService.android] Google Play Billing connection initialized');
  } catch (e) {
    console.error('[iapService.android] initConnection failed:', String(e));
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
  assertAndroid();
  try {
    const subs = await getSubscriptions([...GOOGLE_SUBSCRIPTION_PRODUCT_IDS]);
    return subs.map(mapSub);
  } catch (e) {
    console.error('[iapService.android] loadSubscriptionProducts failed:', String(e));
    return [];
  }
}

export async function loadBoostProducts(): Promise<IAPProduct[]> {
  assertAndroid();
  try {
    const products = await getProducts([...GOOGLE_BOOST_PRODUCT_IDS]);
    return products.map(mapProduct);
  } catch (e) {
    console.error('[iapService.android] loadBoostProducts failed:', String(e));
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

function mapSub(sub: Subscription): IAPProduct {
  return {
    productId:      sub.productId,
    title:          sub.title ?? sub.productId,
    description:    sub.description ?? '',
    localizedPrice: sub.localizedPrice ?? '',
    price:          parseFloat(sub.price ?? '0'),
    currency:       sub.currency ?? 'USD',
    isSubscription: true,
  };
}

function mapProduct(p: Product): IAPProduct {
  return {
    productId:      p.productId,
    title:          p.title ?? p.productId,
    description:    p.description ?? '',
    localizedPrice: p.localizedPrice ?? '',
    price:          parseFloat(p.price ?? '0'),
    currency:       p.currency ?? 'USD',
    isSubscription: false,
  };
}

// ─── Subscription purchase ────────────────────────────────────────────────────

export async function purchaseAppleSubscription(
  productId: GoogleSubscriptionProductId,
  userId:    string,
): Promise<IAPPurchaseResult> {
  assertAndroid();
  // react-native-iap v12: requestSubscription returns SubscriptionPurchase | void on some
  // versions; cast to assert the non-void branch (purchase token check guards null case).
  let purchase: SubscriptionPurchase;
  try {
    purchase = (await requestSubscription({
      sku:                         productId,
      obfuscatedAccountIdAndroid:  userId,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    })) as SubscriptionPurchase;
  } catch (e: any) {
    const err = e as PurchaseError;
    if (err?.code === IAPErrorCode.E_USER_CANCELLED)  return { ok: false, error: 'Purchase cancelled' };
    if (err?.code === IAPErrorCode.E_DEFERRED_PAYMENT) return { ok: false, error: 'Purchase pending' };
    console.error('[iapService.android] requestSubscription failed:', String(e));
    return { ok: false, error: err?.message ?? 'Purchase failed. Please try again.' };
  }

  const token = (purchase as any).purchaseToken as string | undefined;
  if (!token) {
    console.error('[iapService.android] No purchaseToken in subscription purchase');
    return { ok: false, error: 'Purchase token unavailable — verification failed' };
  }

  const result = await verifyWithServer({ purchaseToken: token, productId, purchaseType: 'subscription' });
  if (result.ok) {
    // Server acknowledges subscription; client finishes the transaction for cleanup
    try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* noop */ }
  } else {
    console.error('[iapService.android] Server verification failed — NOT finishing:', result.error);
  }
  return result;
}

// ─── Boost consumable purchase ────────────────────────────────────────────────

export async function purchaseAppleBoost(
  productId: GoogleBoostProductId,
  userId:    string,
  eventId:   string,
): Promise<IAPPurchaseResult> {
  assertAndroid();
  let purchase: Purchase;
  try {
    purchase = (await requestPurchase({
      sku:                        productId,
      obfuscatedAccountIdAndroid: userId,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    })) as Purchase;
  } catch (e: any) {
    const err = e as PurchaseError;
    if (err?.code === IAPErrorCode.E_USER_CANCELLED)  return { ok: false, error: 'Purchase cancelled' };
    if (err?.code === IAPErrorCode.E_DEFERRED_PAYMENT) return { ok: false, error: 'Purchase pending' };
    console.error('[iapService.android] requestPurchase (boost) failed:', String(e));
    return { ok: false, error: err?.message ?? 'Purchase failed. Please try again.' };
  }

  const token = (purchase as any).purchaseToken as string | undefined;
  if (!token) {
    console.error('[iapService.android] No purchaseToken in boost purchase');
    return { ok: false, error: 'Purchase token unavailable — verification failed' };
  }

  const result = await verifyWithServer({ purchaseToken: token, productId, purchaseType: 'consumable', eventId });
  if (result.ok) {
    // Server consumes server-side; client finishes for cleanup
    try { await finishTransaction({ purchase, isConsumable: true }); } catch { /* noop */ }
  } else {
    console.error('[iapService.android] Boost verification failed — NOT finishing:', result.error);
  }
  return result;
}

// ─── Restore purchases ────────────────────────────────────────────────────────

export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  assertAndroid();
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    let restoredTier: string | undefined;

    for (const purchase of purchases) {
      if (!(GOOGLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(purchase.productId)) continue;
      const token = (purchase as any).purchaseToken as string | undefined;
      if (!token) continue;

      const result = await verifyWithServer({ purchaseToken: token, productId: purchase.productId, purchaseType: 'subscription' });
      if (result.ok && result.tier) {
        restoredTier = result.tier;
        console.log(`[iapService.android] Restored: user=${userId.slice(0,8)} tier=${result.tier}`);
      }
    }
    return { ok: true, restoredTier };
  } catch (e: any) {
    console.error('[iapService.android] restorePurchases failed:', String(e));
    return { ok: false, error: e?.message ?? 'Restore failed. Please try again.' };
  }
}

// ─── Background transaction listener ─────────────────────────────────────────

export function setupTransactionListener(
  _userId:  string,
  onResult: (result: IAPPurchaseResult) => void,
  eventId?: string,
): () => void {
  if (Platform.OS !== 'android') return () => {};

  const updateSub = purchaseUpdatedListener(async (purchase: Purchase | SubscriptionPurchase) => {
    const isSubscription = (GOOGLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(purchase.productId);
    const isBoost        = (GOOGLE_BOOST_PRODUCT_IDS        as readonly string[]).includes(purchase.productId);
    if (!isSubscription && !isBoost) return;

    const token = (purchase as any).purchaseToken as string | undefined;
    if (!token) { onResult({ ok: false, error: 'Purchase token unavailable' }); return; }

    let result: IAPPurchaseResult;
    if (isSubscription) {
      result = await verifyWithServer({ purchaseToken: token, productId: purchase.productId, purchaseType: 'subscription' });
    } else if (eventId) {
      result = await verifyWithServer({ purchaseToken: token, productId: purchase.productId, purchaseType: 'consumable', eventId });
    } else {
      result = { ok: false, error: 'No event context for boost' };
    }

    if (result.ok) {
      try { await finishTransaction({ purchase, isConsumable: isBoost }); } catch { /* noop */ }
    }
    onResult(result);
  });

  const errorSub = purchaseErrorListener((error: PurchaseError) => {
    if (error.code !== IAPErrorCode.E_USER_CANCELLED) onResult({ ok: false, error: error.message });
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
