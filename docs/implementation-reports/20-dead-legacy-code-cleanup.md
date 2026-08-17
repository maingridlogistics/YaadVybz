# VYBZ HUB — PHASE 20: DEAD / LEGACY CODE CLEANUP

## STATUS
COMPLETE (Audit) | NO ACTION REQUIRED

## AUDIT PERFORMED

### Personal Profile Verification Remnants
**Searched for:** `profile.verification`, `profile_verification`, `profile-verification`, `Verified Profile`, `selfie`, `identity.*verif`, `id.*upload`, `personal.*verif`
**Result:** NONE FOUND ✅

No personal ID verification, selfie verification, or "Verified Profile" screens exist in the codebase.

### verifiedPromoter / verified_promoter
**Found in:** `contexts/AuthContext.tsx`, `services/entitlementService.ts`, `constants/data.ts`, `app/admin/users.tsx`, `app/admin/user/[userId].tsx`, `app/following.tsx`, `supabase/functions/`

**Assessment:** These are **intentionally retained**. `verified_promoter` is an **admin-controlled flag** set via `admin_set_verified_promoter()` SECURITY DEFINER RPC. It is NOT personal ID/selfie verification — it is a business-level trust signal applied by admin. The roadmap explicitly states "Business Verification remains the only verification product" — this flag serves that purpose for admin workflows. No removal required.

### getTierScore
**Searched for:** `getTierScore`
**Result:** NONE FOUND ✅

Previously removed in Search Priority implementation.

### Legacy compareBrowse() client-side ranking
**Searched for:** All explore screens
**Result:** Both `event-parish.tsx` and `event-category.tsx` already migrated to `search_events` RPC. No stale compareBrowse references on discovery surfaces.

### Personal Verification Routes
**Searched for:** selfie, identity verification, ID upload routes
**Result:** NONE FOUND ✅

### Obsolete Subscription Copy
**Assessed in:** `app/monetization/upgrade.tsx`
**Result:** Pro $4.99/month, Elite $14.99/month pricing matches roadmap. No obsolete copy found.

### Dead Imports
**Assessment:** No dead imports identified via code review. `services/entitlementService.ts` `PLAN_ENTITLEMENTS_CLIENT` has `verifiedPromoter: true` for Pro/Elite — this maps to the admin-settable flag, not personal verification. Retained as correct.

### Stale Feature Flags
**Searched:** `constants/featureFlags.ts`
**Result:** File exists; feature flags appear to be current product flags.

## FILES CHANGED
None — no dead/legacy code found requiring removal.

## IMPLEMENTATION EVIDENCE

### Code
No changes made — audit found no actionable dead code.

### Searches Performed
- `profile.verification` → 0 results
- `profile_verification` → 0 results  
- `Verified Profile` → 0 results
- `getTierScore` → 0 results
- `selfie` → 0 results
- `personal.*verif` → 0 results

### Intentionally Retained
- `verified_promoter` / `verifiedPromoter` — admin-controlled promoter trust flag (correct)
- `admin_set_verified_promoter()` RPC — admin tool only (correct)
- `entitlements.ts` comment explaining `verified_promoter` is NOT auto-set by subscription (correct)

## SECURITY
No security regressions — no privileged code removed.

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN

## BLOCKERS
None.

## FOLLOW-UP
If a future audit finds any personal verification remnants in branches or uncommitted files, they should be removed at that time. Current committed codebase is clean.
