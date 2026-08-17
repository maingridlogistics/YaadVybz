# VYBZ HUB — PHASE 17: ELITE HOMEPAGE PLACEMENT

## STATUS
COMPLETE (Code + DB Migration) | NEEDS SQL EXECUTION | NEEDS DEVICE TEST

## IMPLEMENTED

### Server-Authoritative RPC (`set_elite_placement`)
- SECURITY DEFINER function in `supabase/migrations/20260817000002_elite_homepage_placement.sql`
- Validates: authenticated caller, elite tier, active subscription period (not expired/revoked/refunded)
- Validates: target is owned by caller (`promoter_id = auth.uid()` for events, `owner_id = auth.uid()` for businesses)
- Validates: target is live + event not past (date::date + 36 hours > now)
- Returns `{ ok: boolean, error: text }` — no silent failures

### Home Feed RPC (`get_elite_placements`)
- Anon-safe (granted to `anon, authenticated`)
- Only returns placements where creator still has active elite subscription
- Event filter: `status = 'live' AND (date::date + interval '36 hours') > now()`
- Business filter: `status = 'live'`
- Privacy-safe: NO lat/lon/street_address returned
- Limit: 6 max

### DB Columns
- `user_profiles.elite_placement_type` (text, constrained to 'event'|'business')
- `user_profiles.elite_placement_target_id` (uuid)
- Index: `user_profiles_elite_placement_idx` on non-null placements

### ElitePlacementManager Screen (`app/elite-placement.tsx`)
- Route: `/elite-placement`
- Client-side Elite entitlement guard (gated to Elite + active)
- Tab selector: Events | Businesses
- Loads only owned live events (upcoming) and owned live businesses
- EventSelectionCard + BusinessSelectionCard with selected state visualization
- Calls `set_elite_placement()` RPC — server enforces all rules
- Switch placement: confirmation dialog
- Remove placement: destructive confirmation dialog
- Web-safe alert modal for Platform.OS === 'web'
- Locked state for non-Elite users with upgrade CTA

### Home Tab Integration (`app/(tabs)/index.tsx`)
- Calls `get_elite_placements()` RPC on mount and refresh
- "Elite Picks" section renders above Quick Date Shortcuts
- `ElitePlacementCard` component: 68% screen width, 180px height, gold border
- Shows event OR business details with creator name
- Navigates to `/event/{id}` or `/business/{id}` on tap
- Section hidden when no active placements (zero state = section not shown)
- Included in pull-to-refresh cycle

### Route Registration (`app/_layout.tsx`)
- `elite-placement` registered with `slide_from_right` animation

## FILES CHANGED
- `supabase/migrations/20260817000002_elite_homepage_placement.sql` — NEW
- `app/elite-placement.tsx` — NEW
- `app/(tabs)/index.tsx` — Elite Picks section + ElitePlacementCard component + RPC call
- `app/_layout.tsx` — route registration

## DATABASE CHANGES
- `ALTER TABLE user_profiles ADD COLUMN elite_placement_type text`
- `ALTER TABLE user_profiles ADD COLUMN elite_placement_target_id uuid`
- Index: `user_profiles_elite_placement_idx`
- Function: `set_elite_placement(p_type text, p_target uuid)` — SECURITY DEFINER
- Function: `get_elite_placements(p_limit integer)` — anon + authenticated
- Migration file: `supabase/migrations/20260817000002_elite_homepage_placement.sql`

## SECURITY
- `set_elite_placement()` is SECURITY DEFINER with `set search_path = public`
- `auth.uid()` derived server-side — client cannot forge identity
- Elite check against canonical `user_profiles.subscription_tier`
- Active period check against `user_profiles.current_period_end > now()`
- Terminal statuses (`expired`, `revoked`, `refunded`) explicitly denied
- Cross-user write impossible: UPDATE only applies to `WHERE id = auth.uid()`
- `get_elite_placements()` returns no PII, no private coordinates
- Business location privacy preserved: no lat/lon/street_address in RPC

## PRODUCT RULES VERIFIED
- ✅ One selection total (event OR business — not both simultaneously)
- ✅ Only owned live targets eligible
- ✅ Past events auto-excluded (date + 36hr check matches isEventPassed())
- ✅ Suspended/rejected businesses auto-excluded (status != 'live')
- ✅ Expired Elite disappears from Home (current_period_end check in RPC)
- ✅ Pro denied server-side (tier must be 'elite')
- ✅ Free denied server-side
- ✅ No Boost credit consumption
- ✅ Not labeled "Boosted" — labeled "Elite"
- ✅ `events.featured` (editorial) untouched
- ✅ Business Verification untouched

## VALIDATION
TypeScript: NOT RUN (environment limitation)
ESLint: NOT RUN
Expo Doctor: NOT RUN
Runtime: NOT RUN — NEEDS DEVICE TEST

## TESTS PERFORMED
- Code review: ownership checks present, entitlement checks present
- Privacy review: no coordinates in get_elite_placements return set
- Product rule review: all 11 rules verified in implementation

## NOT TESTED
- Physical iPhone/Android: Elite placement set → appears on Home for other users
- Expired Elite subscription → placement disappears from Home feed
- Past event → placement auto-removed from Home feed
- Non-Elite user opening screen → locked gate UI shown
- Free/Pro attempting set_elite_placement() RPC directly → error returned

## BLOCKERS
- SQL migration must be executed in Supabase dashboard before screen works
- `get_public_promoter_profiles` function may need `banner_url` column added
  (separate concern — covered in migration 20260817000001)

## IMPLEMENTATION EVIDENCE

### Code
- `app/elite-placement.tsx` — ElitePlacementManager screen
- `app/(tabs)/index.tsx` — ElitePlacementCard + get_elite_placements() call
- `app/_layout.tsx` — route registration

### Backend
- `supabase/migrations/20260817000002_elite_homepage_placement.sql`
- `set_elite_placement()` SECURITY DEFINER RPC
- `get_elite_placements()` anon-safe RPC

### App Entry Point
- Profile screen → Elite Placement option → `/elite-placement`
- Home tab → "Elite Picks" section (when placements exist)

### Server Authority
- `set_elite_placement()` SECURITY DEFINER validates:
  1. `auth.uid()` not null
  2. `subscription_tier = 'elite'`
  3. `subscription_status NOT IN ('expired','revoked','refunded')`
  4. `current_period_end > now()`
  5. Target ownership via `promoter_id = auth.uid()` or `owner_id = auth.uid()`
  6. Target `status = 'live'`
  7. Event not past: `(date::date + interval '36 hours') > now()`

### Validation Evidence
NOT RUN — requires Supabase SQL execution + physical device testing
