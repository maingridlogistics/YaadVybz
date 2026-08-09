# VYBZ HUB — FINAL PRODUCTION READINESS AUDIT
**Date:** 2026-08-09  
**Auditor:** OnSpace AI  
**Method:** Full source code inspection + backend context cross-reference  
**Note:** Terminal commands (npm ci, expo-doctor, bundleRelease) cannot be executed from this environment. Results for those are marked NOT VERIFIED.

---

## OVERALL STATUS

| Check | Status |
|---|---|
| OVERALL PRODUCTION READY | **NO** |
| iOS PRODUCTION READY | **CONDITIONAL** — code complete, 4 store config items missing |
| ANDROID PRODUCTION READY | **NO** — native build broken |
| APPLE SUBMISSION READY | **NO** — 6 blocking items |
| GOOGLE PLAY SUBMISSION READY | **NO** — native build broken + 5 config items |
| BACKEND READY | **YES** — Supabase ACTIVE_HEALTHY, all edge functions deployed |
| PAYMENTS READY | **CONDITIONAL** — iOS verified, Android unverified |
| SUBSCRIPTIONS READY | **CONDITIONAL** — iOS verified, Android build broken |
| BOOST SYSTEM READY | **CONDITIONAL** — iOS verified, Android build broken |
| SECURITY READY | **YES** (with 2 gaps noted below) |

**PRODUCTION READINESS SCORE: 57 / 100**

---

## EXECUTIVE SUMMARY

**What works:**
- Complete iOS IAP payment system (Apple StoreKit 2, server-side JWS verification, Restore Purchases)
- Stripe subscriptions and boosts for web
- Full backend: Supabase schema, RLS, Edge Functions, push notifications, email
- Auth: email/password signup, session persistence, password reset, account deletion
- Event CRUD lifecycle (create, publish, edit, delete, moderation)
- Browse/search/discovery with parish and category filtering
- Boost system with credit redemption and analytics
- Admin panel: event moderation, account deletion review, ad management
- Cross-provider subscription protection (prevents double-billing)
- Push notifications with FCM, deep links, foreground/background handling

**What is broken:**
- **Android native build** — expo-iap 5.1.0 pulls openiap-google 3.1.0 (Kotlin 2.4.x metadata), incompatible with Expo SDK 54's Kotlin 2.1.20. Three fix attempts made; current fix (`-Xskip-metadata-version-check` in root build.gradle) is unverified locally.

**What is incomplete:**
- Google OAuth sign-in: throws "not implemented" (no expo-web-browser OAuth flow)
- Apple Sign-In (OAuth): same
- Phone/OTP auth: disabled via feature flag (Twilio not configured)
- "In-App Ticket Sales" and "Priority Customer Support" (Elite features): show as "Coming Soon" in UI — not yet built

**What is not verified:**
- Whether `./gradlew :app:bundleRelease` passes with the Kotlin metadata skip flag
- Whether App Store Connect and Google Play Console have the correct IAP product registrations
- Whether vybzhub.com/privacy, /terms, /subscription-terms are live and contain legally valid content
- Email delivery via SMTP/Postal (secrets are set, actual delivery not tested from audit)
- GOOGLE_PUBSUB_TOKEN enforcement in google-play-notifications webhook

**What needs manual configuration:**
- App Store Connect: IAP product registrations for all 7 product IDs
- Google Play Console: subscription and consumable product registrations
- Supabase Secrets: APPLE_BUNDLE_ID, APPLE_REJECT_SANDBOX, GOOGLE_PUBSUB_TOKEN
- Live URLs: vybzhub.com/privacy, vybzhub.com/terms, vybzhub.com/subscription-terms
- Apple reviewer test account in App Store Connect

**What prevents launch today:**
1. Android build broken — cannot ship Android at all
2. Google Play product IDs not verifiably configured in Play Console
3. Apple App Store IAP products unverified in App Store Connect
4. vybzhub.com legal URLs may not be live (App Store hard-rejection risk)
5. No reviewer/test account documented for App Store review

---

## 1. BUILD / PROJECT HEALTH

| Item | Status | Notes |
|---|---|---|
| Expo SDK | ✅ | 54.0.36 |
| React Native | ✅ | 0.81.5 |
| expo-iap | ⚠️ IMPLEMENTED BUT NOT VERIFIED | 5.1.0 installed; Android native compilation broken |
| openiap-google | 🚨 PRODUCTION BLOCKER | 3.1.0 requires Kotlin 2.4.x metadata; Expo SDK 54 uses 2.1.20; fix applied but unverified |
| iOS build | ✅ WORKING | User confirmed iOS compiles and runs |
| Android build | ❌ BROKEN | `:expo-iap:compileReleaseKotlin` fails; 3 attempted fixes |
| app.config.js | ⚠️ | Added `-Xskip-metadata-version-check` in `withProjectBuildGradle` — locally unverified |
| eas.json | ✅ | Production profiles configured, autoIncrement, correct image |
| .npmrc | ⚠️ | `ignore-workspace-root-check=true` — generates npm warn on install |
| package.json | ⚠️ NOT VERIFIED | Cannot read (restricted); expect pnpm lockfile + pnpm-workspace.yaml |
| Supabase connection | ✅ | ACTIVE_HEALTHY (twilfdbvrzhlnllcmssc) |
| Deep link scheme | ✅ | `vybzhub://` configured; used for Stripe return, OAuth, notifications |
| npm ci --include=dev | NOT VERIFIED | Cannot execute terminal commands |
| npx expo-doctor | NOT VERIFIED | Cannot execute terminal commands |
| npx expo export --platform ios | NOT VERIFIED | Cannot execute terminal commands |
| npx expo export --platform android | NOT VERIFIED | Android build likely fails same as bundleRelease |

---

## 2. UNFINISHED / MOCK / PLACEHOLDER CODE

| Pattern | Found | Impact |
|---|---|---|
| TODO / FIXME / TEMP | None | — |
| MOCK | `MOCK_ADS` in constants/data.ts | P2 — 5 hardcoded Unsplash ads (Appleton, Digicel, Island Car, NCB, Red Stripe); used as fallback when no database ads exist. External Unsplash dependency. |
| localhost / 127.0.0.1 | None | — |
| example.com | None | — |
| Coming Soon (in UI) | "In-App Ticket Sales", "Priority Customer Support" | P2 — shown in Elite plan features with SOON badge; not a rejection risk |
| Hardcoded payment success | None | — |
| Sandbox credentials in client | None | — |
| Development URLs | None | — |
| Empty button handlers | None found | — |
| MOCK_EVENTS | `[]` (empty) | ✅ Good — no fake events |
| MOCK_PROMOTER_SOCIALS | `{}` (empty) | ✅ Good |
| PHONE_AUTH_ENABLED | `false` | P2 — Phone tab hidden, code intact |

---

## 3. AUTH / ACCOUNTS

