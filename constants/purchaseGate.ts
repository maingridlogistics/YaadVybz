/**
 * iOS Digital Purchase Gate
 *
 * iOS digital purchases are disabled for App Store version 1.0.
 * Re-enable only after Apple In-App Purchase is implemented or the flow is
 * otherwise confirmed App Store compliant.
 *
 * To re-enable on iOS, set IOS_DIGITAL_PURCHASES_ENABLED = true here.
 * To replace with Apple IAP, set it to true and add an Apple IAP provider
 * that is consumed by the same screens that check `canPurchaseDigitalFeatures`.
 *
 * ANDROID and WEB are never affected by this gate.
 */

import { Platform } from 'react-native';

/**
 * Master flag — flip to true once Apple In-App Purchase is implemented.
 * This is the ONLY place that controls iOS purchase availability.
 */
export const IOS_DIGITAL_PURCHASES_ENABLED = false;

/**
 * True when the current platform can initiate or manage Stripe digital purchases.
 *
 * - Android: always true (Stripe flows remain fully active)
 * - Web:     always true (Stripe flows remain fully active)
 * - iOS:     controlled by IOS_DIGITAL_PURCHASES_ENABLED (currently false)
 */
export const canPurchaseDigitalFeatures: boolean =
  Platform.OS !== 'ios' || IOS_DIGITAL_PURCHASES_ENABLED;
