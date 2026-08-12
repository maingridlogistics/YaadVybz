# VYBZ HUB — TICKETING PHASE 1 FINAL SECURITY PATCH REPORT
**Date:** 2026-08-12  
**Scope:** QR Credential Exposure — Promoter Base-Table Access Removal  
**Follows:** Phase 1 Hardening (VYBZHUB_TICKETING_PHASE1_HARDENING_REPORT.md)

---

## PHASE 1 SECURITY PATCH: COMPLETE

---

## FEATURE FLAG: OFF

`constants/featureFlags.ts` → `TICKETING_ENABLED = false`  
No ticketing UI is visible to any user. Zero production impact.

---

## PROMOTER BASE-TABLE TICKET ACCESS: REMOVED

The `promoter_select_event_tickets` policy has been **permanently dropped** from `public.tickets`.

**Before this patch:**
A promoter could execute `SELECT * FROM tickets WHERE event_id = '<their_event>'` via any Supabase client and receive all ticket columns, including `secure_token`.

**After this patch:**
A promoter executing the same query receives **0 rows**. The RLS evaluation path is:

1. `authenticated_select_own_tickets` — `owner_user_id = auth.uid() OR purchaser_user_id = auth.uid()` — does not match for tickets belonging to other buyers.
2. `admin_all_tickets` — `is_admin()` — does not match for promoter roles.

No other SELECT policy covers tickets for non-owner users. The table is effectively closed to direct promoter query.

---

## PROMOTER SECURE_TOKEN ACCESS: BLOCKED

`secure_token` is **structurally inaccessible** through any promoter-accessible path:

| Access Path | Promoter Can Access `secure_token`? |
|---|---|
| Direct `SELECT * FROM tickets` | ❌ 0 rows returned (RLS blocks) |
| `get_event_tickets_for_promoter()` RPC | ❌ `secure_token` is absent from the RETURN TABLE definition — cannot appear in output |
| `get_event_ticket_summary()` RPC | ❌ Returns aggregate stats only, no ticket rows |
| `checkin_ticket()` RPC | ❌ Scanner validates token; token is consumed as input, never returned |
| Supabase dashboard (client) | ❌ Dashboard respects RLS for non-admin roles |
| Service role (Edge Functions) | ✅ Server-side only — not client-accessible |

**The exclusion is structural, not just conditional.** The return type of `get_event_tickets_for_promoter()` does not declare a `secure_token` column. It is impossible for any query parameter or argument to cause the function to return a token value, regardless of what the caller sends.

---

## CUSTOMER OWN-TICKET ACCESS: PASS

The existing `authenticated_select_own_tickets` policy is **unchanged**:

```sql
USING (owner_user_id = auth.uid() OR purchaser_user_id = auth.uid() OR is_admin())
```

Customers can SELECT their own ticket rows, including `secure_token`, which is required to display the QR code in the My Tickets screen (Phase 2).

The Phase 1 security patch does not affect customer ticket access in any way.

---

## ADMIN ACCESS: PASS

The existing `admin_all_tickets` policy is **unchanged**:

```sql
USING (is_admin()) WITH CHECK (is_admin())
```

Admins retain full SELECT, INSERT, UPDATE, DELETE access to all ticket rows, including `secure_token`. Admin access requires `is_admin()` to return true (server-side DB function, not trusting client-supplied roles).

---

## SCANNER RPC: PASS

`checkin_ticket(secure_token, event_id, scanned_by, device_id)` is **unchanged** from the hardening pass.

- Scanner provides the token as **input** — the token is never returned as output.
- Authorization is verified inside the SECURITY DEFINER function before any ticket data is accessed.
- A scanner cannot use this RPC to enumerate tokens for tickets they have not personally scanned.
- The function returns `{ ok, result, attendee_name, checkin_id, message }` — no credentials.

---

## SANITIZED PROMOTER QUERY PATH: `get_event_tickets_for_promoter()`

### Function Signature
```sql
get_event_tickets_for_promoter(
  p_event_id uuid,
  p_limit    integer default 100,
  p_offset   integer default 0
) returns table (...)
```

### Returned Columns (ALL that are accessible)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Ticket row ID |
| `event_id` | uuid | Always matches `p_event_id` |
| `ticket_type_id` | uuid | Tier identifier |
| `ticket_type_name` | text | Tier name (joined from `event_ticket_types`) |
| `owner_user_id` | uuid | Current owner's user ID |
| `purchaser_user_id` | uuid | Original purchaser's user ID |
| `attendee_name` | text | Name printed on ticket |
| `status` | text | valid / transferred_out / voided / cancelled / refunded |
| `checked_in_at` | timestamptz | Null until checked in |
| `checked_in_by` | uuid | Scanner user ID |
| `transfer_count` | integer | Number of times transferred |
| `created_at` | timestamptz | Purchase timestamp |
| `updated_at` | timestamptz | Last modified timestamp |

### Columns NEVER returned (structural exclusion)
- `secure_token` — QR credential. Not in RETURNS TABLE definition.
- `order_id` — Payment reference. Not in RETURNS TABLE definition.
- `order_item_id` — Payment reference. Not in RETURNS TABLE definition.

