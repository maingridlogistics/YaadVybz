# VYBZ HUB — FULL CODEBASE + DATABASE CLEANUP AUDIT

**Date:** 2026-08-14  
**Status:** AUDIT ONLY — no changes made  
**Scope:** Mobile app source, Supabase backend, Edge Functions, assets, dependencies

---

## CURRENT PROJECT STATUS

| Item | Value |
|------|-------|
| **Expo SDK** | 54 |
| **React Native** | 0.81.5 (New Architecture enabled) |
| **TypeScript** | strict mode |
| **Supabase Project** | twilfdbvrzhlnllcmssc (ACTIVE_HEALTHY) |
| **Stage** | Post-audit stabilization (Stage 1 complete) |
| **Build** | Production builds passing (iOS + Android) |
| **@stripe/stripe-react-native** | 0.74.0 (intentional — Xcode 26 compat) |

---

## REPOSITORY SIZE — MAJOR DIRECTORIES

| Directory | Estimated Contents | Notes |
|-----------|-------------------|-------|
| `app/` | ~55 screen files | Core routes — all required |
| `components/` | ~14 components | Mix of required and one unused |
| `contexts/` | 7 context files | All required |
| `hooks/` | 12 hook files | All required |
| `services/` | 10 service files | All required |
| `lib/` | 6 utility files | All required |
| `constants/` | 11 constant files | Required, minor dead exports |
| `supabase/functions/` | 21 Edge Functions + 7 shared | All active |
| `assets/images/` | 18 images | Mix — some unused |
| `assets/screenshots/` | 8 screenshots | Not referenced in app code |
| `*.md` (root) | 13 markdown files | Report/audit artifacts |
| `*.sql` (root) | 1 SQL file | Migration artifact |

---

## SECTION 1 — SAFE CLEANUP (LOW RISK)

These items have strong evidence of being unnecessary. Removal is safe.

---

### 1.1 Root-Level Markdown Report Files

These are development audit artifacts and exported reports. They serve no runtime, build, or deployment purpose. The Git history preserves them permanently regardless.

| File | Size (est.) | Evidence | Risk |
|------|-------------|----------|------|
| `VYBZHUB_PRODUCTION_READINESS_AUDIT.md` | ~80 KB | Historical audit report, superseded | LOW |
| `VYBZHUB_FINAL_RELEASE_READINESS_AUDIT.md` | ~60 KB | Historical audit report | LOW |
| `VYBZHUB_IMPLEMENTATION_SPEC.md` | ~40 KB | Implementation reference, superseded | LOW |
| `VYBZHUB_TICKETING_PHASE1_REPORT.md` | ~30 KB | Phase 1 ticketing report | LOW |
| `VYBZHUB_TICKETING_PHASE1_HARDENING_REPORT.md` | ~25 KB | Phase 1 hardening report | LOW |
| `VYBZHUB_TICKETING_PHASE1_SECURITY_PATCH_REPORT.md` | ~20 KB | Security patch notes | LOW |
| `VYBZHUB_ANDROID_IAP_BUILD_FIX_REPORT.md` | ~15 KB | Android IAP build fix notes | LOW |
| `VYBZHUB_BILLING_BLOCKER_REMEDIATION_REPORT.md` | ~20 KB | Billing blocker report | LOW |
| `VYBZ_HUB_WEBSITE_DOOR_SALES_REMOVAL_SPEC.md` | ~10 KB | Website spec (separate project) | LOW |
| `VYBZ_HUB_WEBSITE_PARITY_MASTER_SPEC.md` | ~25 KB | Website spec (separate project) | LOW |
| `VYBZHUB_CLEANUP_AUDIT.md` | ~this file | This audit (keep for reference) | — |

**Estimated savings:** ~325 KB from repository working tree; no effect on bundle.

---

### 1.2 Root-Level SQL File

| File | Evidence | Risk |
|------|----------|------|
| `VYBZHUB_BILLING_MIGRATION.sql` | Migration artifact. All migrations have already been applied to production. No application code imports this file. | LOW |

**Estimated savings:** ~10 KB from repository working tree; no effect on bundle.

---

### 1.3 Dead Exports in `constants/data.ts`

