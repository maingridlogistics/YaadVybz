# VYBZ HUB FINAL RELEASE READINESS AUDIT
**Generated:** August 9, 2026  
**Audit Scope:** Full codebase — Frontend, Backend, Database, Edge Functions, Payment Systems, Security, Compliance

---

## SCORECARD

| Category                   | Score |
|----------------------------|-------|
| **Overall Release Score**  | 71/100 |
| Architecture               | 78/100 |
| Security                   | 80/100 |
| Apple Readiness            | 84/100 |
| Google Play Readiness      | 68/100 |
| Stripe Readiness           | 88/100 |
| Database Quality           | 74/100 |
| Performance                | 73/100 |
| Maintainability            | 70/100 |
| User Experience            | 82/100 |
| Subscription System        | 79/100 |
| Boost System               | 81/100 |
| Admin System               | 77/100 |
| Cross-Platform Readiness   | 74/100 |
| Code Quality               | 72/100 |
| Technical Debt             | 68/100 |
| Risk Level                 | MEDIUM-HIGH |

---

## ISSUES — COMPLETE LIST

---

### CRITICAL SEVERITY

---

**ISSUE-001**
- **Severity:** CRITICAL  
- **File:** `supabase/functions/google-play-notifications/index.ts`  
- **Function:** Main handler  
- **Platform:** Android  
- **Description:** The Google Pub/Sub authentication token is conditionally enforced. If `GOOGLE_PUBSUB_TOKEN` is not set in Edge Function secrets (and it is NOT currently listed in the configured secrets), any external actor can POST to the RTDN endpoint and forge subscription lifecycle events — upgrades, downgrades, renewals, and cancellations — for any user.  
- **Root Cause:** `if (expectedToken && receivedToken !== expectedToken)` — the check only fires when the env var exists. The secret `GOOGLE_PUBSUB_TOKEN` is absent from the configured secrets list.  
- **Fix:** Add `GOOGLE_PUBSUB_TOKEN` to Supabase Edge Function secrets immediately. Change the guard to reject ALL requests unconditionally when the token is absent: `if (!expectedToken || receivedToken !== expectedToken)`.  
- **Priority:** P0 — MUST FIX BEFORE PRODUCTION  
- **Estimated Time:** 30 minutes  

---

**ISSUE-002**
- **Severity:** CRITICAL  
- **File:** `supabase/functions/create-subscription-checkout/index.ts`, `supabase/functions/create-boost-checkout/index.ts`  
- **Function:** Main handlers  
- **Platform:** Android  
- **Description:** Both checkout Edge Functions block iOS requests but do NOT block Android. Android users can successfully create Stripe Checkout sessions for subscriptions and boosts, bypassing Google Play Billing entirely. This violates Google Play's billing policy (all digital goods sold to Android users must use Google Play Billing) and risks app removal from the Play Store.  
- **Root Cause:** The iOS platform check `if (clientPlatform === 'ios')` was added but the equivalent Android check was deferred and never implemented.  
- **Fix:** Add `if (clientPlatform === 'android') { return 403 directing to Google Play Billing }` immediately below the iOS gate in both functions.  
- **Priority:** P0 — MUST FIX BEFORE PRODUCTION  
- **Estimated Time:** 1 hour  

---

**ISSUE-003**
- **Severity:** CRITICAL  
- **File:** `supabase/functions/google-play-notifications/index.ts`  
- **Function:** Subscription notification handler  
- **Platform:** Android  
- **Description:** `SUBSCRIPTION_ON_HOLD` is included in the `isDowngrade` group, causing `downgradeToFree()` to be called immediately. Account hold is a temporary state during which Google allows continued access while retrying billing. Downgrading immediately on `SUBSCRIPTION_ON_HOLD` incorrectly revokes access before the actual billing retry period expires. By contrast, `verify-google-purchase/index.ts` correctly maps `SUBSCRIPTION_STATE_ON_HOLD` to `'past_due'` (not free).  
- **Root Cause:** Incorrect event grouping. `SUBSCRIPTION_ON_HOLD` should map to `past_due` (preserve entitlements, update status), not to a downgrade.  
- **Fix:** Remove `SUBSCRIPTION_ON_HOLD` from the `isDowngrade` array. Add a separate handler that calls `syncSubscriptionEntitlements` with `subscriptionStatus: 'past_due'` instead of `downgradeToFree`.  
- **Priority:** P0 — MUST FIX BEFORE PRODUCTION  
- **Estimated Time:** 2 hours  

---

