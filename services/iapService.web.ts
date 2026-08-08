// ─── Vybz Hub IAP Service — Web Stub ─────────────────────────────────────────
//
// Metro resolves this file over services/iapService.ts on web builds.
// This explicit .web.ts variant guarantees the native IAP code
// (iapService.ios.ts / iapService.android.ts) and react-native-iap
// are never bundled for web, preventing any platform-resolution ambiguity.
//
// All functions are safe no-ops. IAPContext renders <>{children}</> on web
// so these are never called in production web builds.

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

const NOT_WEB = { ok: false as const, error: 'In-app purchases are not available on web.' };

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
): Promise<IAPPurchaseResult>                                                       { return NOT_WEB; }
export async function purchaseAppleBoost(
  _productId: AppleBoostProductId,
  _userId:    string,
  _eventId:   string,
): Promise<IAPPurchaseResult>                                                       { return NOT_WEB; }
export async function restoreApplePurchases(
  _userId: string,
): Promise<IAPRestoreResult>                                                        { return NOT_WEB; }
export function setupTransactionListener(
  _userId:    string,
  _onResult:  (result: IAPPurchaseResult) => void,
  _eventId?:  string,
): () => void                                                                       { return () => {}; }
