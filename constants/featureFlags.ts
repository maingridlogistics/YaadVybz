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