**ISSUE-004**
- **Severity:** CRITICAL  
- **File:** `supabase/functions/google-play-notifications/index.ts`  
- **Function:** All handlers  
- **Platform:** Android  
- **Description:** The Google Play Real-Time Developer Notifications webhook has not been registered in the Google Play Console. Without a registered Pub/Sub push URL, ALL subscription lifecycle events (renewals, cancellations, grace periods, refunds) are silently lost. Android subscribers who cancel or receive refunds will retain entitlements indefinitely. Subscribers whose cards fail will not be marked past_due.  
- **Root Cause:** RTDN webhook registration is a pending setup task documented in audit notes but never completed.  
- **Fix:** Register the Pub/Sub push URL in Play Console → Monetize → Subscriptions → Real-time developer notifications. URL format: `https://twilfdbvrzhlnllcmssc.supabase.co/functions/v1/google-play-notifications?token=<GOOGLE_PUBSUB_TOKEN>`. Must be done alongside ISSUE-001.  
- **Priority:** P0 — MUST FIX BEFORE PRODUCTION  
- **Estimated Time:** 2 hours (including secret setup)  

---

### HIGH SEVERITY

---

**ISSUE-005**
- **Severity:** HIGH  
- **File:** `supabase/functions/_shared/entitlements.ts`  
- **Function:** `syncSubscriptionEntitlements`, `activateBoostEntitlement`  
- **Platform:** All  
- **Description:** Google subscription purchase tokens and Google boost order IDs are stored in `user_profiles.apple_original_transaction_id` and `boost_purchases.apple_transaction_id`. These columns were designed for Apple-only data. Storing Google credentials in Apple-named columns creates semantic confusion, makes cross-provider queries misleading, and could cause incorrect provider detection. The client-side `entitlementService.getEntitlementSnapshot()` incorrectly identifies Google subscribers as Apple subscribers because it checks `apple_original_transaction_id` first.  
- **Root Cause:** The original schema only had `apple_original_transaction_id`. When Google support was added, Google data was written to the same field as an expedient solution rather than adding a separate column.  
- **Fix:** Add `google_purchase_token` to `user_profiles` and `google_order_id` to `boost_purchases`. Update `syncSubscriptionEntitlements` to write to the correct column based on `paymentProvider`. Update `getEntitlementSnapshot()` to detect Google by the new column. Migration: copy existing Google tokens from `apple_original_transaction_id` to `google_purchase_token` for rows where `payment_provider = 'google'`.  
- **Priority:** P1  
- **Estimated Time:** 4 hours (DB migration + code update)  

---

**ISSUE-006**
- **Severity:** HIGH  
- **File:** `supabase/functions/apple-iap-notifications/index.ts`  
- **Function:** `DID_RENEW` handler  
- **Platform:** iOS  
- **Description:** The `DID_RENEW` handler calls `resetBoostCredits()` and updates `user_profiles.subscription_status` and `current_period_end` directly, but does NOT call `syncSubscriptionEntitlements()`. As a result, `events.promoter_tier` is not updated after renewal. If a user's subscription was downgraded during a grace period, their events continue showing the stale `promoter_tier` value even after successful renewal.  
- **Root Cause:** The `DID_RENEW` handler was written to be minimal (only resetting boosts and updating dates), bypassing the shared sync function.  
- **Fix:** Replace the direct `user_profiles` update in `DID_RENEW` with a call to `syncSubscriptionEntitlements()` that includes `overrideRemainingBoosts: allowance` and passes the correct plan tier from the existing subscription row.  
- **Priority:** P1  
- **Estimated Time:** 2 hours  

---

**ISSUE-007**
- **Severity:** HIGH  
- **File:** `supabase/functions/_shared/subscriptionGuard.ts`  
- **Function:** `checkSubscriptionEligibility`  
- **Platform:** All  
- **Description:** When `user_profiles` shows an active subscription but no matching row exists in the `subscriptions` ledger (a partial-failure scenario possible after an atomic write fails), the guard logs a warning and returns `eligible: true`, allowing a new purchase. This creates a double-billing vulnerability in the narrow window between a partial DB failure.  
- **Root Cause:** The fallback behavior prioritizes availability over correctness. When data is inconsistent, a new purchase should be blocked pending manual investigation, not allowed.  
- **Fix:** When `profile.subscription_tier !== 'free'` and `profileStatus` is active but no ledger row exists, return `eligible: false` with `eligibility: 'admin_granted'` (since admin grants are the most likely cause of a profile-only row). Alternatively, surface a specific "contact_support" eligibility that the UI handles by showing a support link.  
- **Priority:** P1  
- **Estimated Time:** 1 hour  

---

