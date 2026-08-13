# VYBZ HUB — WEBSITE DOOR SALES REMOVAL SPEC
# For Lovable / Web team

This document specifies everything that must be removed from the Vybz Hub **website**
as part of the Online-Only Ticketing simplification.
Online ticketing, QR, transfer, scanner, finance, and payouts are NOT affected.

---

## REMOVE: Routes / Pages

| Route | Reason |
|---|---|
| `/ticketing/door/[eventId]` | Sell at Door screen — removed entirely |
| Any `/door-sale/*` sub-routes | Entirely removed |

---

## REMOVE: UI Entry Points

Remove every link, button, nav item, or menu row that navigates to:
- Sell at Door
- Door Sales
- Cash Sale
- Card at Door
- Walk-up Sale
- Recent Door Orders
- Void Door Cash Order
- Door Sales Summary

Locations to audit:
- Promoter Dashboard quick actions
- Ticketing tab / Event Operations section
- More / Operations menu
- Staff tools
- Any event management action sheet

---

## REMOVE: Payment Options

Remove any ticket payment option labelled:
- Cash
- Cash Payment
- Cash Deposit
- Pay at Door
- Pay at Event

Online Stripe checkout is the only supported payment method.

---

## REMOVE: Finance / Dashboard UI

Remove from the Ticket Dashboard and Finance screens:
- Cash Collected Directly row
- Door Cash Sales section
- Door Card Sales section
- Sales Breakdown channel rows for `door_cash` and `door_card`
- Staff Activity section (was door-sale specific)
- Cash Accounting card / callout
- "Cash Refunds You Must Handle" warning card
- Any `cash_collected_directly_minor` display

---

## REMOVE: Edge Function Calls

Remove all client-side calls to:
- `create-door-card-checkout` (Edge Function deleted)
- `door_sale_cash` RPC
- `get_door_sales_summary` RPC
- `void_door_cash_order` RPC
- `is_door_staff_for_event` RPC
- `get_door_order_tickets` RPC

Do NOT remove calls to:
- `create-ticket-checkout` (online checkout — keep)
- `stripe-webhook` (keep)
- `process-event-refunds` (keep)
- `finalize_ticket_order` (keep)
- `checkin_ticket` (keep)
- `get_event_ticket_summary` (keep)
- `get_event_tickets_for_promoter` (keep)

---

## REMOVE: Staff Role

Remove `door_sales` as a selectable staff role in the Add Staff UI.

Final selectable roles:
- `scanner`
- `manager`

Existing `door_sales` rows in the database may remain for historical reference.

---

## KEEP: Everything Online

Preserve without change:
- Online customer ticket checkout (`create-ticket-checkout`)
- Stripe webhook processing
- `finalize_ticket_order` RPC
- Ticket inventory reservation
- My Tickets / QR codes
- Ticket detail
- Ticket transfer
- Attendee rename
- Scanner / check-in
- Ticket Setup, Tiers, Dashboard (online stats only)
- Staff (scanner + manager roles only)
- Finance & Payouts (online proceeds only)
- Cancellation & Refunds (electronic only)
- Physical ticket location display (external listings only, not Vybz Hub processing)
- External ticket provider link

---

## DB COLUMNS — DO NOT DROP (yet)

These columns exist in `ticket_orders` but should NOT be dropped without a separate
owner-approved migration. Audit whether any online flow writes to them first:
- `buyer_name`
- `buyer_email`
- `buyer_phone`
- `buyer_id` (nullable — keep for now, online checkout always sets this)

`sale_source` values `door_cash` and `door_card` may remain in historical rows.
New writes will always be `online_customer`.

---

## LEGAL COPY REQUIRING UPDATE

The following documents contain language about door/cash sales that will need
to be updated in a separate legal review. Do NOT change terms versions in this task.

1. **Customer Ticket Terms** — References to cash refund responsibility, walk-up purchase model
2. **Promoter Ticketing Agreement** — Door sales fee model (0%/0%), cash collection clauses
3. **Refund Policy** — "Cash refunds are the promoter's responsibility" clause
4. **Terms of Use** — Any mention of at-event cash or door card transactions
5. **Privacy Policy** — Walk-up customer contact data collection (buyer_name/email/phone)

---

_Generated: 2026-08-13 | Vybz Hub Online-Only Ticketing Migration_
