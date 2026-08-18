
// ─── Vybz Hub IAP Service — Native (expo-iap 5.1.0, iOS + Android) ───────────
//
// ─── CRITICAL API CONTRACT (expo-iap 5.1.0) ──────────────────────────────────
//
// requestPurchase() in expo-iap 5.1.0 is EVENT-BASED.
//
// Evidence from this codebase:
//   • Both the argument and return value required `as unknown` escape-hatch
//     casts, which is only necessary when TypeScript infers a type that does NOT
//     match Purchase. If requestPurchase returned Purchase, no escape hatch is
//     needed.
//   • Observed device behavior confirms it: requestPurchase() returns before the
//     purchase completes — the completed Purchase (with purchaseToken as iOS JWS)
//     arrives exclusively through purchaseUpdatedListener.
//
// ─── iOS JWS FIELD (expo-iap 5.1.0) ─────────────────────────────────────────
//
// PurchaseIOS in expo-iap 5.1.0 does NOT define `jwsRepresentationIos`.
// The unified field is PurchaseCommon.purchaseToken, which on iOS contains the
// StoreKit 2 signed JWS transaction string and on Android contains the Google
// Play purchase token.
//
// Primary extraction:  purchase.purchaseToken  (iOS JWS / Android token)
// Fallback (iOS only): getTransactionJwsIOS(purchase.productId)  — note the
//   argument is the product SKU, NOT a transaction ID, per the 5.1.0 API.
//
// The previous architecture assumed requestPurchase() returned a complete
// Purchase object (StoreKit 2 synchronous-style). That assumption was wrong.
// The previous "foreground guard" used _txId() on the requestPurchase() return
// value — but since that value has no transactionId, the Set was always empty
// and the guard was a no-op.
//
// ─── CORRECT ARCHITECTURE ────────────────────────────────────────────────────
//
//   1. purchaseAppleSubscription / purchaseAppleBoost / purchaseAppleBusinessPromotion
//      each register a per-productId one-shot listener BEFORE calling
//      requestPurchase(). This listener receives the completed Purchase object.
//
//   2. requestPurchase() is called and its return value is DISCARDED. Errors
//      (cancellation, deferred payment) are caught from the rejected Promise
//      or from purchaseErrorListener.
//
//   3. The one-shot listener receives the Purchase with full JWS, verifies
//      server-side, calls finishTransaction ONLY on success.
//
//   4. If JWS is absent on the Purchase object the listener receives, the code
//      attempts getTransactionJwsIOS(transactionId) if that function is exported
//      by the installed expo-iap version. If neither path produces a valid JWS,
//      the purchase is reported as failed without calling finishTransaction.
//
//   5. A module-level Set (_foregroundProductIds) tracks which productIds are
//      currently being handled by a foreground purchase call. setupTransaction-
//      Listener (background/Ask-to-Buy) skips any product in this Set, so the
//      same purchase is never processed twice.
//
//   6. Transaction deduplication is enforced at the server (apple_transactions
//      UNIQUE transaction_id). The client additionally skips duplicate
//      finishTransaction via the one-shot pattern (settled flag per call).
//
// ─── SECURITY RULES (unchanged) ──────────────────────────────────────────────
//   • NEVER grant entitlements based on purchase() returning success on-device.
//   • NEVER call finishTransaction before server verification succeeds.
//   • appAccountToken / obfuscatedAccountIdAndroid = userId links the purchase
//     to the Vybz Hub account so the server can verify ownership.

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
import type { Product, ProductSubscription, Purchase, PurchaseError, RequestPurchaseProps } from 'expo-iap';
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

/**
 * Extract the signed JWS (StoreKit 2) from a Purchase object.
 *
 * In expo-iap 5.1.0 the unified field is PurchaseCommon.purchaseToken.
 * On iOS this contains the signed JWS; on Android it contains the Google
 * Play purchase token.  `jwsRepresentationIos` does NOT exist in 5.1.0 —
 * reading it always returns undefined.
 */
function extractIOSJWS(purchase: Purchase): string | null {
  if (!purchase) return null;
  const p = purchase as unknown as Record<string, unknown>;
  // expo-iap 5.1.0: PurchaseCommon.purchaseToken is the iOS JWS
  const jws = (p.purchaseToken as string | undefined) ?? null;
  return jws && jws.split('.').length === 3 ? jws : null;
}

