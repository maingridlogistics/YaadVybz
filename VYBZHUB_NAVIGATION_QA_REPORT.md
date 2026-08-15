# VYBZ HUB — FULL ROLE NAVIGATION QA REPORT

**Audit Date:** August 15, 2026  
**Scope:** Full role navigation, architecture, routing, security, dark mode, UX  
**Audit Type:** Read-only. No code changes were made.

---

## UNIVERSAL 5-TAB NAVIGATION

**PASS**

`app/(tabs)/_layout.tsx` defines exactly one `<Tabs>` navigator with 5 screens:

| Tab | Screen File | Icon |
|---|---|---|
| Home | `(tabs)/index.tsx` | home |
| Browse | `(tabs)/browse.tsx` | search |
| Create | `(tabs)/post.tsx` | (gold circle, floating) |
| Map | `(tabs)/map.tsx` | map |
| Profile | `(tabs)/profile.tsx` | person |

The tab bar is universally rendered for ALL roles. There is no secondary or role-specific tab bar defined here.

---

## SECONDARY NAVIGATION BARS

**NONE**

All role-specific pages use a Stack layout (no tab bar):

- `app/admin/_layout.tsx` → `<Stack screenOptions={{ headerShown: false }} />` — NO tab bar
- `app/(promoter)/_layout.tsx` → `<Stack screenOptions={{ headerShown: false }} />` — NO tab bar

No other files create a secondary persistent tab bar. Filter chips and segment controls inside individual feature screens (e.g. Browse mode switcher, ticket orders status filter) are page-level UI controls, not navigation tab bars.

---

## ATTENDEE NAVIGATION

**PASS**

An attendee (no `promoter` or `admin` role) sees:
- Home, Browse, Create (→ Become a Promoter gate), Map, Profile
- Profile shows: Account, My Vybz, Become a Promoter CTA, Settings & Support, Account Actions
- No promoter tools visible
- No admin tools visible

The `isPromoter && !isAdmin` guard in `profile.tsx` correctly hides all promoter rows.  
The `!isAdmin` guard correctly hides the "Become a Promoter" CTA for admin accounts, while showing it to attendees.

---

## PROMOTER NAVIGATION

**PASS**

A promoter (has `promoter` role, no `admin` role) sees:
- Home, Browse, Create (→ full 7-step event creation form), Map, Profile
- Profile shows: Account, My Vybz, Events section, Ticketing section, Event Operations section, Money section, Promoter section, Subscription card/CTA, Settings & Support, Account Actions

All rows verified in profile.tsx. Each routes to a dedicated feature screen or goes through the smart event picker.

---

## ADMIN NAVIGATION

**PASS**

An admin (has `admin` role) sees:
- Home, Browse, Create (→ Admin Account gate), Map, Profile
- Profile shows: Account, My Vybz, Moderation section, People section, Money section, Content & App section, Settings & Support, Account Actions
- No Promoter sections visible
- No "Become a Promoter" CTA visible

---

## ATTENDEE CREATE

**PASS**

`app/(tabs)/post.tsx` gate sequence:
1. Admin check first → shows Admin Account gate with gold icon, "Go to Admin Section" CTA
2. Not logged in → Sign In gate
3. At event limit → Monthly Limit gate
4. Not a promoter → **"Become a Promoter"** activation flow with perks list and "Activate Promoter Account" CTA

Attendees who are not yet promoters see the correct Become a Promoter gate. ✅

---

## PROMOTER CREATE

**PASS**

Promoters who are not admins reach the full 7-step event creation form with:
- Basic Info, Location, Category, Flyer, Pricing, Contact, Review steps
- Draft auto-save to AsyncStorage
- Image upload with progress
- Conflict nudge if other events exist same date/parish
- On submit: routes to ticket setup if Vybz Hub ticketing selected, otherwise to `/my-events`

---

## ADMIN CREATE BLOCK

**PASS**

In `post.tsx`, the admin check is the FIRST gate (before login check, before promoter check):

