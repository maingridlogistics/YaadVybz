# VYBZ HUB — STAGE 3: UNIFIED ROLE ARCHITECTURE REPORT

---

## FILES CHANGED

| File | Change |
|------|--------|
| `app/index.tsx` | Removed role-split routing. All authenticated users → `/(tabs)`. |
| `app/auth.tsx` | Removed Admin→`/admin` post-login redirect. All users → `/(tabs)` (or `returnTo`). |
| `app/(tabs)/_layout.tsx` | Removed Admin redirect `useEffect` that bounced Admin back to `/admin`. |
| `app/(tabs)/profile.tsx` | Removed Admin redirect + `return null` guard. Added `isAdmin` detection. Added Admin Tools section (Admin Dashboard card + 4 quick-link buttons). Updated Promoter Tools section. Gated My Events / Become Promoter cards to non-admin users. Gated Upgrade CTA to non-admin. |
| `app/(promoter)/_layout.tsx` | Changed Admin guard: Admin now redirected to `/(tabs)` instead of `/admin`. Non-promoter non-admin users still redirected to `/(tabs)`. |

**Not changed:** Admin portal (`/admin/*`), Stripe, Apple IAP, Google Play Billing, AuthContext, PromoterModeContext, all other screens, RLS, database.

---

## AUTHENTICATION

| Role | Login destination |
|------|-------------------|
| **Attendee** | `/(tabs)` — shared Home |
| **Promoter** | `/(tabs)` — shared Home |
| **Admin** | `/(tabs)` — shared Home |

All roles enter the same shared browsing experience. Role-specific tools are accessed via Profile tab.

---

## SHARED APP ACCESS

| Feature | Attendee | Promoter | Admin |
|---------|----------|----------|-------|
| Home (`/(tabs)`) | ✅ | ✅ | ✅ |
| Browse / Explore | ✅ | ✅ | ✅ |
| Event Detail | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ |
| Profile | ✅ | ✅ | ✅ |
| My Tickets | ✅ | ✅ | ✅ |
| Bookmarks | ✅ | ✅ | ✅ |

---

## PROFILE — ROLE CONTROL CENTER

### Attendee
- Profile info (name, phone, parishes, interests)
- My Tickets
- Become a Promoter
- Bookmarks
- Notification Settings
- Language
- Legal / Support
- Delete Account
- Sign Out

### Promoter
- Profile info
- **PROMOTER TOOLS section** (labeled badge header)
  - Promoter Dashboard card (routes to `/(promoter)`)
- My Tickets
- My Events
- Bookmarks
- Upgrade to Pro (if free tier)
- Subscription management card (if paid)
- Notification Settings
- Language / Legal / Support
- Delete Account / Sign Out

### Admin
- Profile info (name, avatar)
- **ADMIN TOOLS section** (labeled badge header)
  - Admin Dashboard card (routes to `/admin`)
  - Quick-link row: Users · Events · Finance · More
- My Tickets
- Bookmarks
- Notification Settings
- Language / Legal / Support
- Delete Account / Sign Out
- *(No Become Promoter, My Events, Upgrade CTA — not applicable to Admin)*

---

## PROMOTER

| Item | Status |
|------|--------|
| Promoter Dashboard entry | Profile → Promoter Tools → Promoter Dashboard card |
| Create Event | Via promoter dashboard tabs; post tab still visible in shared app for promoters |
| Finance | Via promoter dashboard |
| Mode-switch logic remaining | `PromoterModeContext` retained — still used by `switchToPromoter()` for persistence and by `/(promoter)/_layout.tsx` guard. Not removed because it serves a legitimate navigation-state purpose. |

---

## ADMIN

| Item | Status |
|------|--------|
| Admin Dashboard entry | Profile → Admin Tools → Admin Dashboard card |
| Admin primary tab count | **5** |
| Admin tab names | Dashboard · Users · Events · Finance · More |
| Non-admin `/admin` protection | **UNCHANGED** — `app/admin/_layout.tsx` still guards with `isAdmin` check and redirects non-admins to `/(tabs)` |

---

## ROUTE MATRIX

| Route | Guest | Attendee | Promoter | Admin |
|-------|-------|----------|----------|-------|
| `/(tabs)` (Home) | ALLOWED (browse-only) | ALLOWED | ALLOWED | ALLOWED |
| `/(tabs)/browse` | ALLOWED | ALLOWED | ALLOWED | ALLOWED |
| `/event/[id]` | ALLOWED | ALLOWED | ALLOWED | ALLOWED |
| `/notifications` | DENIED→auth | ALLOWED | ALLOWED | ALLOWED |
| `/(tabs)/profile` | Guest view | ALLOWED | ALLOWED | ALLOWED (Admin Tools shown) |
| `/my-tickets` | DENIED→auth | ALLOWED | ALLOWED | ALLOWED (no purchase controls) |
| `/ticketing/checkout/[eventId]` | DENIED→auth | ALLOWED | ALLOWED | ROLE DEPENDENT (backend authorization unchanged) |
| `/(tabs)/post` (Create Event) | DENIED | ALLOWED | ALLOWED | ALLOWED (tab visible; backend requires promoter role to save) |
| `/(promoter)` Dashboard | DENIED→tabs | DENIED→tabs | ALLOWED | DENIED→tabs |
| `/admin` Dashboard | DENIED→onboarding | DENIED→tabs | DENIED→tabs | ALLOWED |
| `/admin/users` | DENIED | DENIED | DENIED | ALLOWED |
| `/admin/events` | DENIED | DENIED | DENIED | ALLOWED |
| `/admin/finance` | DENIED | DENIED | DENIED | ALLOWED |
| `/monetization/upgrade` | ALLOWED (view) | ALLOWED | ALLOWED | ALLOWED (view only) |