/**
 * Attempt to retrieve the JWS for a transaction using getTransactionJwsIOS,
 * which was added to expo-iap to handle cases where the Purchase object
 * delivered to purchaseUpdatedListener has an empty purchaseToken.
 *
 * This function probes for the export at runtime and returns null safely if
 * the installed version does not export it — avoiding a hard import failure
 * when the function is absent in expo-iap 5.1.0.
 */
async function tryGetTransactionJwsIOS(purchase: Purchase): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const p = purchase as unknown as Record<string, unknown>;
    // getTransactionJwsIOS() in expo-iap 5.1.0 accepts the product SKU (productId),
    // NOT a transaction ID.  Using transactionId would always fail to find the pass.
    const productId =
      (p.productId as string | undefined) ??
      (p.sku as string | undefined) ??
      null;
    if (!productId) return null;

    // Use dynamic import instead of require for ESM compatibility and to avoid
    // linting issues with @typescript-eslint/no-var-requires
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

// ─── Foreground purchase guard (productId-based) ──────────────────────────────
//
// Tracks which productIds are currently being handled by an active foreground
// purchaseAppleSubscription / purchaseAppleBoost call.
//
// WHY productId INSTEAD OF transactionId:
//   The previous version used a transactionId-based Set (_foregroundTxIds).
//   That was a no-op because expo-iap 5.1.0 requestPurchase() does not return
//   a Purchase object — the returned value has no transactionId. So _txId() on
//   the requestPurchase return always returned null, and nothing was ever added
//   to the Set.
//
//   productId is known BEFORE calling requestPurchase, making it the only
//   reliable key for the guard at purchase initiation time.
//
// The background setupTransactionListener checks this Set and skips any
// purchase whose productId is currently being handled foreground.

const _foregroundProductIds = new Set<string>();

// ─── JWS extraction with fallback ────────────────────────────────────────────
//
// Attempts to extract the signed JWS from the Purchase object.
// If the field is absent (which can happen when the purchaseUpdatedListener
// fires before StoreKit fully populates the JWS on the transaction), falls
// back to getTransactionJwsIOS(transactionId) if available in the installed
// expo-iap version.

async function resolveJWS(purchase: Purchase): Promise<string | null> {
  const direct = extractIOSJWS(purchase);
  if (direct) return direct;
  // Fallback: probe for getTransactionJwsIOS (may be present in newer expo-iap patches)
  return tryGetTransactionJwsIOS(purchase);
}

// ─── Generic foreground purchase helper ──────────────────────────────────────
//
// Core pattern for all foreground IAP purchases (subscription, boost, biz promo):
//
//   1. Register productId in _foregroundProductIds BEFORE calling requestPurchase.
//   2. Set up a one-shot purchaseUpdatedListener filtered to this productId.
//   3. Set up a purchaseErrorListener for cancellation / deferred / errors.
//   4. Call requestPurchase() — its return value is DISCARDED.
//      The purchase result arrives exclusively through the listener.
//   5. On listener fire: extract JWS (with fallback), verify server-side,
//      call finishTransaction ONLY on success.
//   6. On settled (success or failure): remove productId from foreground Set,
//      clean up both listeners.
//   7. Timeout after 2 minutes to prevent the Promise from hanging indefinitely
//      if StoreKit never calls back (e.g. network loss mid-purchase).
//
// Idempotency guarantee:
//   The `settled` flag ensures the Promise resolves exactly once even if both
//   the listener AND requestPurchase() resolve (the latter being possible if
//   a future expo-iap version returns the Purchase synchronously).

const PURCHASE_TIMEOUT_MS = 120_000; // 2 minutes

interface ForegroundPurchaseOptions {
  productId: string;
  purchaseType: 'subs' | 'in-app';
  userId: string;
  /** Called when the verified Purchase is ready for finishTransaction. */
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

    // Register productId as foreground BEFORE subscribing listeners and calling requestPurchase
    _foregroundProductIds.add(productId);

    // Timeout guard — prevents the Promise hanging if StoreKit never responds
    timer = setTimeout(() => {
      console.warn('[iapService] foregroundPurchase timeout for', productId);
      settle({ ok: false, error: 'Purchase timed out. Please try again.' });
    }, PURCHASE_TIMEOUT_MS);