```typescript
if (user?.roles.includes('admin')) {
  return (
    <View style={styles.gateContainer}>
      <SafeAreaView edges={['top']} />
      <View style={styles.gate}>
        <View style={[styles.gateIcon, { backgroundColor: Colors.goldSurface, borderWidth: 2, borderColor: `${Colors.gold}44` }]}>
          <MaterialIcons name="admin-panel-settings" size={36} color={Colors.gold} />
        </View>
        <Text style={styles.gateTitle}>Admin Account</Text>
        <Text style={styles.gateSub}>
          Admin accounts cannot post events. Event management is handled through the Admin Panel.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)/profile' as any)} ...>
          ...Go to Admin Section
        </Pressable>
      </View>
    </View>
  );
}
```

An admin cannot bypass the gate via:
- The Create tab (blocked at component level)
- Direct URL entry to the Create route (the component renders the gate before any form state)
- Deep link (same component renders the gate)

---

## ADMIN PRECEDENCE

**PASS**

In `profile.tsx`:

```typescript
{isPromoter && !isAdmin ? (
  /* Promoter sections */
) : !isAdmin ? (
  /* Become a Promoter CTA */
) : null}
{isAdmin && (
  /* Admin sections */
)}
```

This logic correctly enforces:
- Admin-only account → Admin sections shown, no promoter sections, no "Become a Promoter"
- Promoter-only account → Promoter sections shown, no admin sections
- Admin + Promoter dual role → Admin sections shown, Promoter sections hidden (admin precedence)
- Attendee only → "Become a Promoter" shown, no other role sections

---

## PROMOTER EVENT PICKER

**PASS**

`app/promoter-event-picker.tsx` correctly implements a shared picker for all event-dependent actions.

### Picker behavior:
| Scenario | Behavior |
|---|---|
| 0 eligible events | Empty state with "Create an Event" CTA and "← Back to Profile" link |
| 1 eligible event | **Handled by Profile's `smartNav` BEFORE picker opens** → direct navigation, picker never shown |
| 2+ eligible events | Picker shown with event list |

### Action → Destination mapping (verified in ACTION_CONFIG):

| Action | Destination Route | Live Only |
|---|---|---|
| scanner | `/ticketing/scanner/[eventId]` | YES |
| attendees | `/ticketing/attendees/[eventId]` | YES |
| staff | `/ticketing/staff/[eventId]` | YES |
| setup | `/ticketing/setup/[eventId]` | YES |
| tiers | `/ticketing/tiers/[eventId]` | YES |
| dashboard | `/ticketing/dashboard/[eventId]` | YES |
| boost | `/monetization/boost/[eventId]` | YES |
| finance | `/ticketing/finance/[eventId]` | NO |
| refunds | `/ticketing/finance/[eventId]?section=refunds` | NO |
| disputes | `/ticketing/finance/[eventId]?section=disputes` | NO |
| cancel | `/ticketing/cancel/[eventId]` | YES |

The picker is NOT a dashboard — it shows only an event list with a subtitle, count note, and back button. No action cards or secondary navigation inside. ✅

---

## PROMOTER DIRECT ROUTING

**PASS**

All Profile rows verified for Promoter section:

| Group | Label | Route | Destination File | Dedicated | Intermediate Hub |
|---|---|---|---|---|---|
| Events | My Events | `/(promoter)/events` | `(promoter)/events.tsx` | YES | NO |
| Events | Create Event | `/(tabs)/post` | `(tabs)/post.tsx` | YES | NO |
| Events | Boost an Event | smart → `/monetization/boost/[id]` or picker | `monetization/boost/[id].tsx` | YES | NO |
| Ticketing | Ticket Setup | smart → `/ticketing/setup/[id]` or picker | `ticketing/setup/[id].tsx` | YES | NO |
| Ticketing | Ticket Tiers | smart → `/ticketing/tiers/[id]` or picker | `ticketing/tiers/[id].tsx` | YES | NO |
| Ticketing | Ticket Sales | smart → `/ticketing/dashboard/[id]` or picker | `ticketing/dashboard/[id].tsx` | YES | NO |
| Event Operations | Ticket Scanner | smart → `/ticketing/scanner/[id]` or picker | `ticketing/scanner/[id].tsx` | YES | NO |
| Event Operations | Attendees | smart → `/ticketing/attendees/[id]` or picker | `ticketing/attendees/[id].tsx` | YES | NO |
| Event Operations | Event Staff | smart → `/ticketing/staff/[id]` or picker | `ticketing/staff/[id].tsx` | YES | NO |
| Money | Finance | `/(promoter)/finance` | `(promoter)/finance.tsx` | YES | NO |
| Money | Payouts | `/(promoter)/payouts` | `(promoter)/payouts.tsx` | YES | NO |
| Money | Refunds | picker → `/ticketing/finance/[id]?section=refunds` | `ticketing/finance/[id].tsx` | YES | NO |
| Money | Disputes | picker → `/ticketing/finance/[id]?section=disputes` | `ticketing/finance/[id].tsx` | YES | NO |
| Promoter | View Public Profile | `/promoter/[user.id]` | `promoter/[id].tsx` | YES | NO |