**ISSUE-008**
- **Severity:** HIGH  
- **File:** `app/admin/index.tsx`  
- **Function:** `handleGrantSubscription`  
- **Platform:** Web (Admin)  
- **Description:** Admin subscription grants write directly to `user_profiles` from the client via the anonymous Supabase client. The `authenticated_update_own_profile` RLS policy allows any authenticated user to update their own profile. The `is_admin()` function guards the `admin_update_user_profiles` policy for OTHER users' profiles. However, the grant updates fields like `subscription_tier`, `verified_promoter`, `remaining_boosts` using the anon key client (`supabase` from `lib/supabase`). If the admin RLS policy is misconfigured or the `is_admin()` function has a bug, any authenticated user could call these same column updates on their own profile.  
- **Root Cause:** Admin operations should exclusively use server-side Edge Functions with service-role access, not direct DB writes from the client.  
- **Fix:** Create a `admin-grant-subscription` Edge Function that verifies admin role server-side with service role key before writing. Remove all direct `supabase.from('user_profiles').update(...)` calls from admin subscription grant flow.  
- **Priority:** P1  
- **Estimated Time:** 3 hours  

---

**ISSUE-009**
- **Severity:** HIGH  
- **File:** `contexts/AuthContext.tsx`  
- **Function:** `upgradePlan`  
- **Platform:** All  
- **Description:** `upgradePlan(tier)` writes subscription tier, verified status, and expiry directly to the database from the client without any payment verification or server-side authorization. It is exposed in the AuthContext value object. Even though no current UI calls it directly (it appears to be dead code from pre-payment-system development), it creates a client-side subscription grant path that should not exist.  
- **Root Cause:** Legacy function from before the server-side payment verification system was built, never removed.  
- **Fix:** Remove `upgradePlan` from `AuthContext`, its type definition, and its context value export entirely. Verify no UI component imports or calls it.  
- **Priority:** P1  
- **Estimated Time:** 30 minutes  

---

**ISSUE-010**
- **Severity:** HIGH  
- **File:** `supabase/functions/use-boost-credit/index.ts`  
- **Function:** Compensating transaction (line ~line 140)  
- **Platform:** All  
- **Description:** When the boost activation fails after successfully decrementing credits, the credit refund restores to the original `currentBoosts` value rather than `currentBoosts - 1 + 1`. If a concurrent operation also decremented credits between the decrement and the refund, the restore would overwrite the concurrent change, creating phantom credits.  
- **Root Cause:** The compensating transaction uses an absolute value instead of a relative increment. Should use `remaining_boosts = remaining_boosts + 1` guarded by `remaining_boosts < monthly_boost_allowance`.  
- **Fix:** Change the refund update to: `UPDATE user_profiles SET remaining_boosts = remaining_boosts + 1 WHERE id = $userId AND remaining_boosts < monthly_boost_allowance`. This makes the refund idempotent and race-safe.  
- **Priority:** P1  
- **Estimated Time:** 1 hour  

---

### MEDIUM SEVERITY

---

**ISSUE-011**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/_shared/entitlements.ts`  
- **Function:** `activateBoostEntitlement`  
- **Platform:** iOS, Android  
- **Description:** For Apple and Google boosts, the `boost_purchases.stripe_checkout_session` column (which has a `NOT NULL` constraint designed for Stripe) is populated with a semantically meaningless placeholder value: `"apple_<transactionId>"` or `"google_<transactionId>"`. Credit redemptions use `"credit_<userId>_<timestamp>"`. These placeholders make the column unqueryable for Stripe-specific lookups and corrupt data integrity.  
- **Root Cause:** Schema designed with Stripe-only boosts in mind. The `NOT NULL` constraint was not relaxed when Apple/Google support was added.  
- **Fix:** `ALTER TABLE boost_purchases ALTER COLUMN stripe_checkout_session DROP NOT NULL`. Remove placeholder values from `activateBoostEntitlement`. Update any queries that filter on this column to check for NULL.  
- **Priority:** P2  
- **Estimated Time:** 2 hours  

---

**ISSUE-012**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/_shared/entitlements.ts`  
- **Function:** `activateBoostEntitlement`  
- **Platform:** Android  
- **Description:** Google boost order IDs are stored in `boost_purchases.apple_transaction_id`. For Google boosts, `transactionId` contains the Google Play `orderId`, not an Apple transaction ID. The `apple-iap-notifications` REFUND handler queries `boost_purchases.apple_transaction_id = tx.transactionId` — if a Google boost purchase token ever matches what is stored in that column, incorrect results could occur.  
- **Root Cause:** Column named for Apple but repurposed for Google without renaming.  
- **Fix:** Add `google_order_id` column to `boost_purchases`. Update `activateBoostEntitlement` to populate the correct column based on `paymentProvider`. Add an index on `google_order_id` for the Google RTDN refund lookup.  
- **Priority:** P2  
- **Estimated Time:** 3 hours  

---