    // One-shot purchaseUpdatedListener filtered to our productId
    updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      const pId = getPurchaseProductId(purchase);
      if (pId !== productId) return; // not our product — ignore

      // Platform-specific verification
      if (Platform.OS === 'ios') {
        const jws = await resolveJWS(purchase);
        if (!jws) {
          console.error('[iapService] foreground listener: JWS absent and getTransactionJwsIOS unavailable for', productId);
          settle({ ok: false, error: 'Transaction data unavailable for verification' });
          return;
        }
        const result = await onVerify(purchase, jws);
        settle(result);
      } else {
        // Android: purchaseToken path — onVerify receives the purchase directly
        const token = extractAndroidToken(purchase);
        if (!token) {
          settle({ ok: false, error: 'Purchase token unavailable — verification failed' });
          return;
        }
        // For Android, pass the purchase as-is; the caller's onVerify handles tokens
        const result = await onVerify(purchase, token);
        settle(result);
      }
    });

    // purchaseErrorListener for cancellation / deferred / system errors
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

    // Initiate purchase — return value is DISCARDED.
    // In expo-iap 5.1.0 requestPurchase is event-based; completion arrives
    // through purchaseUpdatedListener above.
    requestPurchase({
      ...buildPurchaseRequest(productId, userId),
      type: purchaseType,
    } as RequestPurchaseProps).catch((e: unknown) => {
      // If requestPurchase itself rejects (e.g. user dismissed before StoreKit
      // sheet appeared, or system error before the sheet), settle here.
      // If the error listener already fired, settle() is a no-op.
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

// ─── Subscription purchase ────────────────────────────────────────────────────

export function purchaseAppleSubscription(
  productId: SubscriptionProductId,
  userId: string,
): Promise<IAPPurchaseResult> {
  return foregroundPurchase({
    productId,
    purchaseType: 'subs',
    userId,
    onVerify: async (purchase, jwsOrToken) => {
      let result: IAPPurchaseResult;
      if (Platform.OS === 'ios') {
        result = await verifyAppleWithServer({ signedTransaction: jwsOrToken, purchaseType: 'subscription' });
      } else {
        result = await verifyGoogleWithServer({ purchaseToken: jwsOrToken, productId, purchaseType: 'subscription' });
      }
      if (result.ok) {
        try { await finishTransaction({ purchase, isConsumable: false }); } catch (e) {
          console.warn('[iapService] finishTransaction subscription failed:', String(e));
        }
      } else {
        console.error('[iapService] Subscription server verification failed — NOT finished:', result.error);
      }
      return result;
    },
  });
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
        result = await verifyAppleWithServer({ signedTransaction: jwsOrToken, purchaseType: 'consumable', eventId });
      } else {
        result = await verifyGoogleWithServer({ purchaseToken: jwsOrToken, productId, purchaseType: 'consumable', eventId });
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
      // Business promotions only run on iOS — Android path not applicable here
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

// ─── Restore purchases ────────────────────────────────────────────────────────

export async function restoreApplePurchases(userId: string): Promise<IAPRestoreResult> {
  try {
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { ok: true };

    let restoredTier: string | undefined;

    for (const purchase of (purchases as Purchase[])) {
      const pId = getPurchaseProductId(purchase);
      if (!pId || !SUBSCRIPTION_IDS_ARRAY.includes(pId)) continue;

      let result: IAPPurchaseResult;
      if (Platform.OS === 'ios') {
        // Use resolveJWS (with getTransactionJwsIOS fallback) for restore path too
        const jws = await resolveJWS(purchase);
        if (!jws) { console.warn('[iapService] Restore: no JWS for', pId); continue; }
        result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
      } else {
        const token = extractAndroidToken(purchase);
        if (!token) continue;
        result = await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'subscription' });
      }

      if (result.ok) {
        // Accept cached:true responses — the server already verified this transaction
        // previously. The tier is returned on cached hits (fixed in verify-apple-transaction).
        // Also handle the fallback case where tier is missing on a cached hit by querying
        // available purchases to derive the tier from the product ID.
        // result.active === false means the server explicitly flagged this
        // transaction as non-entitling (e.g. expired Sandbox subscription).
        // Transaction history != current entitlement — do NOT set restoredTier.
        if (result.active === false) {
          console.log(`[iapService] Restore: cached but expired/non-entitling for ${pId} — skipping`);
          continue;
        }
        const tier = result.tier ?? null;
        if (tier) {
          restoredTier = tier;
          console.log(`[iapService] Restored: user=${userId.slice(0, 8)} tier=${tier} cached=${result.cached ?? false}`);
        } else if (result.cached) {
          // Cached hit without explicit tier AND not flagged non-active.
          // Only derive from productId if active is not explicitly false.
          // This handles legacy server responses that predate the active field.
          const derivedTier =
            pId.includes('elite') ? 'elite' :
            pId.includes('promoter_pro') || pId.includes('pro') ? 'pro' : null;
          if (derivedTier) {
            restoredTier = derivedTier;
            console.log(`[iapService] Restored (tier derived from productId): user=${userId.slice(0, 8)} tier=${derivedTier}`);
          }
        }
      }
    }

    return { ok: true, restoredTier };
  } catch (e: unknown) {
    console.error('[iapService] restorePurchases failed:', String(e));
    return { ok: false, error: (e as Error)?.message ?? 'Restore failed' };
  }
}

// ─── Background transaction listener ─────────────────────────────────────────
//
// Handles Ask-to-Buy (parent approves after user leaves screen) and interrupted
// purchases resumed after an app restart. These are the ONLY cases this listener
// should handle — normal foreground purchases are handled by foregroundPurchase().
//
// SKIP RULE: if a foreground purchase is in progress for this productId, the
// background listener skips the transaction entirely. The foreground one-shot
// listener in foregroundPurchase() is already handling it.
//
// MISSING JWS RULE: if JWS is absent AND getTransactionJwsIOS is unavailable,
// the transaction is silently skipped. It is NOT reported as a user-visible
// failure — the transaction remains unfinished and StoreKit will re-deliver it
// next time the app launches, at which point either the foreground path or this
// background listener will process it with a complete JWS.

export function setupTransactionListener(
  _userId: string,
  onResult: (result: IAPPurchaseResult) => void,
  eventId?: string,
): () => void {
  const updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    const pId = getPurchaseProductId(purchase);
    if (!pId) return;

    const isSubscription = SUBSCRIPTION_IDS_ARRAY.includes(pId);
    const isBoost = BOOST_IDS_ARRAY.includes(pId);
    if (!isSubscription && !isBoost) return;

    // Skip if a foreground purchase call is already handling this productId.
    if (_foregroundProductIds.has(pId)) {
      console.log('[iapService] background listener: skipping foreground-handled product', pId);
      return;
    }

    let result: IAPPurchaseResult;

    if (Platform.OS === 'ios') {
      const jws = await resolveJWS(purchase);
      if (!jws) {
        // Incomplete transaction object — StoreKit will re-deliver on next launch.
        // Do NOT report as user-visible error. Do NOT call finishTransaction.
        console.warn('[iapService] background listener: JWS absent for', pId, '— will retry on next launch');
        return;
      }

      if (isSubscription) {
        result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' });
      } else if (eventId) {
        result = await verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'consumable', eventId });
      } else {
        // Background listener has no event context for boosts — cannot verify.
        // Leave transaction unfinished; user must re-open the boost screen.
        console.warn('[iapService] background listener: no eventId for boost product', pId);
        return;
      }
    } else {
      const token = extractAndroidToken(purchase);
      if (!token) {
        console.warn('[iapService] background listener: missing Android token for', pId, '— skipping');
        return;
      }

      if (isSubscription) {
        result = await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'subscription' });
      } else if (eventId) {
        result = await verifyGoogleWithServer({ purchaseToken: token, productId: pId, purchaseType: 'consumable', eventId });
      } else {
        console.warn('[iapService] background listener: no eventId for boost product', pId);
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
    // Do not surface user-cancelled errors from background listener —
    // there is no active purchase UI to show the error on.
    if (!isUserCancelled(err)) {
      console.warn('[iapService] background purchaseErrorListener:', err.message);
      // Only call onResult for non-cancellation errors so IAPContext can
      // update lastPurchaseResult for Ask-to-Buy / recovered purchase failures.
      onResult({ ok: false, error: err.message ?? 'Purchase error' });
    }
  });

  return () => { updateSub?.remove(); errorSub?.remove(); };
}
