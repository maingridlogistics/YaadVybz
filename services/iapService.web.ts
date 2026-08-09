// ─── Vybz Hub IAP Service — Web Stub ─────────────────────────────────────────
//
// expo-iap only supports iOS and Android (StoreKit 2 / Google Play Billing).
// This stub is selected by Metro for web builds so the bundler does not attempt
// to import expo-iap's native modules on a platform they cannot run on.
//
// All functions return { ok: false } or empty arrays — IAP features are
// intentionally unavailable on web. Stripe checkout handles web payments.

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

const WEB_UNAVAILABLE: IAPPurchaseResult = {
  ok: false,
  error: 'In-app purchases are not available on web. Use the mobile app.',
};

export async function initIAP(): Promise<void> {}

export async function teardownIAP(): Promise<void> {}

export async function loadSubscriptionProducts(): Promise<IAPProduct[]> {
  return [];
}

export async function loadBoostProducts(): Promise<IAPProduct[]> {
  return [];
}

export async function loadAllProducts(): Promise<{
  subscriptions: IAPProduct[];
  boosts: IAPProduct[];
}> {
  return { subscriptions: [], boosts: [] };
}

export async function purchaseAppleSubscription(
  _productId: SubscriptionProductId,
  _userId: string,
): Promise<IAPPurchaseResult> {
  return WEB_UNAVAILABLE;
}

export async function purchaseAppleBoost(
  _productId: BoostProductId,
  _userId: string,
  _eventId: string,
): Promise<IAPPurchaseResult> {
  return WEB_UNAVAILABLE;
}

export async function restoreApplePurchases(_userId: string): Promise<IAPRestoreResult> {
  return { ok: false, error: 'Restore is not available on web. Use the mobile app.' };
}

export function setupTransactionListener(
  _userId: string,
  _onResult: (result: IAPPurchaseResult) => void,
  _eventId?: string,
): () => void {
  return () => {};
}