The Promoter Finance screen (`(promoter)/finance.tsx`) contains a shortcut CTA to Payouts but is itself a standalone Revenue Overview page — not a hub with tabs. ✅

---

## ADMIN DIRECT ROUTING

**PASS**

All Profile rows verified for Admin section:

| Group | Label | Route | Destination File | Dedicated | ?section= |
|---|---|---|---|---|---|
| Moderation | Event Queue | `/admin/event-queue` | `admin/event-queue.tsx` | YES | NO |
| Moderation | Flagged Events | `/admin/flagged-events` | `admin/flagged-events.tsx` | YES | NO |
| Moderation | All Events | `/admin/all-events` | `admin/all-events.tsx` | YES | NO |
| Moderation | Cancellation Requests | `/admin/cancellation-requests` | `admin/cancellation-requests.tsx` | YES | NO |
| People | Users | `/admin/users` | `admin/users.tsx` | YES | NO |
| People | Account Deletion Requests | `/admin/account-deletion-requests` | `admin/account-deletion-requests.tsx` | YES | NO |
| Money | Ticket Orders | `/admin/ticket-orders` | `admin/ticket-orders.tsx` | YES | NO |
| Money | Payouts | `/admin/payouts` | `admin/payouts.tsx` | YES | NO |
| Money | Disputes | `/admin/disputes` | `admin/disputes.tsx` | YES | NO |
| Money | Subscriptions | `/admin/subscriptions` | `admin/subscriptions.tsx` | YES | NO |
| Content & App | Ads | `/admin/ads-management` | `admin/ads-management.tsx` | YES | NO |
| Content & App | Event Settings | `/admin/event-settings` | `admin/event-settings.tsx` | YES | NO |
| Content & App | Categories | `/admin/categories` | `admin/categories.tsx` | YES | NO |
| Content & App | System Tools | `/admin/system-tools` | `admin/system-tools.tsx` | YES | NO |

Zero `?section=` parameters in any Admin Profile row. ✅

---

## ADMIN DEDICATED PAGES

**PASS**

All 14 dedicated admin pages audited for content isolation:

| Page | Content | Unrelated Content | Admin Guard |
|---|---|---|---|
| `/admin/event-queue` | Pending events, approve, reject, edit | NONE | ✅ |
| `/admin/flagged-events` | Flagged events, unflag, remove, edit | NONE | ✅ |
| `/admin/all-events` | Search, status filter, featured toggle, edit | NONE | ✅ |
| `/admin/cancellation-requests` | Pending requests, approve (with confirmation), reject, reason | NONE | ✅ |
| `/admin/users` | Search, role filters, pagination, open User Detail | NONE — no deletion requests section | ✅ |
| `/admin/account-deletion-requests` | Deletion requests, approve, reject, reason, destructive confirmation | NONE | ✅ |
| `/admin/ticket-orders` | Orders list, search, status filter, pagination | NONE | ✅ |
| `/admin/payouts` | Pending/processing/history, Start Processing, Mark Paid, Mark Failed, provider ref | NONE | ✅ |
| `/admin/disputes` | Read-only dispute list, status filters, Stripe Dashboard notice | NONE | ✅ |
| `/admin/subscriptions` | Read-only subscription ledger, provider filters | NONE | ✅ |
| `/admin/ads-management` | Placement list, create placement, toggle live/off, → placement detail | NONE | ✅ |
| `/admin/event-settings` | Require Event Approval toggle only | NONE | ✅ |
| `/admin/categories` | Parishes + Event Types + Reset to Defaults | NONE | ✅ |
| `/admin/system-tools` | Ad Rotation, Test Email, SMTP, Test Push, Push Test Lab link | NONE | ✅ |

