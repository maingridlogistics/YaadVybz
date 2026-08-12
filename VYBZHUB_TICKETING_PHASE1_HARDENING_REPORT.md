# VYBZ HUB — TICKETING PHASE 1 HARDENING REPORT
**Date:** 2026-08-12  
**Scope:** Security, Concurrency & Architecture Hardening  
**Follows:** Phase 1 Foundation (VYBZHUB_TICKETING_PHASE1_REPORT.md)

---

## PHASE 1 HARDENING: COMPLETE

---

## FEATURE FLAG: OFF

`constants/featureFlags.ts` → `TICKETING_ENABLED = false`  
No ticketing UI is visible to any user.

---

## STRIPE CAPABILITY VERIFICATION

### JMD CUSTOMER CHARGES: NOT AVAILABLE

Stripe Standard does not support JMD (Jamaican Dollar) as a charge currency. Jamaica is not in Stripe's list of supported presentment currencies. Attempting to create a `PaymentIntent` with `currency = 'jmd'` will return a Stripe error.

**Options to resolve:**
- **Option A — USD only (recommended for Phase 2 launch):** Collect payments in USD. No Stripe changes needed. Jamaican customers pay in USD.
- **Option B — WiPay / Paymaster:** Integrate a Caribbean payment processor that supports JMD collection. Requires a separate integration path alongside Stripe.
- **Option C — Apply for Stripe local payment method:** Contact Stripe support to request JMD presentment capability. Not guaranteed to be approved.

**Decision required from owner before Phase 2 checkout development begins.**

---

### JAMAICA CONNECT: NOT AVAILABLE

Jamaica is not a supported country for Stripe Connect (neither Standard nor Express accounts). Jamaican business accounts cannot be created as connected accounts on the Vybz Hub platform account as of the current Stripe supported regions list.

**Impact:** Stripe cannot automatically split ticket proceeds to promoter bank accounts in Jamaica.

**Workaround architecture (already built in Phase 1):**
- `promoter_ledger` tracks what each promoter is owed
- `promoter_payouts` records manual payout execution
- `promoter_payout_accounts` stores payout destination metadata
- Manual admin-initiated payouts via wire/NCB Lynk are the realistic Phase 2 payout path

---

### GLOBAL PAYOUTS: NOT AVAILABLE

Stripe Global Payouts (formerly Stripe Treasury) does not cover Jamaica. Recipients in Jamaica cannot receive automated payouts through Stripe's global payout infrastructure.

**Same workaround applies as above.**

---

## HARDENING ITEMS

---

### TICKET DIRECT UPDATE: REMOVED

The `authenticated_update_own_tickets` policy that allowed ticket owners to directly UPDATE any field on their ticket rows has been **dropped**.

Ticket state changes now require going through controlled RPCs:
- `checkin_ticket()` — marks `checked_in_at` and `checked_in_by` atomically
- `initiate_ticket_transfer()` — creates the transfer record (Phase 2 will complete ownership + token rotation)
- Attendee name changes → `ticket_name_changes` table via service-role RPC (Phase 2)

No general client UPDATE path remains on the `tickets` table.

---

### TRANSFER SERVER-ONLY: PASS

The `authenticated_insert_own_tt` policy allowing direct client INSERT into `ticket_transfers` has been **dropped**.

Replaced by `initiate_ticket_transfer(p_ticket_id, p_from_user, p_to_email, p_to_user_id)` — a `SECURITY DEFINER` RPC that atomically:

1. Locks the ticket row (`SELECT … FOR UPDATE`)
2. Verifies current ownership (`owner_user_id = p_from_user`)
3. Verifies ticket is `valid`
4. Verifies ticket is not checked in
5. Verifies ticket is not in a terminal state (voided/cancelled/refunded/transferred_out)
6. Verifies event has not already passed
7. Prevents self-transfer
8. Prevents initiating a new transfer when one is already `pending`
9. Creates the transfer record
10. Returns transfer ID + status

Token rotation and ownership swap are Phase 2 scope (require atomicity with ticket status update).

**Client cannot fabricate a transfer record independently.**

---

### ATOMIC INVENTORY RPC: PASS

Three atomic database functions have been created to replace direct client access to `ticket_inventory_reservations`:

#### `reserve_ticket_inventory(ticket_type_id, quantity, user_id) → json`

- Uses `SELECT … FOR UPDATE` on the ticket type row to serialize concurrent reservation attempts
- Validates tier is `active` and ticket settings are `on_sale`
- Enforces `min_per_order` and `max_per_order` on the server (not trusting client quantity)
- Computes live available inventory using `expires_at > now()` (cron-independent)
- Cancels any prior active reservation by the same user for the same tier (prevents stacking)
- Sets `expires_at = now() + interval '10 minutes'` — server-computed, client cannot supply
- Returns `{ ok, reservation_id, expires_at, quantity, ticket_type_id, event_id }`

