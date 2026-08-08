// ─── Vybz Hub Apple IAP Service ───────────────────────────────────────────────
//
// iOS-only StoreKit 2 client wrapper using react-native-iap.
//
// Architecture overview:
//   1. Load products from Apple (StoreKit 2 — real localized prices from App Store)
//   2. Initiate purchase via requestSubscription / requestPurchase
//   3. purchaseUpdatedListener fires with transaction containing signed JWS
//   4. Send JWS to verify-apple-transaction Edge Function for server-side verification
//   5. ONLY on { ok: true } from server: call finishTransaction on the client
//      (never finish the transaction before server confirmation)
//   6. Server writes entitlements to user_profiles via _shared/entitlements.ts
//   7. Client reads entitlements from user_profiles via AuthContext.refreshProfile()
//
// DO NOT grant entitlements client-side based on purchase() returning.
// DO NOT call finishTransaction before server verification succeeds.
// DO NOT call this service on Android or Web — all methods check Platform.OS.
//
// Restore Purchases:
//   • Subscriptions: getAvailablePurchases() returns current active subscriptions.
//     Each is verified server-side, which reconnects the entitlement to the account.
//   • Consumable boosts: NEVER restored — consumables are already delivered/activated.
//     apple_transactions table prevents duplicate activation if somehow called.

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
  type Subscription,
  type Product,
  type Purchase,
  type SubscriptionPurchase,
  type PurchaseError,
  IAPErrorCode,
} from 'react-native-iap';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Apple Product IDs ────────────────────────────────────────────────────────

/** All subscription product IDs registered in App Store Connect */
export const APPLE_SUBSCRIPTION_PRODUCT_IDS = [
  'com.vybzhub.subscription.promoter_pro.monthly',
  'com.vybzhub.subscription.promoter_pro.yearly',
  'com.vybzhub.subscription.elite.monthly',
  'com.vybzhub.subscription.elite.yearly',
] as const;

/** All boost consumable product IDs registered in App Store Connect */
export const APPLE_BOOST_PRODUCT_IDS = [
  'com.vybzhub.boost.three_day',
  'com.vybzhub.boost.seven_day',
  'com.vybzhub.boost.until_event_end',
] as const;

export type AppleSubscriptionProductId = typeof APPLE_SUBSCRIPTION_PRODUCT_IDS[number];
export type AppleBoostProductId = typeof APPLE_BOOST_PRODUCT_IDS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  localizedPrice: string;   // Apple-authoritative localized price e.g. "$9.99"
  price: number;             // Numeric price (for sorting/display)
  currency: string;          // ISO currency code
  isSubscription: boolean;
  subscriptionPeriod?: string;  // e.g. "P1M" (monthly), "P1Y" (yearly)
}

export interface IAPPurchaseResult {
  ok: boolean;
  transactionId?: string;
  environment?: 'Production' | 'Sandbox';
  tier?: string;             // For subscriptions: 'pro' | 'elite'
  boostType?: string;        // For consumables
  boostExpiresAt?: string | null;
  cached?: boolean;          // True if duplicate transaction (idempotent)
  error?: string;
}