---

## OLD PROMOTER HUBS

**REDIRECT ONLY**

| File | Current Behavior | Target |
|---|---|---|
| `(promoter)/index.tsx` | `router.replace('/(tabs)/profile')` | Profile tab |
| `(promoter)/ticketing.tsx` | `router.replace('/(tabs)/profile')` | Profile tab |
| `(promoter)/more.tsx` | `router.replace('/(tabs)/profile')` | Profile tab |

`(promoter)/events.tsx` and `(promoter)/finance.tsx` and `(promoter)/payouts.tsx` remain as real dedicated feature screens, not hubs. ✅

---

## OLD ADMIN HUBS

**REDIRECT ONLY**

| File | Current Behavior | Target |
|---|---|---|
| `admin/index.tsx` | `router.replace('/(tabs)/profile')` | Profile tab |
| `admin/events.tsx` | `<Redirect href={'/(tabs)/profile'}/>` | Profile tab |
| `admin/finance.tsx` | `<Redirect href={'/(tabs)/profile'}/>` | Profile tab |
| `admin/more.tsx` | `router.replace('/(tabs)/profile')` | Profile tab |
| `admin/users.tsx` | Real dedicated Users screen (legacy `?section=deletions` redirects to `/admin/account-deletion-requests`) | N/A |

Note: `admin/users.tsx` is now a REAL dedicated page, not a hub. Its `?section=deletions` handling is a legacy compatibility redirect only. ✅

---

## ?SECTION ROUTES

### From Profile

**NONE** — Zero `?section=` parameters in any Admin Profile row. Zero in any Promoter Profile row.

### From Other Internal Navigation

| Location | Route with ?section= | Classification |
|---|---|---|
| `promoter-event-picker.tsx` → refunds action | `/ticketing/finance/[id]?section=refunds` | VALID FOCUSED DEEP LINK — refunds sub-tab within event finance |
| `promoter-event-picker.tsx` → disputes action | `/ticketing/finance/[id]?section=disputes` | VALID FOCUSED DEEP LINK — disputes sub-tab within event finance |
| `(promoter)/finance.tsx` → payouts shortcut | `/(promoter)/payouts` | NO ?section= (direct route) |

### Legacy Compatibility (incoming only)

| Old URL | Current Behavior | Still Needed |
|---|---|---|
| `/admin/users?section=deletions` | Handled in `admin/users.tsx` → `<Redirect href='/admin/account-deletion-requests'>` | YES — old notifications may use this |
| `/admin/finance?section=*` | `admin/finance.tsx` → redirect to Profile | UNKNOWN — keep for safety |
| `/admin/events?section=*` | `admin/events.tsx` → redirect to Profile | UNKNOWN — keep for safety |

---

## BACK BUTTONS

**PASS** — all audited screens have visible `arrow-back` back buttons.

