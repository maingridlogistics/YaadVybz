# VYBZ HUB — WEBSITE PARITY MASTER SPECIFICATION
**Document Version:** 1.0  
**Audit Date:** 2026-08-12  
**Source:** Static analysis of current Vybz Hub mobile repository + Supabase backend  
**Purpose:** Complete reference for implementing Vybz Hub website feature parity using Lovable  
**Supabase Project:** twilfdbvrzhlnllcmssc (ACTIVE_HEALTHY)  
**Backend URL:** https://twilfdbvrzhlnllcmssc.supabase.co

---

## ⚠️ CRITICAL NOTICE TO LOVABLE

This specification is **READ-ONLY** with respect to backend architecture. The Vybz Hub Supabase backend is **shared** between the mobile app and the website. You MUST:

1. **NEVER** create duplicate tables, RPCs, Edge Functions, triggers, or cron jobs
2. **NEVER** implement client-side pricing, fee calculation, or inventory management
3. **NEVER** expose `secure_token` (QR codes) to promoters or unauthenticated users
4. **ALWAYS** call the existing RPCs and Edge Functions — do not reimplemented their logic in browser code
5. **ALWAYS** use server-side Stripe Checkout — never embed raw card fields
6. **NEVER** issue tickets based on client-side payment confirmation alone

The mobile app and website share the **same users, events, tickets, orders, payments, transfers, check-ins, refunds, payouts, and financial records**.

---

## Executive Summary

Vybz Hub is a Jamaica-focused event discovery and in-app ticketing platform. The mobile app (React Native / Expo) is the primary client. The website will serve as a second client, particularly valuable for:

- Desktop ticket purchase (Stripe hosted checkout works best on web)
- Promoter event management from desktop
- Admin operations
- SEO/discoverability for events

The backend is **fully implemented** across 28+ database tables, 40+ SECURITY DEFINER RPCs, 18 Edge Functions, pg_cron schedulers, and 3 storage buckets. The website must **consume** this backend, not duplicate it.

**Current `TICKETING_ENABLED` flag:** `true` (development/testing mode)  
**Feature Flags File:** `constants/featureFlags.ts`  
- `TICKETING_ENABLED = true`  
- `PHONE_AUTH_ENABLED = false` (Twilio not configured)

---

## Complete Feature Inventory

### APPLICATION AREAS IDENTIFIED

1. Authentication & Account Management
2. Onboarding
3. Event Discovery & Search
4. Event Details & Social
5. Event Creation & Editing
6. Event Categories & Parishes
7. Bookmarks / Favorites
8. Notifications (In-app + Push)
9. Promoter Profile & Public Profiles
10. Subscriptions & Paid Plans
11. Boost System (Paid Promotion)
12. Advertising (Ad Placements)
13. Ticketing — Customer (Checkout, My Tickets, QR, Transfers)
14. Ticketing — Promoter (Setup, Tiers, Dashboard, Attendee List)
15. Ticketing — Staff (Scanner, Door Cash, Door Card)
16. Ticketing — Admin (Cancellations, Refunds, Payouts, Disputes)
17. Finance & Payouts
18. Admin Panel (Full)
19. Map View
20. Language / Localization

---

## Website Parity Classification Legend

- **A — MUST EXIST ON WEBSITE** (P0/P1 — required for any production website launch)
- **B — SHOULD EXIST ON WEBSITE** (P2 — important for full parity)
- **C — OPTIONAL ON WEBSITE** (nice to have)
- **D — MOBILE-ONLY — DO NOT IMPLEMENT ON WEBSITE** (camera, haptics, native-specific)
- **E — BACKEND-ONLY — WEBSITE CONSUMES IT** (Edge Functions, RPCs, triggers, cron)

---

## Customer Features

### Authentication

| Feature | Classification | Mobile Route | Backend | Notes |
|---|---|---|---|---|
| Email sign up | A | `/auth` | `supabase.auth.signUp()` | Phone required on mobile; recommend optional on web |
| Email sign in | A | `/auth` | `supabase.auth.signInWithPassword()` | |
| Password reset | A | `/auth` | `supabase.auth.resetPasswordForEmail()` | Deep link returns to web URL, not `vybzhub://` |
| Set new password (recovery) | A | `/auth` (recovery mode) | `supabase.auth.updateUser()` | Triggered by `onAuthStateChange` RECOVERY event |
| Sign out | A | Profile | `supabase.auth.signOut()` | Clear session |
| Phone OTP | C | `/auth` | `signInWithPhone()` / `verifyOTP()` | `PHONE_AUTH_ENABLED=false` — not yet available |
| Google OAuth | C | Stubbed | Not configured | Throws error in current mobile app |
| Apple OAuth | C | Stubbed | Not configured | iOS-only anyway |
| Session persistence | A | — | Supabase localStorage | Use `@supabase/ssr` or browser localStorage |
| Auth state listener | A | — | `onAuthStateChange` | Mirror mobile's AuthContext pattern |
| Password recovery mode | A | — | `RECOVERY` event in `onAuthStateChange` | Website redirect URI must be set in Supabase dashboard |

**Important:** The mobile app's `resetPassword()` has 4-retry logic and handles 504 SMTP timeout. Replicate this on website or handle gracefully.

**Password Reset Deep Links:** Mobile uses `vybzhub://auth`. Website must use its own URL (e.g., `https://vybzhub.com/auth/reset`). Supabase Auth Settings → Site URL must include both.

#### Auth Form Rules (from mobile `auth.tsx`)
- Name: minimum 2 characters
- Email: must pass regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Password: minimum 8 characters
- Phone: required for registration; Jamaica default (+1 876/658); E.164 storage
- Roles: user selects 'attendee' and/or 'promoter' on registration
- Password strength indicator: weak (< 8 chars), fair (1 of upper/num/special), strong (2+ of upper/num/special)

---

### Account & Profile

| Feature | Classification | Mobile Route | Tables/RPCs | Notes |
|---|---|---|---|---|
| View own profile | A | `/(tabs)/profile` | `user_profiles` | |
| Edit name | A | Profile | `user_profiles.update` | RLS: own only |
| Edit phone | A | Profile | `user_profiles.update` | PhoneInput component required |
| Upload avatar | A | Profile | `profile-images` bucket | Auth-scoped path `{uid}/avatar.jpg` |
| View subscription status | A | Profile | `user_profiles.subscription_tier` | |
| View boost credits | B | Profile | `user_profiles.remaining_boosts` | |
| Preferred parishes | B | Profile | `user_profiles.preferred_parishes` | |
| Interests | B | Profile | `user_profiles.interests` | |
| Notification settings | B | `/notification-settings` | `user_profiles.*_notif_*` columns | |
| Delete account | A | Profile | `account_deletion_requests` + `delete-account` Edge Function | Request-based, admin approval required |
| View deletion request status | A | Profile | `account_deletion_requests` | |
| Legal links | A | Profile, Onboarding | External URLs | `https://vybzhub.com/privacy`, `/terms` |
| Support contact | A | Profile | mailto link | `info@vybzhub.com` |
| Language toggle (EN/Patois) | C | Profile | `LanguageContext` | Client-side only; low priority for web |

#### `user_profiles` Table Key Columns
```
id (uuid, FK → auth.users.id)
email (text)
name (text)
phone (text) — E.164 format
home_parish (text)
preferred_parishes (text[])
interests (text[]) — event type IDs
roles (text[]) — 'attendee', 'promoter', 'admin'
subscription_tier (text) — 'free', 'pro', 'elite'
subscription_status (text) — 'active', 'past_due', 'canceled'
current_period_end (timestamptz)
verified_promoter (boolean)
monthly_boost_allowance (integer)
remaining_boosts (integer)
avatar_url (text)
```

---

### Event Discovery

| Feature | Classification | Mobile Route | Tables/Services | Notes |
|---|---|---|---|---|
| Home feed (featured, trending, this week) | A | `/(tabs)/index` | `events` table | |
| Browse events | A | `/(tabs)/browse` | `events` table | |
| Search by title/promoter/parish | A | Browse | Client-side filter on loaded events | |
| Filter by parish | A | Browse | `events.parish` | 14 canonical Jamaica parishes |
| Filter by event type | A | Browse | `events.event_types` | |
| Filter by date (today/weekend) | A | Browse | `events.date` | |
| Event cards | A | Various | `events` table | Cover image, title, parish, date, going/interested count |
| Featured events | A | `/featured-events` | `events.featured = true` | |
| Trending events | B | Home | Custom `compareTrending` function | Engagement + boost nudge |
| Near you (parish-based) | C | Home | `events.parish` | Less useful on desktop |
| Browse by category | A | Home | `EVENT_TYPES` config + `events.type` | |
| Browse by parish | A | Home | `PARISHES` list | |
| Event type chips / filters | A | Browse | Client-side | |

#### Event Visibility Rules (from RLS)
- `status = 'live'` → visible to everyone (anon + authenticated)
- `status = 'pending'` → promoter + admin only
- `status = 'rejected'` → promoter + admin only (shows as "Cancelled" if `cancellation_status = 'cancellation_approved'`)
- `status = 'flagged'` → live to public, flagged state visible to admin

---

### Event Details

| Feature | Classification | Mobile Route | Tables/RPCs | Notes |
|---|---|---|---|---|
| Full event detail view | A | `/event/[id]` | `events` | |
| Flyer image gallery | A | Event detail | `events.flyer_images` | Array of image URLs |
| Going / Interested RSVP | A | Event detail | `user_rsvps`, `useEvents.toggleGoing/Interested` | Auth required |
| View going/interested counts | A | Event detail | `events.going_count`, `events.interested_count` | Public |
| View event lineup | A | Event detail | `events.lineup_entries` (jsonb) | |
| Contact info | A | Event detail | `events.contact_info` | |
| Share event | B | Event detail | Native share → web: Web Share API | |
| Bookmark / Save event | A | Event detail | `user_rsvps` or local state | Auth required |
| View promoter profile | A | Event detail | `/promoter/[id]` | Public |
| View event squad | C | `/squad/[eventId]` | `user_rsvps` filtered | |
| Report event | C | Event detail | Client UI | Low priority |
| Buy Tickets CTA | A | Event detail → checkout | `getEventTicketingStatus()` | |
| View ticket pricing on event card | A | Event detail | `event_ticket_settings`, `event_ticket_types` | |
| Increment view count | B | Event detail | `increment_event_view()` RPC | |
| Map/Location display | B | Event detail | `events.venue`, `events.address` | Google Maps Embed or static map |

---

### Ticket Purchase (Customer)

**This is P0 for website — Stripe checkout works best on web browsers.**