**ISSUE-013**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/_shared/cors.ts`  
- **Platform:** All  
- **Description:** CORS headers allow `Access-Control-Allow-Origin: *`. While this is necessary for mobile apps making direct API calls, it means any web origin can call these Edge Functions if it can obtain a valid Supabase token. Combined with the anon key being publicly available (as is standard for Supabase), this is an accepted trade-off for mobile apps — but the CORS wildcard should be documented as intentional.  
- **Root Cause:** Default permissive CORS for mobile app compatibility.  
- **Fix:** Document this as intentional. For the Stripe webhook endpoint specifically, CORS headers are unnecessary since only Stripe's servers call it (not browsers). Remove CORS headers from `stripe-webhook` to reduce attack surface.  
- **Priority:** P2  
- **Estimated Time:** 30 minutes  

---

**ISSUE-014**
- **Severity:** MEDIUM  
- **File:** Database schema  
- **Platform:** All  
- **Description:** `account_deletion_requests` table has no `rejection_reason` column. The `delete-account` Edge Function attempts to write `rejection_reason` to a non-existent column, catches the error, and retries silently without it. Admin rejection reasons entered in the admin panel are never persisted. The UI shows a rejection reason input that saves nothing.  
- **Root Cause:** DB migration for the `rejection_reason` column was not applied.  
- **Fix:** `ALTER TABLE account_deletion_requests ADD COLUMN rejection_reason text;` Apply migration and remove the silent retry fallback from the Edge Function.  
- **Priority:** P2  
- **Estimated Time:** 1 hour  

---

**ISSUE-015**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/stripe-webhook/index.ts`  
- **Function:** `invoice.payment_succeeded`  
- **Platform:** Web  
- **Description:** The subscription cycle renewal handler reads `monthly_boost_allowance` from `user_profiles` but the `subscriptions` table has no `monthly_boost_allowance` column (the `select` query tries to fetch it: `select 'user_id, plan, monthly_boost_allowance'`). The query will silently return null for the non-existent column, causing `allowance` to default to 0. Stripe subscribers will have their boost credits reset to 0 on every renewal instead of their plan allowance.  
- **Root Cause:** The select query references a column (`monthly_boost_allowance`) that exists only on `user_profiles`, not on `subscriptions`. The code then correctly reads from `user_profiles`, so functionally it works — but the `subRow.plan` and the unnecessary `subscriptions.monthly_boost_allowance` fetch are confusing and could break if query shape changes.  
- **Fix:** Remove `monthly_boost_allowance` from the `subscriptions` select. The subsequent `user_profiles` query already fetches the correct value. Verify that the reset sets `remaining_boosts = allowance` (from the `user_profiles` row) rather than 0.  
- **Priority:** P2  
- **Estimated Time:** 1 hour  

---

**ISSUE-016**
- **Severity:** MEDIUM  
- **File:** `services/subscriptionService.ts`  
- **Function:** `checkSubscriptionEligibility`  
- **Platform:** All  
- **Description:** The function invokes the Edge Function using `supabase.functions.invoke('check-subscription-eligibility?provider=${provider}', { method: 'GET' } as any)`. The `method: 'GET'` option is not in the official Supabase JS SDK `FunctionsInvokeOptions` type (hence `as any`). Behavior depends on the SDK version. If the SDK ignores the method override and defaults to POST, the query string appended to the function name may or may not be preserved, leading to the `provider` parameter defaulting to `'stripe'` for all platforms.  
- **Root Cause:** Non-standard invocation pattern to simulate GET from the functions SDK.  
- **Fix:** Either: (a) switch to `supabase.functions.invoke('check-subscription-eligibility', { body: { provider } })` and update the Edge Function to read from the body; or (b) use raw `fetch` with the full function URL and a proper GET request. Option (a) is simpler and consistent with other Edge Function calls.  
- **Priority:** P2  
- **Estimated Time:** 1.5 hours  

---

**ISSUE-017**
- **Severity:** MEDIUM  
- **File:** Database — no explicit migration  
- **Platform:** All  
- **Description:** Performance-critical columns have no database indexes:  
  - `boost_purchases.provider_purchase_token` (queried in idempotency checks for every Google boost purchase)  
  - `boost_purchases.apple_transaction_id` (queried in Apple REFUND notification handler)  
  - `boost_purchases.stripe_payment_intent` (queried in Stripe `charge.refunded` handler)  
  As volume grows, these lookups degrade from O(log n) to O(n) table scans.  
- **Root Cause:** Indexes were not added when the columns were created.  
- **Fix:**  
  ```sql
  CREATE INDEX IF NOT EXISTS boost_purchases_provider_purchase_token_idx ON boost_purchases (provider_purchase_token);
  CREATE INDEX IF NOT EXISTS boost_purchases_apple_transaction_id_idx ON boost_purchases (apple_transaction_id);
  CREATE INDEX IF NOT EXISTS boost_purchases_stripe_payment_intent_idx ON boost_purchases (stripe_payment_intent);
  ```  