| Feature | Status | Notes |
|---|---|---|
| Email/password signup | ✅ WORKING | Standard Supabase auth |
| Email/password login | ✅ WORKING | `signInWithPassword` |
| Logout | ✅ WORKING | Non-blocking, routes to onboarding immediately |
| Session persistence | ✅ WORKING | AsyncStorage (mobile) / localStorage (web) |
| Forgot password | ✅ WORKING | Supabase email reset |
| Reset password deep link | ✅ WORKING | `passwordRecoveryMode` detected in AuthContext, redirects to /auth |
| Profile creation | ✅ WORKING | `handle_new_user` trigger on `auth.users` |
| Profile editing | ✅ WORKING | Name, avatar, preferred parishes, interests |
| Avatar upload | ✅ WORKING | `profile-images` bucket, 5MB limit |
| Email verification | ⚠️ NOT VERIFIED | Supabase default setting; unverified whether required |
| Account deletion | ✅ WORKING | Soft-delete with admin review; `delete-account` edge function |
| Invalid/expired session | ✅ WORKING | `onAuthStateChange` listener; AppState refresh/pause |
| Google OAuth | ❌ NOT IMPLEMENTED | No expo-web-browser OAuth flow |
| Apple Sign-In (OAuth) | ❌ NOT IMPLEMENTED | No implementation |
| Phone/OTP | ❌ DISABLED | Feature flag `PHONE_AUTH_ENABLED = false` |
| Cross-user data access | 🔒 BLOCKED | RLS enforced on all tables; users cannot read other users' private data |

---

## 4. ROLES / PERMISSIONS / RLS

### User Roles
| Role | Granted By | Description |
|---|---|---|
| `attendee` | Default (trigger) | All registered users |
| `promoter` | Self-activation via `addPromoterRole()` | Event posting |
| `admin` | Admin-only update (RLS + trigger) | Full platform access |

### Permissions Matrix

| Action | Attendee | Promoter | Admin | Enforcement |
|---|---|---|---|---|
| Read live events | ✅ | ✅ | ✅ | RLS: `anon_select_live_events` |
| Create events | ❌ | ✅ (own) | ✅ | RLS: `authenticated_insert_own_events` — `promoter_id = auth.uid()` |
| Edit another user's event | ❌ | ❌ | ✅ | RLS: `authenticated_update_own_events` — `promoter_id = auth.uid() OR is_admin()` |
| Delete another user's event | ❌ | ❌ | ✅ | RLS: `authenticated_delete_own_events` |
| Change own subscription tier | ❌ | ❌ | ❌ | Written only by service role in edge functions |
| Grant themselves boosts | ❌ | ❌ | ❌ | `protect_boost_fields_trigger` + `use_boost_credit_atomic` RPC; RLS blocks direct update |
| Modify payments | ❌ | ❌ | ❌ | `boost_purchases`: admin insert only; service role writes all payment records |
| Access admin data | ❌ | ❌ | ✅ | `is_admin()` function checks `roles` array; used in all admin RLS policies |
| Escalate to admin role | ❌ | ❌ | ❌ | `enforce_admin_role_assignment` trigger prevents all non-admin role escalation |
| Read another user's profile | ❌ | ❌ | ✅ | RLS: `authenticated_select_own_profile` — `id = auth.uid()` |
| Read another user's subscription | ❌ | ❌ | ✅ | RLS: `authenticated_select_own_subscriptions` |
| Read another user's notifications | ❌ | ❌ | ✅ | RLS: `authenticated_select_own_notifications` |
| Read another user's RSVPs | ❌ | ❌ | ❌ | RLS: `authenticated_select_own_rsvps` |

**RLS Assessment: ✅ SOLID** — All tables have RLS enabled. No privilege escalation path identified. Service role key never exposed to client.

---

## 5. NAVIGATION / UI FUNCTIONALITY

| Item | Status | Notes |
|---|---|---|
| Home tab | ✅ | — |
| Browse tab | ✅ | — |
| Post tab | ✅ | Hidden for admin users |
| Map tab | ✅ | — |
| Profile tab | ✅ | Admin panel embedded for admins |
| Event detail | ✅ | /event/[id] |
| Promoter profile | ✅ | /promoter/[id] |
| Edit event | ✅ | /edit-event/[id] |
| Notifications | ✅ | /notifications |
| Notification settings | ✅ | /notification-settings |
| Admin panel | ✅ | Embedded in profile tab |
| Admin ads management | ✅ | /admin/ads/[placementId] |
| Boost purchase | ✅ | /monetization/boost/[id] |
| Boost performance | ✅ | /monetization/boost-performance/[id] |
| Subscription upgrade | ✅ | /monetization/upgrade |
| My events | ✅ | /my-events |
| Squad | ✅ | /squad/[eventId] |
| Onboarding | ✅ | /onboarding |
| Auth | ✅ | /auth |
| Notification deep links | ✅ | All 10 notification types route correctly |
| Deletion notification routing | ✅ | Admin → deletions tab; user → profile |
| Dead buttons | None found | — |
| Broken routes | None found | — |

---

## 6. EVENT SYSTEM

| Feature | Status | Notes |
|---|---|---|
| Create event | ✅ | Via Post tab |
| Edit event | ✅ | /edit-event/[id], promoter-only |
| Delete event | ✅ | Admin and promoter |
| Publish / status control | ✅ | `pending` → `live` (or admin approval) |
| Flyer images (multi-image) | ✅ | Up to N images, event-images bucket |
| Date/time | ✅ | Jamaica UTC-5 correct parsing (`isUpcoming`, `isEventPassed`, `isToday`) |
| Location / Parish | ✅ | 14 Jamaica parishes |
| Category | ✅ | 12 event types |
| Lineup entries | ✅ | `lineupEntries` JSON field |
| Share | ⚠️ NOT VERIFIED | Not seen in audit; may exist in event detail screen |
| Search | ✅ | Text search in browse |
| Parish filter | ✅ | |
| Type filter | ✅ | |
| Favorites (bookmark) | ✅ | `userBookmarkIds`, `toggleBookmark` |
| RSVP (Going/Interested) | ✅ | `user_rsvps` table, counts synced via trigger |
| Expired events | ✅ | `isEventPassed` uses next-day 7AM threshold (events run past midnight) |
| Deleted events | ✅ | RLS: deleted events not visible; cascade on event_id FK |
| Recurring events | ✅ | `recurring` + `recurringFrequency` field |
| Contact info | ✅ | `contactInfo` field |
| Post-event photos link | ✅ | `eventPhotosLink` field |
| Pending/rejected moderation | ✅ | `status` field, admin approve/reject |
| Report count | ✅ | `report_count` field |
| View count | ✅ | `increment_event_view` function |

---

## 7. DISCOVERY / SEARCH

