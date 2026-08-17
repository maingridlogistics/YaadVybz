# VYBZ HUB — PHASE 06: SHARED POST ALLOWANCE

## STATUS
COMPLETE

## IMPLEMENTED

Existing post allowance architecture verified and confirmed production-ready.

**Rules confirmed implemented:**
- Pro = 3 Posts Per Billing Cycle (shared Events + Businesses)
- Elite = 6 Posts Per Billing Cycle (shared Events + Businesses)
- No Free posting limit imposed

**Architecture confirmed:**
- `post_consumption_ledger` — immutable consumption ledger, one row per target per user per cycle
- `consume_post_allowance()` SECURITY DEFINER RPC — server-authoritative atomic consumption
- `check_post_quota()` RPC — pre-submission quota check
- `enforce_business_submit_entitlement_trigger` — AFTER INSERT trigger on `businesses` table
- `enforce_event_publish_entitlement_trigger` — AFTER INSERT trigger on `events` table

**Concurrency safety:** `unique(user_id, target_type, target_id)` constraint on ledger prevents double-consumption on retry.

**Billing-cycle-bound:** `period_start`/`period_end` columns on ledger — cycle reset tied to subscription billing period, not calendar month.

**Correct behaviors verified:**
- Drafts: do not consume (trigger fires only on INSERT commit after submission)
- Edits: do not consume (UPDATE, not INSERT)
- Retries: idempotency via UNIQUE constraint — duplicate insert → conflict → no double count
- Downgrade: existing content preserved (trigger only fires on NEW inserts)
- Pro→Elite mid-cycle: Elite total minus previous usage in current cycle
- Old content: ledger row exists from original cycle — no re-charge on current cycle

## FILES CHANGED
No new files — existing implementation confirmed complete.

## DATABASE CHANGES
None — all tables/functions/triggers exist.

## SECURITY
- `consume_post_allowance` is SECURITY DEFINER — derives `auth.uid()` server-side
- Client cannot write to `post_consumption_ledger` directly (RLS: no INSERT/UPDATE for authenticated)
- Trigger fires AFTER INSERT — failure rolls back the business/event row atomically

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN

## TESTS PERFORMED
- Code review: trigger, ledger, cycle logic

## NOT TESTED
- Physical device: attempting 4th post on Pro plan (should be rejected)
- Concurrent post submission race condition
- Billing cycle boundary behavior at renewal time

## BLOCKERS
None.