#### Complete Purchase Flow
```
Event Detail → "Buy Tickets" button
→ GET event ticketing status (event_ticket_settings + event_ticket_types)
→ Check buyState: 'buy_tickets' | 'sales_not_started' | 'sold_out' | 'sales_ended' | 'paused' | 'not_configured' | 'past_event'
→ If 'buy_tickets': Show tier selection UI
→ Tier selection: quantity stepper per tier (respects min_per_order, max_per_order, available)
→ Terms acceptance check (customer_ticket_terms_acceptances table)
→ If not accepted: Show terms modal → record acceptance
→ POST to create-ticket-checkout Edge Function (JWT required)
  ← Returns: checkout_url, session_id, order_id, order_number, expires_at, amounts
→ Redirect to Stripe hosted checkout page
→ Stripe processes payment
→ Stripe webhook → stripe-webhook Edge Function:
  - Idempotency check (ticket_payment_events table)
  - finalize_ticket_order() RPC
  - Notification sent to buyer
  - Reservation released
→ Success: Redirect to /tickets/order/[orderId] or /my-tickets
→ Cancel: Reservation expires in 10 minutes automatically
```

| Feature | Classification | Mobile Route | Edge Function/RPC | Notes |
|---|---|---|---|---|
| Ticket tier display | A | `/ticketing/checkout/[eventId]` | `event_ticket_types` direct query | |
| Availability display | A | Checkout | `available = total - sold - reserved` | |
| Quantity stepper | A | Checkout | Client UI | Respects min/max per order |
| Customer fee display (5%) | A | Checkout | Client display only (server is authoritative) | |
| Terms acceptance modal | A | Checkout | `customer_ticket_terms_acceptances` | Version `'1.0'` |
| Create checkout session | A | Checkout | `create-ticket-checkout` Edge Function | JWT required |
| JMD unavailable error | A | Checkout | Edge Function returns `jmd_provider_unavailable` | Show clear error |
| Stripe hosted checkout | A | Checkout | Stripe hosted page | Redirect pattern |
| Payment success redirect | A | After Stripe | URL param `?order_id=` | Parse from success URL |
| Payment cancel redirect | A | After Stripe | URL param from cancel URL | Show cancellation message |
| Order receipt page | A | `/ticketing/order/[orderId]` | `ticket_orders`, `ticket_order_items`, `get_purchase_history_tickets()` | |
| Reservation expiry notice | A | Checkout | 10-minute TTL | Show countdown or notice |

#### Stripe Return URLs for Website
The mobile app uses:
- Success: `vybzhub://ticket-success?session_id={CHECKOUT_SESSION_ID}&order_id=...`
- Cancel: `vybzhub://ticket-cancel?order_id=...&event_id=...`

**The website must use HTTPS URLs instead:**
- Success: `https://vybzhub.com/tickets/success?session_id={CHECKOUT_SESSION_ID}&order_id=...`
- Cancel: `https://vybzhub.com/tickets/cancel?order_id=...&event_id=...`

These must be passed in the `create-ticket-checkout` Edge Function request body or the Edge Function must be updated to accept a `return_base_url` parameter. **Do NOT modify the mobile app's return URLs.**

**NOTE:** The current Edge Function hardcodes `vybzhub://ticket-success` and `vybzhub://ticket-cancel`. The website implementation will need to either:
1. Pass the return URL as a request parameter (requires Edge Function update by owner — NOT by Lovable)
2. Use a server-side proxy that maps web return URLs back to mobile-compatible format

**⚠️ This is a coordination point. Lovable must NOT modify the Edge Function without owner authorization.**

---

### My Tickets

| Feature | Classification | Mobile Route | Tables/RPCs | Notes |
|---|---|---|---|---|
| List all tickets | A | `/my-tickets` | `tickets` table (own via RLS) | |
| Individual ticket detail | A | `/ticketing/ticket/[ticketId]` | `tickets` | |
| QR code display | A | Ticket detail | `tickets.secure_token` | Use QR library |
| Ticket status display | A | Ticket detail | `tickets.status` | valid, cancelled, refunded, transferred_out, voided |
| Checked-in status | A | Ticket detail | `tickets.checked_in_at` | |
| Transfer ticket | A | Ticket detail | `initiate_ticket_transfer()`, `complete_ticket_transfer()`, `lookup_transfer_recipient()` RPCs | |
| Attendee name change | A | Ticket detail | `change_ticket_attendee_name()` RPC | |
| Order receipt link | A | My Tickets | `/tickets/order/[orderId]` | |
| Transfer history | B | Ticket detail | `ticket_transfers` table | |
| Cancelled/Refunded tickets | A | My Tickets | Filter by `tickets.status` | |

#### `getMyTickets()` Query Pattern
```javascript
// From customerTicketingService.ts
supabase.from('tickets')
  .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, transfer_count, created_at')
  .eq('owner_user_id', user.id)
  .order('created_at', { ascending: false })
```
Then enriched with parallel queries for events, ticket types, and order numbers.

#### `get_purchase_history_tickets()` RPC (IMPORTANT)
Used in order detail to get `secure_token`. This RPC returns:
- `secure_token` = actual token for tickets still owned by the buyer
- `secure_token` = `null` for tickets transferred away (prevents original purchaser from using old QR)

**NEVER query `tickets.secure_token` directly in an order receipt context. Always use this RPC.**

---

### Ticket Transfer

#### Complete Transfer Flow
```
Ticket Detail → Transfer button
→ Eligibility check: status === 'valid' AND !isEventPast AND transfer_count < limit
→ Step 1: Enter recipient email/phone
  → lookup_transfer_recipient({ p_identifier }) RPC
  ← Returns: { ok, recipient_id, display_name, display_hint }
  (display_hint is masked — e.g. "jo***@gmail.com")
→ Step 2: Confirm recipient with masked hint
→ Step 3: Call initiate_ticket_transfer() RPC
  → Creates ticket_transfers record (status: 'pending')
→ Step 4: Confirm → Call complete_ticket_transfer() RPC
  → Rotates secure_token (old QR invalidated)
  → Updates ticket.owner_user_id
  → Creates ticket_name_changes audit record
  → Creates notification for recipient
→ Success: Show new QR / navigate to My Tickets
```

#### Transfer Eligibility (from ticket detail screen)
```javascript
const canTransfer = ticket.status === 'valid' && !isEventPast && ticket.transfer_count < MAX_TRANSFERS;
```

#### Privacy: `lookup_transfer_recipient()`
This RPC accepts email or phone. It returns:
- `display_hint`: masked identifier (not full email/phone) to protect recipient's PII
- `display_name`: recipient's display name
- `recipient_id`: UUID to use in transfer RPC

**NEVER show the full email/phone of the recipient to the sender.**

---

### Attendee Name Change

| Rule | Value |
|---|---|
| RPC | `change_ticket_attendee_name(p_ticket_id, p_new_name)` |
| Authorization | Must be `owner_user_id` (via RLS / RPC check) |
| Restriction | Cannot change after check-in (`checked_in_at IS NOT NULL`) |
| Audit | Creates record in `ticket_name_changes` |
| Ownership | Name change does NOT change ticket ownership |

---

### Notifications

| Feature | Classification | Mobile Route | Tables | Notes |
|---|---|---|---|---|
| Notification list | A | `/notifications` | `notifications` table | RLS: own only |
| Unread count badge | A | Nav header | `notifications.read = false` count | |
| Mark as read | A | Notifications | `UPDATE notifications SET read = true` | |
| Delete notification | B | Notifications | `DELETE FROM notifications` | Own only |
| Notification types | A | — | `notifications.type` column | See types below |

#### Notification Types (from `_layout.tsx` routing)
- `account_deletion_request` — User requested deletion
- `account_deletion_approved` — Account deletion approved by admin
- `account_deletion_rejected` — Account deletion rejected
- `event_rejected` — Promoter's event rejected by admin
- `event_cancelled` — Event cancelled (for attendees)
- `ticket_transferred` — Ticket was transferred away
- `ticket_received` — Ticket received via transfer
- `ticket_purchase_confirmed` — Ticket purchase succeeded
- `boost_expiring` — Boost expiring soon
- `payment_failed` — Subscription payment failed
- `subscription_cancellation_scheduled` — Subscription set to cancel at period end
- `new_follower` — Someone followed the promoter
- `payment_dispute` — Chargeback filed against promoter
- `refund_completed` — Customer refund issued

**Push notifications (FCM/APNs) are mobile-only (D). In-app notifications via `notifications` table are website-compatible (A).**

---

## Promoter Features

### Event Creation & Management

| Feature | Classification | Mobile Route | Tables | Notes |
|---|---|---|---|---|
| Post new event | A | `/(tabs)/post` | `events.insert` | All fields documented below |
| Edit event | A | `/edit-event/[id]` | `events.update` | Ownership: `promoter_id = auth.uid()` |
| My events list | A | `/my-events` | `events` filtered by `promoter_id` | |
| Flyer image upload | A | Post/Edit | `event-images` bucket | Auth-scoped: `{uid}/{filename}` |
| Delete/reject event (soft) | B | Admin only | `events.status = 'rejected'` | Promoter can request cancellation |
| Event status display | A | My events | `events.status`, `events.cancellation_status` | |

#### Complete Event Fields (from `post.tsx` / `edit-event/[id].tsx`)
| Field | Type | Required | Notes |
|---|---|---|---|
| title | text | Yes | |
| description | text | No | |
| type | text | Yes | Deprecated; use event_types |
| event_types | text[] | Yes | Array of event type IDs |
| type_label | text | Auto | Derived from event_types |
| parish | text | Yes | 14-parish canonical list |
| venue | text | Yes | |
| address | text | No | |
| date | text | Yes | YYYY-MM-DD |
| start_time | text | Yes | HH:MM format |
| end_time | text | No | |
| recurring | boolean | No | Default false |
| recurring_frequency | text | Conditional | If recurring=true |
| cover_image | text | Yes | Public URL from event-images bucket |
| flyer_images | text[] | No | Array of public URLs |
| ticket_price | text | No | Default 'Free' |
| dress_code | text | No | |
| age_limit | text | No | Default 'All Ages' |
| lineup | text[] | No | Array of performer names |
| lineup_entries | jsonb | No | Richer lineup objects |
| contact_info | text | No | Phone/contact — use PhoneInput component |
| promoter_name | text | Auto | From user profile |
| tags | text[] | No | |

#### Phone Input Requirements
The app uses a custom `PhoneInput` component with:
- Jamaica default (+1 876)
- Supports 876 and 658 area codes
- International picker
- E.164 output storage
- Validation

**The website must implement equivalent phone input behavior.**

---

### Ticketing Setup (Promoter)