| Feature | Status | Notes |
|---|---|---|
| Home feed | ✅ | |
| Browse | ✅ | |
| Search | ✅ | |
| Parish filter | ✅ | |
| Category/type filter | ✅ | |
| Date filter | ⚠️ NOT VERIFIED | Not confirmed in browse screen audit |
| Featured events | ✅ | `featured` field |
| Boosted event placement | ✅ | `isBoostActive()` helper; `boosted` flag drives ranking |
| Boost ranking | ✅ | `rankingUtils.ts` present; boost impressions tracked |
| Pagination/infinite scroll | ⚠️ NOT VERIFIED | EventsContext query behavior not fully audited |
| Loading states | ✅ | `isLoading` throughout |
| Error states | ✅ | Error messages shown |
| Empty states | ✅ | Empty activity icons and CTAs |

---

## 8. SUBSCRIPTIONS

### Plan Matrix

| Plan | Monthly | Yearly | Monthly/yr equiv | Apple Monthly ID | Apple Yearly ID | Google Monthly ID | Google Yearly ID | Stripe Monthly Price | Stripe Yearly Price |
|---|---|---|---|---|---|---|---|---|---|
| Free | $0 | $0 | — | — | — | — | — | — | — |
| Promoter Pro | $9.99 | $89.99 | $7.50/mo | `com.vybzhub.subscription.promoter_pro.monthly` | `com.vybzhub.subscription.promoter_pro.yearly` | Same | Same | `STRIPE_PRICE_PRO_MONTHLY` | `STRIPE_PRICE_PRO_YEARLY` |
| Elite | $24.99 | $224.99 | $18.75/mo | `com.vybzhub.subscription.elite.monthly` | `com.vybzhub.subscription.elite.yearly` | Same | Same | `STRIPE_PRICE_ELITE_MONTHLY` | `STRIPE_PRICE_ELITE_YEARLY` |

### Plan Entitlements

| Plan | Event Limit | Boost Credits/mo | Verified Badge | Analytics | Featured Priority |
|---|---|---|---|---|---|
| Free | 3/month | 0 | No | Basic | 0 |
| Promoter Pro | Unlimited | 1 | Yes | Yes | 1 |
| Elite | Unlimited | 5 | Yes | Advanced | 2 |

### Subscription Feature Audit

| Feature | Status | Notes |
|---|---|---|
| Product loading (Apple) | ✅ | `loadAllProducts()` in IAPContext on mount |
| Product loading (Google) | ⚠️ NOT VERIFIED | Code path exists; Android build broken |
| Purchase (Apple) | ✅ | StoreKit 2 + server verify |
| Purchase (Google) | ❌ BROKEN | Android build fails |
| Stripe checkout | ✅ | `create-subscription-checkout` edge function |
| Monthly billing | ✅ | |
| Yearly billing | ✅ | |
| Upgrade/downgrade | ✅ | Via Stripe portal; Apple: App Store Settings; Google: Play Settings |
| Renewal | ✅ | `invoice.payment_succeeded` webhook handles; boost credits reset |
| Cancellation | ✅ | `customer.subscription.deleted` downgrade to free; Apple/Google: native store |
| Expiration | ✅ | `subscription_status` tracked; `current_period_end` enforced |
| Failed payment | ✅ | `invoice.payment_failed` → `past_due`; push notification sent |
| Grace period | ✅ | Stripe retries; entitlements not immediately revoked |
| Restore purchases (Apple) | ✅ | `restoreApplePurchases()` → `restorePurchases` in IAPContext |
| Restore purchases (Google) | ⚠️ NOT VERIFIED | Code path exists; Android build broken |
| Cross-device entitlement | ✅ | Server-side `user_profiles` as single source of truth |
| Cross-provider guard | ✅ | `check-subscription-eligibility` blocks double-billing |
| Admin grant | ✅ | `admin-grant-subscription` edge function |
| Entitlement only after verification | ✅ | Service role writes; client never grants locally |

---

## 9. APPLE IAP

| Item | Status | Notes |
|---|---|---|
| StoreKit 2 purchase flow | ✅ | expo-iap 5.1.0, `purchaseAppleSubscription` |
| Product IDs (7 total) | ✅ | 4 subscriptions + 3 boosts; defined in constants/data.ts |
| Server-side Apple verification | ✅ | `verify-apple-transaction` edge function |
| JWS handling | ✅ | `_shared/appleJws.ts` — root certificate chain, not shared secret |
| finishTransaction timing | ✅ | After server verification returns `ok: true` |
| Restore Purchases button | ✅ | Shown on upgrade screen when no active sub; required by Apple |
| Renewal | ✅ | Apple sends `apple-iap-notifications` RTDN |
| Expiration/revocation | ✅ | `apple-iap-notifications` handles; entitlements downgraded |
| Billing failure | ✅ | Handled via RTDN notifications |
| Cross-device login | ✅ | Server-side; JWT-based entitlement lookup |
| Sandbox rejection in prod | ⚠️ SECURITY GAP | `APPLE_REJECT_SANDBOX` not set in secrets; sandbox transactions may pass |
| APPLE_BUNDLE_ID in secrets | ⚠️ | Not in configured secrets list; may default to hardcoded 'com.chambex.vybzhub' |
| Stripe for iOS digital | ✅ CORRECT | `canPurchaseDigitalFeatures` blocks Stripe checkout on iOS |
| App Store Connect IAP setup | ⚠️ MANUAL REQUIRED | Products must be registered; cannot verify from code |
| Subscription Terms URL | ⚠️ | `https://vybzhub.com/subscription-terms` — must be live |
| Apple reviewer test account | ❌ NOT DOCUMENTED | Required for App Store review |

---

## 10. GOOGLE PLAY BILLING

| Item | Status | Notes |
|---|---|---|
| expo-iap Android | ❌ BUILD BROKEN | openiap-google 3.1.0 Kotlin metadata incompatibility |
| Product IDs (7 total) | ✅ | Defined in constants/data.ts; same IDs as Apple |
| Google Play API verification | ✅ | `verify-google-purchase` uses subscriptionsv2 API |
| Purchase token verification | ✅ | Token sent to server before any acknowledgement |
| Acknowledgement | ✅ | Server-side via subscriptionsv2 acknowledge endpoint |
| Consumption (boosts) | ✅ | `consumeProductPurchase` called after boost activation |
| RTDN/Pub/Sub | ✅ | `google-play-notifications` edge function deployed |
| GOOGLE_PUBSUB_TOKEN | 🔒 SECURITY GAP | Not in configured secrets; webhook may be unauthenticated |
| Renewal handling | ✅ | Via RTDN subscription state changes |
| Restore purchases | ⚠️ NOT VERIFIED | Code exists; Android build broken |
| Google Play Console setup | ⚠️ MANUAL REQUIRED | Subscription products must be created |
| targetSdk / compileSdk | NOT VERIFIED | Gradle files generated on prebuild; expect 36 per history |

---

## 11. CROSS-PLATFORM SUBSCRIPTIONS

