/**
 * iOS Digital Purchase Gate
 *
 * Phase 3 (Apple StoreKit 2) complete — iOS digital purchases are enabled.
 * iOS subscriptions and boost consumables are purchased via Apple IAP.
 *
 * Google Play Billing is intentionally deferred to the next release.
 * Android uses Stripe Checkout until Google Play products are registered
 * and the Google Play monetization phase is implemented.
 *
 * To re-enable Google IAP: set GOOGLE_IAP_ENABLED = true.
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
 * Controls whether Android uses Google Play Billing.
 *
 * false = Android deferred — routes to Stripe Checkout instead (current release)
 * true  = Google Play Billing active (next release, after products are registered)
 *
 * Setting this to false prevents Android users from hitting unregistered
 * Google Play product IDs and seeing a store-level error dialog.
 */
export const GOOGLE_IAP_ENABLED = false;

/**
 * True when the current platform can initiate digital purchases.
 *
 * - iOS:     true when IOS_DIGITAL_PURCHASES_ENABLED (Apple IAP)
 * - Android: true always (Google Play Billing when GOOGLE_IAP_ENABLED, else Stripe)
 * - Web:     true always (Stripe)
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
 * True when the current platform uses Google Play Billing for purchases.
 * false until GOOGLE_IAP_ENABLED = true — Android falls through to Stripe.
 * Used to conditionally render Google-specific UI (localized prices,
 * Restore Purchases, Google Play disclosures).
 */
export const isGoogleIAP: boolean = Platform.OS === 'android' && GOOGLE_IAP_ENABLED;

/**
 * True when native IAP is active (Apple or Google Play).
 * False on web (Stripe) and on Android while Google IAP is deferred.
 */
export const isNativeIAP: boolean = isAppleIAP || isGoogleIAP;

/**
 * True when the current user can redeem included boost credits.
 *
 * Credit redemption is ALWAYS allowed regardless of platform or
 * IOS_DIGITAL_PURCHASES_ENABLED — boost credits are entitlements already
 * included in a Pro/Elite subscription; redeeming them is NOT a new purchase.
 * They must never be gated behind canPurchaseDigitalFeatures.
 */
export const canRedeemBoostCredits = true;
