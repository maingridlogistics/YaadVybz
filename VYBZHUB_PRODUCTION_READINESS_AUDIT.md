# VYBZ HUB — FINAL PRODUCTION READINESS AUDIT
**Date:** August 7, 2026  
**Audit Type:** Comprehensive Pre-Release Audit  
**Target:** Apple App Store + Google Play Store  
**Auditor:** OnSpace AI — Full Codebase Analysis

---

## A. EXECUTIVE SUMMARY

### Overall Readiness Score: **62 / 100**

### Release Recommendation: **RELEASE AFTER BLOCKERS**

The application is architecturally sound with a well-structured backend, correct iOS purchase gate, and a mature event/RSVP system. However, several release blockers exist — most critically: the `.env` file with Supabase keys is absent from the project (no `EXPO_PUBLIC_SUPABASE_ANON_KEY` or `EXPO_PUBLIC_SUPABASE_URL` set), Google and Apple OAuth are stubbed with `throw new Error(...)`, the app uses `scheme: "onspaceapp"` (shared OnSpace dev scheme rather than a production `com.chambex.vybzhub://` scheme), and the `aps-environment` entitlement defaults to `development` in non-production builds.

| Category | Count |
|---|---|
| 🚨 Release Blockers | 8 |
| ❌ Verified Broken | 5 |
| ⚠️ Partially Working | 11 |
| 🟡 Code Verified — Manual Test Required | 24 |
| ⚪ Not Implemented | 6 |
| 🔵 External Configuration Required | 14 |

---

## B. VERIFIED WORKING ✅

Evidence: Direct code inspection + architectural correctness of implementation.

1. **RSVP Mutual Exclusivity** — `toggleGoing` / `toggleInterested` correctly remove the opposing RSVP atomically with debounce protection (400ms). Both DB rows and optimistic state update together.

2. **iOS Purchase Gate** — `canPurchaseDigitalFeatures` in `constants/purchaseGate.ts` correctly returns `false` on iOS, gates all Stripe UI (upgrade screen, boost screen both call `router.replace` and return null on iOS). Server-side `create-boost-checkout` also rejects `platform: 'ios'`.

3. **Permission System (On-Demand)** — All four `requestMediaLibraryPermissionsAsync()` calls are exclusively inside `onPress` handlers (verified lines: `profile.tsx:413`, `post.tsx:437`, `edit-event/[id].tsx:652`, `admin/ads/[placementId].tsx:149`). No permission call on mount or navigation.

4. **Map — No Location Permission** — `JamaicaMap.native.tsx` contains zero calls to `requestForegroundPermissionsAsync`, `requestBackgroundPermissionsAsync`, `getCurrentPositionAsync`, or `watchPositionAsync`. Map displays event markers only, uses fixed parish coordinates.

5. **Android Permission Blocklist** — `app.json` `blockedPermissions` array covers: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `ACTIVITY_RECOGNITION`, `CAMERA`, `RECORD_AUDIO`, `READ_CONTACTS`, `WRITE_CONTACTS`, `READ_CALENDAR`, `WRITE_CALENDAR`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `READ_MEDIA_VIDEO`, `AD_ID`. Camera and microphone permissions also blocked at `expo-image-picker` plugin level.

6. **Event Ranking — Single Source of Truth** — `rankingUtils.ts` exports `compareBrowse`, `compareFeatured`, `compareTrending`. All sorting surfaces import from here. Boost expiry checked at runtime via `getBoostScore()`. Expired boosts receive score 0. Tier never overrides boost.

7. **Stripe Webhook — Server-Side Price Enforcement** — `create-boost-checkout` never accepts a price from the client. Prices are fully server-side: `three_day=$1.99`, `seven_day=$3.99`, `until_event_end=$6.99`. Upgrade deltas are also server-only. Ownership verified before Stripe session creation.

8. **RLS Policies** — All tables have RLS enabled. User data queries are filtered by `auth.uid() = user_id`. Admin functions use service-role client in edge functions. The `protect_boost_fields_trigger` prevents client-side boost activation.

9. **Account Deletion Flow** — Client submits `account_deletion_requests` insert (RLS enforced). Admin calls `delete-account` edge function with `request_id`. Edge function verifies admin role server-side, calls `auth.admin.deleteUser()`. Real-time subscription in `AuthContext` triggers auto-signout on status change to `approved`.

10. **Session Persistence** — `createStorageAdapter()` uses `AsyncStorage` on native and `localStorage` on web. `autoRefreshToken: true`, `persistSession: true`. AppState listener properly pauses/resumes auto-refresh. Session restoration in `useEffect` with loading state.

11. **Duplicate RSVP Prevention** — `user_rsvps` unique constraint on `(user_id, event_id, status)`. Client uses `upsert` with `onConflict: 'user_id,event_id,status'`. `processingRef` debounce prevents rapid double-tap creating duplicate DB calls.

12. **Image Compression Pipeline** — 3-variant (thumb/card/full) compression via `expo-image-manipulator`. Variants uploaded in parallel via `Promise.allSettled`. EXIF orientation corrected. Local file guard prevents broken `file://` URIs entering the database.

13. **Password Reset — Retry Logic** — `resetPassword()` retries up to 4 times with 2s delay on SMTP timeout signals (`context deadline`, `504`, `request_timeout`). Protects against Postal SMTP latency.