export interface IAPRestoreResult {
  ok: boolean;
  restoredTier?: string;    // 'pro' | 'elite' if active subscription found
  error?: string;
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function assertIOS(): void {
  if (Platform.OS !== 'ios') {
    throw new Error('[iapService] Apple IAP is only available on iOS');
  }
}

// ─── Extract JWS from react-native-iap purchase ───────────────────────────────
//
// react-native-iap v12+ exposes the StoreKit 2 signed transaction JWS.
// Field names may vary by library version:
//   - jwsRepresentation         (react-native-iap >= 12.14)
//   - verificationResultIOS     (some v12 builds)
//   - transactionReceipt        (StoreKit 1 fallback — NOT a JWS)
//
// The JWS is required for server-side verification.
// If unavailable, the verification step will be skipped and the purchase
// will NOT activate until the user restores or Apple ASSN delivers the event.

function extractJWS(purchase: Purchase | SubscriptionPurchase): string | null {
  const p = purchase as Record<string, unknown>;
  // Try all known field names in order of preference
  const jws =
    (p.jwsRepresentation as string | undefined) ??
    (p.verificationResultIOS as string | undefined) ??
    null;

  // Validate it looks like a JWS (3 base64url parts separated by dots)
  if (jws && jws.split('.').length === 3) return jws;

  // transactionReceipt is StoreKit 1 base64 receipt — NOT a JWS; cannot use for verification
  return null;
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

/** Initialize the StoreKit 2 connection. Call once on app start (iOS only). */
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

/** Tear down the StoreKit 2 connection. Call on component unmount or app background. */
export async function teardownIAP(): Promise<void> {
  if (!connectionInitialized) return;
  try {
    await endConnection();
    connectionInitialized = false;
  } catch { /* noop */ }
}

// ─── Product Loading ──────────────────────────────────────────────────────────

/** Load subscription products from Apple (real localized prices). */
export async function loadSubscriptionProducts(): Promise<IAPProduct[]> {
  assertIOS();
  try {
    const subs = await getSubscriptions({ skus: [...APPLE_SUBSCRIPTION_PRODUCT_IDS] });
    return subs.map(mapSubscriptionToProduct);
  } catch (e) {
    console.error('[iapService] loadSubscriptionProducts failed:', String(e));
    return [];
  }
}

/** Load boost consumable products from Apple (real localized prices). */
export async function loadBoostProducts(): Promise<IAPProduct[]> {
  assertIOS();
  try {
    const products = await getProducts({ skus: [...APPLE_BOOST_PRODUCT_IDS] });
    return products.map(mapProductToIAPProduct);
  } catch (e) {
    console.error('[iapService] loadBoostProducts failed:', String(e));
    return [];
  }
}

/** Load all IAP products (subscriptions + boosts) in one call. */
export async function loadAllProducts(): Promise<{ subscriptions: IAPProduct[]; boosts: IAPProduct[] }> {
  const [subscriptions, boosts] = await Promise.all([
    loadSubscriptionProducts(),
    loadBoostProducts(),
  ]);
  return { subscriptions, boosts };
}

function mapSubscriptionToProduct(sub: Subscription): IAPProduct {
  return {
    productId:          sub.productId,
    title:              sub.title ?? sub.productId,
    description:        sub.description ?? '',
    localizedPrice:     sub.localizedPrice ?? '',
    price:              parseFloat(sub.price ?? '0'),
    currency:           sub.currency ?? 'USD',
    isSubscription:     true,
    subscriptionPeriod: (sub as any).subscriptionPeriodUnitIOS ?? undefined,
  };
}

function mapProductToIAPProduct(product: Product): IAPProduct {
  return {
    productId:      product.productId,
    title:          product.title ?? product.productId,
    description:    product.description ?? '',
    localizedPrice: product.localizedPrice ?? '',
    price:          parseFloat(product.price ?? '0'),
    currency:       product.currency ?? 'USD',
    isSubscription: false,
  };
}

// ─── Subscription Purchase ────────────────────────────────────────────────────

/**
 * Initiate an Apple subscription purchase and verify it with the Vybz Hub server.
 *
 * The user MUST be authenticated before calling this function.
 * The Supabase user.id is passed as appAccountToken so Apple embeds it in the
 * signed transaction — the server uses this to link the purchase to the account.
 *
 * @param productId   One of APPLE_SUBSCRIPTION_PRODUCT_IDS
 * @param userId      Supabase auth user.id (UUID, set as appAccountToken)
 * @returns           IAPPurchaseResult with { ok, tier } on success
 */
export async function purchaseAppleSubscription(
  productId: AppleSubscriptionProductId,
  userId: string,
): Promise<IAPPurchaseResult> {
  assertIOS();

  let purchase: SubscriptionPurchase;
  try {
    purchase = await requestSubscription({
      sku: productId,
      // appAccountToken links the Apple transaction to the Vybz Hub user account.
      // Must be a UUID (lowercase). Apple embeds it in the signed JWS.
      appAccountToken: userId.toLowerCase(),
      // NEVER auto-finish — always wait for server confirmation first.
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    });
  } catch (e: any) {
    const iapError = e as PurchaseError;
    if (iapError?.code === IAPErrorCode.E_USER_CANCELLED) {
      return { ok: false, error: 'Purchase cancelled' };
    }
    if (iapError?.code === IAPErrorCode.E_DEFERRED_PAYMENT) {
      return { ok: false, error: 'Ask to Buy: purchase is pending parental approval' };
    }
    console.error('[iapService] requestSubscription failed:', String(e));
    return { ok: false, error: iapError?.message ?? 'Purchase failed' };
  }

  const jws = extractJWS(purchase);
  if (!jws) {
    console.error('[iapService] No JWS in purchase — cannot verify with server');
    return { ok: false, error: 'Transaction data unavailable for verification' };
  }

  // Verify with Vybz Hub server BEFORE finishing the transaction
  const result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'subscription' });