| Feature | Classification | Mobile Route | Service/RPC | Notes |
|---|---|---|---|---|
| Accept promoter ticketing terms | A | `/ticketing/setup/[eventId]` | `ticketing_terms_acceptances` | Version `TICKETING_TERMS_VERSION = '2026-08-v1'` |
| Configure currency (USD/JMD) | A | Setup | `event_ticket_settings` | Currency locks after first paid order |
| Enable ticketing | A | Setup | `event_ticket_settings.enabled = true` | |
| Set sales status | A | Setup | `event_ticket_settings.sales_status` | draft/on_sale/paused/ended |
| Set sales start/end dates | B | Setup | `event_ticket_settings.sales_start_at/end_at` | |
| Create ticket tier | A | `/ticketing/tiers/[eventId]` | `event_ticket_types.insert` | Max 5 tiers enforced by DB trigger |
| Edit ticket tier | A | Tiers | `event_ticket_types.update` | |
| Cancel ticket tier | A | Tiers | `cancelTicketTier()` — sets status='cancelled' | Cannot cancel tier with sold tickets |
| Reorder tiers | B | Tiers | `sort_order` updates | |

#### Promoter Ticketing Terms (LEGAL BLOCKER)
- **Version:** `'2026-08-v1'` (in `ticketingService.ts:TICKETING_TERMS_VERSION`)
- **Table:** `ticketing_terms_acceptances (user_id, terms_version)`
- **Current content:** PLACEHOLDER — not attorney-approved
- **Acceptance check RPC:** `hasAcceptedTicketingTerms(userId)` queries by version
- **Website must:** Show same terms, record acceptance with `platform: 'web'`

#### Ticket Tier Fields
```typescript
{
  name: string           // Required
  description: string    // Optional
  price_minor: number    // Integer minor units (cents) — 0 for free
  currency: 'USD'|'JMD'  // Must match event settings currency
  quantity_total: number // Total capacity
  min_per_order: number  // Minimum 1
  max_per_order: number  // Maximum (typically 10)
  sales_start_at: string | null  // ISO timestamp
  sales_end_at: string | null    // ISO timestamp
  sort_order: number
}
```

---

### Promoter Ticket Dashboard

| Feature | Classification | Mobile Route | RPC | Notes |
|---|---|---|---|---|
| Ticket sales summary | A | `/ticketing/dashboard/[eventId]` | `get_event_ticket_summary(p_event_id)` | Returns totals by status and by type |
| Attendee list (sanitized) | A | Dashboard | `get_event_tickets_for_promoter(p_event_id, p_limit, p_offset)` | **NO secure_token** |
| Sales totals by type | A | Dashboard | Included in summary RPC | |
| Check-in status per ticket | A | Dashboard | Included in attendee list RPC | |
| Door sales summary | A | `/ticketing/door/[eventId]` (Finance tab) | `get_door_sales_summary(p_event_id)` | |

#### `get_event_ticket_summary()` Returns
```json
{
  "event_id": "uuid",
  "total_tickets": 150,
  "checked_in": 75,
  "not_checked_in": 70,
  "valid": 145,
  "transferred_out": 3,
  "voided": 1,
  "cancelled": 0,
  "refunded": 1,
  "by_type": [
    {
      "ticket_type_id": "uuid",
      "ticket_type_name": "General Admission",
      "total": 100,
      "checked_in": 50
    }
  ]
}
```

#### `get_event_tickets_for_promoter()` Returns (NO secure_token)
```typescript
interface PromoterTicketRow {
  id: string              // ticket ID
  event_id: string
  ticket_type_id: string
  ticket_type_name: string
  owner_user_id: string | null
  purchaser_user_id: string | null
  attendee_name: string
  status: string          // valid, cancelled, refunded, transferred_out, voided
  checked_in_at: string | null
  checked_in_by: string | null
  transfer_count: number
  created_at: string
  updated_at: string
  // NOTE: secure_token is STRUCTURALLY ABSENT — not null, not present
}
```

---

### Staff Management (Promoter)

| Feature | Classification | Mobile Route | Tables | Notes |
|---|---|---|---|---|
| View staff list | A | `/ticketing/staff/[eventId]` | `event_staff` | |
| Add staff by email | A | Staff | `event_staff.insert` with `lookup_transfer_recipient()` for ID | |
| Assign staff role | A | Staff | `event_staff.staff_role` | 'scanner' / 'door_sales' / 'manager' |
| Revoke staff access | A | Staff | `event_staff.update` set `status='revoked'` | |

#### Staff Roles and Permissions

| Role | Can Scan QR | Can Do Door Cash | Can Do Door Card | Can See Dashboard | Can Manage Staff |
|---|---|---|---|---|---|
| `scanner` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `door_sales` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `manager` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `promoter` (event owner) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |

Authorization is enforced **server-side** via `checkin_ticket()` and `door_sale_cash()` RPCs' internal checks, not only by RLS.

---

### Finance & Payouts (Promoter)

| Feature | Classification | Mobile Route | RPC/Service | Notes |
|---|---|---|---|---|
| Finance summary per event | A | `/ticketing/finance/[eventId]` | `get_promoter_finance_summary(p_event_id)` | |
| Payout balance | A | Finance | `get_promoter_payout_balance(p_promoter_id, p_currency)` | |
| Payout eligibility status | A | Finance | `events.payout_status`, `events.payout_eligible_at` | |
| Payout eligibility countdown | B | Finance | Client-calculated from `payout_eligible_at` | |
| Add payout account | A | Finance | `promoter_payout_accounts.insert` | Admin must verify |
| Request payout | A | Finance | `request_promoter_payout()` RPC | |
| View payout history | A | Finance | `promoter_payouts` table | |
| View financial holds | A | Finance | `payout_financial_holds` table | |
| View liabilities | A | Finance | `promoter_liabilities` table | |
| View disputes | A | Finance | `payment_disputes` table | |
| Execute Stripe refunds | Admin only | Finance | `process-event-refunds` Edge Function | Admin only |

#### `get_promoter_finance_summary()` Returns (Key Fields)
```typescript
{
  platform_gross_minor: number        // total electronic receipts
  platform_customer_fees_minor: number // 5% from customers
  platform_promoter_fees_minor: number // 5% from promoter proceeds
  promoter_proceeds_minor: number      // net after promoter fee
  cash_collected_directly_minor: number // door cash (stays with promoter)
  total_refunded_minor: number
  refunds_pending_minor: number
  cash_orders_promoter_must_refund: number // cash tickets in cancelled event
  open_liabilities_minor: number
  payouts: PayoutRecord[]
  disputes: DisputeRecord[]
  has_financial_hold: boolean
  payout_status: string    // 'pending_event' | 'post_event_hold' | 'eligible' | 'requested' | etc.
  payout_eligible_at: string | null
}
```

#### `get_promoter_payout_balance()` Returns
```typescript
{
  gross_platform_minor: number     // total from finalize_ticket_order()
  total_refunded_minor: number
  total_liability_minor: number
  total_paid_out_minor: number
  in_flight_minor: number          // requested + processing (not yet paid)
  post_event_hold_minor: number
  pending_event_minor: number
  eligible_minor: number           // available to request payout
  has_financial_hold: boolean
}
```

---

### Event Cancellation (Promoter)

| Feature | Classification | Mobile Route | RPC | Notes |
|---|---|---|---|---|
| Submit cancellation request | A | `/ticketing/cancel/[eventId]` | `submit_event_cancellation_request()` | Requires promoter acknowledgements |
| View cancellation status | A | My Events / Finance | `event_cancellation_requests` | |
| Acknowledgement confirmation | A | Cancel screen | UI gate before RPC call | User must confirm consequences |

#### Cancellation Lifecycle
1. Promoter submits `submit_event_cancellation_request(p_event_id, p_reason)` → creates `event_cancellation_requests` record with `status = 'pending_admin'`
2. Admin reviews in admin panel
3. Admin approves → `admin_approve_event_cancellation(p_request_id)` RPC → voids all valid tickets → creates `ticket_refunds` records → updates `events.cancellation_status = 'cancellation_approved'`
4. Admin (or promoter can trigger) → `process-event-refunds` Edge Function → issues Stripe refunds
5. Cash ticket refunds: promoter is notified these must be handled manually

#### Cancelled vs Rejected Semantics
**IMPORTANT:** In the database, approved cancellations have `events.status = 'rejected'`. However, the UI correctly displays "Cancelled" when `events.cancellation_status = 'cancellation_approved'`. Do NOT show "Rejected" for cancelled events.

---

## Staff Features

### QR Scanner

| Feature | Classification | Mobile Route | RPC | Notes |
|---|---|---|---|---|
| Camera QR scan | D (MOBILE-ONLY) | `/ticketing/scanner/[eventId]` | `checkin_ticket()` | Camera API unavailable in most browsers |
| Manual token entry | B | Web alternative | `checkin_ticket()` | Paste/type 64-char hex token |
| Webcam QR scan | C | Web alternative | `checkin_ticket()` | Browser webcam + `jsQR` library |
| Check-in result display | A | Scanner | From `checkin_ticket()` RPC | |
| Session check-in counter | A | Scanner | Client-side count | |
| Torch/flash control | D (MOBILE-ONLY) | Scanner | Native camera API | |

#### `checkin_ticket()` RPC
```sql
checkin_ticket(
  p_secure_token text,  -- 64-char hex QR token
  p_event_id uuid,
  p_scanned_by uuid,
  p_device_id text
)
```

**Returns:**
```typescript
{
  result: 'valid' | 'already_used' | 'invalid' | 'wrong_event' | 'voided' | 'cancelled' | 'refunded' | 'unauthorized' | 'error',
  attendee_name?: string,      // Only on 'valid'
  ticket_type_name?: string,   // Only on 'valid'
  checked_in_at?: string       // On 'already_used' — when it was scanned
}
```

**Authorization:** SECURITY DEFINER RPC — checks `event_staff` table for scanner/door_sales/manager role OR event promoter OR admin. Returns `'unauthorized'` if not authorized.

**Website scanner recommendation:**
1. Show a manual input field for the 64-char token as minimum implementation
2. Optionally implement webcam scanning with `jsQR` or `@zxing/library`
3. Call `checkin_ticket()` RPC with the extracted token

---

### Door Sales

#### Door Cash Sale

| Feature | Classification | Notes |
|---|---|---|
| Door cash sale UI | A | Website can serve as POS terminal for desk staff |
| Tier selection | A | Load from `event_ticket_types` |
| Quantity input | A | |
| Attendee name capture | A | Optional field |
| Idempotency key generation | A | `door-{eventId[0:8]}-{sellerId[0:8]}-{timestamp}-{random}` |
| Submit via `door_sale_cash()` RPC | A | Server enforces 0% fees |
| Sell & Check-In option | A | `p_sell_and_checkin = true` |
| QR display after sale | A | Via `get_door_order_tickets()` RPC |
| Void order | A | `void_door_cash_order()` RPC |
| Recent orders list | A | `getRecentCashOrders()` function |