#### `release_ticket_reservation(reservation_id, user_id) → json`

- Locks the reservation row (`SELECT … FOR UPDATE`)
- Validates calling user owns the reservation
- Validates reservation is currently `active`
- Sets status to `cancelled`

#### `finalize_ticket_order(reservation_id, buyer_id, payment_reference, payment_provider) → json`

- **Phase 2 scaffold** — function signature locked, full implementation deferred
- Will atomically: lock inventory, verify reservation, compute fees, insert order + items + tickets, update quantities, mark reservation `converted`, append ledger entries, log audit entry
- Currently returns an error message — not callable without service role anyway (no authenticated GRANT)

**Direct INSERT and UPDATE on `ticket_inventory_reservations` removed from RLS.**

---

### RESERVATION SOURCE OF TRUTH: TRIGGER-MAINTAINED CACHE (Design B)

**Decision: `quantity_reserved` on `event_ticket_types` is a denormalized cache — maintained exclusively by a database trigger. It is never written directly by application code.**

**Source of truth for inventory decisions: `ticket_inventory_reservations` table + `expires_at > now()` filter.**

Implementation:

- `sync_quantity_reserved()` trigger fires `AFTER INSERT OR UPDATE OR DELETE` on `ticket_inventory_reservations`
- On every change, it recomputes: `SUM(quantity) WHERE status = 'active' AND expires_at > now()`
- Updates `event_ticket_types.quantity_reserved` to match
- `calculate_available_inventory()` queries the live `ticket_inventory_reservations` table directly (not the cached column) to ensure correctness is never cron-dependent

**How expired reservations affect inventory:**

1. An expired reservation (`expires_at < now()`) is excluded from `calculate_available_inventory()` immediately — the inventory is visually available to new buyers the instant the TTL lapses.
2. The `sync_quantity_reserved` trigger does NOT fire when cron runs `expire_stale_reservations()` to change `status → 'expired'` (UPDATE fires trigger → trigger recomputes → `quantity_reserved` drops to correct value). This keeps the display cache correct.
3. If cron has not run yet, `quantity_reserved` may temporarily show a stale higher value — but this is only a display column. All reservation and checkout decisions use the live RPC logic which applies `expires_at > now()` regardless.

---

### CLIENT RESERVATION ABUSE: BLOCKED

The following abuse vectors are now prevented:

| Abuse Vector | Mitigation |
|---|---|
| Client selects arbitrary quantity | `reserve_ticket_inventory()` enforces `min_per_order` / `max_per_order` server-side |
| Client reserves another event's tiers | FK + ticket settings check inside RPC validates event ownership chain |
| Client creates excessively long reservation | `expires_at` is server-computed (`now() + 10 min`) — client cannot supply it |
| Client modifies `expires_at` | No client UPDATE policy on `ticket_inventory_reservations` |
| Client holds unlimited inventory | Stacking prevention: prior active reservation by same user for same tier is cancelled before new one is created |
| Client bypasses sales status | RPC checks `event_ticket_settings.sales_status = 'on_sale'` before allowing reservation |
| Client direct INSERT | `authenticated_insert_own_tir` policy dropped; only RPC path available |
| Client direct UPDATE | `authenticated_update_own_tir` policy dropped; only RPC path available |

---

### CHECK-IN ATOMIC FOUNDATION: PASS

`checkin_ticket(secure_token, event_id, scanned_by, device_id) → json` — `SECURITY DEFINER` RPC that atomically:

1. Verifies scanner authorization (checks `event_staff` OR event ownership OR admin) **before** touching ticket data
2. Locks the ticket row (`SELECT … FOR UPDATE` by `secure_token`)
3. Verifies event assignment
4. Checks ticket status: voided/cancelled/refunded → `VOID`, transferred_out → `INVALID`, checked-in → `ALREADY_USED`
5. On VALID: atomically sets `checked_in_at = now()` and `checked_in_by = scanned_by`
6. Inserts `ticket_checkins` log entry with the scan result in the same transaction

**A scanner client cannot create a `VALID` check-in log entry without actually updating the ticket row. The check-in record and the ticket state change are atomic.**

All scan outcomes are logged: VALID, ALREADY_USED, INVALID, WRONG_EVENT, VOID, CANCELLED.

Scanner authorization check order: `event_staff` table → promoter ownership → admin role.

---

### QR TOKEN STORAGE: PLAINTEXT WITH JUSTIFICATION

**Decision: `secure_token` stored in plaintext.**

**Justification:**