| Screen | Back Button | Back Target |
|---|---|---|
| `admin/event-queue.tsx` | ✅ `router.back()` | Profile |
| `admin/flagged-events.tsx` | ✅ `router.back()` | Profile |
| `admin/all-events.tsx` | ✅ `router.back()` | Profile |
| `admin/cancellation-requests.tsx` | ✅ `router.back()` | Profile |
| `admin/users.tsx` | ✅ `router.back()` | Profile |
| `admin/account-deletion-requests.tsx` | ✅ `router.back()` | Profile |
| `admin/ticket-orders.tsx` | ✅ `router.back()` | Profile |
| `admin/payouts.tsx` | ✅ `router.back()` | Profile |
| `admin/disputes.tsx` | ✅ `router.back()` | Profile |
| `admin/subscriptions.tsx` | ✅ `router.back()` | Profile |
| `admin/ads-management.tsx` | ✅ `router.back()` | Profile |
| `admin/event-settings.tsx` | ✅ `router.back()` | Profile |
| `admin/categories.tsx` | ✅ `router.back()` | Profile |
| `admin/system-tools.tsx` | ✅ `router.back()` | Profile |
| `(promoter)/events.tsx` | ✅ `navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)/profile')` | Profile |
| `(promoter)/finance.tsx` | ✅ `navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)/profile')` | Profile |
| `(promoter)/payouts.tsx` | ✅ `navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)/profile')` | Profile |
| `promoter-event-picker.tsx` | ✅ `router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')` | Profile |
| `edit-event/[id].tsx` | ✅ `router.back()` | Previous screen |

**No back button points to a retired hub.** ✅

---

## ROLE LEAKAGE

**NONE**

| Check | Result |
|---|---|
| Promoter tools shown to Attendee | NO — `isPromoter && !isAdmin` guard |
| Promoter tools shown to Admin | NO — `isPromoter && !isAdmin` guard excludes admin-only accounts; admin+promoter dual roles see Admin sections only |
| Admin tools shown to Promoter | NO — `isAdmin` guard |
| Admin tools shown to Attendee | NO — `isAdmin` guard |
| "Become a Promoter" shown to Admin | NO — `!isAdmin` guard |
| Admin can create personal events | NO — Create tab admin gate is the FIRST check |
| Promoter Finance accessible to Attendee | NO — `(promoter)/_layout.tsx` redirects non-promoters |
| Admin screens accessible to non-admin | NO — both `admin/_layout.tsx` (layout-level) AND per-page gate views enforce admin role |

---

## ADMIN EDIT ANY EVENT

**PASS**

In `edit-event/[id].tsx`:

```typescript
const isAdmin = user?.roles.includes('admin') ?? false;
if (event.promoterId !== user?.id && !isAdmin) {
  return <GateView message="You can only edit your own events." />;
}
```

Frontend: Admin bypasses ownership check. ✅  
Backend (RLS): `events` table policy `authenticated_update_own_events` uses `USING ((promoter_id = auth.uid()) OR is_admin())` — admin can update any event. ✅

---

## PROMOTER EDIT OWN EVENT

**PASS**

Frontend: `event.promoterId === user?.id` check passes for own events. ✅  
Backend: `promoter_id = auth.uid()` RLS condition. ✅

---

## PROMOTER EDIT OTHER EVENT

**DENIED**

Frontend: returns gate view "You can only edit your own events." ✅  
Backend: RLS rejects the UPDATE at database level even if client is bypassed. ✅

---

## ATTENDEE EDIT EVENT

**DENIED**

Frontend: `event.promoterId !== user?.id && !isAdmin` → gate view. ✅  
Backend: RLS rejects UPDATE (attendee is neither promoter_id nor admin). ✅

---

## PROFILE GENERAL MENU

**PASS**

Rows shared by all authenticated roles:

| Group | Label | Route | Dedicated Page | Back Button |
|---|---|---|---|---|
| Account | Edit Profile | Opens inline name edit | Inline (no nav) | N/A |
| Account | Phone Number | Opens inline phone edit | Inline (no nav) | N/A |
| Account | Preferred Parishes | Opens bottom sheet modal | Modal (no nav) | N/A |
| Account | Notification Settings | `/notification-settings` | YES | ✅ |
| My Vybz | Saved Events | `/bookmarks` | YES | ✅ |
| My Vybz | My Tickets | `/my-tickets` | YES | ✅ |
| My Vybz | Following | `/bookmarks` | YES | ✅ |
| My Vybz | Going To | `/bookmarks` | YES | ✅ |
| Settings & Support | Language | Toggles inline (no nav) | Inline | N/A |
| Settings & Support | Home Parish | Opens parish modal | Modal | N/A |
| Settings & Support | Help & Support | Opens email link | External | N/A |
| Settings & Support | Email address | Opens email link | External | N/A |
| Settings & Support | Terms of Use | Opens URL | External | N/A |
| Settings & Support | Privacy Policy | Opens URL | External | N/A |
| Settings & Support | Subscription Terms | Opens URL | External | N/A |
| Settings & Support | Refund & Cancellation Policy | Opens URL | External | N/A |
| Settings & Support | About Vybz Hub | Opens URL | External | N/A |
| Account Actions | Delete Account | Submits deletion request | In-place action | N/A |
| Account Actions | Sign Out | Signs out + navigates to `/onboarding` | In-place action | N/A |

