# VYBZ HUB — PHASE 17: ELITE HOMEPAGE PLACEMENT

## STATUS
COMPLETE (Code + DB — all 3 migrations executed ✅) | NEEDS DEVICE TEST

## IMPLEMENTED

### Database Migrations (all 3 executed successfully)

**Migration 20260817000002_elite_homepage_placement.sql:**
- `ALTER TABLE user_profiles ADD COLUMN elite_placement_type text CHECK (IN ('event','business'))`
- `ALTER TABLE user_profiles ADD COLUMN elite_placement_target_id uuid`
- Index: `user_profiles_elite_placement_idx` (partial — non-null only)
- Function: `set_elite_placement(p_type text, p_target uuid)` — SECURITY DEFINER
- Function: `get_elite_placements(p_limit integer)` — anon + authenticated

**Migration 20260817000003_elite_placement_column_protection.sql (CORRECTED):**
- `REVOKE UPDATE (elite_placement_type, elite_placement_target_id) FROM authenticated`
- `REVOKE UPDATE (elite_placement_type, elite_placement_target_id) FROM anon`
- Dropped broken SECURITY DEFINER trigger — `current_user` check is ineffective inside SECURITY DEFINER (becomes function owner/postgres, not 'authenticated'); the check never fired
- Correct architecture confirmed: established user_profiles privilege model (table-level UPDATE revoked from authenticated + no column-level grant for elite columns) is sufficient
- Privilege verification DO block ran at migration time, confirmed protection
- Executed successfully ✅

### Server-Side Security

**`set_elite_placement()` — SECURITY DEFINER, `authenticated` only:**
- `auth.uid()` derived server-side — unforgeable
- Elite tier check: `subscription_tier = 'elite'`
- FAIL-CLOSED status check: explicit allowed-list `IN ('active','trialing','canceled','past_due')` — NULL/unknown/expired/revoked/refunded all denied
- Period check: `current_period_end IS NOT NULL AND > now()`
- Event ownership: `e.promoter_id = auth.uid()`
- Business ownership: `b.owner_id = auth.uid()`
- Target eligibility: `status = 'live'`, event not past `(date::date + 36 hours) > now()`
- Idempotent: calling same type+target twice → same result, no error
- Clear: p_type=NULL or p_target=NULL → clears both (no entitlement required to clear)
- Returns: `{ ok: boolean, error?: text }` — never silent failure

**`get_elite_placements()` — SECURITY DEFINER, anon-safe:**
- Entitlement re-verified at read time (fail-closed explicit allowed-list)
- Event ownership re-checked: `e.promoter_id = up.id` (independent of setter)
- Business ownership re-checked: `b.owner_id = up.id` (independent of setter)
- Privacy-safe: NO lat/lon, NO street_address returned
- Past events auto-excluded: `(date::date + 36 hours) > now()`
- Non-live targets auto-excluded: `status = 'live'`
- Limit clamped: 1–20
- WHERE after all LEFT JOINs (valid SQL syntax — corrected from initial version)

**Column Protection (established privilege model + defense-in-depth):**
- Established architecture: table-level UPDATE revoked from `authenticated` on `user_profiles` (matches subscription_tier, roles, verified_promoter, etc.)
- Column-level `REVOKE UPDATE` on both elite columns from `authenticated` and `anon` — explicit defense-in-depth, consistent with other protected columns
- No trigger: SECURITY DEFINER trigger's `current_user` is unreliable (becomes postgres, not caller) — removed
- `set_elite_placement()` runs as postgres (SECURITY DEFINER) — bypasses column restrictions legitimately
- service_role bypasses RLS — admin operations unaffected
- Direct authenticated UPDATE: BLOCKED (no table-level or column-level UPDATE grant)

### Client Screen (`app/elite-placement.tsx`)
- Route: `/elite-placement`
- Client-side Elite entitlement guard (locked state for non-Elite with upgrade CTA)
- Tab selector: Events | Businesses
- Loads only owned live upcoming events + owned live businesses
- Selection, switch (confirmation dialog), remove (destructive dialog)
- Calls `set_elite_placement()` RPC — server enforces all rules
- Web-safe alert modal for `Platform.OS === 'web'`

### Home Tab Integration (`app/(tabs)/index.tsx`)
- `get_elite_placements({ p_limit: 6 })` called on mount + pull-to-refresh
- "Elite Picks" horizontal rail above Quick Date Shortcuts
- `ElitePlacementCard` (68% screen width, 180px height, gold border)
- Navigates to `/event/{id}` or `/business/{id}` on tap
- Section hidden when no active placements

### Route Registration (`app/_layout.tsx`)
- `elite-placement` screen registered

## FILES CHANGED
- `supabase/migrations/20260817000002_elite_homepage_placement.sql` — NEW (executed ✅)
- `supabase/migrations/20260817000003_elite_placement_column_protection.sql` — NEW, corrected (executed ✅)
- `app/elite-placement.tsx` — NEW
- `app/(tabs)/index.tsx` — Elite Picks section + ElitePlacementCard + RPC call
- `app/_layout.tsx` — route registration

## DATABASE CHANGES
- 2 new columns on `user_profiles`
- 1 partial index
- `set_elite_placement()` SECURITY DEFINER function (authenticated-only)
- `get_elite_placements()` anon-safe function
- Column-level REVOKE on authenticated + anon (defense-in-depth)
- All 3 migrations executed in Supabase ✅

## SECURITY

### Entitlement Check (fail-closed, explicit allowed-list)
```
PASS:  tier='elite' AND status IN ('active','trialing','canceled','past_due') AND period_end > now()
DENY:  tier != 'elite'
DENY:  status = 'expired' | 'revoked' | 'refunded' | NULL | any unknown value
DENY:  period_end IS NULL
DENY:  period_end <= now()
```