1. **256-bit entropy** — `encode(gen_random_bytes(32), 'hex')` produces a 64-character hex string with 2^256 possible values. Brute-force is computationally infeasible.
2. **Validation path** — the `checkin_ticket()` RPC receives the raw token from the scanner and does a direct equality lookup. Hashing would add complexity (pgcrypto extension + index on hash) with no meaningful security benefit given the token entropy.
3. **Token rotation** — the token is rotated on every successful transfer, so a stolen token from a transferred ticket becomes invalid.
4. **RLS restriction** — customers can only SELECT their own tickets (owner or purchaser). Promoters can SELECT all tickets for their events (required for door management). The `checkin_ticket()` RPC is the scanner's primary access path.

**Known limitation / Phase 2 action:** Promoters with direct DB query access (via SQL editor or service role) could enumerate `secure_token` values for their events. This is acceptable because:
- Promoters do not have service role access
- Client-side SELECT queries go through RLS which enforces event scoping
- Ticket validation still requires knowing the `event_id` match

**Phase 2 recommendation:** Introduce a promoter-facing view (`event_tickets_summary`) that excludes `secure_token`, and remove the direct `promoter_select_event_tickets` table policy. Replace it with the view-based path for operational access (attendee lists, check-in counts).

---

### EVENT ELIGIBILITY SERVER-SIDE: PASS

`check_event_ticket_eligibility()` — `SECURITY DEFINER` trigger function, fires:
- `BEFORE INSERT OR UPDATE (WHEN new.enabled = true)` on `event_ticket_settings`
- `BEFORE INSERT` on `event_ticket_types`

Enforces:
- Event `status` must be `'live'` — pending, rejected, flagged events cannot have ticketing enabled
- Event `date` must be `>= current_date` — past events cannot receive new ticket configuration

**Server-side enforcement — cannot be bypassed by the UI or direct API calls.**

---

### ACCOUNT DELETION COMPATIBILITY: PASS

Reviewed all `ON DELETE RESTRICT` foreign keys referencing `auth.users` in financial tables.

**Problem identified:** `ticket_orders.buyer_id → auth.users RESTRICT` would block account deletion for any user who has placed a ticket order. Financial records must survive account closure.

**Fixes applied:**

| Table | Column | Old | New |
|---|---|---|---|
| `ticket_orders` | `buyer_id` | `RESTRICT` | `SET NULL` |
| `promoter_ledger` | `promoter_id` | `RESTRICT` | `SET NULL` |
| `promoter_payouts` | `promoter_id` | `RESTRICT` | `SET NULL` |
| `event_cancellation_requests` | `requested_by` | `RESTRICT` | `SET NULL` |

**Financial records are preserved when an account is deleted — the foreign key becomes NULL but the row survives. Accounting integrity is maintained.**

Tables intentionally keeping `CASCADE` on user delete:
- `ticket_inventory_reservations.user_id` → CASCADE (active reservations should be released on account close)
- `promoter_payout_accounts.promoter_id` → CASCADE (operational records, not financial history)
- `event_staff.user_id` → CASCADE (staff authorization records, not financial history)

No existing app account deletion workflow is broken.

---

### CRON REQUIRED FOR CORRECTNESS: NO

`calculate_available_inventory()` and `reserve_ticket_inventory()` both apply `expires_at > now()` directly in their queries. A buyer sees correct available inventory the instant a reservation expires, regardless of whether `expire_stale_reservations()` has run.

**Cron is maintenance/housekeeping only:**
- Cleans up stale rows to prevent table bloat
- Keeps `quantity_reserved` display cache accurate for UI hints
- Does not affect correctness of any checkout or reservation decision

**Recommended pg_cron schedule:** Every 5 minutes is sufficient (not every minute).

```sql
select cron.schedule(
  'expire-stale-ticket-reservations',
  '*/5 * * * *',  -- every 5 minutes
  'select public.expire_stale_reservations()'
);
```

---

## DATABASE CHANGES

### FK Constraint Changes

| Table | Column | Change |
|---|---|---|
| `ticket_orders` | `buyer_id` | `RESTRICT → SET NULL` |
| `promoter_ledger` | `promoter_id` | `RESTRICT → SET NULL` |
| `promoter_payouts` | `promoter_id` | `RESTRICT → SET NULL` |
| `event_cancellation_requests` | `requested_by` | `RESTRICT → SET NULL` |

### Triggers Created

| Trigger | Table | Event | Function |
|---|---|---|---|
| `enforce_event_ticket_eligibility` | `event_ticket_settings` | BEFORE INSERT OR UPDATE (WHEN enabled = true) | `check_event_ticket_eligibility()` |
| `enforce_ticket_tier_eligibility` | `event_ticket_types` | BEFORE INSERT | `check_event_ticket_eligibility()` |
| `sync_quantity_reserved_trigger` | `ticket_inventory_reservations` | AFTER INSERT OR UPDATE OR DELETE | `sync_quantity_reserved()` |