#### `door_sale_cash()` RPC Parameters
```sql
door_sale_cash(
  p_event_id uuid,
  p_items jsonb,          -- [{ticket_type_id, quantity}]
  p_attendee_name text,
  p_idempotency_key text,
  p_sell_and_checkin boolean,
  p_contact_info text,
  p_owner_user_id uuid    -- NULL for anonymous walk-up
)
```

**Fee Rule (LOCKED — MUST NOT CHANGE):**
```
customer_fee = 0
promoter_fee = 0
platform_fee = 0
processor_fee = 0
future_payout = 0
```
Cash physically stays with the promoter. Cash orders are excluded from all payout balance calculations via `sale_source = 'door_cash'` filter.

#### Door Card Sale

| Feature | Classification | Notes |
|---|---|---|
| Door card checkout | A | Via `create-door-card-checkout` Edge Function |
| Staff authorization | A | Server validates `event_staff` role |
| Stripe checkout redirect | A | Similar flow to online checkout |
| Fee model | A | See Door Card Fee section below |

---

## Admin Features

### Admin Panel Overview

**Authorization:** All admin operations require `is_admin()` function to return true. This checks `user_profiles.roles @> ARRAY['admin']`. Self-assignment is blocked by `prevent_admin_role_escalation` trigger.

### Admin Tabs and Features

| Tab | Feature | Backend |
|---|---|---|
| **Queue** | Pending event approval | `events.status = 'pending'` |
| **Queue** | Approve event | `events.update status='live'` + notify promoter |
| **Queue** | Reject event with reason | `events.update status='rejected'` + notify promoter |
| **Flagged** | View flagged events | `events.status = 'flagged'` |
| **Flagged** | Unflag event | `events.update status='live'` |
| **Flagged** | Remove flagged event | `events.update status='rejected'` |
| **All Events** | Search/filter all events | `events` table — all statuses |
| **All Events** | Status filter (including 'cancelled') | `cancellation_status = 'cancellation_approved'` |
| **All Events** | Feature/Unfeature toggle | `events.update featured=true/false` |
| **All Events** | Edit event | Navigate to edit screen |
| **Analytics** | Subscription analytics | `subscriptions` table aggregate |
| **Analytics** | Event/parish/type analytics | `events` table aggregate |
| **Analytics** | RSVP stats | `events.going_count/interested_count` |
| **Analytics** | Grant lifetime subscription | `admin-grant-subscription` Edge Function |
| **Categories** | Add/remove parishes | Stored in `admin_settings` or CategoriesContext |
| **Categories** | Add/edit/remove event types | Stored in `admin_settings` or CategoriesContext |
| **Settings** | Toggle moderation (require approval) | `admin_settings` table |
| **Settings** | Send test email | `sendTestEmail()` → `send-email` Edge Function |
| **Settings** | SMTP probe | `testSmtpConnection()` → Edge Function |
| **Settings** | Send test push | `sendTestPush()` → Edge Function |
| **Ads** | View/manage ad placements | `ad_placements` table |
| **Ads** | Enable/disable placement | `ad_placements.enabled` |
| **Ads** | Create placement | `ad_placements.insert` |
| **Ads** | Manage ads per placement | `ads` table |
| **Boosts** | View active boosts | `events.boosted = true` |
| **Boosts** | Grant complimentary boost | `boostEvent()` via `events.update` |
| **Boosts** | Remove boost | `events.update boosted=false` |
| **Boosts** | View boost purchase history | `boost_purchases` table |
| **Subs** | Subscription ledger | `subscriptions` table |
| **Subs** | Filter by provider | `payment_provider` column |
| **Deletions** | View deletion requests | `account_deletion_requests` |
| **Deletions** | Approve deletion | `delete-account` Edge Function `{action: 'approve'}` |
| **Deletions** | Reject deletion | `delete-account` Edge Function `{action: 'reject'}` |
| **Cancellations** | View cancellation requests | `event_cancellation_requests` |
| **Cancellations** | Approve cancellation | `admin_approve_event_cancellation()` RPC |
| **Cancellations** | Reject cancellation | Direct update to `event_cancellation_requests.status='rejected_admin'` |
| **Cancellations** | Execute Stripe refunds | `process-event-refunds` Edge Function |
| **Payouts** | View payout requests | `promoter_payouts` |
| **Payouts** | Mark processing | `admin_update_payout_status()` RPC |
| **Payouts** | Mark paid (with ref) | `admin_update_payout_status()` RPC |
| **Payouts** | Mark failed | `admin_update_payout_status()` RPC |
| **Payouts** | Place financial hold | `admin_place_payout_hold()` RPC |
| **Payouts** | Release financial hold | `admin_release_payout_hold()` RPC |

---

## Ticketing Architecture

### Database Tables (Ticketing)

| Table | Purpose | Key Fields |
|---|---|---|
| `event_ticket_settings` | Per-event ticketing config | `enabled, currency, sales_status, currency_locked` |
| `event_ticket_types` | Ticket tiers | `price_minor, quantity_total, quantity_sold, quantity_reserved, min/max_per_order` |
| `ticket_inventory_reservations` | 10-min TTL reservations | `expires_at, status, order_id` |
| `ticket_orders` | Payment orders | `order_number, buyer_id, payment_status, base_subtotal_minor, customer_fee_minor, customer_total_minor, promoter_fee_minor, promoter_proceeds_minor, sale_source` |
| `ticket_order_items` | Immutable order line items | `unit_price_minor_snap, quantity, subtotal_minor_snap` |
| `tickets` | Individual admission records | `secure_token, status, checked_in_at, owner_user_id, purchaser_user_id` |
| `ticket_checkins` | Scan audit log | `ticket_id, scanned_by, result, scanned_at` |
| `ticket_transfers` | Transfer records | `from_user_id, to_user_id, to_email, status` |
| `ticket_name_changes` | Name change audit | `old_name, new_name, changed_by` |
| `ticket_audit_logs` | General audit log | `entity_type, action, previous_state, new_state` |
| `ticket_payment_events` | Stripe webhook idempotency | `webhook_event_id (UNIQUE)` |
| `ticket_refunds` | Refund records | `status, amount_minor, provider_refund_ref, refunded_at` |
| `ticketing_terms_acceptances` | Promoter terms | `user_id, terms_version` |
| `customer_ticket_terms_acceptances` | Customer terms | `user_id, terms_version` |
| `ticket_operation_rate_limits` | Rate limiting | `user_id, operation` |
| `event_staff` | Staff roles | `user_id, event_id, staff_role, status` |
| `promoter_ledger` | Financial ledger | `entry_type, amount_minor, status, sale_source, available_at` |
| `promoter_payouts` | Payout requests | `status, amount_minor, provider_payout_ref` |
| `promoter_payout_accounts` | Bank details | `payout_method, display_name, status` |
| `promoter_liabilities` | Chargeback/dispute costs | `liability_type, amount_minor, status` |
| `payout_financial_holds` | Admin holds on payouts | `reason, status, released_at` |
| `payment_disputes` | Stripe disputes | `provider_dispute_id, status, financial_liability` |

### SECURITY DEFINER RPCs

All these RPCs enforce their own authorization internally. They are callable by authenticated users but reject unauthorized callers.

| RPC | Auth Required | Purpose |
|---|---|---|
| `reserve_multiple_ticket_tiers(p_reservations, p_user_id, p_order_id)` | JWT | Atomic inventory reservation |
| `finalize_ticket_order(p_order_id, p_payment_reference, p_provider_amount_minor, p_provider_currency)` | Service role (webhook) | Create tickets after payment verified |
| `door_sale_cash(p_event_id, p_items, ...)` | JWT + staff check | Cash door sale, 0% fees |
| `checkin_ticket(p_secure_token, p_event_id, p_scanned_by, p_device_id)` | JWT + staff check | QR scan validation |
| `complete_ticket_transfer(p_ticket_id, p_recipient_id)` | JWT + owner check | Token rotation on transfer |
| `initiate_ticket_transfer(p_ticket_id, p_to_user_id, p_to_email)` | JWT + owner check | Create transfer record |
| `change_ticket_attendee_name(p_ticket_id, p_new_name)` | JWT + owner check | Rename attendee |
| `lookup_transfer_recipient(p_identifier)` | JWT | Find user by email/phone (masked) |
| `get_event_ticket_summary(p_event_id)` | JWT (promoter/admin) | Stats without PII |
| `get_event_tickets_for_promoter(p_event_id, p_limit, p_offset)` | JWT (promoter/admin) | Attendees, NO secure_token |
| `get_purchase_history_tickets(p_order_id)` | JWT (buyer) | Tickets with token (null if transferred) |
| `get_door_order_tickets(p_order_id)` | JWT (staff/promoter) | Door order tickets for QR display |
| `get_door_sales_summary(p_event_id)` | JWT (promoter/admin) | Aggregated door + online stats |
| `get_promoter_finance_summary(p_event_id)` | JWT (promoter/admin) | Event financial summary |
| `get_promoter_payout_balance(p_promoter_id, p_currency)` | JWT (own/admin) | Balance for payout request |
| `request_promoter_payout(p_event_id, p_currency, p_payout_account_id)` | JWT (own) | Request payout |
| `submit_event_cancellation_request(p_event_id, p_reason)` | JWT (promoter/own) | Request cancellation |
| `admin_approve_event_cancellation(p_request_id)` | JWT + is_admin() | Void tickets + create refunds |
| `admin_update_payout_status(p_payout_id, p_new_status, ...)` | JWT + is_admin() | Update payout status |
| `admin_place_payout_hold(p_promoter_id, p_reason, p_event_id)` | JWT + is_admin() | Place financial hold |
| `admin_release_payout_hold(p_hold_id, p_note)` | JWT + is_admin() | Release hold |

### Edge Functions