14. **Admin Role Protection** — `activateAdmin()` throws immediately. `enforce_admin_role_assignment` DB trigger prevents self-promotion. Admin panel has role check gate at render time. `delete-account` edge function verifies `roles contains 'admin'` server-side.

15. **Free-Plan Event Limit (3/month)** — Correctly counts current-month events in `app/(tabs)/post.tsx` before showing the "Limit Reached" gate. Only counts `live`/`pending` events (excludes `rejected`).

16. **Sound System / Lineup Display** — `ROLE_DISPLAY` map in event detail normalizes `'Speaker' → 'Sound System'` at render time. Icon selector in lineup correctly shows `'speaker'` icon for Sound System role.

17. **Supabase Client Fallback** — `supabase.ts` uses `placeholder-key` if `EXPO_PUBLIC_SUPABASE_ANON_KEY` is missing, logs a console warning, and exposes `supabaseReady: boolean` so UI can detect misconfiguration.

---

## C. VERIFIED BROKEN ❌

### C1. Missing .env File — Backend Not Connected
**Status:** 🚨 RELEASE BLOCKER  
**Evidence:** `.env` file listed in project but `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_SUPABASE_URL` are not set (Backend Context shows `Connected` — the dashboard credentials exist but the `.env` file in the project repository is empty or absent).  
**Impact:** App launches but all auth, event loading, RSVP, profile updates, and every Supabase call silently fail with `placeholder-key` errors. Auth screen shows the config warning banner.  
**Fix:** Create `.env` with `EXPO_PUBLIC_SUPABASE_URL=https://twilfdbvrzhlnllcmssc.supabase.co` and `EXPO_PUBLIC_SUPABASE_ANON_KEY=<real key from Supabase Dashboard>`.

### C2. Google Sign-In — Throws Immediately
**Status:** ❌ VERIFIED BROKEN  
**File:** `contexts/AuthContext.tsx:signInWithGoogle()`  
**Evidence:** `throw new Error('Google sign-in requires OAuth configuration. Coming soon.')` — the function throws unconditionally on every call. The auth screen's social buttons section is commented out, so this is not user-visible, but any call would crash.  
**Impact:** Non-blocking for App Store if buttons remain hidden. Blocking if OAuth buttons are ever shown.

### C3. Apple Sign-In — Throws Immediately
**Status:** ❌ VERIFIED BROKEN  
**File:** `contexts/AuthContext.tsx:signInWithApple()`  
**Evidence:** Same pattern as Google — throws `'Apple sign-in requires OAuth configuration. Coming soon.'`  
**Impact:** Same as C2.

### C4. Phone OTP Sign-In — Not Configured
**Status:** ❌ NOT WORKING IN PRODUCTION  
**File:** `app/auth.tsx` — renders the phone method UI but the notice says "Phone sign-in requires Twilio configuration in your Supabase project settings."  
**Evidence:** `signInWithPhone()` calls `supabase.auth.signInWithOtp({ phone })`. Without Twilio configured in Supabase, this will return an error. The UI is visible to users.  
**Impact:** Users who tap the "Phone" tab and try to send an OTP will receive an error. Misleading UX.  
**Fix:** Either remove the Phone tab or configure Twilio in Supabase.

### C5. `useBoostCredit()` Function — Never Called From UI
**Status:** ❌ DEAD CODE  
**File:** `services/subscriptionService.ts:useBoostCredit()`  
**Evidence:** This function is defined but never imported or called from any screen or hook. The boost flow uses Stripe checkout (`create-boost-checkout` Edge Function) for paid boosts, and `boostEvent()` in EventsContext for admin grants. Promoters cannot redeem their monthly free boost credits.  
**Impact:** Pro subscribers with `remaining_boosts > 0` have no way to use their free boost credits from the app. Monthly boost credit is a key selling point of the Pro/Elite plan.  
**Severity:** High — feature advertised in pricing but inaccessible.

---

## D. PARTIALLY WORKING ⚠️

### D1. Image Variant URLs — Partial Reliability
`getThumbUrl()`, `getCardUrl()`, `getFullUrl()` in `lib/storage.ts` perform string replacement on `_full.jpg` suffix. Images from Unsplash (fallback gallery) or custom URL inputs return unchanged — no variant. If a Supabase URL uses a different naming pattern (e.g. older uploads without `_full.jpg` suffix), the replacement fails silently and returns the original URL. No 404 error, but performance benefits of variants are lost for legacy images.

### D2. Promoter Follower Count
`app/promoter/[id].tsx` uses `MOCK_PROMOTER_SOCIALS[promoterId]?.followerCount ?? 0`. `MOCK_PROMOTER_SOCIALS` is an empty object `{}` in `constants/data.ts`. Real follower counts are stored in the `follows` table but are never queried on the promoter profile screen. All promoters display `0 Followers`.

### D3. Promoter Bio and Social Links
Same issue — `MOCK_PROMOTER_SOCIALS[promoterId]?.bio` returns `undefined` → fallback to `'Event organizer on Vybz Hub.'` for every promoter. Social links section never renders. Promoter profiles have no real bio or social media presence displayed.

### D4. Notification Reminders — Scheduling Only (No Background Delivery)
`scheduleEventReminder()` in `NotificationsContext` uses `expo-notifications` local scheduling. This works correctly for events where the user grants notification permission on-device. However, if the OS kills the app, Android may not deliver scheduled local notifications reliably on some OEMs (Xiaomi, Huawei). Not a code issue — a platform limitation.