- **Priority:** P2  
- **Estimated Time:** 30 minutes  

---

**ISSUE-018**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/apple-iap-notifications/index.ts`  
- **Function:** `CONSUMPTION_REQUEST` handler (unhandled — falls to `default`)  
- **Platform:** iOS  
- **Description:** Apple sends a `CONSUMPTION_REQUEST` notification when a user requests a refund for a consumable product. Apps are required to respond to this notification within 12 hours with consumption information (whether or not the user has consumed the item). Failure to respond results in Apple treating the purchase as unconsumed, which may affect refund decisions and could eventually affect App Store review status.  
- **Root Cause:** `CONSUMPTION_REQUEST` falls to the unhandled default branch.  
- **Fix:** Add a `CONSUMPTION_REQUEST` case that calls the App Store Server API to submit consumption data. At minimum, log the request with the transaction ID and product ID so manual review is possible. For a full implementation, call `POST /inApps/v1/transactions/consumption/{transactionId}` with the consumption status.  
- **Priority:** P2  
- **Estimated Time:** 3 hours  

---

**ISSUE-019**
- **Severity:** MEDIUM  
- **File:** `metro.config.js`  
- **Platform:** iOS, Android  
- **Description:** `config.transformer.hermesParser = false` disables the Hermes parser globally, including in native (iOS/Android) production builds. Hermes parser is optimized for React Native and its deactivation may increase bundle parsing time on device. The original intent was only to fix a web preview parsing error, not to affect native builds.  
- **Root Cause:** The `hermesParser: false` flag was set globally as a workaround for a web preview compatibility issue with hermes-parser@0.25.1 and react-native@0.79.4.  
- **Fix:** Conditionally disable hermes-parser only for web: `if (process.env.EXPO_TARGET === 'web') { config.transformer.hermesParser = false; }`. Alternatively, investigate whether the underlying hermes-parser version mismatch can be resolved by overriding the dependency version.  
- **Priority:** P2  
- **Estimated Time:** 2 hours  

---

**ISSUE-020**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/_shared/appleJws.ts`  
- **Function:** Root CA fingerprint check  
- **Platform:** iOS  
- **Description:** The Apple Root CA G2 fingerprint stored in `APPLE_ROOT_CA_SHA256` (`c2b9b042dd...`) has not been verified against the actual Apple Root CA G2 DER certificate. If incorrect, any JWS with a chain terminating at the real Apple G2 root would log a warning but continue processing (the check is non-fatal). However, if Apple rotates its root CA (documented as G3 for StoreKit 2), and the G3 fingerprint listed (`63343abf...`) is also unverified, the defense-in-depth check becomes meaningless.  
- **Root Cause:** Fingerprints were added based on documentation references without runtime verification.  
- **Fix:** Download the actual Apple Root CA G3 certificate from `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer`, compute its SHA-256, and compare against the stored value. Update if different.  
- **Priority:** P2  
- **Estimated Time:** 1 hour  

---

**ISSUE-021**
- **Severity:** MEDIUM  
- **File:** `supabase/functions/verify-google-purchase/index.ts`  
- **Function:** Subscription verification  
- **Platform:** Android  
- **Description:** When the Google subscriptionsv2 API returns `SUBSCRIPTION_STATE_PAUSED`, `googleStateToVybzStatus` maps it to `'canceled'`. The subscription is then written with status `'canceled'`, which triggers entitlement revocation. However, a paused subscription (user explicitly paused billing) is not the same as cancellation — the user retains history and can resume. Marking it as `'canceled'` may confuse the `subscriptionGuard` when the user tries to resume (it would see a `'canceled'` row and allow a new purchase, potentially creating a duplicate subscription row).  
- **Root Cause:** The Vybz Hub status model does not have a `'paused'` state.  
- **Fix:** Add `'paused'` as a valid subscription status. Map `SUBSCRIPTION_STATE_PAUSED` to `'paused'` and handle it the same as `'canceled'` for entitlement purposes but distinctly in the UI and subscription guard.  
- **Priority:** P2  
- **Estimated Time:** 2 hours  

---

### LOW SEVERITY / CODE QUALITY

---

**ISSUE-022**
- **Severity:** LOW  
- **File:** `services/iapService.android.ts`  
- **Function:** Entire module  
- **Platform:** Android  
- **Description:** Functions in the Android IAP service are named `purchaseAppleSubscription` and `purchaseAppleBoost`, and type aliases `AppleSubscriptionProductId` / `AppleBoostProductId` are re-exported for Google. This is extremely confusing — Apple-named functions performing Google Play operations. The only reason for this naming is API compatibility with `IAPContext`.  
- **Root Cause:** Android service was modeled to be a drop-in replacement for iOS so `IAPContext` could import the same function names.  
- **Fix:** Rename Android functions to `purchaseGoogleSubscription` and `purchaseGoogleBoost`. Add re-exports with the Apple names for backward compatibility. Alternatively, create a platform-agnostic `iapService.interface.ts` file that both implement.  
- **Priority:** P3  
- **Estimated Time:** 2 hours  

