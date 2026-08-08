/**
 * iOS Digital Purchase Gate
 *
 * Phase 3 (Apple StoreKit 2) complete — iOS digital purchases are enabled.
 * iOS subscriptions and boost consumables are purchased via Apple IAP.
 * Android and Web continue to use Stripe.
 *
 * To disable iOS purchases again, set IOS_DIGITAL_PURCHASES_ENABLED = false.
 */

import { Platform } from 'react-native';

/**
 * Master flag — controls whether iOS can initiate digital purchases.
 * true  = Apple IAP flows active (current — Phase 3 complete)
 * false = iOS redirected away from purchase screens
 */
export const IOS_DIGITAL_PURCHASES_ENABLED = true;

/**
 * True when the current platform can initiate digital purchases.
 *
 * - Android: always true (Stripe)
 * - Web:     always true (Stripe)
 * - iOS:     true when IOS_DIGITAL_PURCHASES_ENABLED (Apple IAP)
 */
export const canPurchaseDigitalFeatures: boolean =
  Platform.OS !== 'ios' || IOS_DIGITAL_PURCHASES_ENABLED;

/**
 * True when the current platform uses Apple IAP for purchases.
 * Used to conditionally render Apple-specific UI (localized prices,
 * Restore Purchases button, Apple payment disclosures).
 */
export const isAppleIAP: boolean = Platform.OS === 'ios';

/**
 * True when the current user can redeem included boost credits.
 *
 * Credit redemption is ALWAYS allowed regardless of platform or
 * IOS_DIGITAL_PURCHASES_ENABLED — boost credits are entitlements already
 * included in a Pro/Elite subscription; redeeming them is NOT a new purchase.
 * They must never be gated behind canPurchaseDigitalFeatures.
 */
export const canRedeemBoostCredits = true;
