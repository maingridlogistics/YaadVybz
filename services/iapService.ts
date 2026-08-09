// ─── Vybz Hub IAP Service — Web Stub ─────────────────────────────────────────
//
// This file is the FALLBACK stub used on WEB only.
//
// Metro platform-specific resolution:
//   iOS     → services/iapService.ios.ts     (StoreKit 2 / react-native-iap)
//   Android → services/iapService.android.ts (Google Play Billing / react-native-iap)
//   Web     → services/iapService.ts         (THIS FILE — no native modules)
//
// All functions here are safe no-ops. Since IAPContext.tsx renders
// `<>{children}</>` on Web, these functions are never called in Web builds.
// They exist solely to satisfy TypeScript's type system during web bundling.

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
  localizedPrice:     string;
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

// ─── Stub implementations ─────────────────────────────────────────────────────
// These are dead code on Android/Web — IAPContext never calls them on non-iOS.
// They exist solely to satisfy TypeScript's type system.

const NOT_IOS = { ok: false as const, error: 'Apple IAP is only available on iOS' };

export async function initIAP():                         Promise<void>              { /* no-op */ }
export async function teardownIAP():                     Promise<void>              { /* no-op */ }
export async function loadSubscriptionProducts():        Promise<IAPProduct[]>      { return []; }
export async function loadBoostProducts():               Promise<IAPProduct[]>      { return []; }
export async function loadAllProducts():                 Promise<{ subscriptions: IAPProduct[]; boosts: IAPProduct[] }> {
  return { subscriptions: [], boosts: [] };
}
export async function purchaseAppleSubscription(
  _productId: AppleSubscriptionProductId,
  _userId:    string,
): Promise<IAPPurchaseResult>                                                       { return NOT_IOS; }
export async function purchaseAppleBoost(
  _productId: AppleBoostProductId,
  _userId:    string,
  _eventId:   string,
): Promise<IAPPurchaseResult>                                                       { return NOT_IOS; }
export async function restoreApplePurchases(
  _userId: string,
): Promise<IAPRestoreResult>                                                        { return NOT_IOS; }
export function setupTransactionListener(
  _userId:    string,
  _onResult:  (result: IAPPurchaseResult) => void,
  _eventId?:  string,
): () => void                                                                       { return () => {}; }