| Function | Purpose | Auth | Key Notes |
|---|---|---|---|
| `create-ticket-checkout` | Create Stripe session for online purchase | JWT | Server-side pricing; JMD blocked |
| `create-door-card-checkout` | Create Stripe session for door card | JWT + staff | |
| `process-event-refunds` | Execute Stripe refunds for cancelled event | JWT + admin | Idempotent via `refunded_at` guard |
| `stripe-webhook` | Handle all Stripe events | Stripe signature | Idempotent via `ticket_payment_events` |
| `send-email` | Transactional email | JWT | Via SMTP/Postal |
| `event-reminders` | Scheduled reminder emails | Service role (cron) | |
| `check-push-receipts` | Expo push receipt check | Service role (cron) | |
| `delete-account` | Process account deletion | JWT + admin | |
| `admin-grant-subscription` | Admin grant lifetime plan | JWT + admin | |
| `verify-apple-transaction` | Apple IAP verification | JWT | |
| `apple-iap-notifications` | Apple S2S notifications | Apple JWS | |
| `verify-google-purchase` | Google Play verification | JWT | |
| `google-play-notifications` | Google RTDN | Bearer token | |
| `create-boost-checkout` | Create Stripe boost checkout | JWT | |
| `create-subscription-checkout` | Create Stripe subscription checkout | JWT | |
| `customer-portal` | Stripe customer portal URL | JWT | |
| `use-boost-credit` | Decrement boost credit atomic | JWT | |
| `check-subscription-eligibility` | Check sub status | JWT | |

---

## Payment Architecture

### Fee Rules

#### Standard Online Ticket Sale (LOCKED)
```
base_subtotal = Σ(unit_price_minor × quantity)
customer_fee = Math.round(base_subtotal × 5 / 100)   // 5%
customer_total = base_subtotal + customer_fee
promoter_fee = Math.round(base_subtotal × 5 / 100)   // 5%
promoter_proceeds = base_subtotal - promoter_fee
platform_gross = customer_fee + promoter_fee
```

**Rounding rule:** `Math.round()` — nearest integer minor unit. Integer arithmetic throughout.

#### Door Cash Sale (LOCKED)
```
customer_fee = 0
promoter_fee = 0
platform_fee = 0
processor_fee = 0
future_vybzhub_payout = 0
```
Cash remains with the promoter. `sale_source = 'door_cash'` excluded from all payout queries.

#### Door Card Sale
- Uses Stripe checkout (similar to online)
- Fee model: **verify current `create-door-card-checkout` Edge Function** — the specification states door card fees apply but exact percentages are not confirmed in visible code. **MANUAL VERIFICATION REQUIRED** by owner.

### Currency Support

| Currency | Online Customer | Online Promoter | Door Cash | Door Card | Payout |
|---|---|---|---|---|---|
| USD | ✅ | ✅ | ✅ | ✅ (via Stripe) | ✅ |
| JMD | ❌ (provider_unavailable) | ❌ | ✅ (cash only) | ❌ | Pending |

**JMD online payments:** `create-ticket-checkout` returns `{ error: '...', code: 'jmd_provider_unavailable' }` for JMD events. JMD is not currently supported for electronic payments.

**Currency lock:** Once the first paid order exists for a ticket settings configuration, `currency_locked = true` is set by the `lock_ticket_currency` trigger. Currency cannot be changed after this.

**Minor units:** All prices stored as integer minor units (cents). $10.00 USD = 1000. J$1,500.00 JMD = 150000.

---

## QR Security Architecture

### Token Generation
- Generated in database: `encode(gen_random_bytes(32), 'hex')` → 64-character lowercase hexadecimal
- Entropy: 256 bits (2^256 possible values)
- Format validation: `/^[a-f0-9]{64}$/i`

### Token Access Rules (CRITICAL)

| Actor | Can Access `secure_token` | How |
|---|---|---|
| Ticket owner (current) | ✅ | `tickets` table RLS: `owner_user_id = auth.uid()` |
| Ticket original purchaser (after transfer) | ❌ | `get_purchase_history_tickets()` returns `null` for transferred tickets |
| Promoter | ❌ | `get_event_tickets_for_promoter()` NEVER includes `secure_token` |
| Scanner staff | ❌ | Sends token TO RPC, never receives it back |
| Admin | Via service role (server only) | Never exposed in web responses |
| Unauthenticated | ❌ | RLS blocks |

### Deep Link Format (Mobile)
`vybzhub://ticket/<64-char-hex-token>`

### Token Rotation on Transfer
When `complete_ticket_transfer()` is called:
1. New `secure_token` is generated for the ticket
2. Old token is permanently invalidated
3. `transfer_count` incremented
4. Original purchaser receives `null` from `get_purchase_history_tickets()`

### Double Scan Protection
`checkin_ticket()` RPC is atomic — sets `checked_in_at` in a single operation. Returns `'already_used'` with the original scan time on duplicate scans.

### Wrong Event Protection
`checkin_ticket()` receives `p_event_id` — if the token belongs to a different event's ticket, returns `'wrong_event'`.

---

## Subscriptions & Paid Plans

### Plan Tiers
| Tier | Monthly | Yearly | Boost Credits/Mo |
|---|---|---|---|
| Free | $0 | $0 | 0 |
| Pro | $9.99 | (annual rate) | 1 |
| Elite | $24.99 | (annual rate) | 5 |

### Purchase Methods
| Platform | Method |
|---|---|
| iOS (native) | Apple IAP via `expo-iap` → `verify-apple-transaction` |
| Android (native) | Google Play Billing → `verify-google-purchase` |
| Web / Desktop | Stripe Checkout → `create-subscription-checkout` |

### Website Subscription Handling
- **Use Stripe** for web subscription purchase
- Stripe Customer Portal (`customer-portal` Edge Function) for management
- `subscriptions` table is the source of truth
- `syncSubscriptionEntitlements()` in `_shared/entitlements.ts` is used by all providers

### Restoration
- Apple: `restore purchases` via `expo-iap` → **mobile only**
- Google: Similar restore → **mobile only**
- Stripe: Customer portal shows active subscriptions
- Admin grant: Via `admin-grant-subscription` Edge Function

### Entitlements Flow
After any subscription event (purchase, update, cancel):
1. Webhook fires to appropriate Edge Function
2. `syncSubscriptionEntitlements()` called with plan + status
3. Updates `user_profiles.subscription_tier`, `subscription_status`, `verified_promoter`, `monthly_boost_allowance`, `remaining_boosts`, `current_period_end`

**Website must NOT directly write to these columns.** Let webhooks handle it.

---

## Boost System

| Feature | Classification | Notes |
|---|---|---|
| Boost event (purchase) | B | `create-boost-checkout` Edge Function |
| View boost performance | B | `/monetization/boost-performance/[id]` |
| Admin grant boost | Admin only | Direct DB update via `boostEvent()` |
| Use boost credit | B | `use-boost-credit` Edge Function |
| Admin view boost stats | Admin | `boost_purchases` table |

### Boost Types
- `three_day` — 3-day boost
- `seven_day` — 7-day boost
- `until_event_end` — Active until event date

### Boost Activation
- Stripe: `stripe-webhook` → `activateBoostEntitlement()`
- Apple: `apple-iap-notifications` / `verify-apple-transaction`
- Google: `verify-google-purchase`
- Admin grant: Direct `events.update` with boost fields

---

## Notifications

### In-App Notifications (`notifications` table)
**Website parity: A — implement the notification inbox.**

```sql
notifications (
  id uuid,
  user_id uuid FK auth.users.id,
  type text,
  title text,
  body text,
  event_id uuid nullable,
  read boolean default false,
  created_at timestamptz
)
```

RLS: Users can SELECT/UPDATE/DELETE their own notifications. Admin can SELECT all.

### Push Notifications
**Push notifications (FCM/APNs) are mobile-only (Classification D).**

The website can display unread in-app notification count from the `notifications` table.

Realtime subscription for new notifications:
```javascript
supabase.channel('notifications')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, callback)
  .subscribe()
```

---

## Map View

| Feature | Classification | Notes |
|---|---|---|
| Jamaica parish map | B | Web: `react-leaflet` or Google Maps Embed |
| Event markers by parish | B | Query events grouped by parish |
| Click marker → event detail | B | |
| Location permission | D (MOBILE-ONLY) | Mobile uses GPS; website uses parish selection |
| Google Maps native | D (MOBILE-ONLY) | Use Leaflet/OpenStreetMap or Maps Embed API on web |

**API Key:** The Google Maps API key in `app.json` (`AIzaSyCG0p2km3OUFNmGb2vSW-1aPyhZVJBGUJI`) should be restricted to the app's SHA-1. A **separate API key restricted to the website domain** should be used for web mapping.

---

## Legal Architecture

### Current Legal Documents Status

| Document | Location | Status | Version | Table |
|---|---|---|---|---|
| Customer Ticket Terms | `services/customerTicketingService.ts:CUSTOMER_TICKET_TERMS_CONTENT` | **PLACEHOLDER — NOT ATTORNEY-APPROVED** | `'1.0'` | `customer_ticket_terms_acceptances` |
| Promoter Ticketing Agreement | `services/ticketingService.ts:TICKETING_TERMS_CONTENT` | **PLACEHOLDER — NOT ATTORNEY-APPROVED** | `'2026-08-v1'` | `ticketing_terms_acceptances` |
| Privacy Policy | URL: `https://vybzhub.com/privacy` | Status unknown — must be live URL | — | — |
| Terms of Use | URL: `https://vybzhub.com/terms` | Status unknown — must be live URL | — | — |
| Subscription Terms | URL: `https://vybzhub.com/subscription-terms` | Required by Apple App Store | — | — |

### Terms Acceptance Architecture
Both terms use the same pattern:
1. Check acceptance: query table for `user_id + terms_version`
2. Show modal if not accepted
3. Record acceptance: `upsert({ user_id, terms_version, platform: 'web' })`
4. Continue to checkout/setup

**Version bumping:** When terms are updated, increment `terms_version` string. All users must re-accept. Existing acceptances of old versions are ignored.

**Website must record `platform: 'web'`** (mobile records `platform: 'mobile'`).

---

## Database Source of Truth

### Shared Supabase Objects

The website MUST reuse all of the following. Do NOT duplicate.

#### Tables (Website Reads/Writes)
| Table | Website Access Pattern |
|---|---|
| `auth.users` | Via Supabase Auth client |
| `user_profiles` | Read/write own profile |
| `events` | Read all live; write own (promoter) |
| `event_ticket_settings` | Read for checkout; write for setup |
| `event_ticket_types` | Read for checkout; write for promoter |
| `ticket_inventory_reservations` | Read own; written by RPC |
| `ticket_orders` | Read own; written by Edge Function |
| `ticket_order_items` | Read own |
| `tickets` | Read own (secure_token via RLS) |
| `ticket_transfers` | Read own transfers |
| `ticket_name_changes` | Read own |
| `ticketing_terms_acceptances` | Read/write own |
| `customer_ticket_terms_acceptances` | Read/write own |
| `event_staff` | Read/write (promoter) |
| `promoter_ledger` | Read own (promoter) |
| `promoter_payouts` | Read own; created by RPC |
| `promoter_payout_accounts` | Read/write own |
| `promoter_liabilities` | Read own |
| `payout_financial_holds` | Read own |
| `payment_disputes` | Read own |
| `notifications` | Read/update own |
| `user_rsvps` | Read/write own |
| `follows` | Read/write own |
| `event_cancellation_requests` | Read/write own (promoter) |
| `ticketing_terms_acceptances` | Read/write own |
| `subscriptions` | Read own |
| `boost_purchases` | Read own |
| `account_deletion_requests` | Read/write own |
| `ad_placements` | Read enabled |
| `ads` | Read active |
| `admin_settings` | Read (public) |