| Scenario | Status | Notes |
|---|---|---|
| Apple subscriber logs into Android | ✅ | `CrossProviderBanner` shown; no re-purchase required |
| Google subscriber logs into iPhone | ✅ | `CrossProviderBanner` shown; no re-purchase required |
| Stripe/web subscriber logs into mobile | ✅ | `CrossProviderBanner` shown |
| Existing entitlement recognized from backend | ✅ | `check-subscription-eligibility` → `isSameProvider` / `isCrossProviderActive` |
| Users forced to pay twice | ❌ BLOCKED | Cross-provider guard prevents new purchase when active sub exists |
| Provider switching after expiration | ✅ | After expiration, any provider can purchase |
| Duplicate active subscriptions | ✅ BLOCKED | `warn_duplicate_active_subscription_trigger` on subscriptions table |
| Double-billing risk | 🔒 LOW | Provider guard + DB trigger; acknowledged race condition risk in multi-tab scenarios |

---

## 12. BOOST SYSTEM

### Boost Matrix

| Boost | Price | Apple Product ID | Google Product ID | Stripe | Duration |
|---|---|---|---|---|---|
| 3-Day Boost | $1.99 | `com.vybzhub.boost.three_day` | Same | `create-boost-checkout` | 3 days |
| 7-Day Boost | $3.99 | `com.vybzhub.boost.seven_day` | Same | `create-boost-checkout` | 7 days |
| Until Event End | $6.99 | `com.vybzhub.boost.until_event_end` | Same | `create-boost-checkout` | Until event date passes |

### Boost Audit

| Feature | Status | Notes |
|---|---|---|
| Purchase (Apple) | ✅ | `purchaseAppleBoost` → `verify-apple-transaction` |
| Purchase (Google) | ❌ BROKEN | Android build broken |
| Purchase (Stripe) | ✅ | `create-boost-checkout` → `stripe-webhook` |
| Backend verification | ✅ | All providers route through `activateBoostEntitlement` |
| Boost activation | ✅ | `events.boosted = true`, `boost_status = active` |
| Expiration (time-based) | ✅ | `expire_stale_boosts` DB function |
| Expiration (until-event-end) | ✅ | `isBoostActive()` checks `isEventPassed()` |
| Ranking / placement | ✅ | Boosted events sorted to top; `boost_impressions` tracked |
| Multiple boosts | ⚠️ | Upgrade path exists; old boost superseded |
| Refunds | ✅ | `charge.refunded` webhook; boost marked refunded |
| Deleted events | ✅ | `events.id` FK CASCADE on boost_purchases |
| Expired events | ✅ | `until_event_end` handled via `isEventPassed` |
| Subscription credits | ✅ | `use-boost-credit` edge function; atomic decrement via `use_boost_credit_atomic` RPC |
| Admin grants | ✅ | Admin can grant via admin panel |
| Replay protection | ✅ | `provider_purchase_token` unique index; `apple_transactions` idempotency table |
| Self-grant prevention | ✅ | `protect_boost_fields_trigger` blocks client-side boost field writes |
| Boost performance screen | ✅ | `/monetization/boost-performance/[id]` |
| Expiring notification | ✅ | `boost_expiring` notification type with deep link |

---

## 13. STRIPE / WEB PAYMENTS

### Payment Provider Matrix

| Payment Type | iOS | Android | Web | Provider |
|---|---|---|---|---|
| Subscription — new | Apple IAP | Google Play | Stripe Checkout | Multi-provider |
| Subscription — manage | App Store Settings | Play Store Settings | Stripe Customer Portal | Platform-native |
| Boost — purchase | Apple IAP | Google Play | Stripe Checkout | Multi-provider |
| Boost — refund | Apple (via App Store) | Google (via Play) | Stripe Refund | Platform-native |
| Admin subscription grant | Admin Edge Function | Admin Edge Function | Admin Edge Function | Admin |

| Item | Status | Notes |
|---|---|---|
| Stripe for iOS digital | ✅ BLOCKED | `canPurchaseDigitalFeatures` and `isAppleIAP` gate prevents Stripe checkout on iOS |
| Webhook signature verification | ✅ | `stripe.webhooks.constructEventAsync` with raw body |
| Price IDs | ✅ SET | All 4 Stripe price IDs in edge function secrets |
| Customer IDs | ✅ | Stored in `user_profiles.stripe_customer_id` |
| Subscription webhooks | ✅ | 5 event types handled |
| Boost webhooks | ✅ | `checkout.session.completed` (payment mode) + `charge.refunded` |
| Refund handling | ✅ | `charge.refunded` expires boost |
| Failed payment notification | ✅ | Push + in-app notification |
| Secrets server-side only | ✅ | All Stripe secrets in Edge Function env, never in client |
| Customer Portal | ✅ | `customer-portal` edge function, Stripe-hosted |
| Idempotency (boost) | ✅ | `purchase_id` in metadata checked before activation |
| Idempotency (subscription) | ✅ | `stripe_subscription_id` ON CONFLICT UPSERT |

---

## 14. PAYMENT SECURITY

| Attack Vector | Protection | Status |
|---|---|---|
| Apple transaction replay | `apple_transactions` table, UNIQUE `transaction_id` | ✅ |
| Google purchase token replay | `provider_purchase_token` unique check in `subscriptions` and `boost_purchases` | ✅ |
| Stripe webhook replay | `checkout_session.id` idempotency check; `charge.id` unique | ✅ |
| Stripe webhook spoofing | Raw body + `stripe-signature` HMAC verification | ✅ |
| Apple JWS spoofing | Apple root certificate chain validation in `appleJws.ts` | ✅ |
| Client-granted entitlements | All writes via service role in edge functions | ✅ |
| Boost self-grant | `protect_boost_fields_trigger` + server-only `use_boost_credit_atomic` | ✅ |
| Cross-provider double purchase | `check-subscription-eligibility` + DB trigger | ✅ |
| Sandbox transactions in production | `APPLE_REJECT_SANDBOX` not set | ⚠️ RISK |
| Google Pub/Sub unauthenticated | `GOOGLE_PUBSUB_TOKEN` not in secrets | 🔒 GAP |
| Admin privilege escalation | `enforce_admin_role_assignment` trigger | ✅ |

---

## 15. SUPABASE / BACKEND

| Item | Status | Notes |
|---|---|---|
| Connection | ✅ | ACTIVE_HEALTHY |
| Tables (all 13) | ✅ | All tables present with correct schema |
| Foreign keys | ✅ | All FKs with ON DELETE CASCADE where appropriate |
| Indexes | ✅ | Indexed on high-frequency query columns |
| RLS | ✅ | Enabled on all 13 tables |
| Storage buckets | ✅ | event-images (10MB), profile-images (5MB), ad-images (5MB) |
| Storage user isolation | ✅ | `storage.foldername(name)[1] = auth.uid()` |
| Edge functions | ✅ | All 14 functions deployed |
| Triggers | ✅ | 11 triggers deployed |
| DB functions | ✅ | 9 functions deployed |
| Service role key exposure | ✅ SAFE | Only in Edge Function secrets; never in client |
| Orphaned records | ✅ | CASCADE deletes handle cleanup |
| Referential integrity | ✅ | All FKs defined |
| Real-time (subscriptions) | NOT VERIFIED | Not audited in this session |
| Scheduled jobs | ⚠️ | `expire_stale_boosts` is a DB function but no pg_cron job confirmed |

