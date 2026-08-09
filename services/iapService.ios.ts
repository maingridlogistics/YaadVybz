// ─── Vybz Hub IAP Service — iOS (StoreKit 2) ──────────────────────────────────
//
// This file is automatically resolved by Metro over services/iapService.ts on iOS.
// It imports react-native-iap which requires a native build (EAS/Xcode).
//
// To add react-native-iap to an EAS build, run in the project root:
//   pnpm add react-native-iap -w
// Then rebuild with EAS:
//   eas build --platform ios --profile preview
//
// Architecture overview:
//   1. Load products from Apple (StoreKit 2 — real localized prices from App Store)
//   2. Initiate purchase via requestSubscription / requestPurchase
//   3. purchaseUpdatedListener fires with signed JWS transaction
//   4. Send JWS to verify-apple-transaction Edge Function for server-side verification
//   5. ONLY on { ok: true } from server: call finishTransaction
//   6. Server writes entitlements to user_profiles via _shared/entitlements.ts
//   7. Client reads entitlements from user_profiles via AuthContext.refreshProfile()
//
// SECURITY RULES:
//   • NEVER grant entitlements based on purchase() returning success on-device
//   • NEVER call finishTransaction before server verification succeeds
//   • appAccountToken = userId links Apple transactions to Vybz Hub accounts

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
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

// ─── Apple Product IDs ────────────────────────────────────────────────────────

export const APPLE_SUBSCRIPTION_PRODUCT_IDS = [
  'com.vybzhub.subscription.promoter_pro.monthly',
  'com.vybzhub.subscription.promoter_pro.yearly',
  'com.vybzhub.subscription.elite.monthly',
  'com.vybzhub.subscription.elite.yearly',
] as const;

export const APPLE_BOOST_PRODUCT_IDS = [
  'com.vybzhub.boost.three_day',
  'com.vybzhub.boost.seven_day',
  'com.vybzhub.boost.until_event_end',
] as const;

export type AppleSubscriptionProductId = typeof APPLE_SUBSCRIPTION_PRODUCT_IDS[number];
export type AppleBoostProductId        = typeof APPLE_BOOST_PRODUCT_IDS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IAPProduct {
  productId:          string;
  title:              string;
  description:        string;
  localizedPrice:     string;   // Apple-authoritative localized price e.g. "$9.99"
  price:              number;
  currency:           string;
  isSubscription:     boolean;
  subscriptionPeriod?: string;
}