  if (result.ok) {
    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch (e) {
      // Non-fatal: StoreKit 2 allows re-finishing transactions
      console.warn('[iapService] finishTransaction warning:', String(e));
    }
  } else {
    console.error('[iapService] Server verification failed — transaction NOT finished:', result.error);
  }

  return result;
}

// ─── Boost Purchase ───────────────────────────────────────────────────────────

/**
 * Initiate an Apple boost consumable purchase and verify it with the Vybz Hub server.
 *
 * Consumable boosts are "use once, never restore" — they are activated immediately
 * on server verification and stored in apple_transactions for idempotency.
 *
 * @param productId   One of APPLE_BOOST_PRODUCT_IDS
 * @param userId      Supabase auth user.id
 * @param eventId     Event to boost (must be owned by userId)
 * @returns           IAPPurchaseResult with { ok, boostType, boostExpiresAt } on success
 */
export async function purchaseAppleBoost(
  productId: AppleBoostProductId,
  userId: string,
  eventId: string,
): Promise<IAPPurchaseResult> {
  assertIOS();

  let purchase: Purchase;
  try {
    purchase = await requestPurchase({
      sku: productId,
      appAccountToken: userId.toLowerCase(),
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    });
  } catch (e: any) {
    const iapError = e as PurchaseError;
    if (iapError?.code === IAPErrorCode.E_USER_CANCELLED) {
      return { ok: false, error: 'Purchase cancelled' };
    }
    if (iapError?.code === IAPErrorCode.E_DEFERRED_PAYMENT) {
      return { ok: false, error: 'Ask to Buy: purchase pending parental approval' };
    }
    console.error('[iapService] requestPurchase (boost) failed:', String(e));
    return { ok: false, error: iapError?.message ?? 'Purchase failed' };
  }

  const jws = extractJWS(purchase);
  if (!jws) {
    console.error('[iapService] No JWS in boost purchase — cannot verify with server');
    return { ok: false, error: 'Transaction data unavailable for verification' };
  }

  const result = await verifyWithServer({
    signedTransaction: jws,
    purchaseType: 'consumable',
    eventId,
  });

  if (result.ok) {
    try {
      await finishTransaction({ purchase, isConsumable: true });
    } catch (e) {
      console.warn('[iapService] finishTransaction (boost) warning:', String(e));
    }
  } else {
    console.error('[iapService] Boost server verification failed — transaction NOT finished:', result.error);
  }

  return result;
}

// ─── Restore Purchases ────────────────────────────────────────────────────────