### D5. Boost Credits UI for Pro/Elite Users
The subscription card in `profile.tsx` correctly shows `remaining_boosts` from the user profile. The `upgrade.tsx` screen shows remaining credits. However, there is no "Use Free Boost" button on the My Events screen — the boost button always routes to the paid Stripe checkout. `useBoostCredit()` exists but is never called (see C5).

### D6. Weather Widget — External API Dependency
`WeatherWidget` component is used in `event/[id].tsx` for every event detail view. The widget implementation was not read in this audit pass but it is referenced. If the weather API key or endpoint is misconfigured, it will silently fail or display an error state per-event. This is non-blocking if the component has proper error handling.

### D7. Event Edit — `contactInfo` Field Missing From Form
`app/edit-event/[id].tsx` has fields for ticket link, photos link, dress code, lineup, but does **not** include a `contactInfo` field. The create form (`post.tsx`) does include it at Step 5. Existing `contactInfo` values on events cannot be edited. DB column exists, create form populates it, but edit form cannot modify it.

### D8. Event Edit — No 3-Variant Compression
`app/edit-event/[id].tsx` calls `uploadEventImages()` which does produce 3-variant compressed images. However, when gallery/Unsplash images are selected (not device-picked), they are passed through `uploadEventImages()` unchanged (remote URLs are passed through). This is consistent with the create flow. Listed as partial because newly device-uploaded images during editing do get compressed, but the edit form doesn't prevent mixing old Supabase variant URLs with new ones, potentially creating inconsistent URL patterns.

### D9. View Count — Non-Unique Increments
`event/[id].tsx` calls `supabase.rpc('increment_view_count', { p_event_id: id })` on every page mount. There is no deduplication — the same user viewing the same event multiple times (back/forward navigation) increments the counter each time. Not a crash, but the metric is inflated.

### D10. Admin Analytics — Estimated MRR
The Analytics tab shows estimated MRR calculated from `subStats.pro * 9.99 + subStats.elite * 24.99`. This only reflects monthly pricing. Yearly subscribers ($89.99/yr Pro, $224.99/yr Elite) are counted as if they pay monthly, inflating or deflating MRR estimates. No critical business impact, but administratively misleading.

### D11. Notification Types — `rsvp_reminder` Email Type Defined But Not Scheduled
`emailService.ts` exports `emailRsvpReminder()` and the `send-email` edge function has `rsvp_reminder` in `EMAIL_PREF_MAP`. However, there is no code in the app that actually triggers RSVP reminder emails. `scheduleEventReminder()` schedules a *local push notification* for 2 hours before the event but does not call `emailRsvpReminder()`. Email reminders are never sent.

---

## E. CODE VERIFIED — MANUAL TEST REQUIRED 🟡

(Cannot be confirmed without a physical device or live environment)

1. **Push Notification Delivery (Android FCM)** — FCM HTTP v1 with OAuth2 caching is correctly implemented in `send-email` edge function. Stale token cleanup is conservative. Requires physical Android device with Google Play Services to verify delivery.

2. **Push Notification Delivery (iOS Expo)** — Expo push service integration with receipt queue (`push_receipt_queue`) and `check-push-receipts` function is correctly implemented. Requires physical iOS device with production build.

3. **Notification Modal — First Sign-In** — `NOTIF_MODAL_SHOWN_KEY` AsyncStorage flag prevents re-showing. Code logic is correct. Requires clean install + first sign-in on physical device to verify timing.

4. **Password Reset Deep Link** — `redirectTo: 'onspaceapp://auth'` in `resetPassword()`. `app.config.js` sets `aps-environment: 'production'` for production builds. Deep link should work in production builds. Requires sending an actual reset email and clicking the link on device.

5. **Stripe Checkout — Boost Purchase** — Full flow (Edge Function → Stripe → WebBrowser → deep link return → event refresh) is architecturally correct. Requires live Stripe keys and a physical device to verify end-to-end.

6. **Stripe Checkout — Subscription** — Same as above. `success_url: onspaceapp://subscription-success` deep link listener is in `upgrade.tsx`. Requires live test.

7. **Stripe Webhook — Boost Activation** — Webhook signature verification, idempotency check, and boost field update logic all appear correct in code. Requires Stripe dashboard webhook configuration and a test payment to verify.

8. **Stripe Webhook — Subscription Events** — All 6 event types handled. Subscription entitlement sync looks correct. Requires live test with each event type.

9. **Customer Portal** — `customer-portal` Edge Function exists. URL is opened via `WebBrowser.openBrowserAsync`. Requires an active Stripe subscription to test.

10. **Admin `delete-account` Function** — Logic is correct (admin role check → `auth.admin.deleteUser()` → cascade). Real-time subscription in AuthContext triggers signout on status change. Requires live admin account and test user.

11. **SMTP Email Delivery** — Postal primary / SMTP fallback configured via secrets. Test email and SMTP probe exist in admin panel. Requires live admin session to test.

12. **FCM Service Account** — `FCM_SERVICE_ACCOUNT_JSON` secret must be set. `parseFcmServiceAccount()` validates fields. Requires Firebase console verification.

13. **Google Maps on Android** — `PROVIDER_GOOGLE` with `AIzaSyCG0p2km3OUFNmGb2vSW-1aPyhZVJBGUJI` API key. Previous blank map bug was fixed (provider logic restored). Requires physical Android device. **Note:** the API key is committed in `app.json` — see Security section.