### Protected Columns
```
Direct UPDATE by 'authenticated' role → BLOCKED
  Mechanism: (a) no table-level UPDATE grant + (b) explicit column-level REVOKE
  Both layers match the established user_profiles privilege architecture.
set_elite_placement() (postgres/SECURITY DEFINER) → ALLOWED
service_role → ALLOWED (bypasses RLS)

NOTE: SECURITY DEFINER trigger approach was dropped — current_user inside SECURITY DEFINER
is the function owner (postgres), not the calling role. The check would never fire.
The privilege model (no UPDATE grant to authenticated) is the correct, proven mechanism.
```

### Cross-User
```
User A tries to select User B's event via RPC → DENIED (promoter_id = auth.uid() check)
User A tries to select User B's business via RPC → DENIED (owner_id = auth.uid() check)
get_elite_placements() corrupted data → BLOCKED (ownership re-verified in JOIN)
```

### Privacy
```
get_elite_placements() returns: primary_parish, town (public-safe)
get_elite_placements() NEVER returns: latitude, longitude, street_address
```

## PRODUCT RULES VERIFIED
- ✅ One selection per creator (single row, both columns updated atomically)
- ✅ Only owned targets accepted (ownership check in RPC)
- ✅ Only live targets accepted (status = 'live' check)
- ✅ Past events auto-excluded (date + 36hr matches isEventPassed())
- ✅ Expired/revoked Elite → disappears from Home (read-time check in get_elite_placements)
- ✅ Pro denied server-side
- ✅ Free denied server-side
- ✅ No Boost credit consumed
- ✅ Not labeled "Boosted" — labeled "Elite"
- ✅ `events.featured` (editorial) untouched
- ✅ Business Verification untouched
- ✅ Idempotent: same type+target → no error

## VALIDATION
TypeScript: NOT RUN (no CLI access in this environment)
ESLint: NOT RUN
Expo Doctor: NOT RUN
Runtime: NOT RUN — NEEDS DEVICE TEST

## TESTS PERFORMED (Code Review)
- Entitlement flow: fail-closed explicit allowed-list verified in both set and get functions
- Ownership flow: promoter_id/owner_id checks verified in both set and get
- Column protection: privilege model verified (no trigger; REVOKE confirmed)
- Privacy: no coordinates in get_elite_placements return columns
- Product rules: all 11 rules verified against implementation
- SQL syntax: WHERE after LEFT JOINs confirmed correct
- Trigger architecture: confirmed SECURITY DEFINER trigger current_user check is unreliable; dropped

## NOT TESTED (Requires Device/Dashboard)
- Physical iOS: Elite creator sets placement → appears on Home for other users
- Physical Android: same
- Expired Elite subscription → placement disappears from Home feed in real time
- Past event → placement auto-removed from Home feed
- Non-Elite user opens screen → locked gate shown
- Direct RPC call by Pro user → error returned
- Direct column UPDATE by authenticated client → blocked (confirmed by privilege analysis; not testable without Supabase SQL editor as authenticated role)

## BLOCKERS
None — all code-side work complete. All 3 SQL migrations executed.

## IMPLEMENTATION EVIDENCE

### Code
- `app/elite-placement.tsx` — ElitePlacementManager screen (full implementation)
- `app/(tabs)/index.tsx` — ElitePlacementCard component + get_elite_placements() RPC call + Elite Picks section
- `app/_layout.tsx` — route registered

### Backend
- `supabase/migrations/20260817000002_elite_homepage_placement.sql` — executed ✅
- `supabase/migrations/20260817000003_elite_placement_column_protection.sql` — executed ✅ (corrected: trigger dropped, privilege model confirmed)
- `set_elite_placement()` SECURITY DEFINER with fail-closed explicit allowed-list
- `get_elite_placements()` anon-safe with ownership re-verification in JOINs
- Column REVOKE (defense-in-depth, matching established privilege architecture)

### App Entry Point
- Profile screen → Elite creator section → Elite Homepage Placement
- Home tab → "Elite Picks" horizontal rail (rendered when placements > 0)

### Server Authority
`set_elite_placement()` validates server-side:
1. `auth.uid()` not null
2. `subscription_tier = 'elite'`
3. `subscription_status IN ('active','trialing','canceled','past_due')` — fail-closed
4. `current_period_end IS NOT NULL AND > now()`
5. Ownership: `promoter_id = auth.uid()` OR `owner_id = auth.uid()`
6. `status = 'live'`
7. For events: `(date::date + interval '36 hours') > now()`

`get_elite_placements()` independently re-validates:
1. `subscription_tier = 'elite'` + fail-closed status + period_end
2. `e.promoter_id = up.id` (event ownership)
3. `b.owner_id = up.id` (business ownership)
4. `e.status = 'live'` + date not past
5. `b.status = 'live'`

### Column Protection Architecture
- Established mechanism: table-level UPDATE revoked from `authenticated` on `user_profiles`
- Elite columns simply have no UPDATE grant to `authenticated` (same as subscription_tier, roles, etc.)
- Explicit REVOKE added as defense-in-depth assertion
- SECURITY DEFINER trigger was incorrect (current_user = postgres, not caller) — removed
- Privilege verification DO block confirmed at migration time

### Validation Evidence
SQL Migration 20260817000002: EXECUTED SUCCESSFULLY ✅
SQL Migration 20260817000003 (CORRECTED): EXECUTED SUCCESSFULLY ✅
  — Trigger dropped (SECURITY DEFINER current_user check unreliable)
  — Column-level REVOKE confirmed as correct protection mechanism
  — Privilege verification DO block ran at migration time
TypeScript/ESLint/Expo Doctor: NOT RUN (no CLI in environment)
Device testing: NOT RUN — NEEDS DEVICE TEST
