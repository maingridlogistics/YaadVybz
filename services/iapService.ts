// ─── Vybz Hub IAP Service — Generic Fallback ────────────────────────────────
//
// Metro resolves platform-specific extensions in priority order:
//   iOS / Android → services/iapService.native.ts  (full StoreKit 2 / Google Play)
//   Web           → services/iapService.web.ts     (no-op stubs)
//   Other         → this file                      (no-op stubs, same as web)
//
// ❗ DO NOT import expo-iap here.
//    expo-iap is a native-only library. Importing it in this fallback file
//    causes `npx expo config` to fail when expo-iap is not yet installed
//    (e.g. in a clean EAS build environment before `npm install` runs), and
//    causes bundling failures on any non-native platform.
//
//    The full IAP implementation lives exclusively in iapService.native.ts.
//    This file is a syntactically valid stub that satisfies TypeScript and
//    the module graph without touching any native module.
//
// MONETIZATION MODEL:
//   • com.vybzhub.pro.lifetime — NON-CONSUMABLE one-time lifetime Pro ($49.99)
//   • com.vybzhub.boost.*     — CONSUMABLE in-app boosts
//   • Elite = admin-granted only (no purchase path)

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

const UNAVAILABLE: IAPPurchaseResult = {
  ok: false,
  error: 'In-app purchases are not available on this platform.',
};

export async function initIAP(): Promise<void> {}
export async function teardownIAP(): Promise<void> {}
export async function loadProProduct(): Promise<IAPProduct | null> { return null; }
export async function loadBoostProducts(): Promise<IAPProduct[]> { return []; }
export async function loadAllProducts(): Promise<{ proProduct: IAPProduct | null; boosts: IAPProduct[] }> {
  return { proProduct: null, boosts: [] };
}
export async function loadSubscriptionProducts(): Promise<IAPProduct[]> { return []; }

export async function purchaseLifetimePro(_userId: string): Promise<IAPPurchaseResult> {
  return UNAVAILABLE;
}

export async function purchaseAppleSubscription(
  _productId: string,
  _userId: string,
): Promise<IAPPurchaseResult> {
  return UNAVAILABLE;
}

export async function purchaseAppleBoost(
  _productId: BoostProductId,
  _userId: string,
  _eventId: string,
): Promise<IAPPurchaseResult> {
  return UNAVAILABLE;
}

export async function purchaseAppleBusinessPromotion(
  _productId: string,
  _userId: string,
  _promotionId: string,
): Promise<IAPPurchaseResult> {
  return UNAVAILABLE;
}

export async function restoreApplePurchases(_userId: string): Promise<IAPRestoreResult> {
  return { ok: false, error: 'Restore is not available on this platform.' };
}

export function setupTransactionListener(
  _userId: string,
  _onResult: (result: IAPPurchaseResult) => void,
  _eventId?: string,
): () => void {
  return () => {};
}