14. **iOS APNs Push — Production Entitlement** — `app.config.js` correctly sets `aps-environment: 'production'` for `EAS_BUILD_PROFILE=production` builds. Requires a production EAS build.

15. **EAS Build Health** — `eas.json` references `latest` build images for production. `autoIncrement: true` for iOS builds. Build has not been verified as successfully completing — requires running `eas build --platform all --profile production`.

16. **Native Permission Manifest Output** — Only verifiable by running `npx expo prebuild --clean` and inspecting generated `android/app/src/main/AndroidManifest.xml` and `ios/VybzHub/Info.plist`. Cannot be verified from source files alone.

17. **Avatar Upload — CDN Cache Busting** — Timestamped filenames in `uploadProfilePhoto()` should bust CDN cache. Requires upload + subsequent profile load to verify the new URL is displayed correctly.

18. **Realtime RSVP Count Sync** — DB trigger `sync_event_rsvp_counts` updates event counts. Realtime subscription in EventsContext receives the update. Requires multi-device or multi-tab test.

19. **Boost Expiry Cron** — `expire_stale_boosts` DB function exists. Requires `pg_cron` job to be scheduled in Supabase (not verifiable from client code).

20. **Promoter Follow — Dual Write** — `follows` table upsert is fire-and-forget (no await, no error handling). If it silently fails, follower notifications (sent via `promoterIdForFollowerLookup` in Edge Function) would not find the user in `follows`. The `followed_promoters` array on `user_profiles` is the source of truth; the `follows` table is secondary for server-side fan-out. **Risk:** Edge Function uses `followed_promoters` array (correct), not the `follows` table, so the dual-write failure is non-critical for notifications but the `follows` table data may be stale.

21. **App Store Screenshots** — 8 screenshot files exist in `assets/screenshots/`. ASC app ID `6798113663` is set in `eas.json`. Store listing completeness requires App Store Connect verification.

22. **Recurring Event Display** — Events marked `recurring: true` with `recurringFrequency` display the repeat pill in event detail. UI is correct. Cannot verify if events remain correctly discoverable across multiple dates without live data.

23. **Background/Cold-Start Push Tap** — `addNotificationResponseReceivedListener` and `getLastNotificationResponseAsync` in `app/_layout.tsx` handle notification deep links. Requires cold-start test on physical device.

24. **Google Maps API Key Quota** — Key `AIzaSyCG0p2km3OUFNmGb2vSW-1aPyhZVJBGUJI` has no rate-limit information available from source. Requires Google Cloud Console verification of API restrictions and quota.

---

## F. NOT IMPLEMENTED / MISSING ⚪

1. **Apple In-App Purchase (IAP)** — `IOS_DIGITAL_PURCHASES_ENABLED = false`. iOS users cannot purchase boosts or subscriptions. Existing paid iOS subscribers retain entitlements (webhook sets them, not purchases). Documented pending task.

2. **Free Boost Credit Usage UI** — `useBoostCredit()` in subscriptionService exists but no UI entry point exists for Pro/Elite promoters to redeem their monthly free boost credits (see C5).

3. **Rejection Reason Visibility for Users** — When admin rejects a deletion request, no reason is communicated to the user beyond `status: 'rejected'`. The `deletePendingBanner` in profile.tsx doesn't show rejection reason (documented pending task).

4. **Email on Deletion Decision** — `send-email` edge function is never called from `delete-account` or `handleRejectDeletion`. User receives no email when their account deletion request is approved or rejected. (Documented pending task.)

5. **Promoter Avatar on Event Cards** — `EventCard.tsx` and `EventCardFeatured.tsx` show promoter name but no avatar image. `promoter/[id].tsx` uses letter avatar, not uploaded photo. (Documented pending task.)

6. **Squad Up — Friends List** — `app/squad/[eventId].tsx` shows "No friends yet" empty state. No social graph (friend connections between users) is implemented. The chat teaser card shows "Coming soon".

---

## G. SECURITY FINDINGS 🔒

### G1. Google Maps API Key Committed in `app.json` — MEDIUM
**File:** `app.json` → `android.config.googleMaps.apiKey: "AIzaSyCG0p2km3OUFNmGb2vSW-1aPyhZVJBGUJI"`  
**Risk:** This key is committed to the repository and will be bundled in the APK. If the repo is public or the APK is decompiled, the key is exposed. Maps API keys can be abused for quota exhaustion.  
**Fix:** Restrict the key in Google Cloud Console to the Android package `com.chambex.vybzhub` and optionally move to an EAS secret.