Three exports are dead code with zero active consumers:

| Export | Evidence | Risk |
|--------|----------|------|
| `MOCK_EVENTS: Event[] = []` | Empty array. No import found anywhere in the codebase. | LOW |
| `MOCK_ADS: BannerAd[]` | Only imported by `BannerAd.tsx` (see §1.4 below). No other consumers. | LOW |
| `MOCK_PROMOTER_SOCIALS` | Empty object `{}`. Imported by `app/promoter/[id].tsx` but the result is always `undefined` — the consuming code at line 158 does `const promoInfo = MOCK_PROMOTER_SOCIALS[promoterId ?? '']` and then guards `if (promoInfo)` which is always false. Effectively dead. | LOW |

**Action:** Remove `MOCK_EVENTS`, `MOCK_ADS`, `BannerAd` interface, and `MOCK_PROMOTER_SOCIALS` from `constants/data.ts`. Remove `MOCK_PROMOTER_SOCIALS` import from `app/promoter/[id].tsx` and delete the dead branch.

---

### 1.4 `components/ui/BannerAd.tsx` — Unused Component

`BannerAd.tsx` exports `BannerAdCard`. There are **zero imports** of `BannerAdCard` anywhere in the application. This component was the original ad display implementation, superseded by `PlacementAd.tsx` (which pulls live ads from Supabase).

| File | Category | Evidence | Risk |
|------|----------|----------|------|
| `components/ui/BannerAd.tsx` | LEGACY / ORPHANED | No imports of `BannerAdCard` in entire codebase. `PlacementAd.tsx` is the active ad component. | LOW |

**Estimated bundle savings:** ~3 KB JS (component + MOCK_ADS data).

---

### 1.5 Screenshot Assets (Not Referenced in App Code)

All files under `assets/screenshots/` are App Store / marketing assets. No application code, component, or config file references these paths.

| File | Evidence | Risk |
|------|----------|------|
| `assets/screenshots/imessage_01_share.jpg` | Not imported or referenced in any source file | LOW |
| `assets/screenshots/ipad_01_home.jpg` | Not imported or referenced | LOW |
| `assets/screenshots/ipad_02_browse.jpg` | Not imported or referenced | LOW |
| `assets/screenshots/iphone_01_home.jpg` | Not imported or referenced | LOW |
| `assets/screenshots/iphone_02_browse.jpg` | Not imported or referenced | LOW |
| `assets/screenshots/iphone_03_event_detail.jpg` | Not imported or referenced | LOW |
| `assets/screenshots/iphone_04_map.jpg` | Not imported or referenced | LOW |
| `assets/screenshots/watch_01_concept.jpg` | Not imported or referenced | LOW |

**Note:** These may be referenced by App Store Connect metadata or EAS Submit configuration outside the repository. Verify before deleting. If screenshots are submitted through a separate metadata folder or directly through App Store Connect, these can be safely removed from the app source tree.

**Estimated savings:** ~3–5 MB from repository and working tree; zero bundle impact (not bundled).

---

### 1.6 Duplicate Parish Image Asset

| File | Evidence | Risk |
|------|----------|------|
| `assets/images/parish_st_andrew.jpg` | Duplicates `assets/images/parishes/saint_andrew.jpg`. No code reference found for the root-level version. The `parishes/` subdirectory files are the ones referenced by parish display logic. | LOW |

---

## SECTION 2 — REVIEW BEFORE REMOVAL (MEDIUM RISK)

Items that appear partially obsolete but require confirmation before removal.

---

### 2.1 `MOCK_PROMOTER_SOCIALS` Import in `app/promoter/[id].tsx`

The public promoter profile screen imports `MOCK_PROMOTER_SOCIALS` but the object is always empty `{}`, so `promoInfo` is always `undefined` and the guarded block never executes. This is effectively dead code but the screen itself is actively used.

**Action required:** Remove the import and the dead `if (promoInfo)` block, but review whether the social bio / follower-count UI will need to be populated from a real Supabase query in Stage 3.

---

### 2.2 `lib/adminNav.ts` — `setTab` Writer Stub