### Authorization
- Caller must be the event promoter (`events.promoter_id = auth.uid()`) OR an admin
- All other callers receive: `ERROR: Not authorised to view tickets for event <id>`
- Promoters cannot query another promoter's event by supplying a different `p_event_id`

### Result Limits
- Client-supplied `p_limit` is capped at 500 rows per call: `least(p_limit, 500)`
- Pagination supported via `p_offset`

### Phase 2 Usage
All Phase 2 promoter ticket dashboards, attendee exports, and door management screens **must** use this RPC. Direct `SELECT` from the `tickets` base table is blocked by RLS for promoters.

---

## ADDITIONAL RPC: `get_event_ticket_summary()`

Returns **aggregated stats only** — no ticket rows, no tokens, no PII.

```json
{
  "event_id": "...",
  "total_tickets": 150,
  "checked_in": 47,
  "not_checked_in": 103,
  "valid": 148,
  "transferred_out": 2,
  "voided": 0,
  "cancelled": 0,
  "refunded": 0,
  "by_type": [
    { "ticket_type_id": "...", "ticket_type_name": "VIP", "total": 50, "checked_in": 12 },
    { "ticket_type_id": "...", "ticket_type_name": "General", "total": 100, "checked_in": 35 }
  ]
}
```

Safe for promoter dashboard widgets. Authorization: same as `get_event_tickets_for_promoter()`.

---

## RLS CHANGES

| Table | Policy | Action |
|---|---|---|
| `public.tickets` | `promoter_select_event_tickets` | **DROPPED** — removes all direct promoter SELECT on tickets base table |

No other RLS policies were modified. Customer and admin policies are unchanged.

---

## DATABASE OBJECTS CREATED

| Object | Type | Description |
|---|---|---|
| `get_event_tickets_for_promoter(uuid, integer, integer)` | SECURITY DEFINER function | Sanitized promoter ticket list — `secure_token` structurally excluded from return type |
| `get_event_ticket_summary(uuid)` | SECURITY DEFINER function | Aggregate check-in and sales stats — no ticket rows, no credentials |

Both functions:
- `REVOKE ALL … FROM public` before granting
- `GRANT EXECUTE … TO authenticated`
- Run as SECURITY DEFINER so they can read the base table while enforcing their own authorization logic

---

## COMPLETE PHASE 1 RLS STATE (tickets table)

After this patch, the effective SELECT policies on `public.tickets` are:

```
authenticated_select_own_tickets:
  USING (owner_user_id = auth.uid()
         OR purchaser_user_id = auth.uid()
         OR is_admin())

admin_all_tickets:
  USING (is_admin())
  WITH CHECK (is_admin())
```

**No other SELECT policy exists.** A promoter who is not also a ticket owner/purchaser sees 0 rows.

---

## SECURE ACCESS MAP (complete, post-patch)

| Who | How to access tickets | secure_token visible? |
|---|---|---|
| Customer (own tickets) | Direct SELECT via `authenticated_select_own_tickets` | ✅ Yes — needed for QR display |
| Promoter (attendee list) | `get_event_tickets_for_promoter()` RPC | ❌ No — structurally excluded |
| Promoter (dashboard stats) | `get_event_ticket_summary()` RPC | ❌ No — aggregate only |
| Scanner (validation) | `checkin_ticket()` RPC (token as input) | ❌ No — token is input, never output |
| Admin | Direct SELECT via `admin_all_tickets` | ✅ Yes — intentional admin access |
| Edge Functions | Service role (bypass RLS) | ✅ Yes — server-side only |
| Anonymous / unauthenticated | No policy | ❌ No access |

---

## TYPECHECK: NOT APPLICABLE
No TypeScript files modified. All changes are SQL-only.

## LINT: NOT APPLICABLE
No application code modified.

## EXPO DOCTOR: NOT APPLICABLE
No native configuration modified.

---

## SAFE TO PROCEED TO PHASE 2: YES

All three Phase 1 stages are now complete:

| Stage | Status |
|---|---|
| Phase 1 — Database & Security Foundation | ✅ Complete |
| Phase 1 — Hardening Pass | ✅ Complete |
| Phase 1 — Final Security Patch | ✅ Complete |

The ticketing schema is fully hardened:
- No direct client writes on tickets, transfers, or reservations
- Promoters cannot access QR credentials through any client-accessible path
- All state changes go through SECURITY DEFINER RPCs
- Account deletion is non-blocking for financial records
- Inventory correctness is guaranteed without cron dependency
- `TICKETING_ENABLED = false` — zero production user impact

---

## PHASE 2 PREREQUISITES (owner actions before development begins)

| # | Action | Required For |
|---|---|---|
| 1 | **Currency decision**: USD-only launch or JMD processor first? | Phase 2 checkout |
| 2 | **pg_cron**: Enable in Supabase Dashboard → Database → Extensions; schedule `expire_stale_reservations()` every 5 min | Reservation cleanup |
| 3 | **Stripe webhook events**: Register `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` for ticket payments | Phase 2 payment confirmation |
| 4 | **Payout decision**: Manual wire (USD), NCB Lynk (JMD), or defer to Phase 3? | Phase 2 promoter dashboard |

---

*Phase 1 security patch complete. Stop.*