---

**ISSUE-023**
- **Severity:** LOW  
- **File:** `services/iapService.ts` (web stub)  
- **Comments** at top of file  
- **Platform:** Web  
- **Description:** The stub comment says "This file is the FALLBACK stub used on **Android** and Web." This is incorrect. Metro platform-specific resolution means Android uses `iapService.android.ts`, not the stub. The stub is only used for Web. This could mislead future developers into thinking Android uses the stub.  
- **Root Cause:** Inaccurate comment.  
- **Fix:** Update comment to: "This file is the FALLBACK stub used on Web only."  
- **Priority:** P3  
- **Estimated Time:** 5 minutes  

---

**ISSUE-024**
- **Severity:** LOW  
- **File:** `contexts/AuthContext.tsx`  
- **Function:** `signInWithGoogle`, `signInWithApple`  
- **Platform:** All  
- **Description:** Both OAuth sign-in functions unconditionally throw `Error('... Coming soon.')`. If any UI element renders a Google/Apple sign-in button and calls these, users receive a raw error. The functions are exposed in the context type and value.  
- **Root Cause:** OAuth was deferred; stub functions were never cleaned up or hidden behind a feature flag.  
- **Fix:** Either implement OAuth sign-in following the platform's OAuth specification in the Knowledge docs, or remove these functions from the context entirely and gate any OAuth UI behind a `SOCIAL_AUTH_ENABLED` feature flag in `constants/featureFlags.ts`.  
- **Priority:** P3  
- **Estimated Time:** 30 minutes to hide; 4+ hours to implement  

---

**ISSUE-025**
- **Severity:** LOW  
- **File:** `supabase/functions/admin/index.tsx`  
- **Function:** `handleGrantSubscription`  
- **Platform:** Web  
- **Description:** Admin grants insert into the `subscriptions` table without `original_transaction_id`. Multiple admin grants for the same user create multiple rows (no unique conflict prevention). The `subscriptionGuard` finds the most recent active row, but the ledger accumulates duplicate admin grant rows over time.  
- **Root Cause:** No unique constraint or conflict resolution for admin-only subscription rows.  
- **Fix:** Before inserting, check for an existing admin grant row. If found, `UPDATE` it instead of `INSERT`. Or add a partial unique constraint: `UNIQUE(user_id) WHERE payment_provider = 'admin' AND status = 'active'`.  
- **Priority:** P3  
- **Estimated Time:** 1 hour  

---

**ISSUE-026**
- **Severity:** LOW  
- **File:** `services/entitlementService.ts`  
- **Function:** `getEntitlementSnapshot`  
- **Platform:** All  
- **Description:** `paymentProvider` detection in the client-side snapshot checks `apple_original_transaction_id` to detect Apple subscribers. Because Google purchase tokens are also stored in this column (ISSUE-005), Google subscribers are incorrectly identified as `paymentProvider: 'apple'` in the snapshot. The snapshot is not currently used by critical UI flows (which use `checkSubscriptionEligibility` instead), but it is a public API that could be called by future code.  
- **Root Cause:** Consequence of ISSUE-005 (wrong column for Google data).  
- **Fix:** Resolves when ISSUE-005 is fixed (add `google_purchase_token` column). Update `getEntitlementSnapshot` to check both columns independently.  
- **Priority:** P3 (depends on ISSUE-005)  
- **Estimated Time:** 1 hour after ISSUE-005  

---

**ISSUE-027**
- **Severity:** LOW  
- **File:** `supabase/functions/create-subscription-checkout/index.ts`  
- **Function:** Checkout session creation  
- **Platform:** Web  
- **Description:** Stripe Checkout `success_url` uses the deep link scheme `vybzhub://subscription-success?session_id={CHECKOUT_SESSION_ID}`. On web, this URL would fail since `vybzhub://` is not a registered web protocol. The web checkout opens via `WebBrowser.openBrowserAsync`, which means the return is handled by the browser closing (not a deep link). However, the `Linking.addEventListener` in `upgrade.tsx` correctly handles this by checking `awaitingReturnRef.current` on browser close. The success URL would fail to open but the flow still works.  
- **Root Cause:** Deep link redirect URL used for both native and web contexts.  
- **Fix:** Use environment-specific success URLs: for web, use `https://vybzhub.com/subscription-success?session_id=...` or handle via a different mechanism. For native, keep the deep link. Pass `platform` to the Edge Function and set the URL accordingly.  
- **Priority:** P3  
- **Estimated Time:** 2 hours  

---