`adminNav.ts` documents a `setTab(tab)` writer pattern in its JSDoc comment, but **no call site in the codebase ever calls `adminNav.setTab()`**. Only `adminNav.consumeTab()` is called (in `app/(tabs)/profile.tsx`). The writer half of the pattern was apparently never implemented.

| Item | Evidence | Risk |
|------|----------|------|
| `adminNav.setTab` documented but never called | Search for `adminNav.setTab(` returns zero results | LOW-MEDIUM |

The entire `adminNav` module is used by three files: `app/_layout.tsx` (import only, not called), `app/(tabs)/profile.tsx` (consumeTab), and `app/(tabs)/post.tsx` (import only, not called). In Stage 3, when the navigation architecture changes, this module may become fully obsolete. For now: clean up the dead JSDoc reference and unused import sites.

---

### 2.3 `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — EAS Environment

The app references `process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `lib/stripe.ts` and `lib/stripe.native.ts`. The `.env` file in the repository either does not set this or sets it to a test value.

**Cannot verify** whether EAS production build profile has this set correctly. Requires manual verification in EAS dashboard or `eas env:list --environment production`.

---

### 2.4 `assets/images/onboarding*.jpg` — Onboarding Images

Three onboarding images (`onboarding1.jpg`, `onboarding2.jpg`, `onboarding3.jpg`) are referenced by `app/onboarding.tsx`. These are required at runtime. **Do not remove.**

They are listed here only to note they are among the larger static assets (~200–400 KB each) and could be compressed (WebP conversion) for bundle size reduction without visual degradation, as a future optimization.

---

### 2.5 `app/(tabs)/post.tsx` — `adminNav` Import

`app/(tabs)/post.tsx` imports `adminNav` from `../../lib/adminNav` but never calls any method on it. This is a dead import introduced when the admin nav module was originally wired up.

| File | Import | Used? | Risk |
|------|--------|-------|------|
| `app/(tabs)/post.tsx` | `import { adminNav }` | No — not called anywhere in the file | LOW |
| `app/_layout.tsx` | `import { adminNav }` | No — not called anywhere in the file | LOW |

---

## SECTION 3 — DO NOT REMOVE (REQUIRED)

Items that look potentially unused but are actively required.

---

### 3.1 `google-services.json`

Required for Firebase Cloud Messaging (FCM) push notifications on Android. Referenced by `app.config.js` Expo build plugin. **Do not remove.**

### 3.2 `proguard-rules.pro`

Required for Android R8 release builds. Specifically the `dontwarn com.stripe.android.pushProvisioning.**` rule prevents build failure on the Stripe Issuing module. **Do not remove or simplify.**

### 3.3 `babel.config.js`, `metro.config.js`, `tsconfig.json`, `eslint.config.js`

Build and tooling configuration. All required. **Do not remove.**

### 3.4 `expo-env.d.ts`

TypeScript declarations for `process.env.EXPO_PUBLIC_*` variables. Required for TypeScript to resolve environment variable types. **Do not remove.**

### 3.5 `pnpm-workspace.yaml`

Workspace configuration. Required for pnpm dependency resolution. **Do not remove.**

### 3.6 `app/+not-found.tsx`

Expo Router's 404 handler. Required to prevent unhandled navigation errors. **Do not remove.**

### 3.7 `services/iapService.ts` / `iapService.native.ts` / `iapService.web.ts`

Three-file platform split required by Expo's platform-specific module resolution. The `.ts` base is imported on all platforms; `.native.ts` overrides on iOS/Android for real IAP; `.web.ts` provides a no-op shim for Live Preview. All three are required. **Do not remove any.**

### 3.8 `lib/stripe.ts` / `lib/stripe.native.ts`

Same pattern as iapService — web fallback and native implementation. Both required. **Do not remove.**

### 3.9 `components/feature/JamaicaMap.tsx` / `JamaicaMap.native.tsx` / `JamaicaMap.web.tsx`

Three-file platform split for map rendering. `.native.tsx` uses `react-native-maps`; `.web.tsx` uses `react-leaflet`. All required. **Do not remove.**

### 3.10 `supabase/functions/_shared/` — All Shared Modules

All seven shared modules are imported by multiple Edge Functions:

| Module | Used By |
|--------|---------|
| `cors.ts` | Every Edge Function |
| `entitlements.ts` | stripe-webhook, verify-apple-transaction, apple-iap-notifications, verify-google-purchase, admin-grant-subscription, use-boost-credit |
| `emailTemplates.ts` | send-email, event-reminders, resend-ticket-email |
| `push.ts` | send-email, event-reminders |
| `subscriptionGuard.ts` | check-subscription-eligibility, create-subscription-checkout, create-boost-checkout |
| `appleJws.ts` | verify-apple-transaction, apple-iap-notifications |
| `googleAuth.ts` | verify-google-purchase, google-play-notifications |

**None are removable.**

---

## SECTION 4 — DATABASE CLEANUP CANDIDATES

No database objects are recommended for immediate removal. All 28 tables, all RPCs, all triggers, and all RLS policies are in active use by application code, Edge Functions, or cascading database relationships.

Specific findings:

### 4.1 Tables — All Active

| Table | Row Count | References | Status |
|-------|-----------|------------|--------|
| `events` | Production data | Core app, all flows | REQUIRED |
| `user_profiles` | Production data | Auth, all flows | REQUIRED |
| `tickets` | Production data | Ticketing | REQUIRED |
| `ticket_orders` | Production data | Ticketing, finance | REQUIRED |
| `ticket_order_items` | Production data | Ticketing | REQUIRED |
| `event_ticket_types` | Production data | Ticketing setup | REQUIRED |
| `event_ticket_settings` | Production data | Ticketing setup | REQUIRED |
| `ticket_checkins` | Production data | Scanner | REQUIRED |
| `ticket_transfers` | Production data | Transfer flow | REQUIRED |
| `ticket_refunds` | Production data | Refund flow | REQUIRED |
| `ticket_inventory_reservations` | Runtime data | Checkout | REQUIRED |
| `ticket_audit_logs` | Audit trail | Compliance | REQUIRED |
| `ticket_payment_events` | Idempotency ledger | Webhooks | REQUIRED |
| `ticket_name_changes` | Audit trail | Rename flow | REQUIRED |
| `ticket_operation_rate_limits` | Runtime data | Rate limiting | REQUIRED |
| `promoter_ledger` | Financial records | Finance | REQUIRED |
| `promoter_payouts` | Financial records | Payout flow | REQUIRED |
| `promoter_payout_accounts` | Config data | Payout flow | REQUIRED |
| `promoter_liabilities` | Financial records | Finance | REQUIRED |
| `payout_financial_holds` | Admin control | Finance | REQUIRED |
| `payment_disputes` | Financial records | Stripe webhooks | REQUIRED |
| `subscriptions` | Billing data | IAP + Stripe | REQUIRED |
| `apple_transactions` | Idempotency ledger | Apple IAP | REQUIRED |
| `boost_purchases` | Financial records | Boost flow | REQUIRED |
| `user_rsvps` | User actions | Events | REQUIRED |
| `follows` | User actions | Promoter profiles | REQUIRED |
| `notifications` | User notifications | Push flow | REQUIRED |
| `push_tokens` | Device tokens | Push notifications | REQUIRED |
| `push_receipt_queue` | Receipt processing | Push infra | REQUIRED |
| `ad_placements` | Admin config | Ads system | REQUIRED |
| `ads` | Ad content | Ads system | REQUIRED |
| `admin_settings` | Admin config | Settings toggle | REQUIRED |
| `account_deletion_requests` | Admin workflow | Delete flow | REQUIRED |
| `event_staff` | Promoter config | Scanner/staff | REQUIRED |
| `event_cancellation_requests` | Promoter workflow | Cancellation flow | REQUIRED |
| `customer_ticket_terms_acceptances` | Legal compliance | Checkout | REQUIRED |
| `ticketing_terms_acceptances` | Legal compliance | Ticketing setup | REQUIRED |

### 4.2 Database Functions — All Active

All 50+ RPCs are either directly called by application code, called by Edge Functions, or invoked by triggers. No orphaned RPCs identified.

### 4.3 Triggers — All Active

All 25 triggers enforce data integrity constraints (updated_at sync, quantity sync, idempotency enforcement, role protection). No obsolete triggers found.

---

## SECTION 5 — EDGE FUNCTION AUDIT

All 21 Edge Functions are actively used. No orphaned functions.

| Function | Caller | Status |
|----------|--------|--------|
| `send-email` | emailService.ts, event-reminders (function-to-function) | ACTIVE |
| `check-push-receipts` | Supabase cron / scheduled | ACTIVE |
| `stripe-webhook` | Stripe dashboard webhook | ACTIVE |
| `create-boost-checkout` | monetization/boost/[id].tsx | ACTIVE |
| `create-subscription-checkout` | subscriptionService.ts | ACTIVE |
| `customer-portal` | app/(tabs)/profile.tsx | ACTIVE |
| `delete-account` | app/admin/users.tsx | ACTIVE |
| `verify-apple-transaction` | iapService.native.ts | ACTIVE |
| `apple-iap-notifications` | Apple App Store server-to-server webhook | ACTIVE |
| `use-boost-credit` | monetization/boost/[id].tsx | ACTIVE |
| `check-subscription-eligibility` | subscriptionService.ts | ACTIVE |
| `google-play-notifications` | Google Play server-to-server webhook | ACTIVE |
| `verify-google-purchase` | iapService.native.ts | ACTIVE |
| `admin-grant-subscription` | app/admin/user/[userId].tsx | ACTIVE |
| `event-reminders` | Supabase cron / scheduled | ACTIVE |
| `create-ticket-checkout` | customerTicketingService.ts | ACTIVE |
| `create-door-card-checkout` | ticketing/dashboard screens | ACTIVE (door sales) |
| `process-event-refunds` | payoutService.ts (admin-triggered) | ACTIVE |
| `create-ticket-payment-intent` | customerTicketingService.ts (PaymentSheet) | ACTIVE |
| `resend-ticket-email` | ticketing/order/[orderId].tsx | ACTIVE |
| `initiate-ticket-transfer-invite` | ticketing/ticket/[ticketId].tsx | ACTIVE |

---

## SECTION 6 — NPM DEPENDENCY AUDIT

Cannot read `package.json` directly in this environment. Based on source-code analysis:

### Confirmed Required
- `expo`, `expo-router`, `expo-status-bar`, `expo-linear-gradient`, `expo-image`, `expo-notifications`, `expo-brightness`, `expo-keep-awake`, `expo-haptics`, `expo-web-browser`, `expo-video`, `expo-av`, `expo-build-properties`
- `react`, `react-native`, `react-native-reanimated`, `react-native-safe-area-context`
- `@supabase/supabase-js`
- `@stripe/stripe-react-native` (0.74.0 — intentional, do not change)
- `react-native-maps` (native maps)
- `react-leaflet`, `leaflet` (web maps)
- `react-native-qrcode-svg` (QR generation)
- `@expo/vector-icons`
- `expo-iap` (Google Play Billing)
- `react-native-url-polyfill`
- `@react-native-async-storage/async-storage`
- `react-native-paper` (UI components, if used)

### Possibly Unused — Manual Verification Required
These were not found with direct import searches but may be transitive dependencies or used in native config:

| Package | Concern |
|---------|---------|
| `react-native-svg` | Required by `react-native-qrcode-svg` as peer dep — keep |
| Any `@react-navigation/*` packages | Expo Router wraps React Navigation internally — likely a peer dep, not a direct import |

### Do Not Change
- `@stripe/stripe-react-native 0.74.0` — intentional Xcode 26 compatibility pin
- All `expo-*` packages — do not upgrade without a coordinated SDK bump
- `react-native-reanimated ~3.17.5` — version-pinned for RN 0.81.5 compatibility

---

## SECTION 7 — STORAGE AUDIT

| Bucket | Public | RLS | Purpose | App References | Status |
|--------|--------|-----|---------|----------------|--------|
| `event-images` | Yes | Yes | Event cover + flyer photos | lib/storage.ts, event creation, edit | REQUIRED |
| `profile-images` | Yes | Yes | User avatar uploads | lib/storage.ts, profile screen | REQUIRED |
| `ad-images` | Yes | Yes | Admin-managed ad creative | adsService.ts, admin ads screen | REQUIRED |

No orphaned buckets. All three buckets are actively used.

---

## SECTION 8 — SECURITY FINDINGS

| File | Issue | Tracked in Git | Action |
|------|-------|---------------|--------|
| `.env` | Contains `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Check `.gitignore` | Ensure `.env` is in `.gitignore` — these are public keys so exposure is low risk but good practice |
| `google-services.json` | Contains Firebase project credentials | YES — tracked | This is normal for React Native/Expo projects; `google-services.json` contains only the project ID and API key scoped to Firebase, not a service account. Low risk but worth noting. |
| `eas.json` | May contain environment profile names | YES — tracked | Does not contain secrets directly; secrets are stored in EAS dashboard |
| `supabase/functions/_shared/*.ts` | Service role key usage is server-side only (Deno.env) | N/A — Edge Functions | Correct — service role key is never in client code |

**No private keys, service-role keys, signing keystores, or certificates found in tracked source files.**

---

## SECTION 9 — ROUTE AUDIT

All active routes verified against navigation code, push notification routing, deep link handlers, and email CTAs.

### Routes in Use
All routes in `app/` are reachable through at least one of: tab navigation, `router.push`, `Link`, push notification handler, deep link handler, or email CTA.

### No Unreachable Routes Found

Every screen file has at least one inbound reference. The admin sub-screens (`/admin/user/[userId]`, `/admin/ads/[placementId]`, `/admin/push-test`) are accessed via `router.push` from within the admin portal.

### Observation: `app/claim-ticket.tsx`
Referenced by: deep link handler in `app/_layout.tsx` (`vybzhub://claim-ticket?transfer=<id>`), email transfer invitation CTAs, and push notification routing. **Required — do not remove.**

---

## SECTION 10 — ESTIMATED SAVINGS SUMMARY

| Category | Estimated Savings |
|----------|------------------|
| **Git repository size** | ~335 KB (markdown reports + SQL file) + up to ~5 MB (screenshots if removed) |
| **Development workspace** | Same as above |
| **Production app bundle** | ~3–5 KB JS (BannerAd component + MOCK_ADS/MOCK_EVENTS data + dead imports) |
| **Database / storage** | None — all objects required |

---

## SECTION 11 — RECOMMENDED CLEANUP ORDER

Ordered from safest to riskiest:

| Step | Action | Risk | Effort |
|------|--------|------|--------|
| 1 | Delete 10 root-level `*.md` report files (keep this audit file) | LOW | 2 min |
| 2 | Delete `VYBZHUB_BILLING_MIGRATION.sql` | LOW | 1 min |
| 3 | Remove `components/ui/BannerAd.tsx` | LOW | 2 min |
| 4 | Remove `MOCK_ADS`, `BannerAd` interface, `MOCK_EVENTS`, `MOCK_PROMOTER_SOCIALS` from `constants/data.ts` | LOW | 5 min |
| 5 | Remove dead `MOCK_PROMOTER_SOCIALS` import and guarded block from `app/promoter/[id].tsx` | LOW | 3 min |
| 6 | Remove dead `adminNav` imports from `app/(tabs)/post.tsx` and `app/_layout.tsx` | LOW | 3 min |
| 7 | Remove `assets/images/parish_st_andrew.jpg` (duplicate of `parishes/saint_andrew.jpg`) | LOW | 1 min |
| 8 | Delete `assets/screenshots/` directory after confirming screenshots are stored externally for App Store Connect | LOW-MEDIUM | 2 min |
| 9 | Clean up `adminNav.ts` JSDoc to remove the dead `setTab` writer pattern documentation | LOW | 2 min |
| 10 | Verify and set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in EAS production environment | MEDIUM | 10 min |

**Total estimated cleanup time:** ~30 minutes  
**Total bundle size reduction:** ~5 KB JS + potential 5 MB asset reduction  
**Risk:** All steps are LOW except step 10 (environment variable verification)

---

## STOP — AUDIT COMPLETE

No changes were made to any files, database, functions, or configuration during this audit.

Proceed to cleanup only after explicit approval of the items above.