**Minor duplication found:** "Preferred Parishes" appears in both Account section AND Settings & Support ("Home Parish"). Both open the same `showParishModal`. This is a UX duplicate, not a functional issue — same modal, same state.

---

## DARK MODE

**PASS**

All reviewed screens use Vybz Hub dark theme throughout:
- Root backgrounds: `Colors.background` (dark)
- Card backgrounds: `Colors.surface`, `Colors.surfaceElevated`
- Text: `Colors.textPrimary`, `Colors.textSecondary`, `Colors.textMuted`
- Accents: `Colors.gold`, `Colors.greenLight`, `Colors.error`
- No hardcoded `#ffffff` backgrounds found in any admin, promoter, or profile screen

**One minor note:** `admin/all-events.tsx` contains `Colors.textMuted` for the gate style text, which is correct dark-mode styling. No issue.

---

## MEMBER SINCE

**PASS**

`profile.tsx` implements a hardened `safeMemberSince()` function:

```typescript
function safeMemberSince(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    // Guard against epoch zero / far-past fallback values
    if (d.getFullYear() < 2020) return null;
    return d.toLocaleDateString('en-JM', { month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}
```

Fallback behavior:
- `null` or `undefined` input → `null` → component not rendered
- Invalid date string → `isNaN(d.getTime())` → `null` → not rendered
- Year before 2020 → `null` → not rendered (guards against epoch zero)
- Valid date → formatted as "Month YYYY" (e.g. "August 2024")

"Invalid Date" **will never display** — the null check `{memberSince !== null && (...)}` prevents rendering. ✅

---

## NOTIFICATION ROUTING

**PASS**

Verified in `app/_layout.tsx` `handleTap` function:

| Notification Type | Route |
|---|---|
| `account_deletion_request` | `/admin/account-deletion-requests` ✅ |
| `account_deletion_approved` | `/admin/account-deletion-requests` ✅ |
| `account_deletion_rejected` | `/(tabs)/profile` ✅ |
| `event_rejected` | `/edit-event/[eventId]` or `/my-events` ✅ |
| `event_cancelled` | `/(tabs)/` (home) ✅ |
| `ticket_transferred` | `/my-tickets` ✅ |
| `ticket_received` | `/my-tickets` ✅ |
| `ticket_purchase_confirmed` | `/my-tickets` ✅ |
| `ticket_transfer_pending` | `/my-tickets` ✅ |
| `ticket_transfer_accepted` | `/my-tickets` ✅ |
| `ticket_transfer_completed` | `/my-tickets` ✅ |
| `ticket_transfer_declined` | `/my-tickets` ✅ |
| `ticket_transfer_cancelled` | `/my-tickets` ✅ |
| `ticket_inventory_low` | `/ticketing/dashboard/[eventId]` or `/(tabs)/profile` ✅ |
| `boost_expiring` | `/monetization/boost/[eventId]` or `/(tabs)/profile` ✅ |
| `payment_failed` | `/monetization/upgrade` ✅ |
| `subscription_cancellation_scheduled` | `/monetization/upgrade` ✅ |
| `new_follower` | `/(tabs)/profile` ✅ |
| QR deep link (`vybzhub://ticket/...`) | `/my-tickets` ✅ |
| Any with `eventId` (fallback) | `/event/[eventId]` ✅ |

**None route to old hubs.** ✅  
**`account_deletion_request` correctly routes to dedicated page**, not `/admin/users?section=deletions`. ✅