**ISSUE-028**
- **Severity:** LOW  
- **File:** `supabase/functions/apple-iap-notifications/index.ts`  
- **Function:** APPLE_BUNDLE_ID env check  
- **Platform:** iOS  
- **Description:** `APPLE_BUNDLE_ID` and `APPLE_REJECT_SANDBOX` are not in the configured Edge Function secrets. Both have hardcoded fallbacks (`com.chambex.vybzhub` and `undefined` respectively). While the fallback is correct for bundle ID, having secrets that are supposed to be managed via environment variables falling back to hardcoded values in production code is a configuration management issue.  
- **Root Cause:** Secrets not added to Supabase project configuration.  
- **Fix:** Add `APPLE_BUNDLE_ID=com.chambex.vybzhub` and `APPLE_REJECT_SANDBOX=true` (for production) to Supabase Edge Function secrets. Remove the hardcoded fallback for `APPLE_BUNDLE_ID` once set.  
- **Priority:** P3  
- **Estimated Time:** 30 minutes  

---

**ISSUE-029**
- **Severity:** LOW  
- **File:** `app/admin/index.tsx`  
- **Function:** Boost purchases history display  
- **Platform:** Web (Admin)  
- **Description:** The boost purchase history displays `stripe_checkout_session` value for all boost records, including Apple IAP and Google Play boosts. For non-Stripe boosts, this field contains placeholder values like `apple_txid_12345...` or `credit_abc123_...`. Admins see this as `Session: ...12345` which appears to be a Stripe session but is not.  
- **Root Cause:** Admin UI was built when only Stripe boosts existed. Non-Stripe provider fields (`provider_transaction_id`, `apple_transaction_id`) are not displayed.  
- **Fix:** Display the correct identifier based on `payment_provider`: for apple show `apple_transaction_id`, for google show `provider_purchase_token`, for stripe show `stripe_checkout_session`, for credit show "Subscription Credit".  
- **Priority:** P3  
- **Estimated Time:** 1 hour  

---

**ISSUE-030**
- **Severity:** LOW  
- **File:** `supabase/functions/stripe-webhook/index.ts`  
- **Function:** Boost activation (checkout.session.completed)  
- **Platform:** Web  
- **Description:** The Stripe webhook boost activation path does not use `activateBoostEntitlement()` from `_shared/entitlements.ts` — it implements the same logic inline. This creates two separate code paths for boost activation (Stripe inline vs. shared function for Apple/Google). Any future change to boost activation logic must be applied in both places.  
- **Root Cause:** The shared `activateBoostEntitlement` function was likely written after the Stripe webhook boost path.  
- **Fix:** Refactor the Stripe boost activation in `stripe-webhook` to call `activateBoostEntitlement()`. The Stripe-specific fields (`paymentIntent`, `checkoutSession`, `amount`, `currency`) are already parameters on the shared function.  
- **Priority:** P3  
- **Estimated Time:** 2 hours  

---

## MISSING CONFIGURATIONS (Not Code Bugs)

| Item | Status | Impact |
|------|--------|--------|
| `GOOGLE_PUBSUB_TOKEN` secret | **NOT SET** | RTDN endpoint is open (ISSUE-001) |
| `APPLE_BUNDLE_ID` secret | Not set (has fallback) | Low risk |
| `APPLE_REJECT_SANDBOX` secret | Not set | Sandbox purchases go through in production |
| Apple ASSN V2 production URL registration | Unknown | If not registered, Apple lifecycle events are lost |
| Apple ASSN V2 sandbox URL registration | Unknown | TestFlight lifecycle events lost |
| Google Play RTDN Pub/Sub registration | **NOT DONE** | All Android lifecycle events lost (ISSUE-004) |
| `rejection_reason` DB column | **MISSING** | Rejection reasons not saved (ISSUE-014) |

---

## FINAL RELEASE CHECKLIST