### G2. Supabase URL Hardcoded in `lib/supabase.ts` — LOW
`SUPABASE_URL` falls back to `'https://twilfdbvrzhlnllcmssc.supabase.co'` if env var is missing. The URL is not secret (it's a public Supabase project URL), but it's not ideal to hardcode. Low risk.

### G3. Stripe Price IDs — Correctly Server-Side Only
Edge functions read Stripe price IDs from `Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')` etc. These are never exposed client-side. No security issue found.

### G4. Admin Role Cannot Be Self-Assigned
`activateAdmin()` throws. DB trigger `enforce_admin_role_assignment` exists. Admin role check in edge functions uses service-role client. No bypass path identified.

### G5. Boost Field Protection
`protect_boost_fields_trigger` on `events` prevents client-side boost activation. Boost can only be activated via the webhook (service-role). Verified.

### G6. RLS on All Tables
All tables verified to have RLS enabled in the Backend Context. No table is missing RLS. `admin_settings` table has anon SELECT allowed (intentionally — for reading `require_event_approval` on app startup). This is appropriate as it stores non-sensitive configuration.

### G7. Service Role Key — Correctly Server-Side Only
Service role key is only accessed in Deno Edge Functions via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. Not present in any client-side code. No `.env` exposure risk for the service role key.

### G8. No Secrets Found in Client Code
No Stripe secret keys, SMTP passwords, FCM private keys, or Postal API keys found in any client-side TypeScript file.

---

## H. DATABASE FINDINGS

### H1. `user_rsvps` Unique Constraint Risk — WATCH
The unique constraint is on `(user_id, event_id, status)`. This means a user CAN have both `status='going'` AND `status='interested'` for the same event as separate rows. The recent mutual-exclusivity fix deletes the opposing status row before inserting the new one. However, there is no database-level constraint enforcing mutual exclusivity — the invariant is enforced only in client code. If an older client version or direct API call creates both rows, the display could show double-counting. Recommend a DB trigger or unique constraint on `(user_id, event_id)` with a `check` constraint for allowed status transitions.

### H2. `followed_promoters` Array + `follows` Table Dual Write
Two sources of follow truth exist. The Edge Function correctly uses `followed_promoters` (array on `user_profiles`) for fan-out. The `follows` table is secondary. The dual-write is fire-and-forget with no error handling. These could diverge silently. Not critical now, but will become a problem if follower analytics or social graph features are built on the `follows` table.

### H3. `events` Table — `view_count` Not Unique
`increment_view_count` RPC is called on every page mount. No session or user deduplication. Views are artificially inflated by repeated navigation. Low priority but affects analytics credibility.

### H4. Missing `createdAt` Column in `events` DB Mapping
`Event` interface has `createdAt?: string` and `mapEventFromDb` maps `row.created_at`. The DB column exists (`created_at` in the events table schema). The free-plan monthly limit check in `post.tsx` falls back to event date if `createdAt` is not set. This fallback is inaccurate — it would use the event date (when the event *happens*) rather than the post date (when it was *created*). Verify `created_at` is correctly populated on new inserts.

### H5. `admin_settings` — Single Row for `require_event_approval`
The moderation toggle is stored as a single row in `admin_settings`. Multiple admins concurrently toggling this could create a race condition in the `upsert` call. Low risk for typical admin team sizes.

---

## I. PERFORMANCE FINDINGS

### I1. EventsContext Loads Up to 200 Events Sorted by `created_at` DESC
`loadEvents()` queries `.limit(200)` with no additional filtering. For the initial app launch, this is acceptable. As event count grows past 200, older events will not appear in Browse or Map. No pagination is implemented in EventsContext — it would need to be added before scale.

### I2. No Image Prefetch on Home Screen
Home screen renders `EventCardFeatured` components with Unsplash/Supabase URLs. Images load on demand. Prefetch via `expo-image`'s `Image.prefetch()` is documented as a pending task. First render can show blank images briefly.

### I3. `ProfileScreen` — 4 `useMemo` Calls All Depend on Full Events Array
`goingEvents`, `interestedEvents`, `savedEvents`, `postedEvents` all filter `events` (the full event array). On every EventsContext update, all four memos recompute. With 200 events this is fast (~0.1ms each). Not a current issue but worth noting for scale.

### I4. Real-Time Channel Receives All Events Updates
EventsContext subscribes to `public:events` table — all INSERT/UPDATE/DELETE events. In a high-volume production environment with many concurrent promoters posting, this channel will generate high traffic for all connected clients. No filtering by parish or relevance is applied.

### I5. `FlatList` Usage
Browse screen uses `FlatList` correctly with `keyExtractor`. EventCard in Profile uses direct `map()` rendering inside `ScrollView` for Going/Interested/Posted tabs — this is acceptable for small lists (max 200 events) but would degrade for very large event histories.

---

## J. UI / RESPONSIVENESS FINDINGS

### J1. `Dimensions.get('window')` — Potential SSR Issue
`app/(tabs)/index.tsx` and `app/(tabs)/browse.tsx` use `Dimensions.get('window')` at module level for `width` constant. On web SSR this can return 0. The `trendStyles.card` uses `width: width * 0.72` which would render as 0-width. This is web-only but affects the Live Preview.

### J2. Horizontal ScrollViews — Chip Bars
All horizontal chip strips use `View` + `ScrollView` pattern per the design constraints. `mapWrap.chipScrollWrap` uses fixed `height: 52`. `trendingScroll` uses `marginHorizontal: -Spacing.base` for full-bleed. These are correctly implemented.

### J3. Keyboard Handling
All forms with text inputs use `KeyboardAvoidingView` with `Platform.OS === 'ios' ? 'padding' : 'height'`. Auth, post, edit-event, admin, notification settings all correctly handle keyboard.

### J4. SafeAreaView — Correct Usage
All screens use `SafeAreaView edges={['top']}` or `edges={['top', 'bottom']}` as appropriate. Tab bar height correctly accounts for `insets.bottom`.

### J5. Small iPhone (SE / 375px) — Hero Image Height
`HERO_HEIGHT = Math.min(340, Math.floor(SCREEN_HEIGHT * 0.48))`. On iPhone SE (667px height), this gives `Math.floor(667 * 0.48) = 320px`. The hero gallery is `320px` on small phones, leaving adequate room for content below. Acceptable.

### J6. Tablet — No Responsive Layout
All layouts are single-column mobile-first. On iPad, the tab bar and content will stretch to full width. Promoter profile and event detail would benefit from multi-column layout on tablet. Not a blocker but noted.

### J7. Text Truncation in Cards
`EventCard`, `EventMiniCard`, `TrendingCard` all use `numberOfLines` on title/meta. Verified. No overflow issues detected in code.

---

## K. APP STORE FINDINGS (iOS)

### K1. Digital Purchase Gate ✅
All Stripe purchase UI (upgrade screen, boost screen) correctly blocked on iOS via `canPurchaseDigitalFeatures`. Both screens call `router.replace('/(tabs)/profile')` immediately and return null. The `create-boost-checkout` Edge Function also server-side blocks `platform: 'ios'`. Compliant.

### K2. Account Deletion ✅
Accessible from profile screen. Requires admin approval (as documented). "Delete Account" button visible and functional.

### K3. Privacy Usage Strings ✅
`expo-image-picker` configured with `photosPermission: "Vybz Hub needs access to your photos so you can select event flyers and profile images to upload."`. Camera and microphone permissions are set to `false`.

### K4. iOS Entitlement — Development vs Production ⚠️
`app.json` sets `"aps-environment": "development"` statically. `app.config.js` overrides this to `"production"` only when `EAS_BUILD_PROFILE === 'production'`. If the production build is not submitted via `eas build --profile production`, or if the `EAS_BUILD_PROFILE` env var is not set, the entitlement will default to `development`. This would cause all iOS push notifications to fail silently in production.

### K5. Bundle Identifier ✅
`com.chambex.vybzhub` set in `app.json`. Matches EAS submission config (`ascAppId: 6798113663`).

### K6. Deep Link Scheme — Shared OnSpace Scheme 🚨 RELEASE BLOCKER
**Evidence:** `app.json` → `scheme: "onspaceapp"`. All password reset, Stripe success/cancel, and OAuth redirect URLs use `onspaceapp://`.  
**Problem:** `onspaceapp://` is the shared OnSpace development scheme. If another OnSpace app is installed on the same device, both apps would compete for the same URL scheme. iOS shows an ambiguous chooser dialog. Password reset deep links may open the wrong app.  
**Fix:** Change `scheme` to `"vybzhub"` (or `"com.chambex.vybzhub"`) and update all `redirectTo`, `success_url`, `cancel_url`, and Supabase Auth Site URL accordingly.

### K7. In-App Review / Rating Flow — Missing
No `expo-store-review` integration. Not a compliance issue but a missed conversion opportunity.

### K8. Privacy Policy and Terms of Service Links
`app/(tabs)/profile.tsx` has a "Contact Support" button linking to `mailto:`. There is no in-app Privacy Policy or Terms of Service link. App Store requires privacy policy URL to be configured in App Store Connect. Not a blocking issue if configured in ASC.

---

## L. GOOGLE PLAY FINDINGS

### L1. Target SDK ✅
`eas.json` production Android uses `image: "latest"` EAS build image. Latest EAS images target SDK 35 (Android 15). Compliant with Play Store requirements (target SDK ≥ 34).

### L2. `AD_ID` Declaration ✅
`com.google.android.gms.permission.AD_ID` is in `blockedPermissions`. No Advertising ID usage detected in code. Play Store Data Safety form should reflect no advertising ID collection.

### L3. Camera and Microphone ✅
Both blocked at multiple levels (blockedPermissions + expo-image-picker plugin flags).

### L4. edgeToEdgeEnabled ✅
`android.edgeToEdgeEnabled: true` in `app.json`. Required for Android 16+.

### L5. Package Name ✅
`com.chambex.vybzhub` set correctly.

### L6. Deep Link Scheme — Same Issue as iOS 🚨
`onspaceapp://` scheme creates the same problem on Android. App Links (verified deep links via HTTPS) are not configured. Recommend migration to `vybzhub://` scheme.

### L7. Play Store Data Safety
The app collects: email address (required), device push tokens, event RSVPs, user profile data, location data (home parish — user-provided, not GPS). The Data Safety form must be completed accurately in Play Console.

---

## M. EXTERNAL CONFIGURATION CHECKLIST 🔵

| # | Service | Setting | Expected Value | Blocks Release? |
|---|---------|---------|----------------|-----------------|
| 1 | Supabase Auth | Site URL | `onspaceapp://auth` (or `vybzhub://auth` after scheme fix) | ✅ YES — password reset deep links fail |
| 2 | Supabase Auth | Redirect URLs allowlist | includes `onspaceapp://auth` | ✅ YES |
| 3 | Supabase | `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` | Anon key from Dashboard → API | ✅ YES |
| 4 | Supabase Edge Functions | `STRIPE_SECRET_KEY` secret | Live Stripe secret key | ✅ YES for payments |
| 5 | Supabase Edge Functions | `STRIPE_WEBHOOK_SECRET` secret | From Stripe Dashboard webhook | ✅ YES for payments |
| 6 | Supabase Edge Functions | `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_YEARLY` | Live Stripe price IDs | ✅ YES for subscriptions |
| 7 | Supabase Edge Functions | `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON | ⚠️ YES for Android push |
| 8 | Supabase Edge Functions | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Postal/SMTP credentials | ⚠️ YES for email |
| 9 | Supabase Edge Functions | `POSTAL_API_URL`, `POSTAL_API_KEY` | Postal API credentials | ⚠️ YES for email |
| 10 | Supabase | `pg_cron` job for `expire_stale_boosts` | Scheduled SQL job | ⚠️ Soft — boosts don't auto-expire |
| 11 | Google Cloud Console | Maps API Key restrictions | Restrict to `com.chambex.vybzhub` Android package | ⚠️ Security |
| 12 | Stripe Dashboard | Webhook endpoint URL | Supabase Edge Function URL for `stripe-webhook` | ✅ YES |
| 13 | Stripe Dashboard | Webhook events subscribed | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded` | ✅ YES |
| 14 | Apple Developer / ASC | Push Notification certificate (APNs) | Production APNs key uploaded to Expo | ✅ YES for iOS push |
| 15 | Apple Developer | App ID with Push Notifications capability | Enabled for `com.chambex.vybzhub` | ✅ YES |
| 16 | Supabase Auth | Email templates | Customized to match Vybz Hub branding | ⚠️ Soft |
| 17 | App Store Connect | Privacy Policy URL | https://vybzhub.com/privacy or equivalent | ✅ Required by Apple |
| 18 | Google Play Console | Data Safety Form completed | Accurate reflection of data collection | ✅ Required by Google |

---

## N. PHYSICAL DEVICE TEST MATRIX

| Test | iOS | Android | Priority |
|------|-----|---------|----------|
| Fresh install — no permission prompt on launch | Manual | Manual | P0 |
| First sign-in — branded notification modal appears | Manual | Manual | P0 |
| Tap "Enable Notifications" — native prompt appears | Manual | Manual | P0 |
| Tap "Not Now" — no native prompt | Manual | Manual | P0 |
| Upload Flyer — permission only after tap | Manual | Manual | P0 |
| Change Profile Photo — permission only after tap | Manual | Manual | P0 |
| Map opens — no location prompt | Manual | Manual | P0 |
| Password reset email → link opens app → set new password | Manual | Manual | P0 |
| Boost purchase → Stripe → back to app → event boosted | — | Manual | P1 |
| Subscription purchase → Stripe → back to app → plan upgraded | — | Manual | P1 |
| Customer portal → plan change → webhook → profile updated | — | Manual | P1 |
| Push notification received (Going RSVP event changed) | Manual | Manual | P1 |
| Push notification tap → opens event detail | Manual | Manual | P1 |
| Admin deletes account → user sees deletion alert → redirected | Manual | Manual | P1 |
| Offline launch — error banner shown, retry works | Manual | Manual | P2 |
| Large image upload (10MB) — compressed correctly | Manual | Manual | P2 |
| Google Maps tiles load on Android | — | Manual | P1 |
| Dark map style renders correctly | — | Manual | P2 |

---

## O. RELEASE BLOCKERS 🚨

Listed in priority order:

**BLOCKER 1 — `.env` File Missing / Backend Not Connected**  
App cannot connect to Supabase. All features are broken without the anon key.  
Fix: Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `.env`.

**BLOCKER 2 — App Scheme `onspaceapp://` Must Be Changed to App-Specific Scheme**  
Using the shared OnSpace dev scheme in a production app store release causes deep link ambiguity, password reset failures, and Stripe redirect failures.  
Fix: Change `scheme` in `app.json` to `"vybzhub"`. Update Supabase Auth Site URL and Redirect URLs. Update all `redirectTo` / `success_url` / `cancel_url` strings in AuthContext and Edge Functions.

**BLOCKER 3 — Supabase Auth Site URL Must Match App Scheme**  
Without updating Supabase Auth Site URL to match the production scheme, password reset deep links will fail or be rejected by Supabase.  
Fix: Dashboard → Authentication → URL Configuration → Site URL = `vybzhub://auth`.

**BLOCKER 4 — `aps-environment` Entitlement Must Be `production` for Store Build**  
`app.json` defaults to `development`. The dynamic `app.config.js` only sets `production` when `EAS_BUILD_PROFILE === 'production'`. If the EAS build is not explicitly run with `--profile production`, iOS push notifications will be silently broken.  
Fix: Verify `eas build --platform ios --profile production` is used for store submission. Alternatively, set `"aps-environment": "production"` statically in `app.json` for safety.

**BLOCKER 5 — Stripe Webhook Not Verified to Be Configured**  
Subscription and boost payments require the `stripe-webhook` Edge Function URL to be registered in Stripe Dashboard with correct events. Without it, purchases create checkout sessions but entitlements are never activated.  
Fix: Verify `https://twilfdbvrzhlnllcmssc.supabase.co/functions/v1/stripe-webhook` is registered in Stripe → Webhooks with all 6 required event types.

**BLOCKER 6 — Google Maps API Key Unrestricted**  
Committed key in `app.json` is potentially unrestricted. An unrestricted key in production can be abused.  
Fix: Restrict to Android package `com.chambex.vybzhub` in Google Cloud Console before release.

**BLOCKER 7 — Phone OTP Sign-In UI Visible Without Backend Support**  
The phone auth tab is visible to all users. Without Twilio configured in Supabase, users who attempt it will receive an error with no helpful guidance.  
Fix: Either configure Twilio or hide the Phone tab on the auth screen.

**BLOCKER 8 — Free Boost Credits Cannot Be Redeemed**  
Pro/Elite subscribers are sold the feature "1/5 free boosts per month" but there is no UI to use them. The boost screen routes all users to paid Stripe checkout regardless of remaining credits.  
Fix: Add "Use Free Boost" path when `user.remainingBoosts > 0` and platform is not iOS, calling `useBoostCredit()`.

---

## P. PRE-RELEASE FIX PLAN

### PHASE 1 — Release Blockers (Critical — Before Any Store Submission)
1. Create `.env` file with Supabase keys.
2. Change `scheme` from `"onspaceapp"` to `"vybzhub"` in `app.json`. Update all deep link strings in `AuthContext.tsx` (`redirectTo`), `app/monetization/upgrade.tsx` (success/cancel URLs), `supabase/functions/create-boost-checkout/index.ts` (success/cancel URLs), and `supabase/functions/create-subscription-checkout/index.ts`.
3. Update Supabase Auth Site URL and Redirect URLs to `vybzhub://auth`.
4. Confirm EAS production build uses `--profile production`. Alternatively add `"aps-environment": "production"` statically to `app.json`.
5. Verify Stripe webhook is registered and all 6 events are subscribed.
6. Restrict Google Maps API key to the Android package in Google Cloud Console.
7. Hide Phone OTP tab or configure Twilio in Supabase.
8. Add "Use Free Boost" UI path for Pro/Elite promoters.

### PHASE 2 — High-Risk Issues (Before Wide Release)
1. Fix `contactInfo` field missing from edit-event form.
2. Replace `MOCK_PROMOTER_SOCIALS` with real DB query for follower count and bio on promoter profile.
3. Add database-level mutual exclusivity constraint on `user_rsvps` per `(user_id, event_id)`.
4. Schedule `pg_cron` job for `expire_stale_boosts` DB function.
5. Configure Privacy Policy URL in App Store Connect and link from app.
6. Complete Google Play Data Safety form.

### PHASE 3 — Functional Regression Testing
1. Verify all RSVP flows (going, interested, mutual exclusivity) with Supabase connected.
2. Test event creation, upload, and visibility end-to-end.
3. Verify notification settings save correctly.
4. Test admin panel: approve/reject events, manage ads, grant boosts.
5. Test deletion request submission and admin approval flow.

### PHASE 4 — Physical Device Testing
Follow the test matrix in section N. Priority P0 items must pass before submission.

### PHASE 5 — Store Submission Verification
1. Run `eas build --platform all --profile production`.
2. Verify iOS build has `aps-environment: production` entitlement.
3. Submit iOS build to TestFlight. Test all P0 scenarios.
4. Verify Google Play AAB with internal testing track.
5. Submit to both stores for review.

---

## Q. FINAL GO / NO-GO CHECKLIST

| Item | Status |
|------|--------|
| `.env` file with Supabase keys configured | ❌ FAILED |
| App scheme changed to production-specific value | ❌ FAILED |
| Supabase Auth Site URL updated | 🔵 EXTERNAL VERIFICATION REQUIRED |
| iOS `aps-environment: production` confirmed for store build | 🟡 MANUAL VERIFICATION REQUIRED |
| Stripe webhook registered with all 6 events | 🔵 EXTERNAL VERIFICATION REQUIRED |
| Stripe price IDs configured in Edge Function secrets | 🔵 EXTERNAL VERIFICATION REQUIRED |
| Google Maps API key restricted | 🔵 EXTERNAL VERIFICATION REQUIRED |
| FCM service account JSON secret configured | 🔵 EXTERNAL VERIFICATION REQUIRED |
| SMTP/Postal secrets configured for email | 🔵 EXTERNAL VERIFICATION REQUIRED |
| Free boost credit redemption UI implemented | ❌ FAILED |
| Phone OTP tab hidden or Twilio configured | ❌ FAILED |
| iOS digital purchase gate active (all Stripe UI hidden) | ✅ VERIFIED |
| Account deletion accessible from profile | ✅ VERIFIED |
| Photos permission only on-demand | ✅ VERIFIED |
| Map has no location permission request | ✅ VERIFIED |
| Admin role cannot be self-assigned | ✅ VERIFIED |
| Boost price enforced server-side | ✅ VERIFIED |
| All tables have RLS enabled | ✅ VERIFIED |
| No Stripe/SMTP secrets in client code | ✅ VERIFIED |
| Google Play Data Safety form completed | 🔵 EXTERNAL VERIFICATION REQUIRED |
| App Store privacy policy URL configured | 🔵 EXTERNAL VERIFICATION REQUIRED |
| Physical device push notification delivery | 🟡 MANUAL VERIFICATION REQUIRED |
| Physical device password reset deep link | 🟡 MANUAL VERIFICATION REQUIRED |
| Physical device Stripe checkout and return | 🟡 MANUAL VERIFICATION REQUIRED |
| Android Google Maps renders correctly | 🟡 MANUAL VERIFICATION REQUIRED |
| EAS production build completes without errors | 🟡 MANUAL VERIFICATION REQUIRED |

---

*Audit completed: August 7, 2026. All findings are based on direct source code inspection of the current project state. No physical device testing was performed during this audit. Ratings reflect code-verified state only — see section E for items requiring manual verification.*