---

## ROUTE REGISTRATION

**PASS**

`app/_layout.tsx` registers all known routes. Verified present:

```
admin/event-queue                ✅
admin/flagged-events             ✅
admin/all-events                 ✅
admin/cancellation-requests      ✅
admin/users                      ✅
admin/account-deletion-requests  ✅
admin/ticket-orders              ✅
admin/payouts                    ✅
admin/disputes                   ✅
admin/subscriptions              ✅
admin/ads-management             ✅
admin/event-settings             ✅
admin/categories                 ✅
admin/system-tools               ✅
admin/push-test                  ✅
admin/ads/[placementId]          ✅
admin/user/[userId]              ✅
(promoter)/payouts               ✅
promoter-event-picker            ✅ (inferred via Expo Router file-based routing)
```

**No orphaned routes found.** No registered routes pointing to deleted files.

**Note:** `admin` is registered as `<Stack.Screen name="admin" .../>` which resolves to the `app/admin/` directory handled by `app/admin/_layout.tsx`. This is correct Expo Router behavior.

---

## DEEP LINK COMPATIBILITY

| Old Route | Current Behavior | Still Needed | Safe to Delete Later |
|---|---|---|---|
| `/admin/index` (`admin/`) | Redirects to `/(tabs)/profile` | UNKNOWN | YES — after confirming no old push notifications use it |
| `/admin/events` | `<Redirect href='/(tabs)/profile'>` | UNKNOWN | YES — after push notification audit |
| `/admin/finance` | `<Redirect href='/(tabs)/profile'>` | UNKNOWN | YES — after push notification audit |
| `/admin/more` | Redirects to `/(tabs)/profile` | UNKNOWN | YES — after push notification audit |
| `/admin/users` | Real screen; `?section=deletions` → `/admin/account-deletion-requests` | YES (for `?section=deletions`) | NO — active compatibility needed |
| `/(promoter)/` | Redirects to `/(tabs)/profile` | UNKNOWN | YES |
| `/(promoter)/ticketing` | Redirects to `/(tabs)/profile` | UNKNOWN | YES |
| `/(promoter)/more` | Redirects to `/(tabs)/profile` | UNKNOWN | YES |
| `vybzhub://ticket/*` | Opens `/my-tickets` | YES — QR share feature | NO |
| `vybzhub://...claim-ticket?transfer=*` | Opens `/claim-ticket?transfer=[id]` | YES — transfer invite emails | NO |

---

## DATABASE/RLS ROLE BOUNDARIES

**PASS**

Role boundaries enforced at multiple layers:

**Admin operations:**
- All admin tables use `is_admin()` function in RLS policies
- `is_admin()` is a security-definer PostgreSQL function that cannot be spoofed client-side
- Admin-specific operations use `SUPABASE_SERVICE_ROLE_KEY` in Edge Functions where applicable

**Promoter operations:**
- `events` RLS: `INSERT` requires `promoter_id = auth.uid()`, `UPDATE` requires `(promoter_id = auth.uid()) OR is_admin()`
- `event_ticket_types`, `event_ticket_settings`, `event_staff` all scoped to promoter's own events
- `promoter_payout_accounts`, `promoter_payouts`, `promoter_ledger` all scoped to `promoter_id = auth.uid()`

**Attendee operations:**
- Cannot INSERT/UPDATE/DELETE events (no matching RLS policy)
- Cannot access admin tables (no policy grants non-admin access)
- Cannot access other users' profiles (`id = auth.uid()` on `user_profiles`)

**No database table exists solely to support an obsolete UI hub** — all tables serve active features. ✅

---

## OBSOLETE FILE CANDIDATES