| Item | Status |
|------|--------|
| Apple JWS signature verification | ✅ PASS |
| Apple appAccountToken anti-replay check | ✅ PASS |
| Apple bundle ID validation | ✅ PASS |
| Apple sandbox/production separation | ✅ PASS |
| Apple subscription lifecycle (SUBSCRIBED, DID_RENEW, EXPIRED, REVOKE, REFUND) | ✅ PASS |
| Apple consumable boost idempotency | ✅ PASS |
| Apple DID_RENEW events.promoter_tier sync | ⚠️ WARNING — ISSUE-006 |
| Apple CONSUMPTION_REQUEST handling | ⚠️ WARNING — ISSUE-018 |
| Apple ASSN V2 URL registered in App Store Connect | ❓ UNVERIFIED |
| Restore Purchases button | ✅ PASS |
| Subscription disclosure text | ✅ PASS |
| Localized pricing from StoreKit | ✅ PASS |
| Manage Subscription → App Store Settings (iOS) | ✅ PASS |
| No Stripe purchase UI on iOS | ✅ PASS |
| Privacy Policy link | ✅ PASS |
| Terms of Use link | ✅ PASS |
| Subscription Terms link (iOS) | ✅ PASS |
| Google Play Billing Library v6+ | ✅ PASS |
| Google purchase token server verification | ✅ PASS |
| Google purchase acknowledgement (server-side) | ✅ PASS |
| Google consumable consumption (server-side) | ✅ PASS |
| Google RTDN registered in Play Console | ❌ FAIL — ISSUE-004 |
| GOOGLE_PUBSUB_TOKEN secret configured | ❌ FAIL — ISSUE-001 |
| RTDN endpoint authenticated | ❌ FAIL — ISSUE-001 |
| Android Stripe checkout blocked | ❌ FAIL — ISSUE-002 |
| SUBSCRIPTION_ON_HOLD handled correctly | ❌ FAIL — ISSUE-003 |
| Manage Subscription → Google Play (Android) | ✅ PASS |
| No Stripe purchase UI on Android | ❌ FAIL — ISSUE-002 |
| Stripe webhook signature verification | ✅ PASS |
| Stripe subscription lifecycle (created, updated, deleted) | ✅ PASS |
| Stripe invoice renewal boost credit reset | ✅ PASS |
| Stripe payment_failed handling | ✅ PASS |
| Stripe boost refund handling | ✅ PASS |
| Stripe customer portal for web subscribers | ✅ PASS |
| Server-side price determination (never trust client) | ✅ PASS |
| One-active-subscription guard (all providers) | ✅ PASS |
| Cross-provider double-billing prevention | ✅ PASS |
| Cross-device entitlement sync | ✅ PASS |
| Provider switching (expired → new provider) | ✅ PASS |
| Admin grant subscription | ✅ PASS (with caveats — ISSUE-008) |
| Boost credit atomic decrement | ✅ PASS |
| Boost credit compensating transaction | ⚠️ WARNING — ISSUE-010 |
| Boost event ownership verification | ✅ PASS |
| Boost replay attack prevention | ✅ PASS |
| Boost cross-event replay prevention | ✅ PASS |
| RLS enabled on all tables | ✅ PASS |
| Service-role key used for all webhook writes | ✅ PASS |
| Anon key never used for privileged operations (Edge Fns) | ✅ PASS |
| Admin role cannot be self-assigned | ✅ PASS |
| Direct client DB writes for admin grants | ❌ FAIL — ISSUE-008 |
| `upgradePlan` client-side bypass removed | ❌ FAIL — ISSUE-009 |
| Missing DB indexes | ❌ FAIL — ISSUE-017 |
| `rejection_reason` column exists | ❌ FAIL — ISSUE-014 |
| Google tokens stored in correct columns | ❌ FAIL — ISSUE-005 |
| `boost_purchases.stripe_checkout_session` nullable for non-Stripe | ❌ FAIL — ISSUE-011 |
| Android Stripe blocking for boost purchases | ❌ FAIL — ISSUE-002 |

---

## FINAL ANSWER

### Is Vybz Hub ready for production?

# NO

**Blocking reasons (in order of severity):**

1. **Google Play RTDN endpoint is publicly accessible** — `GOOGLE_PUBSUB_TOKEN` is not set. Any external actor can call the endpoint and trigger fake subscription lifecycle events (upgrades, cancellations, downgrades) for any user without authentication. This is an open security vulnerability.

2. **Google Play RTDN is not registered** — All Android subscription lifecycle events (renewals, cancellations, grace periods, refunds) are silently lost because the Pub/Sub push URL has not been configured in Play Console. Android subscribers who cancel will retain their entitlements forever.

3. **Android is not blocked from Stripe checkout** — Android users can bypass Google Play Billing and purchase subscriptions/boosts via Stripe. This violates Google Play billing policy and risks app removal from the Play Store.

4. **`SUBSCRIPTION_ON_HOLD` immediately revokes Android subscriber access** — When a Google Play subscriber enters account hold (a billing retry state), the RTDN handler calls `downgradeToFree()` instead of setting `past_due`. Android subscribers having billing issues lose access immediately rather than retaining it during the billing retry window.

5. **Admin subscription grants are direct client-side DB writes** — Admin operations write subscription data using the anon key from the browser, relying entirely on RLS policies for security. These should use server-side Edge Functions with the service role key.

**The first four issues directly affect paying users and could cause lost revenue, incorrect billing, Google Play policy violations, and a compromised authentication surface.** These must be resolved before any public launch.

---

*This report was generated by automated static analysis and manual code review of all frontend pages, backend Edge Functions, database schema, RLS policies, and payment provider integrations.*