export interface IAPPurchaseResult {
  ok:             boolean;
  transactionId?: string;
  environment?:   'Production' | 'Sandbox';
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

function assertIOS(): void {
  if (Platform.OS !== 'ios') throw new Error('[iapService] Apple IAP is only available on iOS');
}

// ─── Extract JWS from purchase ─────────────────────────────────────────────────
// react-native-iap v12+ exposes the StoreKit 2 signed JWS transaction.
// Field names vary by version; try all known names.

function extractJWS(purchase: Purchase | SubscriptionPurchase): string | null {
  const p = purchase as Record<string, unknown>;
  const jws =
    (p.jwsRepresentation       as string | undefined) ??
    (p.verificationResultIOS   as string | undefined) ??
    null;
  // Validate compact JWS format: header.payload.signature
  return jws && jws.split('.').length === 3 ? jws : null;
}

// ─── Server verification ──────────────────────────────────────────────────────

async function verifyWithServer(params: {
  signedTransaction: string;
  purchaseType: 'subscription' | 'consumable';
  eventId?: string;
}): Promise<IAPPurchaseResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase.functions.invoke('verify-apple-transaction', {
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
  assertIOS();
  if (connectionInitialized) return;
  try {
    await initConnection();
    connectionInitialized = true;
    console.log('[iapService] StoreKit 2 connection initialized');
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
  assertIOS();
  try {
    const subs = await getSubscriptions([...APPLE_SUBSCRIPTION_PRODUCT_IDS]);
    return subs.map(mapSub);
  } catch (e) {
    console.error('[iapService] loadSubscriptionProducts failed:', String(e));
    return [];
  }
}

export async function loadBoostProducts(): Promise<IAPProduct[]> {
  assertIOS();
  try {
    const products = await getProducts([...APPLE_BOOST_PRODUCT_IDS]);
    return products.map(mapProduct);
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

function mapSub(sub: Subscription): IAPProduct {
  return {
    productId:          sub.productId,
    title:              sub.title ?? sub.productId,
    description:        sub.description ?? '',
    localizedPrice:     sub.localizedPrice ?? '',
    price:              parseFloat(sub.price ?? '0'),
    currency:           sub.currency ?? 'USD',
    isSubscription:     true,
    subscriptionPeriod: (sub as any).subscriptionPeriodUnitIOS,
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

/**
 * Purchase a subscription via StoreKit 2, then verify server-side.
 * The user's Supabase user.id is passed as appAccountToken — Apple embeds it
 * in the signed JWS so the server can link the purchase to the account.
 * transaction.finish() is called ONLY after server confirms { ok: true }.
 */
export async function purchaseAppleSubscription(
  productId: AppleSubscriptionProductId,
  userId:    string,
): Promise<IAPPurchaseResult> {
  assertIOS();
  let purchase: SubscriptionPurchase;
  try {
    purchase = await requestSubscription({
      sku:             productId,
      appAccountToken: userId.toLowerCase(),
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    });
  } catch (e: any) {
    const err = e as PurchaseError;
    if (err?.code === IAPErrorCode.E_USER_CANCELLED)  return { ok: false, error: 'Purchase cancelled' };
    if (err?.code === IAPErrorCode.E_DEFERRED_PAYMENT) return { ok: false, error: 'Purchase pending parental approval' };
    console.error('[iapService] requestSubscription failed:', String(e));
    return { ok: false, error: err?.message ?? 'Purchase failed' };
  }

  const jws = extractJWS(purchase);
  if (!jws) {
    console.error('[iapService] No JWS in subscription purchase');
    return { ok: false, error: 'Transaction data unavailable for verification' };
  }

  const result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
  if (result.ok) {
    try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* StoreKit 2 allows re-finish */ }
  } else {
    console.error('[iapService] Server verification failed — transaction NOT finished:', result.error);
  }
  return result;
}

// ─── Boost consumable purchase ────────────────────────────────────────────────

/**
 * Purchase a boost consumable via StoreKit 2, then verify server-side.
 * Consumable boosts are "use once, never restore" — stored in apple_transactions.
 */
export async function purchaseAppleBoost(
  productId: AppleBoostProductId,
  userId:    string,
  eventId:   string,
): Promise<IAPPurchaseResult> {
  assertIOS();
  let purchase: Purchase;
  try {
    purchase = await requestPurchase({
      sku:             productId,
      appAccountToken: userId.toLowerCase(),
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    });
  } catch (e: any) {
    const err = e as PurchaseError;
    if (err?.code === IAPErrorCode.E_USER_CANCELLED)  return { ok: false, error: 'Purchase cancelled' };
    if (err?.code === IAPErrorCode.E_DEFERRED_PAYMENT) return { ok: false, error: 'Purchase pending parental approval' };
    console.error('[iapService] requestPurchase (boost) failed:', String(e));
    return { ok: false, error: err?.message ?? 'Purchase failed' };
  }

  const jws = extractJWS(purchase);
  if (!jws) {
    console.error('[iapService] No JWS in boost purchase');
    return { ok: false, error: 'Transaction data unavailable for verification' };
  }

  const result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId });
  if (result.ok) {
    try { await finishTransaction({ purchase, isConsumable: true }); } catch { /* noop */ }
  } else {
    console.error('[iapService] Boost server verification failed — NOT finished:', result.error);
  }
  return result;
}

// ─── Restore purchases ────────────────────────────────────────────────────────

/**
 * Restore active Apple subscriptions by re-verifying each with the server.
 * Consumable boosts are NOT restored — consumables are excluded from
 * StoreKit's currentEntitlements, so getAvailablePurchases() never returns them.
 */
export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  assertIOS();
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    let restoredTier: string | undefined;

    for (const purchase of purchases) {
      if (!(APPLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(purchase.productId)) continue;
      const jws = extractJWS(purchase);
      if (!jws) { console.warn('[iapService] Restore: no JWS for', purchase.productId); continue; }

      const result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
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

/**
 * Persistent StoreKit 2 listener for out-of-flow transactions:
 *   - Ask to Buy approved after user left screen
 *   - Interrupted purchases from a previous session
 * Returns cleanup function — call on component unmount.
 */
export function setupTransactionListener(
  _userId:   string,
  onResult:  (result: IAPPurchaseResult) => void,
  eventId?:  string,
): () => void {
  if (Platform.OS !== 'ios') return () => {};

  const updateSub = purchaseUpdatedListener(async (purchase: Purchase | SubscriptionPurchase) => {
    const isSubscription = (APPLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(purchase.productId);
    const isBoost        = (APPLE_BOOST_PRODUCT_IDS        as readonly string[]).includes(purchase.productId);
    if (!isSubscription && !isBoost) return;

    const jws = extractJWS(purchase);
    if (!jws) { onResult({ ok: false, error: 'Transaction data unavailable' }); return; }

    let result: IAPPurchaseResult;
    if (isSubscription) {
      result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
    } else if (eventId) {
      result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId });
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