#### RPCs (Call Don't Recreate)
All 40+ RPCs listed in the SECURITY DEFINER Audit section. Never re-implement their logic in browser code.

#### Edge Functions (Call Don't Recreate)
All 18 Edge Functions. Call via `supabase.functions.invoke()` or direct HTTPS POST.

#### Triggers & Cron (Never Touch)
- `on_auth_user_created` → auto-creates `user_profiles`
- `lock_ticket_currency` → locks currency after first order
- `enforce_max_ticket_tiers` → enforces 5-tier limit
- `sync_quantity_reserved` → keeps reservation counts synchronized
- `prevent_admin_role_escalation` → blocks self-admin
- `protect_boost_fields` → prevents client boost manipulation
- `protect_ticket_order_financials` → prevents financial manipulation
- pg_cron `set_events_payout_eligible` → runs at 02:00 UTC daily
- pg_cron `check-push-receipts` → runs periodically

---

## LOVABLE — PROHIBITED IMPLEMENTATION PATTERNS

This section must be strictly followed. Any violation could cause financial loss, security breaches, or data corruption.

### NEVER DO:

1. **DO NOT duplicate the ticketing backend.** Do not create new tables for tickets, orders, inventory, or payments. Use existing Supabase objects.

2. **DO NOT implement client-side pricing.** Displayed prices are informational only. The authoritative fee calculation happens in `create-ticket-checkout` Edge Function. The website must not calculate the final `customer_total_minor` and submit it to Stripe.

3. **DO NOT expose `secure_token` (QR codes) to promoters.** Use `get_event_tickets_for_promoter()` RPC which structurally omits this field.

4. **DO NOT expose `secure_token` in order receipts for transferred tickets.** Use `get_purchase_history_tickets()` RPC which returns `null` for transferred tickets.

5. **DO NOT expose the Supabase service role key on the client or in browser code.** It belongs only in Edge Functions via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

6. **DO NOT expose Stripe secret keys on the client.** `STRIPE_SECRET_KEY` must remain in Edge Functions only.

7. **DO NOT issue tickets based on browser-side payment success.** Wait for Stripe webhook → `finalize_ticket_order()` RPC → ticket appears in `tickets` table. Never create ticket records directly from browser code.

8. **DO NOT trust client-submitted ticket prices.** The Edge Function loads prices from `event_ticket_types` server-side. The website must only send `ticket_type_id` and `quantity`.

9. **DO NOT bypass RLS.** Never use the service role key in browser-accessible code. All client queries must use the anon key with proper RLS-enforced user context.

10. **DO NOT create duplicate cron jobs.** `set_events_payout_eligible` already runs at 02:00 UTC. Do not add additional schedulers.

11. **DO NOT create a separate ticket inventory system.** All inventory tracking is in `event_ticket_types.quantity_reserved/sold` and `ticket_inventory_reservations`. Never manage inventory counters in browser code.

12. **DO NOT create a second refund system.** All refunds go through `process-event-refunds` Edge Function which requires admin JWT. Never call Stripe refund API directly from browser.

13. **DO NOT independently calculate payout authority in browser code.** Always use `get_promoter_payout_balance()` RPC which applies all holds, liabilities, in-flight deductions.

14. **DO NOT allow admin actions without server-side `is_admin()` verification.** Every admin action passes JWT to a SECURITY DEFINER RPC or Edge Function that calls `is_admin()` internally.

15. **DO NOT modify the `events.status` column directly to 'rejected' for event cancellations.** The `admin_approve_event_cancellation()` RPC handles the correct state transitions.

16. **DO NOT allow a promoter to approve their own cancellation.** This requires admin review.

17. **DO NOT change the payout calculation logic.** Cash sales (`sale_source = 'door_cash'`) must remain excluded from all payout balance calculations.

18. **DO NOT add financial columns to ticket_orders or tickets tables.** The schema is immutable for financial audit compliance.

19. **DO NOT skip the `customer_ticket_terms_acceptances` check.** The Edge Function validates this server-side and returns `code: 'terms_required'` if missing.

20. **DO NOT assume JMD payments work.** The Edge Function returns `code: 'jmd_provider_unavailable'` for JMD events. Always handle this error gracefully.

21. **DO NOT hardcode the Stripe return URL with `vybzhub://`.** The website must use HTTPS return URLs.

22. **DO NOT call `initiate_ticket_transfer()` and `complete_ticket_transfer()` in the same request.** These are two separate user-confirmed steps with UI confirmation between them.

23. **DO NOT show full email/phone of transfer recipient.** Use the `display_hint` (masked) from `lookup_transfer_recipient()` only.

24. **DO NOT implement your own payout hold logic.** Use `admin_place_payout_hold()` RPC.

---

## Website Route Specification

### Recommended Website URL Structure

| URL | Audience | Auth | Purpose | Mobile Equivalent | Priority |
|---|---|---|---|---|---|
| `/` | Public | No | Home/Landing | `/(tabs)/index` | P0 |
| `/events` | Public | No | Browse all events | `/(tabs)/browse` | P0 |
| `/events/[id]` | Public | No | Event detail | `/event/[id]` | P0 |
| `/events/featured` | Public | No | Featured events | `/featured-events` | P1 |
| `/map` | Public | No | Map view | `/(tabs)/map` | P2 |
| `/auth` | Public | No | Sign in / Register | `/auth` | P0 |
| `/auth/reset` | Public | No | Password reset landing | `/auth` (recovery) | P0 |
| `/profile` | Auth | Yes | Own profile | `/(tabs)/profile` | P1 |
| `/profile/settings` | Auth | Yes | Settings, notifications | `/(tabs)/profile` | P2 |
| `/profile/delete` | Auth | Yes | Account deletion | Profile section | P2 |
| `/notifications` | Auth | Yes | Notification list | `/notifications` | P1 |
| `/bookmarks` | Auth | Yes | Saved events | `/bookmarks` | P1 |
| `/my-events` | Promoter | Yes | Promoter's events | `/my-events` | P1 |
| `/events/create` | Promoter | Yes | Post new event | `/(tabs)/post` | P1 |
| `/events/[id]/edit` | Promoter | Yes | Edit event | `/edit-event/[id]` | P1 |
| `/tickets` | Auth | Yes | My Tickets list | `/my-tickets` | P0 |
| `/tickets/[ticketId]` | Auth | Yes | Ticket detail + QR | `/ticketing/ticket/[ticketId]` | P0 |
| `/tickets/order/[orderId]` | Auth | Yes | Order receipt | `/ticketing/order/[orderId]` | P0 |
| `/tickets/checkout/[eventId]` | Auth | Yes | Ticket purchase | `/ticketing/checkout/[eventId]` | P0 |
| `/tickets/success` | Auth | Yes | Payment success | Deep link handler | P0 |
| `/tickets/cancel` | Auth | Yes | Payment cancelled | Deep link handler | P0 |
| `/promoter/[id]` | Public | No | Public promoter profile | `/promoter/[id]` | P1 |
| `/promoter/ticketing/[eventId]/setup` | Promoter | Yes | Ticketing setup | `/ticketing/setup/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/tiers` | Promoter | Yes | Tier management | `/ticketing/tiers/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/dashboard` | Promoter | Yes | Ticket dashboard | `/ticketing/dashboard/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/staff` | Promoter | Yes | Staff management | `/ticketing/staff/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/door` | Staff | Yes | Door sales | `/ticketing/door/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/scanner` | Staff | Yes | QR scanner (manual/webcam) | `/ticketing/scanner/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/finance` | Promoter | Yes | Finance/payouts | `/ticketing/finance/[eventId]` | P1 |
| `/promoter/ticketing/[eventId]/cancel` | Promoter | Yes | Event cancellation | `/ticketing/cancel/[eventId]` | P1 |
| `/plans` | Public | No | Subscription plans | `/monetization/upgrade` | P2 |
| `/plans/boost/[eventId]` | Promoter | Yes | Boost event | `/monetization/boost/[id]` | P2 |
| `/admin` | Admin | Yes | Admin panel | `/admin/index` | P1 |
| `/admin/ads/[placementId]` | Admin | Yes | Ad management | `/admin/ads/[placementId]` | P1 |
| `/advertise` | Public | No | Advertising info | `/advertise` | P2 |

---

## Parity Matrix