---

## 16. ADMIN

| Feature | Status | Notes |
|---|---|---|
| Admin authentication | ✅ | `is_admin()` function; roles array in user_profiles |
| Admin panel (embedded) | ✅ | Rendered in Profile tab for admin users |
| Event moderation (approve/reject/flag) | ✅ | Via admin panel |
| Account deletion review | ✅ | Admin can approve/reject deletion requests |
| Ad placement management | ✅ | `/admin/ads/[placementId]` |
| Admin settings | ✅ | `admin_settings` table |
| Normal user calling admin functions | ❌ BLOCKED | RLS: `is_admin()` check on all admin operations |
| Admin grant subscription | ✅ | `admin-grant-subscription` edge function, admin-only |
| User list management | ⚠️ NOT VERIFIED | Admin screen not fully read; depends on admin/index.tsx |
| Analytics | ⚠️ NOT VERIFIED | Beyond boost impressions and event view counts |
| Featured content control | ✅ | `featured` field on events |

---

## 17. USER-GENERATED CONTENT / MODERATION

| Feature | Status | Notes |
|---|---|---|
| Event reporting | ✅ | `report_count` field; `flagReason` |
| Admin removal | ✅ | Admin can delete/reject events |
| Event approval workflow | ✅ | `requireEventApproval` per-promoter flag |
| Image validation | ✅ | Storage bucket MIME type restrictions (JPEG, PNG, WebP) |
| Image size limits | ✅ | 10MB events, 5MB profiles/ads |
| Spam controls | ⚠️ | Free plan 3 events/month limit; enforced NOT VERIFIED |
| User blocking | ❌ NOT IMPLEMENTED | No block feature found |
| Terms enforcement | ⚠️ NOT VERIFIED | Manual admin moderation only |
| App Store UGC requirements | ⚠️ | Reporting exists; content moderation workflow exists but human-only |

---

## 18. PUSH NOTIFICATIONS

| Feature | Status | Notes |
|---|---|---|
| Permission flow | ✅ | `NotificationPermissionModal` — shown once after first sign-in |
| Token registration | ✅ | `push_tokens` table; Expo push token |
| FCM (Android) | ✅ | `FCM_SERVICE_ACCOUNT_JSON` configured |
| Multiple devices | ✅ | Multiple rows per user_id in push_tokens |
| Token refresh | ✅ | `updated_at` tracked; upsert on re-registration |
| Event notifications | ✅ | New parish events, followed promoters |
| Purchase notifications | ✅ | Payment failed, cancellation scheduled |
| Admin notifications | ✅ | Deletion request received/approved/rejected |
| Notification deep links | ✅ | All 10 types route to correct screens |
| Foreground behavior | ✅ | `shouldShowBanner: true` configured |
| Background behavior | ✅ | `getLastNotificationResponseAsync` on launch |
| check-push-receipts | ✅ | Deployed; cleans invalid tokens |
| Push token status display | ✅ | Profile shows registered/failed/denied status with retry |
| iOS | ✅ | — |
| Android | ⚠️ NOT VERIFIED | FCM configured; Android build broken for testing |

---

## 19. EMAIL / DEEP LINKS

| Feature | Status | Notes |
|---|---|---|
| Password reset email | ✅ | Supabase built-in; SMTP configured |
| Welcome email | ⚠️ NOT VERIFIED | `send-email` edge function exists with template; not confirmed triggered |
| Purchase/subscription emails | ⚠️ NOT VERIFIED | `emailTemplates.ts` exists; delivery unverified |
| Admin notification emails | ⚠️ NOT VERIFIED | Same |
| Production email domain | ⚠️ NOT VERIFIED | POSTAL_API_URL/KEY configured; deliverability unverified |
| Deep link scheme | ✅ | `vybzhub://` configured in app.config.js |
| Event deep link | ✅ | `vybzhub://event/[id]` routable via _layout.tsx |
| Password reset deep link | ✅ | `passwordRecoveryMode` detected |
| Notification deep links | ✅ | 10 types handled |
| Boost return deep link | ✅ | `vybzhub://boost-success` detected in boost screen |
| Subscription return deep link | ✅ | `vybzhub://subscription-*` handled |

---

## 20. MEDIA / STORAGE

| Feature | Status | Notes |
|---|---|---|
| Event flyers (upload) | ✅ | event-images bucket, 10MB |
| Profile images (upload) | ✅ | profile-images bucket, 5MB |
| Ad images | ✅ | ad-images bucket, 5MB |
| File size limits enforced | ✅ | Bucket-level limits |
| MIME validation | ✅ | Bucket-level allowed MIME types |
| User isolation | ✅ | `storage.foldername(name)[1] = auth.uid()` in bucket RLS |
| One user overwriting another | ❌ BLOCKED | Auth path in storage key prevents cross-user writes |
| Orphaned files | ⚠️ | No automatic cleanup when events deleted |
| Image compression | ⚠️ NOT VERIFIED | `quality: 0.9` in ImagePicker but no explicit compression library |
| Public buckets | ✅ | All 3 buckets are public (correct for an events app) |
| MOCK_ADS Unsplash dependency | ⚠️ P2 | 5 fallback ads use external Unsplash URLs |

---

## 21. SECURITY