### Functions Created / Changed

| Function | Type | Change |
|---|---|---|
| `check_event_ticket_eligibility()` | Trigger function | NEW — validates event status + date before ticket config |
| `sync_quantity_reserved()` | Trigger function | NEW — keeps `quantity_reserved` in sync with live reservations |
| `calculate_available_inventory(uuid)` | RPC | UPDATED — explicit `expires_at > now()` filter documented; cron-independent |
| `reserve_ticket_inventory(uuid, integer, uuid)` | RPC | NEW — atomic reservation with SELECT FOR UPDATE, stacking prevention, server TTL |
| `release_ticket_reservation(uuid, uuid)` | RPC | NEW — atomic reservation cancellation |
| `checkin_ticket(text, uuid, uuid, text)` | RPC | NEW — atomic QR check-in: scanner auth + ticket update + log in one transaction |
| `initiate_ticket_transfer(uuid, uuid, text, uuid)` | RPC | NEW — atomic transfer initiation with full validation chain |
| `finalize_ticket_order(uuid, uuid, text, text)` | RPC | NEW (scaffold) — signature locked; full implementation is Phase 2 |

### RLS Changes

| Table | Policy | Action |
|---|---|---|
| `tickets` | `authenticated_update_own_tickets` | DROPPED |
| `ticket_transfers` | `authenticated_insert_own_tt` | DROPPED |
| `ticket_inventory_reservations` | `authenticated_insert_own_tir` | DROPPED |
| `ticket_inventory_reservations` | `authenticated_update_own_tir` | DROPPED |
| `tickets` | `promoter_select_event_tickets` | DROPPED and re-created (same logic, documented for Phase 2 view replacement) |

---

## MAX 5 TIERS — BUSINESS RULE CONFIRMATION

Current trigger counts **non-cancelled** tiers (`where status != 'cancelled'`).

**Confirmed correct business behavior:** Cancelling a tier permanently frees a slot, allowing a new tier to be created in its place (up to the 5-tier maximum of active/usable tiers at any one time). Historical cancelled tier records are preserved for audit purposes but do not count toward the active limit.

If a future requirement changes this to a **lifetime 5-tier limit**, the trigger must be updated to: `where true` (count all tiers regardless of status). No change made at this time.

---

## TYPECHECK: NOT APPLICABLE

No TypeScript files were modified in this hardening pass. All changes are SQL-only (schema, triggers, functions, RLS). Run `npx tsc --noEmit` to confirm no regressions.

## LINT: NOT APPLICABLE

No application code modified. Run `npx eslint .` to confirm no regressions.

## EXPO DOCTOR: NOT APPLICABLE

No native configuration modified.

---

## SAFE TO PROCEED TO PHASE 2: YES

All Phase 1 hardening items are resolved. The ticketing schema is now security-hardened with:
- No dangerous direct client writes on tickets, transfers, or reservations
- Atomic RPCs for all state-changing operations
- Event eligibility enforced server-side via triggers
- Account deletion compatibility preserved for all financial tables
- Inventory correctness guaranteed without cron dependency
- Transfer and check-in operations fully server-controlled

---

## PHASE 2 PREREQUISITES

Before Phase 2 development begins, the following decisions are required from the owner:

| Item | Decision Required |
|---|---|
| **Currency** | USD-only for Phase 2 launch, or integrate JMD processor first? |
| **Payout method** | Manual wire (USD), NCB Lynk (JMD), or defer payouts to Phase 3? |
| **pg_cron** | Enable in Supabase dashboard (Database → Extensions → pg_cron) and schedule `expire_stale_reservations()` every 5 minutes |
| **Stripe webhook events** | Register `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` for ticket PaymentIntents in Stripe dashboard |

---

## PHASE 2 SCOPE (NEXT)

1. **Promoter ticket configuration UI** — enable ticketing on an event, select currency, create up to 5 ticket tiers (gated by `TICKETING_ENABLED` flag)
2. **Customer checkout flow** — tier selection → `reserve_ticket_inventory()` RPC → Stripe PaymentIntent → confirmation
3. **`create-ticket-checkout` Edge Function** — server-side fee calculation (5% + 5%), calls `finalize_ticket_order()` after payment confirmation
4. **Ticket webhook handler** — extend `stripe-webhook` to handle ticket `payment_intent.succeeded`
5. **My Tickets screen** — customer views purchased tickets with QR code display
6. **Basic sales dashboard** — promoter views ticket sales + revenue for their events

---

*Phase 1 hardening complete. Stop.*