| Feature | Mobile Route | Backend | Website Requirement | Priority | Security Sensitive | Notes |
|---|---|---|---|---|---|---|
| Email auth | `/auth` | Supabase Auth | Required | P0 | High | Same Supabase project |
| Registration with phone | `/auth` | `user_profiles` | Required | P0 | Medium | Phone optional on web |
| Password reset | `/auth` | Supabase Auth | Required | P0 | Medium | Different redirect URL |
| Session management | — | Supabase Auth | Required | P0 | High | localStorage |
| Browse events | `/browse` | `events` table | Required | P0 | Low | |
| Event detail | `/event/[id]` | `events` table | Required | P0 | Low | |
| Going/Interested RSVP | Event detail | `user_rsvps` | Required | P0 | Low | Auth required |
| Bookmark events | Profile | `user_rsvps` | Should exist | P1 | Low | |
| My Tickets | `/my-tickets` | `tickets` RLS | Required | P0 | High | QR + secure_token |
| QR code display | Ticket detail | `tickets.secure_token` | Required | P0 | Critical | Web QR library |
| Ticket purchase | Checkout | `create-ticket-checkout` | Required | P0 | Critical | Server pricing only |
| Ticket transfer | Ticket detail | RPCs | Required | P1 | High | Two-step flow |
| Attendee rename | Ticket detail | RPC | Should exist | P1 | Medium | |
| Terms acceptance (customer) | Checkout | `customer_ticket_terms_acceptances` | Required | P0 | Medium | |
| Terms acceptance (promoter) | Setup | `ticketing_terms_acceptances` | Required | P0 | Medium | |
| Post event | `/post` | `events.insert` | Required | P1 | Medium | |
| Edit event | `/edit-event` | `events.update` | Required | P1 | Medium | |
| Ticketing setup | Setup screen | `event_ticket_settings` | Required | P0 | Medium | |
| Ticket tiers | Tiers screen | `event_ticket_types` | Required | P0 | Medium | |
| Ticket dashboard | Dashboard | `get_event_ticket_summary()` | Required | P1 | Medium | |
| Attendee list | Dashboard | `get_event_tickets_for_promoter()` | Required | P1 | High | NO secure_token |
| Staff management | Staff screen | `event_staff` | Required | P1 | Medium | |
| QR scanner (camera) | Scanner | `checkin_ticket()` | Mobile only (D) | MOBILE | High | D — use manual/webcam |
| QR scanner (manual/webcam) | Scanner | `checkin_ticket()` | Should exist | P1 | High | Web alternative |
| Door cash sale | Door screen | `door_sale_cash()` | Required | P1 | High | 0% fees |
| Door card sale | Door screen | `create-door-card-checkout` | Should exist | P1 | High | |
| Finance summary | Finance screen | `get_promoter_finance_summary()` | Required | P1 | High | |
| Payout balance | Finance screen | `get_promoter_payout_balance()` | Required | P1 | High | |
| Payout request | Finance screen | `request_promoter_payout()` | Required | P1 | High | |
| Event cancellation | Cancel screen | RPCs | Required | P1 | Medium | |
| Admin panel | Profile tab | Various | Required | P1 | Critical | Full admin parity |
| Subscriptions (Stripe) | Upgrade screen | `create-subscription-checkout` | Should exist | P1 | High | Stripe only on web |
| Subscriptions (Apple IAP) | Upgrade screen | `expo-iap` | Mobile only (D) | MOBILE | — | |
| Subscriptions (Google Play) | Upgrade screen | expo-iap | Mobile only (D) | MOBILE | — | |
| Boost purchase (Stripe) | Boost screen | `create-boost-checkout` | Should exist | P2 | High | |
| Boost purchase (IAP) | Boost screen | `expo-iap` | Mobile only (D) | MOBILE | — | |
| Push notifications | System | FCM/APNs | Mobile only (D) | MOBILE | — | |
| In-app notifications | `/notifications` | `notifications` table | Required | P1 | Low | |
| Onboarding slides | `/onboarding` | AsyncStorage | Not needed | — | — | Web has different onboarding |
| Map view | `/map` | Google Maps/Leaflet | Should exist | P2 | Low | |
| Language toggle | Profile | LanguageContext | Optional | P3 | — | |
| Haptic feedback | Scanner | Native API | Mobile only (D) | MOBILE | — | |
| Camera torch | Scanner | Native API | Mobile only (D) | MOBILE | — | |

---

## Recommended Implementation Phases for Lovable

### Website Phase 1 — Shared Architecture & Authentication

**Goal:** Working authenticated website that can read Vybz Hub data

**Features:**
- Supabase client setup (`@supabase/ssr` for SSR or `@supabase/supabase-js` for SPA)
- Email sign in / sign up
- Password reset (HTTPS redirect URL, not `vybzhub://`)
- Session persistence via browser localStorage
- `onAuthStateChange` listener
- Protected routes (redirect to `/auth` when unauthenticated)
- Auth context equivalent (user object, session)
- User profile display (name, email, subscription tier)

**Routes:** `/auth`, `/auth/reset`, `/profile`

**Backend:**
- `supabase.auth.*` functions
- `user_profiles` table READ

**Security:** JWT stored in browser storage; never expose service role key

**Must NOT change:**
- Mobile app auth flow
- `user_profiles` table schema
- `handle_new_user()` trigger
- Auth Settings in Supabase (preserve mobile deep link scheme)

**Acceptance Tests:**
- [ ] Can sign up with email + password
- [ ] Profile page shows correct user name and subscription tier
- [ ] Password reset email arrives and web reset link works
- [ ] Sign out clears session

---

### Website Phase 2 — Customer Event Discovery & Purchase

**Goal:** Customer can discover events and purchase tickets on web

**Features:**
- Home page with featured events, trending events
- Browse events with parish/type/date filters
- Event detail page with all fields
- Going/Interested RSVP
- Customer ticket terms acceptance modal
- Tier selection UI with quantity steppers
- Stripe hosted checkout integration
- Payment success/cancel URL handlers
- Order receipt page
- My Tickets list page
- Individual ticket detail with QR code (using qr-code library)

**Routes:** `/`, `/events`, `/events/[id]`, `/tickets/checkout/[eventId]`, `/tickets/success`, `/tickets/cancel`, `/tickets`, `/tickets/order/[orderId]`, `/tickets/[ticketId]`

**Edge Functions called:**
- `create-ticket-checkout` (POST with JWT)

**RPCs called:**
- `get_purchase_history_tickets(p_order_id)`
- `increment_event_view(p_event_id)`

**Direct table queries:**
- `events` (SELECT)
- `event_ticket_settings` (SELECT)
- `event_ticket_types` (SELECT)
- `tickets` (SELECT own)
- `ticket_orders` (SELECT own)
- `ticket_order_items` (SELECT own)
- `user_rsvps` (SELECT/INSERT/DELETE own)
- `customer_ticket_terms_acceptances` (SELECT/INSERT own)

**Security Requirements:**
- Checkout Edge Function must receive JWT
- Return URLs must use HTTPS (coordinate with owner for Edge Function update)
- Never display `secure_token` for transferred tickets (use `get_purchase_history_tickets()`)
- `secure_token` only visible to `owner_user_id`

**Acceptance Tests:**
- [ ] Browse events page loads with filters working
- [ ] Event detail shows all fields, images, RSVP counts
- [ ] Clicking "Buy Tickets" shows tier selection
- [ ] Terms modal appears and records acceptance
- [ ] Stripe checkout opens and processes test payment
- [ ] After payment, order receipt shows correct amounts
- [ ] My Tickets shows purchased tickets
- [ ] QR code renders correctly from `secure_token`
- [ ] 5% fee shown correctly (informational)
- [ ] JMD event shows correct unavailability message

---

### Website Phase 3 — My Tickets: QR, Transfers, Name Changes

**Goal:** Full ticket management for customers on web

**Features:**
- Transfer ticket to another user (3-step flow)
  - Step 1: Enter email/phone
  - Step 2: Confirm masked recipient hint
  - Step 3: Initiate → Complete
- Attendee name change
- Transfer history display
- Ticket status states (valid, cancelled, refunded, voided, transferred_out)
- Cancelled/refunded ticket display

**RPCs called:**
- `lookup_transfer_recipient(p_identifier)` — masked output only
- `initiate_ticket_transfer(p_ticket_id, p_to_user_id, p_to_email)`
- `complete_ticket_transfer(p_ticket_id, p_recipient_id)`
- `change_ticket_attendee_name(p_ticket_id, p_new_name)`

**Security Requirements:**
- Never show full email/phone of recipient (use `display_hint` only)
- Old QR must not be shown after transfer (RPC returns null token)
- User can only manage their own tickets (owner_user_id = auth.uid())

**Acceptance Tests:**
- [ ] Transfer flow completes in 3 steps
- [ ] Recipient hint is masked (not full email)
- [ ] After transfer, old QR no longer shows (null token)
- [ ] Attendee name change works and updates immediately
- [ ] Cannot change name after check-in

---

### Website Phase 4 — Promoter Event & Ticketing Management

**Goal:** Promoter can manage events and ticketing setup from desktop

**Features:**
- Create event form (all fields including parish/type selectors)
- Edit event form
- My events list with status display
- Ticketing setup: currency, sales status, terms acceptance
- Ticket tier management (create, edit, cancel, reorder)
- Enable/disable sales

**Routes:** `/events/create`, `/events/[id]/edit`, `/my-events`, `/promoter/ticketing/[eventId]/setup`, `/promoter/ticketing/[eventId]/tiers`

**Must NOT:**
- Display `secure_token` anywhere in promoter UI
- Allow promoter to set their own fees
- Change `currency` after first paid order (`currency_locked = true`)

**Acceptance Tests:**
- [ ] Can create event with all required fields
- [ ] Image upload to `event-images` bucket works
- [ ] Can accept promoter ticketing terms (version recorded)
- [ ] Can configure USD currency and enable sales
- [ ] Can create up to 5 ticket tiers (6th is blocked by DB trigger)
- [ ] Cannot cancel tier with sold tickets

---

### Website Phase 5 — Staff Scanner & Door Sales

**Goal:** Staff can check in attendees and handle walk-up sales from desktop/tablet browser

**Features:**
- Manual token entry scanner (enter 64-char hex or paste QR link)
- Webcam QR scanner (optional — using `jsQR` or `@zxing/library`)
- Check-in result display (all 9 result states)
- Session check-in counter
- Door cash sale form (tier + quantity + attendee name)
- Sell & Check-In option
- QR display after cash sale (from `get_door_order_tickets()`)
- Void cash order
- Recent cash orders list
- Door card checkout (Stripe)

**Routes:** `/promoter/ticketing/[eventId]/scanner`, `/promoter/ticketing/[eventId]/door`

**RPCs called:**
- `checkin_ticket(p_secure_token, p_event_id, p_scanned_by, null)`
- `door_sale_cash(...)` — 0% fees enforced server-side
- `get_door_order_tickets(p_order_id)`
- `void_door_cash_order(p_order_id, p_reason)`
- `get_door_sales_summary(p_event_id)`

**Edge Functions called:**
- `create-door-card-checkout`

**Security:**
- Staff must have active `event_staff` record for the event
- `checkin_ticket()` returns 'unauthorized' if staff not registered for this event
- `door_sale_cash()` enforces staff authorization server-side
- `secure_token` values from door order are only for display (not stored/logged)

**Door Cash Fee Rule (IMMUTABLE):**
- customer_fee = 0%
- promoter_fee = 0%
- platform_fee = 0%
- processor_fee = 0%
- future payout = 0

**Acceptance Tests:**
- [ ] Manual token entry validates against correct event
- [ ] Invalid token format rejected before RPC call
- [ ] All 9 result states display correctly
- [ ] Door cash sale issues tickets with 0% fees
- [ ] Sell & Check-In marks ticket as checked-in immediately
- [ ] QR code displays after cash sale
- [ ] Void order marks ticket as voided
- [ ] Non-staff user gets 'unauthorized' result

---

### Website Phase 6 — Finance, Cancellations & Payouts

**Goal:** Promoter can view finances and request payouts from desktop

**Features:**
- Finance summary per event
- Payout eligibility status with countdown
- Add payout account (bank details)
- Request payout
- Payout history
- Financial holds display
- Liabilities display
- Dispute display
- Submit event cancellation request
- View cancellation status