| Finding | Severity | Details |
|---|---|---|
| Service role key in client | ✅ SAFE | Only in edge function Deno.env; never in client code |
| Stripe secrets in client | ✅ SAFE | Server-side only |
| Google service account in client | ✅ SAFE | `FCM_SERVICE_ACCOUNT_JSON` and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` in edge function secrets only |
| No hardcoded credentials found | ✅ | Search confirmed no hardcoded tokens, keys, or passwords |
| Webhook signature verification | ✅ | Stripe: HMAC; Apple: JWS; Google: token |
| GOOGLE_PUBSUB_TOKEN missing | 🔒 SECURITY GAP | `google-play-notifications` webhook may be unauthenticated — any caller could send fake renewal/cancellation events |
| APPLE_REJECT_SANDBOX missing | ⚠️ RISK | Apple sandbox transactions could activate real entitlements in production |
| Sensitive logging | ✅ SAFE | Edge functions log only user ID prefix (8 chars) and plan; no PII, no tokens logged |
| IDOR on events | ✅ SAFE | `promoter_id = auth.uid()` in all event write RLS policies |
| IDOR on profiles | ✅ SAFE | `id = auth.uid()` in profile read/write policies |
| Admin bypass | ✅ BLOCKED | `enforce_admin_role_assignment` trigger |
| SQL injection | ✅ SAFE | All queries use Supabase parameterized client |
| Insecure storage | ✅ SAFE | Session tokens in AsyncStorage (mobile) / localStorage (web); no sensitive data beyond session |
| Boost replay | ✅ BLOCKED | `provider_purchase_token` unique check + `apple_transactions` ledger |

---

## 22. PERFORMANCE / RELIABILITY

| Item | Status | Notes |
|---|---|---|
| FlatList usage | ⚠️ NOT VERIFIED | Not fully audited across all list screens |
| expo-image usage | ✅ | All images use `expo-image` |
| Large queries | ⚠️ NOT VERIFIED | EventsContext query scope not fully audited |
| Push notification pagination | ✅ | `notifications_user_id_created_idx` index |
| Missing indexes | ✅ | Key indexes present (boost, events, notifications) |
| No internet handling | ⚠️ NOT VERIFIED | Error states exist; offline behavior not traced |
| API timeout | ⚠️ | Edge functions have no explicit timeout config visible |
| Payment verification timeout | ✅ | Try/catch with error messages on all payment paths |
| Upload failure | ✅ | Try/catch with Alert on avatar upload |
| Cancelled purchase | ✅ | "Purchase cancelled" error handled silently in UI |
| False payment success | ✅ SAFE | Entitlements only written server-side after verification |
| Slow startup | ⚠️ NOT VERIFIED | Cannot benchmark |

---

## 23. PRIVACY / LEGAL / STORE COMPLIANCE

| Item | Status | Notes |
|---|---|---|
| Privacy Policy URL | ⚠️ | `https://vybzhub.com/privacy` — linked in profile and auth screens; must be live and valid |
| Terms of Use URL | ⚠️ | `https://vybzhub.com/terms` — linked; must be live and valid |
| Subscription Terms URL | ⚠️ | `https://vybzhub.com/subscription-terms` — iOS only, must be live |
| Support URL | ⚠️ NOT VERIFIED | Support email exists; app store support URL must be configured |
| Contact email | ✅ | `SUPPORT_EMAIL` constant used throughout |
| Account deletion | ✅ | Implemented and accessible from profile screen |
| Data deletion | ✅ | Account deletion deletes user + cascade |
| Subscription pricing disclosure | ✅ | Prices shown on plan cards with billing cycle |
| Auto-renewal disclosure | ✅ | Explicit disclosure text in upgrade screen (Apple and Google variants) |
| Restore Purchases | ✅ | Button shown on iOS and Android |
| Camera/photos permission | ✅ | Permission requested before ImagePicker; explanation text provided |
| Notification permission | ✅ | Custom modal explains why before OS prompt |
| Location permission | ✅ N/A | No location permission used (parish is user-selected) |
| Privacy nutrition label | ⚠️ NOT VERIFIED | Must be configured in App Store Connect |
| GDPR/CCPA | ⚠️ NOT VERIFIED | Jamaica-focused but may have EU users; no consent banner found |

---

## 24. APPLE APP STORE SUBMISSION CHECKLIST

| Item | Status |
|---|---|
| iOS native build compiles | ✅ User confirmed |
| expo-iap / StoreKit 2 purchase flow | ✅ |
| Server-side Apple IAP verification | ✅ |
| Restore Purchases button | ✅ |
| Account deletion | ✅ |
| Privacy Policy URL live | ❌ Must verify |
| Terms of Use URL live | ❌ Must verify |
| Subscription Terms URL live | ❌ Must verify |
| App Store Connect: IAP products registered (4 subs + 3 boosts = 7) | ⚠️ Manual required |
| App Store Connect: Subscription terms URL filled in | ⚠️ Manual required |
| App Store Connect: Subscription screenshots | ⚠️ Manual required |
| App Store Connect: Privacy Nutrition Label | ⚠️ Manual required |
| App Store Connect: ASC App ID in eas.json | ✅ `6798113663` |
| Reviewer test account documented | ❌ Not found |
| No Stripe for iOS digital purchases | ✅ |
| No hardcoded prices shown on iOS (uses StoreKit prices) | ✅ `Platform.OS !== 'ios'` price gate in upgrade CTA |
| UGC policy compliance | ⚠️ Reporting exists; requires human moderation |
| Crash-free launch (not tested) | ⚠️ |
| APPLE_BUNDLE_ID in edge function secrets | ❌ Missing |
| APPLE_REJECT_SANDBOX set | ❌ Missing — sandbox risk |

**APPLE SUBMISSION READY: NO**
Blocking: missing reviewer account, unverified live URLs, unverified IAP product registration, APPLE_BUNDLE_ID secret missing.

---

## 25. GOOGLE PLAY SUBMISSION CHECKLIST

| Item | Status |
|---|---|
| Android native build compiles | ❌ BROKEN |
| expo-iap / Google Play Billing | ❌ Build broken |
| Target SDK | ⚠️ NOT VERIFIED (expect 36 per Gradle history) |
| Data Safety form | ❌ Not configured (manual in Play Console) |
| Privacy Policy URL live | ❌ Must verify |
| Content rating questionnaire | ❌ Manual in Play Console |
| App access for review | ⚠️ Manual required |
| Google Play Console: subscription products (4) | ⚠️ Manual required |
| Google Play Console: consumable boost products (3) | ⚠️ Manual required |
| RTDN Pub/Sub configured | ⚠️ `google-play-notifications` deployed; Pub/Sub subscription in Google Cloud must point to it |
| GOOGLE_PUBSUB_TOKEN set | ❌ Missing — security gap |
| AAB upload to internal test | ❌ Android build must succeed first |
| Signed release build | ❌ Android build broken |

**GOOGLE PLAY SUBMISSION READY: NO**
Primary blocker: Android native build broken.

---

## 26. PRODUCTION ENVIRONMENT

### Client-Side Variables

| Variable | Status |
|---|---|
| EXPO_PUBLIC_SUPABASE_URL | SET (auto-generated) |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | SET (auto-generated) |

### Edge Function Secrets

