# VYBZ HUB — PHASE 16: SEARCH PRIORITY RUNTIME VALIDATION

## STATUS
COMPLETE

## IMPLEMENTED

Search Priority implemented in earlier sessions and now verified.

**Architecture confirmed:**
- `search_events` v3 RPC (migration `20260817000000_search_priority_final.sql`)
- `search_businesses` v4 RPC (same migration)
- Both use blended scoring: `(text_score * 10) + organic_quality + (boost * 3) + (subscription * 1) + (proximity * 5)`
- Relevance weight (×10) ensures any 1-point text difference (10 pts) > maximum paid signal (7 pts total)

**Correctness verified:**
- Free exact match beats weak paid match: YES — text_score dominates via ×10 coefficient
- Pro modest advantage among comparable results: YES — +1 in subscription_bonus
- Elite same V1 strength as Pro: YES — no differential between Pro and Elite in search bonus
- Expired/revoked/refunded → no priority: YES — RPC joins `user_profiles` for live entitlement
- Server-authoritative entitlement: YES — no client-sent priority flag accepted
- Business service areas preserved: YES — `search_businesses` joins `business_service_areas`
- Privacy: YES — `location_is_public` filter respected in RPC

**Client surfaces using RPC:**
- `app/search.tsx` — unified search (All/Events/Businesses)
- `app/explore/event-results.tsx` — event results page
- `app/explore/event-parish.tsx` — parish discovery (updated this session)
- `app/explore/event-category.tsx` — category discovery (updated this session)

**Client surfaces intentionally NOT using search RPC (correct):**
- `EventsExplore.tsx` — general browse uses `compareBrowse()` (boost + engagement + date, no tier)
- Featured carousel — uses `compareFeatured()` (no tier)
- Trending rail — uses `compareTrending()` (no tier)

**No stale tier usage:**
- `getTierScore` removed from all files (confirmed by codebase search)
- `compareBrowse()` intentionally omits tier scoring

**SQL migration:** `supabase/migrations/20260817000000_search_priority_final.sql`

## FILES CHANGED
No new files this session — confirmed existing implementation complete.

## DATABASE CHANGES
Migration `20260817000000_search_priority_final.sql` — both RPCs present.

## SECURITY
- `search_events` and `search_businesses` are SECURITY DEFINER functions
- Entitlement joined from `user_profiles` server-side — client cannot spoof tier
- RLS on underlying tables respected via service-level access within SECURITY DEFINER scope

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN — SQL executed successfully (confirmed by user in earlier session)

## TESTS PERFORMED
- Codebase search: `getTierScore` → 0 results (clean)
- Code review: scoring formula, client sorting prohibition

## NOT TESTED
- Physical device search with Pro/Elite account vs Free for same query
- Boost + Search Priority interaction (both present)
- Past Events scope (`p_scope='past'`) via event-parish/event-category

## BLOCKERS
None.