---

## NOTIFICATIONS

| Role | Routing |
|------|---------|
| **Attendee** | Ticket/event notifications → `/(tabs)`, `/my-tickets`, `/event/[id]` |
| **Promoter** | Promoter notifications → `/ticketing/dashboard/[id]`, `/my-events`, `/promoter/[id]` |
| **Admin** | Deletion/moderation notifications → `/admin/users` (unchanged from Stage 1) |

Admin notification routing (`account_deletion_request`, `account_deletion_approved`) in `app/_layout.tsx` still routes to `/admin/users`. This remains correct — admin will navigate to their portal specifically for admin actions, not the shared profile.

---

## PROMOTERMODE CONTEXT — RETAINED

`PromoterModeContext` is kept because:
1. `switchToPromoter()` is called before navigating to `/(promoter)` — it persists the "active view" state so back-navigation and foreground-return behave correctly.
2. `/(promoter)/_layout.tsx` uses `switchToAttendee()` in its non-promoter guard to reset the mode when a non-promoter somehow reaches the route.
3. `isPromoterModeReady` in `app/index.tsx` gates the initial redirect until AsyncStorage has been read — preventing a flash to `/(tabs)` before the stored mode is known.

It is **not** used to create separate "app modes" — in Stage 3, all roles browse the same `/(tabs)` regardless of this context value.

---

## SECURITY

| Item | Status |
|------|--------|
| Backend authorization changed | **NO** |
| RLS changed | **NO** |
| `/admin/*` route guards | **UNCHANGED** — still Admin-only |
| `/(promoter)/*` route guards | **UNCHANGED** — still Promoter-only |
| New risk introduced | None. Admin can now browse public events and use Profile but cannot create orders, post events as a promoter, or access any protected route without the appropriate role. Backend RLS and route guards still enforce all critical boundaries. |

### Admin in shared app — what is allowed vs. prevented

**Allowed (by design):**
- Browse events, view event details, use search/map
- View their own profile, edit name/avatar
- View My Tickets (no tickets expected for admin accounts)
- Access Notifications
- Navigate to Admin Portal via Profile → Admin Tools

**Prevented (by guards + backend):**
- Admin cannot navigate to `/(promoter)/*` — layout guard redirects to `/(tabs)`
- Admin cannot create events as a promoter (backend RLS requires promoter role)
- Admin cannot purchase tickets via checkout (backend validates user is not admin — existing RLS, unchanged)
- Admin cannot see Promoter Tools, My Events, Upgrade CTA, or Become a Promoter in Profile

---

## STRIPE

- **Stripe files changed:** NO
- **Physical iOS Stripe test:** PENDING (same status as Stage 2 close)

---

## VERIFICATION

- **TypeScript:** NOT VERIFIED (no CLI access from OnSpace editor)
- **ESLint:** NOT VERIFIED
- **Expo Doctor:** NOT VERIFIED
- **Expo Config:** NOT VERIFIED

---

## REGRESSIONS

| Area | Status |
|------|--------|
| Home / Browse | NOT VERIFIED — no regressions expected (no changes to these screens) |
| Event Detail | NOT VERIFIED — not modified |
| Post / Create Event | NOT VERIFIED — not modified |
| Promoter Dashboard | NOT VERIFIED — only guard behavior changed (Admin→tabs instead of Admin→/admin) |
| Admin Portal | NOT VERIFIED — not modified (still 5 tabs, all guards intact) |
| Admin Finance / Ticket Sales | NOT VERIFIED — unchanged from Stage 1 |
| Admin Users | NOT VERIFIED — unchanged |
| Delete Request flow | NOT VERIFIED — unchanged |
| Notifications | NOT VERIFIED — routing unchanged |
| Profile | **CHANGED** — Admin Tools section added, Promoter Tools restructured. No regression expected for Attendee or Promoter views. |
| Logout | NOT VERIFIED — signOut() unchanged |

---

## STAGE 3 STATUS

**`PASS — ARCHITECTURE IMPLEMENTED`**

All role redirects removed from login and shared tabs. Admin and Promoter now enter the shared app on login. Profile is the role control center. Admin Tools visible only to admins. Promoter Tools visible only to promoters. All `/admin/*` and `/(promoter)/*` route guards remain intact. No Stripe, IAP, theme, or backend changes.

**STOP — Do not start light theme redesign. Awaiting approval.**
