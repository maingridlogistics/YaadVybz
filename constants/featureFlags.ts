/**
 * Centralized feature flags for Vybz Hub.
 *
 * Set a flag to `false` to hide the corresponding feature from the production
 * UI without removing the underlying implementation.  This lets features be
 * re-enabled quickly once the required external configuration is in place.
 */

/**
 * Phone authentication disabled for production launch until Twilio/Supabase
 * SMS configuration is completed.
 *
 * When `false`:
 *  - The Phone / OTP tab is hidden from the Sign In form.
 *  - All underlying `signInWithPhone` / `verifyOTP` code remains intact and
 *    can be restored by flipping this flag back to `true`.
 */
export const PHONE_AUTH_ENABLED = false;

/**
 * In-app ticketing system disabled for production launch.
 *
 * When `false`:
 *  - No ticketing UI is shown to any user (promoters, attendees, scanners).
 *  - Existing free-event behavior is completely unchanged.
 *  - All ticketing schema and backend code may be developed safely behind this flag.
 *  - Flip to `true` only after Phase 2+ checkout and QR scanner are complete
 *    and all store/payment provider configuration is verified.
 */
export const TICKETING_ENABLED = true;

/**
 * Native Stripe PaymentSheet for mobile ticket purchases.
 *
 * When `true`:  Mobile checkout uses the native in-app Stripe PaymentSheet
 *               (supports Apple Pay, Google Pay, Link, Klarna where eligible).
 * When `false`: Mobile checkout falls back to the hosted Stripe Checkout
 *               Session opened via WebBrowser (original behaviour, unchanged).
 *
 * IMPORTANT: Native PaymentSheet requires a NEW EAS native build.
 * Expo Go and OTA updates alone are NOT sufficient for Apple Pay / Google Pay.
 *
 * Default: `false` — flip to `true` only after real-device QA passes the
 * full test matrix (iOS + Android, USD + JMD, card + wallets + 3DS).
 */
export const NATIVE_TICKET_PAYMENTS_ENABLED = true;

/**
 * WhatsApp OTP authentication via Twilio Verify.
 *
 * When `true`: "Continue with WhatsApp" button is shown on the auth screen.
 * The send-whatsapp-otp and verify-whatsapp-otp Edge Functions must be deployed
 * and Twilio credentials must be configured as Supabase secrets.
 */
export const WHATSAPP_AUTH_ENABLED = true;