**Routes:** `/promoter/ticketing/[eventId]/finance`, `/promoter/ticketing/[eventId]/cancel`

**RPCs called:**
- `get_promoter_finance_summary(p_event_id)`
- `get_promoter_payout_balance(p_promoter_id, p_currency)`
- `request_promoter_payout(p_event_id, p_currency, p_payout_account_id)`
- `submit_event_cancellation_request(p_event_id, p_reason)`

**Direct table reads (own data via RLS):**
- `promoter_payouts`
- `promoter_payout_accounts`
- `promoter_liabilities`
- `payout_financial_holds`
- `payment_disputes`
- `event_cancellation_requests`

**Acceptance Tests:**
- [ ] Finance summary shows correct gross/fees breakdown
- [ ] Payout status shows correct label (pending_event, post_event_hold, eligible, etc.)
- [ ] Can add payout account (pending_verification status)
- [ ] Payout request button disabled when has_financial_hold=true
- [ ] Payout request button disabled when eligible_minor=0
- [ ] Cancellation requires explicit acknowledgement before submitting
- [ ] Cash orders show "promoter must refund directly" count

---

### Website Phase 7 — Admin Panel Parity

**Goal:** Full admin functionality accessible from web dashboard

**Features:** All 12 admin tabs (Queue, Flagged, All Events, Analytics, Categories, Settings, Ads, Boosts, Subs, Deletions, Cancellations, Payouts)

**Routes:** `/admin`, `/admin/ads/[placementId]`

**Security Requirements:**
- Every admin action must pass JWT to SECURITY DEFINER RPC or Edge Function
- Admin check happens server-side via `is_admin()` or `is_admin` RLS policy
- Route must check `user_profiles.roles @> ARRAY['admin']` for UI display

**Edge Functions called (admin):**
- `process-event-refunds` (requires admin JWT)
- `delete-account` (requires admin JWT)
- `admin-grant-subscription` (requires admin JWT)
- `send-email` (via Settings testing)

**RPCs called (admin):**
- `admin_approve_event_cancellation(p_request_id)`
- `admin_update_payout_status(p_payout_id, ...)`
- `admin_place_payout_hold(p_promoter_id, ...)`
- `admin_release_payout_hold(p_hold_id, ...)`

**Acceptance Tests:**
- [ ] Non-admin user cannot access `/admin` routes
- [ ] Event approval/rejection sends notification to promoter
- [ ] "Cancelled" status shows correctly (via cancellation_status) vs "Rejected"
- [ ] Feature/Unfeature toggle works
- [ ] Subscription grant via Edge Function works
- [ ] Deletion approval/rejection works
- [ ] Cancellation approval creates refund records
- [ ] Payout status updates work
- [ ] Financial hold placement/release works

---

### Website Phase 8 — Subscriptions & Boost Parity

**Goal:** Promoters can purchase subscriptions and boosts via web

**Features:**
- Subscription plans page
- Stripe subscription checkout
- Stripe customer portal (for management/cancellation)
- Boost purchase via Stripe
- Subscription status display in profile

**Edge Functions called:**
- `create-subscription-checkout`
- `customer-portal`
- `create-boost-checkout`
- `use-boost-credit`

**Note:** Apple IAP and Google Play Billing are MOBILE ONLY. Web uses Stripe exclusively for subscriptions and boosts.

**Acceptance Tests:**
- [ ] Subscription checkout opens Stripe
- [ ] After subscription, plan shows correctly in profile
- [ ] Customer portal opens from profile
- [ ] Boost purchase via Stripe works
- [ ] Pro plan shows 1 boost credit/mo; Elite shows 5

---

### Website Phase 9 — Legal Implementation

**Goal:** Replace placeholder legal documents with attorney-approved content

**Actions (DO NOT implement until legal review is complete):**
1. Replace `CUSTOMER_TICKET_TERMS_CONTENT` with attorney-approved text
2. Bump `CUSTOMER_TICKET_TERMS_VERSION` (requires re-acceptance from all existing users)
3. Replace `TICKETING_TERMS_CONTENT` with attorney-approved text
4. Bump `TICKETING_TERMS_VERSION` (requires re-acceptance from all existing promoters)
5. Publish Privacy Policy at `https://vybzhub.com/privacy`
6. Publish Terms of Use at `https://vybzhub.com/terms`
7. Publish Subscription Terms at `https://vybzhub.com/subscription-terms`

**Note:** Version bumps require database migration to invalidate existing acceptances for the old version.

---

### Website Phase 10 — Production Acceptance Testing

**Goal:** Verify website works correctly in production with live Stripe

**Checklist:**
- [ ] Stripe live mode keys configured in Supabase secrets
- [ ] Stripe webhook registered with website URL
- [ ] `success_url` and `cancel_url` use production HTTPS domains
- [ ] CORS configured for website domain in Edge Functions
- [ ] Google Maps API key restricted to website domain
- [ ] Push notification tokens NOT registered from web clients
- [ ] Full purchase flow tested with real Stripe payment
- [ ] Transfer tested end-to-end
- [ ] Admin panel tested with real admin account
- [ ] Cancellation → refund flow tested
- [ ] Payout flow tested (with test payout account)

---

## Manual Owner Configuration

| Item | Status | Action |
|---|---|---|
| Stripe live mode keys | NEEDS VERIFICATION | Confirm `STRIPE_SECRET_KEY` in Supabase secrets is live key |
| Stripe webhook endpoint | NEEDS VERIFICATION | Must register new website webhook endpoint in Stripe Dashboard |
| Stripe success/cancel URLs | NEEDS CONFIGURATION | `create-ticket-checkout` Edge Function needs website return URL support |
| Supabase Auth Site URL | NEEDS CONFIGURATION | Add website domain to Supabase Auth → URL Configuration → Site URL and Redirect URLs |
| Supabase Auth Redirect URLs | NEEDS CONFIGURATION | Add `https://vybzhub.com/auth/reset` to allowed redirect URLs |
| Google Maps API key (website) | NEEDS CONFIGURATION | Create separate Maps API key restricted to website domain |
| pg_cron job verification | NEEDS VERIFICATION | Run `SELECT * FROM cron.job` in Supabase SQL editor |
| Privacy Policy URL | NOT CONFIGURED | `https://vybzhub.com/privacy` must resolve |
| Terms of Use URL | NOT CONFIGURED | `https://vybzhub.com/terms` must resolve |
| Subscription Terms URL | NOT CONFIGURED | `https://vybzhub.com/subscription-terms` must resolve |
| Legal terms final copy | NOT CONFIGURED | Attorney review required |
| FCM config | CONFIRMED (mobile) | Not needed for website |
| SMTP/Postal config | CONFIRMED | Shared with mobile |
| Supabase project health | CONFIRMED ACTIVE_HEALTHY | twilfdbvrzhlnllcmssc |

---

## Current Production Blockers

### CRITICAL

1. **LEGAL: Customer ticket terms placeholder** — `CUSTOMER_TICKET_TERMS_CONTENT` is placeholder text, not attorney-approved. All ticket purchases require acceptance of these terms. Do not launch ticketing without final legal copy.

2. **LEGAL: Promoter ticketing terms placeholder** — `TICKETING_TERMS_CONTENT` is placeholder text. Do not launch promoter ticketing without final legal copy.

3. **LEGAL: Privacy Policy and Terms of Use URLs not verified live** — Multiple screens link to `https://vybzhub.com/privacy` and `https://vybzhub.com/terms`. Required for App Store submission.

4. **CONFIG: Stripe return URL** — `create-ticket-checkout` Edge Function hardcodes `vybzhub://ticket-success` and `vybzhub://ticket-cancel`. Website cannot use these. Owner must update Edge Function to accept `return_base_url` parameter, OR implement a redirect proxy page.

5. **CONFIG: Supabase Auth redirect URLs** — Password reset and OAuth flows need website HTTPS domains whitelisted in Supabase Auth settings. Currently only mobile deep link configured.

### HIGH

6. **Google Maps API key unrestricted** — Key in `app.json` should be restricted. A separate restricted key should be used for the website.

7. **pg_cron payout scheduler** — Must verify `set_events_payout_eligible` is active. Run `SELECT * FROM cron.job` in Supabase.

8. **Stripe live mode** — Confirm `STRIPE_SECRET_KEY` in Supabase secrets is the live (not test) key before going live.

9. **Website domain CORS** — Edge Functions must allow CORS from the website domain. Check `_shared/cors.ts` includes website origin.

### MEDIUM

10. **`TICKETING_ENABLED = true`** — This flag is hardcoded. Confirm it's intentional for production.

11. **JMD online payments** — Currently blocked at Edge Function level. JMD events cannot sell tickets online. Promoters should be informed of this limitation.

12. **Subscription Terms page** — Required by Apple App Store guidelines (`https://vybzhub.com/subscription-terms`).

### MANUAL TEST REQUIRED

13. Full ticket purchase flow with real Stripe in production environment
14. Event cancellation → refund → customer notification chain
15. Payout eligibility advancement via pg_cron scheduler
16. Transfer → QR rotation → new owner can enter event

### LEGAL REVIEW REQUIRED

15. All ticket terms content before any production ticket sales
16. Privacy Policy and Terms of Use publication
17. Refund policy disclosures

---

## Final Recommendations

1. **Coordinate website Stripe return URL before writing any checkout code.** The `create-ticket-checkout` Edge Function must be updated by the owner (not Lovable) to accept a `return_base_url` parameter before the website checkout can work.

2. **Implement phases sequentially.** Do not start Phase 5 (scanner/door) before Phase 2 (purchase) is working correctly.

3. **Use `@supabase/ssr`** for Next.js/SvelteKit websites, or standard `@supabase/supabase-js` for SPA frameworks.

4. **Implement a QR code library** (e.g., `qrcode.react` or `react-qr-code`) for ticket display in Phase 2.

5. **For the scanner web implementation:** Implement manual 64-char hex token input as minimum. Optionally add webcam scanning with `@zxing/browser` or `jsQR`. The `checkin_ticket()` RPC call is identical for both.

6. **Use the same Supabase client** — single instance per page/session. Do not create multiple Supabase clients.

7. **Test all financial operations with Stripe test mode** before switching to live mode.

8. **Never log `secure_token` values** in browser console, analytics, or server logs.

9. **Never store `secure_token` in browser localStorage, URL params, or cookies.** It should only exist in-memory while the ticket detail page is open.

10. **Website Phase 1 (Auth) is a prerequisite for all other phases.** Complete it and test thoroughly before proceeding.

---

*End of Specification*

---

**SPEC COMPLETE: YES**  
**FILE CREATED: `VYBZ_HUB_WEBSITE_PARITY_MASTER_SPEC.md`**