| File | Why It May Be Unused | References Found | Safe to Delete |
|---|---|---|---|
| `app/admin/events.tsx` | Pure compatibility redirect | Referenced from notifications compatibility in `_layout.tsx` | NO — keep as redirect |
| `app/admin/finance.tsx` | Pure compatibility redirect | Old push notifications may reference | NO — keep as redirect |
| `app/admin/more.tsx` | Pure compatibility redirect | Old bookmarks may reference | NO — keep as redirect |
| `app/admin/index.tsx` | Pure compatibility redirect | `/admin` deep links | NO — keep as redirect |
| `app/(promoter)/index.tsx` | Pure compatibility redirect | `/(promoter)` deep links | NO — keep as redirect |
| `app/(promoter)/ticketing.tsx` | Pure compatibility redirect | Old notifications may reference | NO — keep as redirect |
| `app/(promoter)/more.tsx` | Pure compatibility redirect | Old notifications may reference | NO — keep as redirect |

**None are safe to delete yet.** All serve as compatibility redirects for old push notifications, email links, or deep links. A future cleanup pass should audit push notification payloads to determine which routes are still actively generated.

---

## UX NAVIGATION ISSUES

Ordered by severity (P0 = most critical):

### P1 — Minor UX Friction

**1. "Preferred Parishes" duplicated in Account and Settings & Support sections**
- Both "Preferred Parishes" (Account section) and "Home Parish" (Settings & Support) open the same parish modal
- The distinction is unclear to users — one label says "Preferred" and one says "Home"
- **Recommendation:** Remove "Home Parish" from Settings & Support, or differentiate the two concepts (Home Parish = single primary parish; Preferred Parishes = multiple parishes for feed filtering)

**2. Boost Event smart routing edge case**
- If a promoter has 1 already-boosted event, Profile routes to `/monetization/boost-performance/[id]`
- If a promoter has 0 boosted events and 1 live event, routes directly to `/monetization/boost/[id]`
- If a promoter has multiple boosted events, routes to picker with `action=boost` but the boosted events would navigate to `/monetization/boost/[id]` (boost purchase), not `/monetization/boost-performance/[id]` (performance view)
- **Recommendation:** Profile Boost row could split into two rows: "Boost an Event" (purchase) and "Boost Performance" (analytics) for clarity. Not a blocking issue.

**3. "Following" and "Going To" in My Vybz both route to `/bookmarks`**
- The Bookmarks page presumably has tabs or sections for these, but from Profile, both rows feel like they go to the same place
- **Recommendation:** Verify Bookmarks page has clear navigation to Following and Going To sections, or route each to the appropriate filtered view

### P2 — Low Priority / Cosmetic

**4. Event Queue back button uses `router.back()` but no fallback**
- If the user deep-links directly to `/admin/event-queue` (e.g. from a push notification), `router.back()` may have no history
- **Recommendation:** Add `router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')` pattern, consistent with other admin screens

**5. All Events page caps display at 100 results**
- `filtered.slice(0, 100).map(...)` — shows a warning message but no pagination
- For platforms with many events, the admin cannot see all events in this view
- **Recommendation:** Add Load More / pagination similar to Ticket Orders page

---

## RECOMMENDED FIXES

### P0 (Critical)
*None identified. Architecture is sound.*

### P1 (Should Fix Soon)
1. **Resolve "Preferred Parishes" vs "Home Parish" duplication** in Profile — clarify or remove one
2. **Add router.canGoBack() fallback** to `admin/event-queue.tsx` back button for direct deep-link entry

### P2 (Backlog)
3. **Pagination for All Events** admin screen — currently caps at 100 results with no load more
4. **Boost Event routing clarity** — consider splitting Profile Boost row into purchase vs. performance views
5. **Verify Bookmarks sub-navigation** — ensure Following and Going To Profile rows resolve to correct tabs
6. **Future compatibility redirect cleanup** — after auditing active push notification payloads, remove unused redirect files

---

## BUILD / STATIC VALIDATION

**TSC:** NOT RUN — code audit only  
**ESLINT:** NOT RUN — code audit only  
**EXPO DOCTOR:** NOT RUN — code audit only  
**ANDROID EXPORT:** NOT RUN — code audit only  
**IOS EXPORT:** NOT RUN — code audit only

---

## FILES CHANGED

**NONE**

---

## CONFIRMATION

**NO CODE CHANGES WERE MADE DURING THIS AUDIT.**

This report reflects the state of the codebase as-read. All findings are observational only.