/**
 * Restore active Apple subscriptions for the current signed-in Vybz Hub account.
 *
 * StoreKit 2 restores subscriptions from currentEntitlements.
 * Consumable boosts are NOT restored (consumables are excluded from StoreKit entitlements).
 * If the user is on a different device with the same Apple ID, this reconnects their
 * active subscription to their Vybz Hub account.
 *
 * @param userId   Current Vybz Hub user.id
 */
export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  assertIOS();

  try {
    const purchases = await getAvailablePurchases();

    if (!purchases || purchases.length === 0) {
      return { ok: true }; // No active Apple subscriptions to restore
    }

    let restoredTier: string | undefined;

    // Process each active subscription
    for (const purchase of purchases) {
      const productId = purchase.productId;

      // Skip non-subscription products (should not appear in getAvailablePurchases, but guard anyway)
      const isSubscription = (APPLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(productId);
      if (!isSubscription) continue;

      const jws = extractJWS(purchase);
      if (!jws) {
        console.warn('[iapService] Restore: no JWS for product', productId);
        continue;
      }

      // Verify each restored transaction with the server
      // The server is idempotent — already-active subscriptions are safely re-synced
      const result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'subscription' });

      if (result.ok && result.tier) {
        restoredTier = result.tier;
        console.log(`[iapService] Restored subscription: user=${userId.slice(0,8)} tier=${result.tier} cached=${result.cached}`);
      }
    }

    return { ok: true, restoredTier };
  } catch (e: any) {
    console.error('[iapService] restorePurchases failed:', String(e));
    return { ok: false, error: e?.message ?? 'Restore failed' };
  }
}

// ─── Transaction Listener ─────────────────────────────────────────────────────

/**
 * Set up a persistent StoreKit 2 transaction listener.
 *
 * Catches transactions that arrive outside of an active purchase flow:
 *   - Ask to Buy: parent approves after user has left the screen
 *   - App re-opened: pending transactions from a previous session
 *   - Interrupted purchases: payment sheet was dismissed mid-flow
 *
 * Returns a cleanup function — call it on component unmount.
 *
 * @param userId    Current Vybz Hub user.id
 * @param eventId   Set when listening for a boost consumable transaction (optional)
 * @param onResult  Callback when a transaction is verified (or fails)
 */
export function setupTransactionListener(
  userId: string,
  onResult: (result: IAPPurchaseResult) => void,
  eventId?: string,
): () => void {
  if (Platform.OS !== 'ios') return () => {};

  const updateSub = purchaseUpdatedListener(async (purchase: Purchase | SubscriptionPurchase) => {
    const productId = purchase.productId;
    const isSubscription = (APPLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(productId);
    const isBoost = (APPLE_BOOST_PRODUCT_IDS as readonly string[]).includes(productId);

    if (!isSubscription && !isBoost) {
      console.warn('[iapService] Listener: unknown product:', productId);
      return;
    }

    const jws = extractJWS(purchase);
    if (!jws) {
      console.warn('[iapService] Listener: no JWS for product', productId);
      onResult({ ok: false, error: 'Transaction data unavailable' });
      return;
    }

    let result: IAPPurchaseResult;

    if (isSubscription) {
      result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
    } else {
      if (!eventId) {
        console.warn('[iapService] Listener: boost purchase received but no eventId set');
        result = { ok: false, error: 'No event context for boost purchase' };
      } else {
        result = await verifyWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId });
      }
    }

    if (result.ok) {
      try {
        await finishTransaction({ purchase, isConsumable: isBoost });
      } catch (e) {
        console.warn('[iapService] Listener finishTransaction warning:', String(e));
      }
    }

    onResult(result);
  });

  const errorSub = purchaseErrorListener((error: PurchaseError) => {
    console.warn('[iapService] Purchase error:', error.code, error.message);
    if (error.code !== IAPErrorCode.E_USER_CANCELLED) {
      onResult({ ok: false, error: error.message });
    }
  });

  return () => {
    updateSub?.remove();
    errorSub?.remove();
  };
}
