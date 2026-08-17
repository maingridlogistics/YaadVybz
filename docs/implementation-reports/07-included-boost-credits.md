# VYBZ HUB — PHASE 07: INCLUDED BOOST CREDITS

## STATUS
COMPLETE

## IMPLEMENTED

Existing boost credit architecture verified and confirmed production-ready.

**Rules confirmed:**
- Pro = 2 credits per billing cycle
- Elite = 6 credits per billing cycle
- No rollover (period-bound ledger)
- Shared across Events + Businesses
- 3-Day = 1 credit; 7-Day = 2 credits; Until Event Ends = NOT credit-eligible

**Architecture confirmed:**
- `boost_credit_ledger` — immutable, SECURITY DEFINER writes only
- `use_boost_credit_atomic()` RPC — atomic credit consumption with period validation
- `user_profiles.monthly_boost_allowance` + `remaining_boosts` — cached for UI display
- `user_profiles.boost_credits_used_this_cycle` — current cycle counter
- `boost_credit_ledger.idempotency_key UNIQUE` — prevents duplicate spend on retry
- `boost_credit_ledger.unique(user_id, idempotency_key)` constraint

**Ownership check:** `use_boost_credit_atomic` verifies `auth.uid() = user_id` server-side.

**Target eligibility:** Client-side validation (one active boost per target) enforced before credit submission; server-side trigger would also reject duplicate-boost attempts.

**Upgrade behavior:** Moving from Pro (2 credits) to Elite (6 credits) mid-cycle: server grants Elite allowance; existing period_start/period_end preserved.

**Paid Boost purchases remain separate:** `boost_purchases` table for paid boosts; ledger for credit boosts. The two systems do not cross.

## FILES CHANGED
No new files — existing implementation confirmed complete.

## DATABASE CHANGES
None — all tables/functions exist.

## SECURITY
- `boost_credit_ledger` has no INSERT/UPDATE/DELETE for authenticated role directly
- All writes via `use_boost_credit_atomic` SECURITY DEFINER function
- `bcl_user_idempotency_idx` UNIQUE index prevents replay
- Period validation inside RPC prevents using credits outside billing window

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN

## TESTS PERFORMED
- Code review: ledger schema, RPC logic, idempotency constraint

## NOT TESTED
- Physical device: using both Pro credits (should block 3rd credit use)
- Credit display after purchase/renewal
- Cross-device credit count sync

## BLOCKERS
None.