| Secret | Status | Notes |
|---|---|---|
| SUPABASE_URL | ✅ SET | |
| SUPABASE_ANON_KEY | ✅ SET | |
| SUPABASE_SERVICE_ROLE_KEY | ✅ SET | |
| SUPABASE_PUBLISHABLE_KEYS | ✅ SET | |
| SUPABASE_SECRET_KEYS | ✅ SET | |
| SUPABASE_DB_URL | ✅ SET | |
| SUPABASE_JWKS | ✅ SET | |
| SMTP_HOST | ✅ SET | |
| SMTP_PORT | ✅ SET | |
| SMTP_USER | ✅ SET | |
| SMTP_PASS | ✅ SET | |
| EMAIL_FROM | ✅ SET | |
| EMAIL_FROM_NAME | ✅ SET | |
| POSTAL_API_URL | ✅ SET | |
| POSTAL_API_KEY | ✅ SET | |
| FCM_SERVICE_ACCOUNT_JSON | ✅ SET | |
| STRIPE_SECRET_KEY | ✅ SET | |
| STRIPE_WEBHOOK_SECRET | ✅ SET | |
| STRIPE_PUBLISHABLE_KEY | ✅ SET | |
| STRIPE_PRICE_PRO_MONTHLY | ✅ SET | |
| STRIPE_PRICE_PRO_YEARLY | ✅ SET | |
| STRIPE_PRICE_ELITE_MONTHLY | ✅ SET | |
| STRIPE_PRICE_ELITE_YEARLY | ✅ SET | |
| GOOGLE_PLAY_PACKAGE_NAME | ✅ SET | |
| GOOGLE_PLAY_SERVICE_ACCOUNT_JSON | ✅ SET | |
| APPLE_BUNDLE_ID | ❌ MISSING | Used in verify-apple-transaction for bundle ID claim validation |
| APPLE_REJECT_SANDBOX | ❌ MISSING | Should be set to `true` to reject sandbox purchases in production |
| GOOGLE_PUBSUB_TOKEN | ❌ MISSING | Should validate Pub/Sub push authentication token |

---

## 27. END-TO-END FLOW RESULTS

| Flow | Result | Notes |
|---|---|---|
| A. Signup → profile → browse → event | PARTIAL | Auth works; Google/Apple login missing |
| B. Promoter signup → create → publish → edit | PASS | Full lifecycle implemented |
| C. Subscription → payment → verification → entitlement (iOS) | PASS | Traced and verified |
| C. Subscription → payment → verification → entitlement (Android) | FAIL | Build broken |
| C. Subscription → payment (Stripe/Web) | PASS | Verified |
| D. Boost → payment → activation → expiration (iOS) | PASS | Verified |
| D. Boost → payment → activation → expiration (Android) | FAIL | Build broken |
| D. Boost credit redemption | PASS | `use-boost-credit` atomic RPC |
| E. Apple subscriber logs into Android | PASS | CrossProviderBanner shown; no re-purchase |
| F. Google subscriber logs into iPhone | PASS | CrossProviderBanner shown; no re-purchase |
| G. Subscription expires | PASS | Webhook handles; entitlements revoked |
| H. Failed payment | PASS | `past_due` status; push notification |
| I. Refund/revocation (Stripe boost) | PASS | `charge.refunded` webhook |
| I. Refund/revocation (Apple) | PASS | RTDN handles revocation |
| J. Account deletion | PARTIAL | Soft-delete with admin review; not instant |
| K. Admin login → moderate content | PASS | Admin panel functional |
| K. Admin grant subscription | PASS | `admin-grant-subscription` edge function |

---

## 28. COMPLETE FEATURE INVENTORY

| Feature | Status | Frontend | Backend | DB | External | Tested? | Production Ready? |
|---|---|---|---|---|---|---|---|
| Email/password auth | ✅ | ✅ | Supabase Auth | auth.users | — | Partial | YES |
| Google OAuth | ❌ | ❌ | — | — | — | No | NO |
| Apple Sign-In (OAuth) | ❌ | ❌ | — | — | — | No | NO |
| Phone/OTP auth | ❌ (disabled) | Code intact | — | — | Twilio | No | NO |
| Profile management | ✅ | ✅ | ✅ | user_profiles | — | Partial | YES |
| Avatar upload | ✅ | ✅ | ✅ | profile-images | — | Partial | YES |
| Event CRUD | ✅ | ✅ | ✅ | events | — | Partial | YES |
| Event moderation | ✅ | ✅ | ✅ | events | — | Partial | YES |
| RSVP (Going/Interested) | ✅ | ✅ | ✅ | user_rsvps | — | Partial | YES |
| Bookmark/save | ✅ | ✅ | ✅ | events context | — | Partial | YES |
| Browse/search | ✅ | ✅ | ✅ | events | — | Partial | YES |
| Parish filter | ✅ | ✅ | ✅ | events | — | Partial | YES |
| Map view | ✅ | ✅ | — | — | — | Partial | YES |
| Follow promoter | ✅ | ✅ | ✅ | follows | — | Partial | YES |
| Promoter profile | ✅ | ✅ | ✅ | user_profiles | — | Partial | YES |
| Push notifications | ✅ | ✅ | ✅ | push_tokens | FCM/Expo | Partial | YES |
| Email notifications | ⚠️ | — | ✅ | — | SMTP/Postal | Unverified | CONDITIONAL |
| Notification settings | ✅ | ✅ | ✅ | user_profiles | — | Partial | YES |
| Apple IAP subscriptions | ✅ | ✅ | ✅ | subscriptions | Apple StoreKit | Partial | YES |
| Google Play subscriptions | ❌ BUILD BROKEN | ✅ | ✅ | subscriptions | Google Play | No | NO |
| Stripe subscriptions | ✅ | ✅ | ✅ | subscriptions | Stripe | Partial | YES |
| Apple IAP boosts | ✅ | ✅ | ✅ | boost_purchases | Apple StoreKit | Partial | YES |
| Google Play boosts | ❌ BUILD BROKEN | ✅ | ✅ | boost_purchases | Google Play | No | NO |
| Stripe boosts | ✅ | ✅ | ✅ | boost_purchases | Stripe | Partial | YES |
| Boost credits | ✅ | ✅ | ✅ | user_profiles | — | Partial | YES |
| Boost analytics | ✅ | ✅ | ✅ | events | — | Partial | YES |
| Customer portal | ✅ | ✅ | ✅ | — | Stripe | Partial | YES |
| Admin panel | ✅ | ✅ | ✅ | multiple | — | Partial | YES |
| Account deletion | ✅ | ✅ | ✅ | account_deletion_requests | — | Partial | YES |
| Ad placements | ✅ | ✅ | ✅ | ads, ad_placements | — | Partial | YES |
| Language/Patois toggle | ✅ | ✅ | — | — | — | Partial | YES |
| Onboarding | ✅ | ✅ | — | — | — | Partial | YES |
| Squad feature | ✅ | ✅ | — | — | — | Partial | YES |
| In-App Ticket Sales | ❌ COMING SOON | Schema ready | Partial | events | — | No | NO |
| Weather widget | ✅ | ✅ | — | — | Weather API | Partial | YES |

---

## OWNER ACTIONS REQUIRED

### APPLE APP STORE CONNECT
1. Register all 7 IAP products with exact product IDs from constants/data.ts
2. Set pricing: Pro Monthly $9.99, Pro Yearly $89.99, Elite Monthly $24.99, Elite Yearly $224.99, 3-Day $1.99, 7-Day $3.99, Until-End $6.99
3. Fill in Subscription Terms URL: `https://vybzhub.com/subscription-terms`
4. Fill in Privacy Policy URL: `https://vybzhub.com/privacy`
5. Fill in Support URL
6. Create sandbox reviewer test account
7. Complete Privacy Nutrition Label (data types collected, tracking)
8. Upload screenshots for all device sizes including iPad
9. Complete App Review Information (reviewer credentials, notes)
10. Set Auth Setting → Site URL to `vybzhub://auth` if using OAuth

### GOOGLE PLAY CONSOLE
1. Fix Android native build (expo-iap/openiap-google Kotlin issue) — verify `./gradlew :app:bundleRelease` passes
2. Create subscription products: 4 product IDs with correct pricing
3. Create consumable in-app products: 3 boost product IDs with correct pricing
4. Configure RTDN: create Pub/Sub topic, subscription pointing to `google-play-notifications` Edge Function URL
5. Complete Data Safety form (data collection, sharing practices)
6. Complete content rating questionnaire
7. Fill in Privacy Policy URL
8. Upload signed AAB to internal testing track

### SUPABASE
1. Set secret: `APPLE_BUNDLE_ID = com.chambex.vybzhub`
2. Set secret: `APPLE_REJECT_SANDBOX = true`
3. Set secret: `GOOGLE_PUBSUB_TOKEN = <your-pub-sub-push-auth-token>` — prevents unauthenticated RTDN calls
4. Verify `expire_stale_boosts` function runs on a schedule (pg_cron or equivalent)

### STRIPE
1. Verify Stripe webhook is configured for production endpoint (Supabase edge function URL)
2. Verify webhook listens for all 6 event types: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`
3. Verify Price IDs in secrets match production (not test mode) Stripe prices

### DOMAIN / WEBSITE
1. Publish `https://vybzhub.com/privacy` with full Privacy Policy content
2. Publish `https://vybzhub.com/terms` with full Terms of Use content
3. Publish `https://vybzhub.com/subscription-terms` with Apple-compliant subscription terms
4. Ensure support email is monitored

### EMAIL
1. Verify SMTP/Postal delivery: send test email through `send-email` edge function
2. Confirm welcome email triggers on new registration
3. Confirm password reset emails deliver

### PUSH NOTIFICATIONS
1. Verify FCM service account has correct permissions for Android push delivery
2. Test push delivery on real Android device (when build is fixed)

### LEGAL / PRIVACY
1. Publish all three legal pages
2. Ensure Privacy Policy accurately describes data collection (push tokens, location-adjacent data, payment data handling)
3. Verify GDPR compliance if targeting EU users

---

## ISSUE PRIORITY

### P0 — MUST FIX BEFORE LAUNCH

| # | Issue | Impact |
|---|---|---|
| 1 | **Android native build broken** (expo-iap/openiap-google Kotlin metadata) | Cannot ship Android at all |
| 2 | **GOOGLE_PUBSUB_TOKEN not set** | Fake Google Play renewal/cancellation events can be injected by anyone |
| 3 | **APPLE_REJECT_SANDBOX not set** | Sandbox/test purchases grant real production entitlements |
| 4 | **vybzhub.com legal URLs must be live** | Apple hard-rejects apps with dead privacy/terms URLs |
| 5 | **App Store Connect IAP products must be registered** | Without this, no iOS purchase will work in production |
| 6 | **No Apple reviewer test account** | App Store review requires credentials to test auth + subscription flows |

### P1 — SHOULD FIX BEFORE LAUNCH

| # | Issue | Impact |
|---|---|---|
| 1 | APPLE_BUNDLE_ID not set in secrets | verify-apple-transaction may fail or use hardcoded fallback |
| 2 | Google Play Console IAP products not confirmed | Android purchases will fail even if build is fixed |
| 3 | Pub/Sub RTDN configuration in Google Cloud unconfirmed | Google renewal/cancellation events won't reach the backend |
| 4 | Email delivery not tested end-to-end | Users may not receive password reset or transactional emails |
| 5 | expire_stale_boosts has no confirmed scheduled job | Expired boosts may remain visually "active" until manual trigger |
| 6 | MOCK_ADS Unsplash fallback URLs are external dependencies | Unsplash CDN outage removes all fallback ads |
| 7 | No Google OAuth / Apple Sign-In | Users without email can only authenticate via email/password |
| 8 | Phone/OTP auth disabled | Twilio configuration pending |

### P2 — CAN FIX AFTER LAUNCH

| # | Issue | Impact |
|---|---|---|
| 1 | npm warn about ignore-workspace-root-check in .npmrc | CI noise only |
| 2 | "Coming Soon" features in Elite plan visible | Minor UX; clearly labeled |
| 3 | No image compression library beyond quality:0.9 | Large images possible |
| 4 | Orphaned storage files when events deleted | Storage accumulates |
| 5 | GDPR consent banner missing | Only if EU user base intended |
| 6 | Squad feature not audited | Unknown completeness |
| 7 | In-app ticket sales schema ready but feature incomplete | Not advertised as complete |

---

## FINAL VERDICT

🔴 **NO-GO — NOT PRODUCTION READY**

**P0 BLOCKERS: 6**  
**P1 ISSUES: 8**  
**P2 ISSUES: 7**

---

## TOP 10 ACTIONS BEFORE LAUNCH (IN EXACT PRIORITY ORDER)

1. **Fix Android build** — Run `git pull && rm -rf android && npx expo prebuild --platform android --clean && cd android && ./gradlew :expo-iap:compileReleaseKotlin && ./gradlew :app:bundleRelease`. If it fails, report the new error immediately.

2. **Set GOOGLE_PUBSUB_TOKEN** — In Supabase Dashboard → Settings → Edge Functions → Secrets. Add the auth token from your Google Cloud Pub/Sub push subscription configuration.

3. **Set APPLE_REJECT_SANDBOX = true and APPLE_BUNDLE_ID = com.chambex.vybzhub** — Same location.

4. **Publish vybzhub.com/privacy, /terms, /subscription-terms** — All three pages must return HTTP 200 with valid legal content before submitting to App Store.

5. **Register all 7 IAP products in App Store Connect** — Create subscription group, add 4 subscription products and 3 consumable IAP products with exact product IDs from constants/data.ts.

6. **Create reviewer test account** — Create a Supabase test user (email/password) and document the credentials for App Store Review Information. Ensure this account can browse events, subscribe, and boost.

7. **Register Google Play IAP products** — Create 4 subscription products and 3 consumable in-app products in Google Play Console. Configure Pub/Sub RTDN pointing to your `google-play-notifications` edge function URL.

8. **Test email delivery** — Invoke `send-email` edge function manually via Supabase dashboard and confirm delivery. Test password reset flow end-to-end on a real device.

9. **Set up Stripe production webhook** — Verify webhook endpoint points to production Supabase edge function URL; verify all 6 event types are subscribed; confirm STRIPE_WEBHOOK_SECRET matches.

10. **Upload AAB to Google Play internal test track and TestFlight** — Once Android build passes, submit both platforms to their respective test tracks before triggering full production release.
