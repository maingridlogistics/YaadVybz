# Vybz Hub — Complete Production Feature Audit & Implementation Specification

> **Purpose:** This document is the definitive implementation specification for the Vybz Hub website to reach feature parity with the iOS/Android mobile application. Every feature, workflow, screen, permission, backend interaction, and business rule implemented in the mobile app is documented here.
>
> **Shared Backend:** The website uses the same Supabase project (`twilfdbvrzhlnllcmssc`), authentication, storage, Edge Functions, Stripe integration, and database as the mobile app.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design System](#2-design-system)
3. [Authentication & Onboarding](#3-authentication--onboarding)
4. [Home Screen](#4-home-screen)
5. [Browse Screen](#5-browse-screen)
6. [Map Screen](#6-map-screen)
7. [Event Detail Screen](#7-event-detail-screen)
8. [RSVP System](#8-rsvp-system)
9. [Event Creation (Post)](#9-event-creation-post)
10. [Edit Event](#10-edit-event)
11. [My Events](#11-my-events)
12. [Promoter Profile](#12-promoter-profile)
13. [Profile Screen](#13-profile-screen)
14. [Notifications System](#14-notifications-system)
15. [Notification Settings](#15-notification-settings)
16. [Squad Up](#16-squad-up)
17. [Subscriptions (Upgrade)](#17-subscriptions-upgrade)
18. [Event Boost (Purchase)](#18-event-boost-purchase)
19. [Boost Performance Analytics](#19-boost-performance-analytics)
20. [Admin Panel](#20-admin-panel)
21. [Advertisements System](#21-advertisements-system)
22. [Database Tables](#22-database-tables)
23. [Edge Functions](#23-edge-functions)
24. [Storage Buckets](#24-storage-buckets)
25. [Image Processing Pipeline](#25-image-processing-pipeline)
26. [Push Notifications Architecture](#26-push-notifications-architecture)
27. [Email System](#27-email-system)
28. [Ranking & Sorting Logic](#28-ranking--sorting-logic)
29. [Weather Widget](#29-weather-widget)
30. [Internationalization (i18n)](#30-internationalization-i18n)
31. [iOS Purchase Gate](#31-ios-purchase-gate)
32. [Categories System (Admin-Configurable)](#32-categories-system-admin-configurable)
33. [Account Deletion Workflow](#33-account-deletion-workflow)
34. [Permissions Model](#34-permissions-model)
35. [Services Reference](#35-services-reference)
36. [Constants & Business Rules Reference](#36-constants--business-rules-reference)
37. [Website Feature Parity Checklist](#37-website-feature-parity-checklist)

---

## 1. Architecture Overview

### Tech Stack (Mobile)
- **Framework:** React Native + Expo (managed workflow)
- **Router:** Expo Router (file-based)
- **Language:** TypeScript
- **State Management:** React Context API
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Payments:** Stripe (Checkout + Customer Portal + Webhooks)
- **Push (Android):** FCM HTTP v1 direct via Edge Function (OAuth2 service account)
- **Push (iOS):** Expo Push Service → APNs

### Layer Architecture

```
app/                  → Expo Router pages (UI entry points)
contexts/             → Global state providers (Auth, Events, Notifications, Language, Categories)
hooks/                → Context consumer hooks (useAuth, useEvents, etc.)
services/             → Data layer (emailService, subscriptionService, adsService)
components/
  feature/            → Domain-specific components (EventCard, JamaicaMap, etc.)
  ui/                 → Generic UI components (Button, Badge, PlacementAd, WeatherWidget)
constants/            → Business logic, theme tokens, data types, rankings
lib/                  → Low-level utilities (supabase client, storage helpers, push helpers)
supabase/functions/   → Deno Edge Functions
```

### Key Design Decisions
- **Optimistic UI:** RSVP toggles, profile saves, and event CRUD update local state immediately; DB writes fire-and-forget; Supabase real-time confirms final state
- **Mutual exclusion:** A user can be either "Going" OR "Interested" to one event, not both
- **On-demand permissions:** No permissions requested at cold launch; photo permission requested only at upload tap; push permission deferred until branded "Stay Connected" modal after first sign-in
- **iOS Stripe gate:** `canPurchaseDigitalFeatures = Platform.OS !== 'ios'` — all Stripe purchase flows hidden on iOS; subscribe/boost pages redirect to profile on iOS
- **Real-time:** EventsContext subscribes to `public:events` Postgres changes; AuthContext subscribes to `account_deletion_requests` for the current user

---

## 2. Design System

### Color Tokens (`constants/theme.ts`)

| Token | Hex | Usage |
|---|---|---|
| `background` | `#0A0A0A` | Page backgrounds |
| `surface` | `#141414` | Cards, modals |
| `surfaceElevated` | `#1C1C1C` | Input fields, elevated surfaces |
| `surfaceBorder` | `#2A2A2A` | Dividers, borders |
| `gold` | `#FFD700` | Primary brand color, CTAs |
| `goldDim` | `#B8A000` | Gold gradient end |
| `goldSurface` | `#1A1700` | Gold-tinted backgrounds |
| `green` | `#007A33` | Jamaica green |
| `greenLight` | `#00A846` | "Going" status, success |
| `greenSurface` | `#001A0D` | Green-tinted backgrounds |
| `textPrimary` | `#FFFFFF` | Headlines |
| `textSecondary` | `#AAAAAA` | Body text |
| `textMuted` | `#666666` | Meta, placeholders |
| `textOnGold` | `#0A0A0A` | Text on gold backgrounds |
| `error` | `#FF4444` | Errors |

### Typography Scale (`constants/theme.ts`)
```
xs: 11px, sm: 13px, base: 16px, md: 18px, lg: 20px, xl: 24px, xxl: 28px, xxxl: 34px
Weights: regular(400), medium(500), semibold(600), bold(700), black(900)
```

### Spacing Grid (`constants/theme.ts`)
```
xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48
```

### Border Radii
```
sm: 8, md: 12, lg: 16, xl: 24, full: 999
```

---

## 3. Authentication & Onboarding

### Feature: Splash Screen (`app/index.tsx`)
- **Purpose:** Route guard / animated splash
- **Behavior:**
  - Animated logo + wordmark entrance (expo-reanimated, ~650ms)
  - Waits for `AuthContext.isLoading` to resolve
  - Authenticated user → `/(tabs)` (home)
  - Unauthenticated user → `/onboarding`
- **Business Rules:** No permissions requested; no data loaded

### Feature: Onboarding (`app/onboarding.tsx`)
- **Purpose:** First-run experience; collects home parish and interests
- **Steps:**
  1. Slide 1/2/3 — brand story (swipeable with dots indicator)
  2. Parish selector — single selection from 14 Jamaican parishes
  3. Interests selector — multi-select from 12 event type categories
- **Data Saved:** `home_parish` + `interests` → `user_profiles` (or AsyncStorage if not signed in)
- **Bypass:** On step 3 slide "I already have an account" routes to `/(tabs)` without saving
- **Pending Onboarding:** If saved to AsyncStorage before sign-in, applied to DB on first profile fetch post-sign-in
- **Database:** `user_profiles.home_parish`, `user_profiles.interests`

### Feature: Authentication (`app/auth.tsx`)
- **Purpose:** Sign in, register, forgot password, password reset
- **Views:**
  1. **Login (email):** Email + password fields, show/hide password, forgot password link
  2. **Login (phone):** Phone number → OTP code (requires Twilio in Supabase; UI present but marked as needing config)
  3. **Register:** Role selector (Attendee / Promoter, both selectable), full name, email, password + confirm, password strength bar (3-level: Too Short → Weak → Fair → Strong)
  4. **Forgot Password:** Email input → calls `supabase.auth.resetPasswordForEmail` with `redirectTo: 'onspaceapp://auth'`; retry logic up to 4 attempts with 2s gap for SMTP timeout recovery
  5. **Password Reset (Recovery Mode):** New password + confirm, triggered by `passwordRecoveryMode` flag in AuthContext set from `PASSWORD_RECOVERY` auth event
  6. **Register Success:** "Check your inbox" screen with email address shown
  7. **Reset Sent:** Confirmation screen, link expires in 1 hour
- **Role Selection at Registration:** User picks Attendee, Promoter, or both. Passed as `options.data.roles` in signUp metadata, consumed by `handle_new_user` trigger
- **Error Handling:** Friendly message mapping for all common Supabase auth errors
- **Skip:** "Browse without account" → `/(tabs)` as guest
- **Validation:** Email regex, password min 8 chars, names min 2 chars, password match check

### Feature: Session Management (`contexts/AuthContext.tsx`)
- **Session Persistence:** `ExpoSecureStoreAdapter` (mobile) / `localStorage` (web)
- **Auto-refresh:** `AppState` listener starts/stops `supabase.auth.startAutoRefresh()` on foreground/background
- **Session Recovery:** `getSession()` on mount → fetches profile → sets `isLoading = false`
- **Auth State Change Listener:** Handles `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY`, `TOKEN_REFRESHED`

### Feature: First Sign-in Push Notification Modal
- **Trigger:** On `SIGNED_IN` event, checked against AsyncStorage key `@vybzhub_notif_modal_shown`
- **Modal:** `NotificationPermissionModal` — "Stay Connected" branded sheet with:
  - 3 feature rows (reminders, promoter alerts, event changes)
  - "Enable Notifications" → calls `requestAndRegisterPushNotifications(userId)` → triggers native OS prompt
  - "Not Now" → dismisses; sets modal shown flag
- **One-time only:** AsyncStorage flag prevents re-showing on subsequent sign-ins

### Feature: Profile Fetch & Mapping
- **On sign-in:** Fetches `user_profiles.*` single row by user ID
- **Field Mapping (DB → App):**
  - `subscription_tier` → `subscriptionTier`
  - `verified_promoter` → `verifiedPromoter`
  - `remaining_boosts` → `remainingBoosts`
  - `monthly_boost_allowance` → `monthlyBoostAllowance`
  - `subscription_status` → `subscriptionStatus`
  - `current_period_end` → `currentPeriodEnd`
  - `stripe_customer_id` → `stripeCustomerId`
  - `avatar_url` → `avatarUrl`
  - `email_notif_*`, `push_notif_*` → notification preferences

### Feature: Roles System
- Roles stored as `text[]` in `user_profiles.roles`
- Default roles: `['attendee']`
- Promoter activation: calls `updateProfile({ roles: [...user.roles, 'promoter'] })`
- Admin role: cannot be self-assigned; enforced by `enforce_admin_role_assignment` DB trigger; must be granted via Supabase Dashboard
- Role badges displayed in profile: Attendee (green), Promoter (gold), Verified (gold), Pro/Elite (plan color)

### Feature: Admin Settings (require_event_approval)
- **Loaded on startup** from `admin_settings` table (key: `require_event_approval`), anon-readable
- Global setting: all admins see same moderation state
- Written by admins via `setRequireEventApproval()` using `upsert` with `onConflict: 'key'`

---

## 4. Home Screen

**Route:** `app/(tabs)/index.tsx`

### Sections (in order)

#### Top Bar
- VYBZ HUB logo + gold dot
- Time-aware greeting: "Good morning/afternoon/evening, {firstName}" (English) / "Big Up Yaself" (Patois)
- Notification bell with unread badge count → navigates to `/notifications`
- Search icon → navigates to `/(tabs)/browse`

#### Quick Date Shortcuts
Three chip buttons:
- **Today** → browse with `dateFilter: 'today'`
- **This Weekend** → browse with `dateFilter: 'weekend'`
- **All Filters** → browse

#### Featured Events (horizontal scroll)
- Source: `getFeaturedEvents()` — events where `featured === true` OR `boostScore > 0`, sorted by `compareFeatured`
- Sorting: boost score → tier → engagement
- Rendered with `EventCardFeatured` (280×340 cards, gold border)
- Loading skeleton shown during first fetch
- Empty state: "No featured events right now"

#### Home Feed Ad
- `PlacementAd` component with `placementName="Home Feed"`
- Renders nothing if no active ads configured

#### Trending Now (horizontal scroll)
- Source: top 6 from `events.filter(!isEventPassed).sort(compareTrending)`
- `compareTrending`: engagement primary + boost fractional bonus + tier micro-nudge
- `TrendingCard`: rank badge, cover image, heat count (going + interested)

#### Browse by Category (horizontal scroll)
- All 12 event types as chips (icon + label, color-coded)
- Tapping navigates to browse with `type` filter

#### Browse by Parish (horizontal scroll)
- First 8 parishes + "+6 more" chip
- Tapping navigates to browse with `parish` filter

#### Near You (conditional, visible when user has homeParish)
- Up to 4 live events in user's home parish, not passed
- "See All" link to browse filtered by parish

#### Happening This Week
- Events within next 7 days (Jamaica UTC-5 timezone), not featured, not passed
- Up to 6 events
- Jamaica time calculation: `Date.now() - 5 * 60 * 60 * 1000`

### Data & Logic
- **Database:** `events` table (RLS: live events only for guests; live + own for authenticated users)
- **Real-time:** Supabase channel `public:events` with INSERT/UPDATE/DELETE handlers
- **Pull to refresh:** `refreshEvents()` re-fetches from Supabase
- **Error banner:** Shown on network failure with retry button

### Business Rules
- Events marked `isEventPassed` are excluded from all sections except Trending (which checks dates itself)
- Jamaica timezone offset `-5h` used consistently throughout; `isToday()`, `isEventPassed()`, `isThisWeekend()` all use UTC-5 offset
- Event "passes" 7:00 AM Jamaica time the day after (handles late-night events)

---

## 5. Browse Screen

**Route:** `app/(tabs)/browse.tsx`

### Three Modes (tab strip)
1. **Parish** — grid of 14 parishes with cover images and event counts
2. **Category** — 3-column grid of 12 event type tiles with count
3. **Filter/Search** — full text search + filter strips + results list

### URL Parameters (deep-linkable)
- `parish` — pre-selects parish filter, auto-switches to Filter mode
- `type` — pre-selects type filter, auto-switches to Filter mode
- `dateFilter` — `'today'` | `'weekend'` — pre-sets date chip

### Parish Grid
- Each parish shows: local image, name, event count badge
- Tapping selects parish and switches to Filter mode

### Category Grid
- Each type shows: icon, label, color, event count
- Tapping selects type and switches to Filter mode

### Filter Mode

#### Filter Strip (collapsible)
- Toggle bar shows active filters as chips when collapsed
- Expanded: date chips (All / Today / This Weekend), parish strip, type strip
- Active filter count badge on toggle bar button

#### Date Filters
- **All Dates** — no date constraint
- **Today** — `isToday(e.date)` (Jamaica timezone)
- **This Weekend** — `isThisWeekend(e.date)` (upcoming Saturday + Sunday Jamaica)
- Only shown when `timeScope === 'upcoming'`

#### Upcoming / Past Toggle
- **Upcoming** — events where `!isEventPassed(date)`
- **Past Events** — events where `isEventPassed(date)`
- Date filter reset when switching between scopes

#### Search
- Matches against: title, venue, address, promoterName, parish (case-insensitive)

#### Boosted Events Rail
- Horizontal scroll of active boosted events above results list
- `BoostedCard` (200×130): cover image + "Boosted" badge, title, parish, price

#### Results List
- Sorted by `compareBrowse`: boost score → tier → engagement → date
- `EventCard` with `variant="row"` (horizontal layout)
- Ad injection: `PlacementAd placementName="Browse Results"` every 5 items

#### Auth Prompt Modal
- Shown when unauthenticated user tries to RSVP (toggle returns `false`)
- Bottom sheet with "Sign In / Register" CTA

### Event Counts
- `parishCounts` — computed from filtered events; recomputed on EventsContext updates
- `typeCounts` — computed from `eventTypes` array; supports multi-type events

### Business Rules
- Filters AND search are combined with AND logic
- Parish filters use exact match; type filters check both `type` and `eventTypes[]`
- Sorting is applied AFTER filtering; boosted events always appear first in results list

---

## 6. Map Screen

**Route:** `app/(tabs)/map.tsx`

### Map Implementation
- **Native (iOS/Android):** `react-native-maps` `MapView` with `PROVIDER_GOOGLE` on Android
- **Web:** `JamaicaMap.web.tsx` — custom parish grid (SVG/View-based fallback)
- **Map Style:** Dark Jamaica-themed custom style (green vegetation, dark water, gold roads)
- **Initial Region:** Jamaica center `{latitude: 18.1096, longitude: -77.2975, latitudeDelta: 1.05, longitudeDelta: 1.80}`

### Custom Pin Component
- Active parishes (count > 0): gold pin with count number
- Selected parish: green pin (larger, glowing shadow)
- Inactive parishes: gray dot pin
- `tracksViewChanges={false}` for performance

### Parish Coordinates
14 parishes with exact lat/lon coordinates stored in `PARISH_COORDS` constant.

### Interactions
- Tap parish pin or chip → selects parish (or deselects if already selected)
- Selected parish → map animates to region (`latitudeDelta: 0.35, longitudeDelta: 0.55`), 600ms
- Deselect / "All Island" chip → map resets to island view, 600ms

### Date Filter (3 chips)
- All Dates / Today / This Weekend
- Resets selected parish on change
- Filters `parishCounts` and `selectedEvents`

### Parish Chip Strip (fixed height 52)
- "All Island" chip + active parishes with event count badges
- Fixed height prevents reflow when a chip is selected

### Bottom Scroll Content
**Island Overview (no parish selected):**
- `PlacementAd placementName="Map Screen"`
- 3-stat row: Filtered Events, Active Parishes, Going count
- Parish list with thumbnail, name, top event title, event count badge
- Skeleton rows during loading (animated opacity pulse)

**Parish Detail (parish selected):**
- Parish name, event count, "Browse All" link
- `EventPreviewCard` list (date, venue, price, heat count)
- Empty state if no events

### Real-time Indicator
- Pulsing green dot in header subtitle
- `parishCounts` recomputes whenever EventsContext updates (real-time)

### Privacy
- No user location requested or accessed
- Location permissions architecturally blocked in `app.json`

---

## 7. Event Detail Screen

**Route:** `app/event/[id].tsx`

### Hero Gallery (`FlyerGallery` component)
- Single image: fullscreen tap → lightbox
- Multiple images: horizontal `FlatList` with `pagingEnabled`, dots indicator, counter badge
- Tap to expand hint overlay
- `ImageLightbox` modal for full-res viewing
- Images loaded via `getFullUrl()` (1600px variant) with `cachePolicy="memory-disk"` and `priority="high"`

### HUD (overlaid on gallery)
- Back button (or go to tabs if no history)
- Bookmark toggle (star outline / filled gold)
- Share button

### Hero Title Overlay (bottom of gallery)
- Featured badge (star)
- Type badge (color-coded)
- Event title (3 lines max)
- Boost badge (if active boost)
- Parish + recurring indicator

### Attendee Count Strip
- Going count (green check icon)
- Interested count (gold star icon)
- View count (visibility icon)

### RSVP Buttons (2-up row)
- **Going:** green gradient when active; tapping schedules 2-hour local reminder
- **Interested:** gold gradient when active
- Mutual exclusion enforced (can only be one or the other)
- Unauthenticated user → `AuthPromptModal`
- Counts shown below label text

### Action Row
- **My Ticket** (shown when Going + paid event): opens `QRTicketModal`
- **Squad Up** → navigates to `/squad/{eventId}` (purple accent)

### Details Card
- Date & Time (formatted, with start→end times, recurring pill if applicable)
- Venue (with address and parish)
- Tickets (price or "Free Entry"; "Get Tickets" button if `ticketLink` set)
- Age Restriction (red, only shown if not "All Ages")
- Dress Code (shown if set)

### Weather Widget
- Only for outdoor event types (beach, carnival, community, sporting, party, all-inclusive, dancehall, culture)
- Shows: condition, temp C/F, UV index, humidity, rain chance, advice text
- Simulated forecast based on parish + month (deterministic algorithm)
- Disclaimer: "Simulated forecast based on typical {parish} weather patterns"

### Map Section (`MapSection` component)
- Stylized map illustration (not real map) with pin, address overlay
- Tapping opens native Maps app or Google Maps with venue+parish query
- "Open Map" CTA button

### Category & Tags
- All event types as color-coded pills (first marked as primary with ★)
- Tags as `#hashtag` chips

### About This Event
- Full description text

### Ad Placement
- `PlacementAd placementName="Event Details"`

### Lineup Section
- Grouped by role (DJ, MC, Host, etc.)
- Role normalization: `ROLE_DISPLAY['Speaker'] = 'Sound System'` (legacy data fix)
- Role icons: DJ → queue-music, MC → record-voice-over, Host → mic-external-on, Band → groups, Sound System → speaker, others → mic
- Supports both `lineupEntries` structured format and legacy `"Role: Name"` strings

### Event Photos Link
- Shown if `eventPhotosLink` is set
- Opens in browser; CTA "View"

### Promoter Card
- Avatar letter, name, verified badge (if tier === 'pro' or 'elite')
- Taps to `/promoter/{promoterId}`

### Share Row + Get Tickets
- Share: iOS → native share sheet; Android/web → custom `ShareModal`
- Share content: title, date, venue, parish, "Discover on Vybz Hub!"
- Share options: Copy Details, SMS, WhatsApp, More
- Get Tickets → opens `ticketLink` in browser

### Related Events (horizontal scroll)
- Up to 8 events matching same parish OR same promoter, not passed
- `RelatedCard` (180px wide, thumbnail + meta)

### QR Ticket Modal
- Deterministic visual QR grid (not a real scannable code)
- Ticket ID: `YV-{eventId[:6]}-{userId[-4:]}`
- Event info panel, perforated divider, "Valid Entry" badge
- Display only (not real ticketing)

### View Count
- `supabase.rpc('increment_view_count', { p_event_id: id })` called on mount (fire-and-forget)

---

## 8. RSVP System

### Feature: Going / Interested / Bookmark
- **Tables:** `user_rsvps` with `status` = `'going' | 'interested' | 'bookmarked'`
- **Unique constraint:** `(user_id, event_id, status)`
- **Authentication required:** Returns `false` if no user; caller shows auth prompt

### Going Toggle Logic
1. Check `processingRef` — 400ms debounce per event (prevents double-tap duplicate calls)
2. If `wasInterested` and switching to Going → delete interested row, decrement `interestedCount`
3. Toggle going in local state immediately (optimistic)
4. Adjust `goingCount` (±1), adjust `interestedCount` (-1 if switching)
5. `supabase.from('user_rsvps').upsert/delete` async (fire-and-forget)
6. Real-time subscription settles DB trigger's count updates

### Interested Toggle Logic
- Mirror of Going toggle with mutual exclusion in reverse

### Bookmark Toggle Logic
- Independent of Going/Interested (no mutual exclusion)
- No count adjustment on events table
- Used for "Saved" events in profile

### Counts
- `going_count` and `interested_count` maintained by `sync_event_rsvp_counts` DB trigger
- Optimistic local adjustments reconciled by real-time Postgres changes

### Loading RSVPs from Supabase
- Loaded after sign-in via `loadRsvpsFromSupabase(userId)`
- Separate arrays: `userGoingIds`, `userInterestedIds`, `userBookmarkIds`

### Event Reminders
- Scheduling: When user marks "Going", `scheduleEventReminder(eventId, title, date, startTime)` triggers a local `expo-notifications` scheduled notification 2 hours before event start (Jamaica timezone)
- Cancellation: When user removes "Going", `cancelEventReminder(eventId)` cancels the scheduled notification
- Stored in `@vybzhub_reminder_ids` AsyncStorage

---

## 9. Event Creation (Post)

**Route:** `app/(tabs)/post.tsx`

### Gates (checked in order)
1. **Not signed in** → "Sign In Required" screen
2. **Free plan 3-event limit** → "Monthly Limit Reached" screen with upgrade CTA (counts events in current calendar month with non-rejected status)
3. **Not a promoter** → "Become a Promoter" screen with benefit list and activate button

### 7-Step Wizard

#### Step 0: Basic Info
- **Event Name** (required)
- **Description** (optional, multiline)
- **Date** (custom `DatePickerModal` — month calendar with day grid)
- **Start Time** / **End Time** (custom `TimePickerModal` — hour/minute/AM-PM scroll pickers)

#### Step 1: Location
- **Parish** (dropdown from dynamic parish list)
- **Venue/Location Name** (required)
- **Street Address** (optional)

#### Step 2: Category
- **Event Types** (multi-select grid of 12 types, first = primary)
- **Recurring Toggle** (weekly/bi-weekly/monthly frequency selector)

#### Step 3: Flyer Images
- **Upload from Device** (permission requested at tap time; multi-select up to 5 minus current; calls `ImagePicker.launchImageLibraryAsync`)
- **Gallery Picker** (15 preset Unsplash images with labels)
- **Custom URL** input
- First image = cover image
- Preview row with "Cover" badge, remove buttons

#### Step 4: Pricing & Details
- **Free Entry toggle** (green switch)
- **Ticket Price** text input (shown when not free)
- **Age Restriction** (All Ages / 18+ / 21+ button group)
- **Dress Code** text input
- **Lineup:** Role chip selector + name input + add button → structured `lineupEntries` array `[{name, role}]`
  - Roles: DJ, Artist, MC, Host, Band, Live Act, Comedian, Sound System, Other

#### Step 5: Contact
- **Ticket / Purchase Link** (URL)
- **Contact Information** (phone, WhatsApp, Instagram handle)
- **Event Photos Link** (URL for post-event gallery)

#### Step 6: Review & Publish
- Cover image hero with edit overlay
- Collapsible review sections for each step
- Upload progress banner (compressing/uploading/done per image with before/after sizes)
- Upload error banner with dismiss
- Publish note

### Submit Flow
1. Guard against duplicate submit via `isSubmittingRef`
2. Upload device images via `uploadEventImages()` — throws on failure
3. If upload fails: set `uploadError` state, abort (don't call `postEvent`)
4. Call `postEvent(eventData, initialStatus)` — `initialStatus = 'pending'` if `requireEventApproval`, else `'live'`
5. Add in-app notification ("Event Published!" or "Submitted for Review")
6. If live: call `notifyParishUsersNewEvent()` (non-blocking)
7. If live and user: call `notifyFollowersNewEvent()` (non-blocking)
8. Show success screen

### Success Screen
- Check/hourglass icon (based on moderation setting)
- Ad placement: `PlacementAd placementName="Post-Event Confirmation"`
- "Manage My Events" CTA + "Post Another Event" link

### Validation
- Step 0 requires title + date
- Step 1 requires parish + venue
- Step 2 requires at least one event type
- Steps 3-6 are optional (always valid)
- "Next" button disabled if current step invalid

### Step Reset on Tab Focus
- `useFocusEffect` resets form if `success === true` (prevents stale success state on re-visit)

---

## 10. Edit Event

**Route:** `app/edit-event/[id].tsx`

### Gates
- Event not found → error screen
- `event.promoterId !== user?.id` → "You can only edit your own events" screen (no admin bypass here)

### Fields (same as Post form, pre-populated)
- All fields from creation form
- Images: existing images pre-loaded; can add more or switch cover image
- Lineup: parses both `lineupEntries` structured format and legacy `"Role: Name"` strings

### Change Detection
- Detects meaningful date/time/venue changes
- If RSVPd user made these changes → local notification to self
- Fires `notifyRsvpUsersEventChange(eventId, data)` (non-blocking Edge Function call) to all RSVP'd users

### Delete
- Confirmation alert
- Fires `notifyRsvpUsersEventCancelled()` (non-blocking)
- Calls `deleteEvent(id)` → navigates to `/my-events`

### Image Upload
- Same 3-variant pipeline as creation
- Upload error displayed; `editEvent` NOT called if upload fails

---

## 11. My Events

**Route:** `app/my-events.tsx`

### Filter Tabs
- All / Upcoming / Past (by local date comparison)

### Event Card
- Cover image (160px height), status badge (Upcoming/Past), image count badge
- Type pill, recurring pill, title, date, parish
- Going + interested counts, price pill
- Action buttons: **Edit** → `edit-event/[id]`, **Boost** or **Stats** (conditional), **Delete**

### Boost/Stats Button
- If `event.boosted === true` → "Stats" (cyan) → `/monetization/boost-performance/{id}`
- If `canPurchaseDigitalFeatures && !boosted` → "Boost" → `/monetization/boost/{id}`
- Hidden on iOS per App Store guidelines (iOS `canPurchaseDigitalFeatures = false`)

### Delete
- Native alert on iOS/Android; custom Modal on web
- Fires `notifyRsvpUsersEventCancelled()` (non-blocking)
- Calls `deleteEvent(id)` optimistically

---

## 12. Promoter Profile

**Route:** `app/promoter/[id].tsx`

### Header
- Hero background (blur from first event cover image or gold gradient fallback)
- Avatar (letter, gradient, verified badge overlay)
- Name + "Verified Promoter" tag (if `promoterTier === 'pro' || 'elite'`)
- Follow button (green when following, gold when not)
- "Event Promoter" role tag

### Stats Row (4 stats)
- Events count, Upcoming count, Followers count (from `MOCK_PROMOTER_SOCIALS`), Total Hype (going + interested across all events)

### About Section
- Bio text (from `MOCK_PROMOTER_SOCIALS` or default)

### Social Links (conditional)
- Instagram, Facebook, Twitter/X, TikTok, Website
- Each opens URL in browser

### Events Section (tabbed: Upcoming / Past)
- `EventMiniCard` list with passed events styled with 65% opacity + "Passed" overlay

### Follow Logic
- `toggleFollow(promoterId)` writes to both `user_profiles.followedPromoters[]` AND `follows` table (dual-write for server-side fan-out queries)
- On follow: in-app notifications for promoter + up to 3 upcoming events from that promoter
- Auth required to follow

### Verified Status Derivation
- `promoterTier` is denormalized onto every event row by Stripe webhook
- Derived from first event's `promoterTier` field (no extra DB query)

---

## 13. Profile Screen

**Route:** `app/(tabs)/profile.tsx`

### Guest View
- Avatar placeholder, "Join Vybz Hub" title, description, "Sign In / Register" CTA

### Top Bar
- "Profile" title, notification bell with unread badge, sign out button

### Profile Card
- **Avatar:** Pressable (taps opens image picker for upload)
  - Shows `user.avatarUrl` if set (stored in `profile-images` bucket)
  - Fallback: letter avatar on gold background
  - Camera badge (bottom-right): spinner during upload, camera icon otherwise
- **Name:** Inline editable (tap pencil → TextInput → save with check button)
- **Contact:** email or phone
- **Role badges:** Attendee (green), Promoter (gold), subscription tier badge (Pro/Elite with plan color)
- **4-stat row:** Going / Interested / Saved / Posted counts; tapping switches activity tab

### Info Card
- Home Parish (read-only)
- Preferred Parishes (editable via `ParishModal` bottom sheet)
  - Multi-select chips, "Save", "Clear All"
  - Shows up to 5 chips + "+N more" overflow
- Event Interests (read-only, colored chips with icons)

### Promoter / Become Promoter Card
- Promoters: "My Events" card → `/my-events`
- Non-promoters: "Become a Promoter" card → `addPromoterRole()`

### Subscription Status Card (paid users only, hidden on iOS)
- Plan name, verified badge, status (active/trialing/past_due/canceled)
- Boost credits row (remaining / monthly allowance)
- Renewal date
- Past-due warning
- "Manage Billing & Subscription" → Customer Portal
- "Plans" → `/monetization/upgrade`

### Upgrade CTA (free promoters, hidden on iOS)
- "Upgrade to Pro" card → `/monetization/upgrade`

### Admin Panel Card (admin users only)
- "Admin Panel" → `/admin`

### Support Card
- "Contact Support" → mailto link to `info@vybzhub.com`

### Notification Settings Card
- Summary of email notification count
- Push token status (registered/denied/failed)
- Retry button (denied/failed only)
- Tap → `/notification-settings`

### Language Toggle
- English (🇧🇧) / Patois (🇯🇲)
- Persisted via `LanguageContext`

### Member Since
- Formatted join date

### Delete Account
- "Delete Account" red button (or pending banner if request submitted)
- On tap: checks for existing pending request; if none, confirmation alert with disclaimer
- On confirm: inserts into `account_deletion_requests`; shows "Request Submitted" alert

### Activity Section (tabbed)
- **Going tab:** Upcoming / Past sub-tabs; EventCard list
- **Interested tab:** Upcoming / Past sub-tabs; EventCard list
- **Saved tab:** `SavedEventRow` list (image + title + meta + unsave button)
- **Posted tab:** EventCard compact list + edit badge + stats badge; "Manage All Events" link

### Avatar Upload Flow
1. On tap: `ImagePicker.requestMediaLibraryPermissionsAsync()` — requested at tap, not on mount
2. `launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1] })`
3. `uploadProfilePhoto(uri, userId)` → compress to 512px → upload to `profile-images/{userId}/avatar_{ts}.jpg`
4. `updateProfile({ avatarUrl: publicUrl })`
5. Spinner shown during upload

---

## 14. Notifications System

**Route:** `app/notifications.tsx`  
**Context:** `contexts/NotificationsContext.tsx`

### Notification Types
| Type | Icon | Color | Description |
|---|---|---|---|
| `new_event_parish` | place | #00BCD4 | New event in preferred parish |
| `new_event_promoter` | campaign | #FF9800 | New event from followed promoter |
| `event_reminder` | alarm | gold | 2-hour event reminder |
| `event_change` | edit-calendar | #9C27B0 | Event updated |
| `event_cancelled` | event-busy | #F44336 | Event cancelled |
| `event_approved` | check-circle | greenLight | Admin approved event |
| `event_rejected` | cancel | #FF6B6B | Admin rejected event |
| `new_follower` | person-add | gold | Someone followed |

### Storage
- **Local:** `@vybzhub_notifications` AsyncStorage (max 100 entries)
- **Remote:** `notifications` table in Supabase (synced for authenticated users)
- On sign-in: loads from Supabase and replaces local state

### Notification Row
- Unread: gold border, gold surface background, gold unread dot
- Type icon in colored circle
- Title (bold when unread), body, time ago string
- Dismiss button (×)
- Tap → navigates to `eventId` or `promoterId` if present; marks read

### Filtering
- All (with count) / Unread (with count) toggle tabs
- Badge count on app icon (updated via `setBadgeCountAsync`)
- "Mark all read" button (shown when unread > 0)
- "Clear all" button (shown when any notifications)

### On Focus
- `useFocusEffect` → `setBadgeCountAsync(0)` + `markAllRead()`

### Adding Notifications
- `addNotification()` creates local record + fires Supabase insert (non-blocking)
- IDs starting with `notif_` are local-only; UUID format = DB records

### Foreground Push Handler
- `ExpoNotifications.addNotificationReceivedListener` → calls `addNotification()` with push content

---

## 15. Notification Settings

**Route:** `app/notification-settings.tsx`

### Preference Categories

#### Email Notifications (4 preferences)
| Key | Label | Stored In |
|---|---|---|
| `emailNotifNewParish` | New Events in My Parishes | `user_profiles.email_notif_new_parish` |
| `emailNotifNewPromoter` | Events from Followed Promoters | `user_profiles.email_notif_new_promoter` |
| `emailNotifEventChange` | Event Changes & Cancellations | `user_profiles.email_notif_event_change` |
| `emailNotifEventReminder` | Event Day Reminders | `user_profiles.email_notif_event_reminder` |

#### Push Notifications (3 preferences)
| Key | Label | Stored In |
|---|---|---|
| `pushNotifNewParish` | New Events in My Parishes | `user_profiles.push_notif_new_parish` |
| `pushNotifNewPromoter` | Events from Followed Promoters | `user_profiles.push_notif_new_promoter` |
| `pushNotifEventChange` | Event Changes & Cancellations | `user_profiles.push_notif_event_change` |

### UI
- Summary pill ("7 of 7 enabled" / "All muted" / "N of 7 enabled")
- `SectionCard` per group with `ToggleRow` components
- Each toggle saves immediately to DB with `updateProfile()`; optimistic update with revert on failure
- "Saved" toast (1.8s) on successful save
- "Mute Email / Email All" bulk toggle in header
- Notes: push requires physical device; email sent to `user.email`

---

## 16. Squad Up

**Route:** `app/squad/[eventId].tsx`

### Feature
- Social coordination feature for attending events with friends
- **Not a real social graph** — friends list is empty state (coming soon)
- Invite crew via native `Share.share()` with event details

### Sections
- Event card (hero image, title, date, venue, parish)
- Stats row: Going count, Interested count, Total
- "Invite Your Crew" card → opens share sheet
- "Your Squad" section (shows current user if Going)
- "Friends Going" section → empty state with invitation prompt
- Squad Chat teaser (purple, "Coming Soon" badge)
- "Invite Your Crew" CTA button

### Share Content
```
🇯🇲 Squad Up: {event.title}
📅 {date} · {startTime}
📍 {venue}, {parish}
{user.name} wants you to come through! Open Vybz Hub to RSVP.
```

---

## 17. Subscriptions (Upgrade)

**Route:** `app/monetization/upgrade.tsx`

### iOS Gate
- Immediately redirects to `/(tabs)/profile` on iOS (`canPurchaseDigitalFeatures = false`)
- Server-side iOS check in `create-subscription-checkout` Edge Function

### Plans

| Plan | Monthly | Yearly | Boost Credits | Featured Priority |
|---|---|---|---|---|
| Free | $0 | $0 | 0 | 0 |
| Promoter Pro | $9.99/mo | $89.99/yr (~$7.50/mo) | 1/month | 1 |
| Elite | $24.99/mo | $224.99/yr (~$18.75/mo) | 5/month | 2 |

### Yearly Savings
- Pro: ~25% off
- Elite: ~25% off
- Savings badge shown on cards when yearly selected

### Plan Card
- Icon, name, highlight badge ("Most Popular" / "Best Value")
- Price per month (adjusts for yearly display)
- Yearly total shown below
- Feature list with check icons
- Coming Soon features (locked icon, grayed out)
- Radio selection indicator

### Manage Subscription Card (existing subscribers)
- Plan name, billing cycle, status (Active/Trialing/Past Due/Canceled)
- Renewal date
- "Manage Subscription" → Customer Portal session

### Checkout Flow
1. `createSubscriptionCheckout(plan, billingCycle)` Edge Function
2. If existing active subscription → returns `redirectToPortal: true` → opens portal
3. Otherwise → returns Stripe Checkout URL
4. `WebBrowser.openBrowserAsync(url)` with deep-link watching
5. On return: 3-second fallback refresh timer OR Linking listener fires first
6. `ProcessingBanner` shown during webhook processing
7. `refreshProfile()` + `fetchSubscription()` confirm updated plan

### Deep-link URLs
- Success: `onspaceapp://subscription-success?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `onspaceapp://subscription-cancel`
- Portal return: `onspaceapp://subscription-portal-return`

### Post-Checkout
- Webhook updates `subscriptions` + `user_profiles` tables
- `syncSubscriptionEntitlements()` applies `verified_promoter`, `monthly_boost_allowance`, `featured_priority`
- `promoter_tier` synced to all events by that user

---

## 18. Event Boost (Purchase)

**Route:** `app/monetization/boost/[id].tsx`

### iOS Gate
- Immediately redirects to `/(tabs)/profile` on iOS

### Boost Packages

| ID | Label | Duration | Price |
|---|---|---|---|
| `three_day` | 3-Day Boost | 72 hours | $1.99 |
| `seven_day` | 7-Day Boost | 7 days | $3.99 |
| `until_event_end` | Until Event Ends | Until event ends | $6.99 |

### Upgrade Pricing (active boost → upgrade)
| From | To seven_day | To until_event_end |
|---|---|---|
| three_day | $2.00 | $5.00 |
| seven_day | — | $3.00 |

### States
1. **No boost:** Shows all packages + benefits list
2. **Active boost (upgradeable):** Shows upgrade packages only + upgrade header
3. **Maximum boost (until_event_end active):** "Maximum Boost Active" card; no packages shown

### Event Preview
- Thumbnail, title, parish, date, heat count

### Active Boost Status Banner
- Type label, expiry date, impressions count

### Benefits List
- Featured at top of home feed
- Pinned to top of Browse results
- ⭐ Boosted badge on event card
- Real-time impression analytics

### Package Card
- Label, description, estimated impressions, price
- Popular/Best Exposure badges
- Perks list

### Checkout Flow
1. `supabase.functions.invoke('create-boost-checkout', { event_id, boost_type, platform })`
2. Returns `{ url, session_id, amount, is_upgrade }`
3. `WebBrowser.openAuthSessionAsync(url, 'onspaceapp://')`
4. On success URL containing `boost-success`: `refreshEvents()` → shows success screen
5. Stripe webhook activates boost (never from client)

### Success Screen
- Stats: Est. Views, Duration, Reach ("Island-wide")

### Pro Upsell
- Free plan promoters shown "Get free boosts with Pro" card → `/monetization/upgrade`

---

## 19. Boost Performance Analytics

**Route:** `app/monetization/boost-performance/[id].tsx`

### Data Source
- Direct Supabase query to `events` table (selecting boost + engagement fields)
- Pull-to-refresh

### Sections

#### Hero Card
- Event cover image, boost status badge (Active / Boost Inactive)
- Title, parish, date overlay

#### Boost Meta Strip
- Boost Type, Spend amount (or "Complimentary"), Status

#### Reach Stats (3 cards)
- Page Views, Impressions (from `boost_impressions`), CTR

#### CTR Calculation
- `CTR = (totalRSVPs / boostImpressions) * 100`
- Quality labels: Excellent (≥5%), Good (≥2%), Building (>0%)

#### Engagement Stats (3 cards)
- Going, Interested, Total RSVPs

#### RSVP Breakdown Bar
- Visual bar chart: Going % vs Interested %

#### CTR Context Card
- Large CTR value with color (green/gold/muted), description

#### Boost Timeline
- Progress track from start date to expiry/event end
- Moving dot indicator
- Day/date labels
- Days remaining pill (or "Boost expired")

#### Performance Tips (5 tips)
- Image quality, description, ticket link, social sharing, post timing

#### CTAs
- View Event (outline)
- Upgrade Boost / Boost Again (gold gradient) — hidden on iOS

---

## 20. Admin Panel

**Route:** `app/admin/index.tsx`

### Access Control
- Checks `user?.roles.includes('admin')` 
- Gate screen shown if not admin
- Note in gate: "Admin access must be granted via Supabase Dashboard" (DB trigger prevents self-assignment)

### Tab Navigation (8 tabs with badges)
- **Queue** (pending count badge)
- **Flagged** (flagged count badge)
- **Analytics**
- **Categories**
- **Settings**
- **Ads**
- **Boosts**
- **Deletions** (pending deletions count badge)

---

### Tab: Queue
- Moderation status banner (ON = pending review / OFF = auto-publish)
- List of `getPendingEvents()` as `QueueRow` components
- Each row: thumbnail, title, promoter name, parish, date, flag reason
- Actions: ✓ Approve (green) / ✗ Reject (red, opens `RejectModal`)
- Empty state: "Queue is Clear"

### Tab: Flagged
- List of `getFlaggedEvents()` as `QueueRow` components
- Actions: Unflag (green) / Remove (red → rejects with reason "Removed by admin")
- Empty state: "No Flagged Events"

### Tab: Analytics

#### Subscription Analytics
- Fetches `subscriptions` table (plan + status)
- Stats: Pro Active (+ estimated MRR), Elite Active (+ estimated MRR), Est. Total MRR, Past Due count, Canceled count
- Tier distribution bar (Pro/Elite breakdown)

#### Overview Stats
- Live Events count, Going total, Interested total, Flagged count

#### Events by Parish (bar chart, top 8)
- Bar width = % of max count
- Gold = first; green = others

#### Events by Type (bar chart, top 6)
- Colored by type color

### Tab: Categories

#### Parishes
- Editable list of parishes with "Add" button
- Each chip: delete button
- Add Parish inline input with save/cancel

#### Event Types
- Editable list with icon, label, color dot, edit/delete buttons
- `TypeFormModal`: label input + icon picker (24 icons) + color picker (16 colors) + live preview
- Edit or add new

#### Reset to Defaults
- Destructive: removes all custom entries, deletes from `admin_settings`

### Tab: Settings

#### Email System
- **Test Email Delivery** → `sendTestEmail()` → Edge Function send-email
- **Test SMTP Handshake** → `testSmtpConnection()` → probes TCP→EHLO→STARTTLS→AUTH, returns per-phase timing
  - Phase breakdown table: TCP, Banner, EHLO, TLS, AUTH (ms each)
  - Color-coded total: <3s green, 3-8s orange, ≥8s red
  - Warning if approaching 10s Supabase Auth deadline

#### Push Notifications
- **Test Push** → `sendTestPush()` → sends to current admin's devices
- Per-device FCM result cards: status (sent/stale/error), HTTP status, FCM message name, error code
- Token type summary row (id prefix, token_type)

#### Moderation Settings
- **Require Event Approval** toggle (persisted to `admin_settings` globally)
- Workflow explanation (3-step with current mode)

### Tab: Ads

#### Placement List
- Each row: size icon, name, ad count, Live/Off toggle pill, chevron
- Tap → `/admin/ads/{placementId}`
- "New" button → `NewPlacementModal` (name + size: rectangle/square)

### Tab: Boosts

#### Overview Stats
- Active boost count, Total revenue (from `boost_purchases.amount` / 100), Purchase count

#### Active Boosts List
- Each: thumbnail, boost type pill, expiry, view/remove buttons
- **Grant Complimentary Boost** button → `GrantBoostModal`
  - Search event by title, select boost type (3-day/7-day/until event end)
  - Calls `boostEvent(eventId, boostType)` + synthetic `boost_purchases` insert

#### Purchase History (top 25)
- Session ID suffix, boost type, date, amount, status badge

### Tab: Deletions
- **Info banner:** permanent deletion warning
- Each request row: user letter avatar (red), name, email, reason, date
- Actions: **Approve** (destructive → calls `delete-account` Edge Function) / **Reject** (update status to 'rejected' inline)
- Refresh button

### Reject Modal
- Optional reason text input
- Cancel / Reject buttons

---

## 21. Advertisements System

### PlacementAd Component (`components/ui/PlacementAd.tsx`)
- **Props:** `placementName`, `style`
- **Behavior:**
  - Fetches placement + active ads via `fetchActiveAdsByPlacementName()`
  - Renders nothing if placement disabled or no active ads
  - Rotates through multiple ads every 10 seconds (`setInterval`)
  - Shows "Ad" badge, rotation dots (when 2+ ads)
  - Tapping opens `target_url` in browser (display-only if no URL)
- **Sizes:**
  - `rectangle` — 80px height, full width
  - `square` — full width, 1:1 aspect ratio

### Placement Locations
| Placement Name | Location |
|---|---|
| Home Feed | Home screen between Featured and Trending |
| Browse Results | Browse grid header + every 5 items in results list |
| Map Screen | Map screen island overview section |
| Event Details | Event detail body |
| Post-Event Confirmation | Post success screen |

### Ad Placement Detail Screen (`app/admin/ads/[placementId].tsx`)
- Placement info card (size, enabled/disabled)
- FlatList of ads with reorder controls (↑/↓), pause/play, delete
- "Add New Ad" → `AddEditModal` with image picker or URL paste
- Image upload via `uploadAdImage()` → `ad-images` bucket
- Sort order updated via `updateAdSortOrder()` for all ads simultaneously on reorder
- "Active / Paused" pill per ad

---

## 22. Database Tables

### `user_profiles`
- **Purpose:** Extended user data linked 1:1 to `auth.users`
- **Key Columns:** `id`, `email`, `name`, `phone`, `home_parish`, `preferred_parishes[]`, `interests[]`, `roles[]`, `subscription_tier`, `verified_promoter`, `remaining_boosts`, `monthly_boost_allowance`, `subscription_status`, `current_period_end`, `stripe_customer_id`, `followed_promoters[]`, `avatar_url`, `email_notif_*` (4 booleans), `push_notif_*` (3 booleans), `featured_priority`, `require_event_approval`
- **RLS:** Authenticated users read/write own row only
- **Triggers:** `set_user_profiles_updated_at`, `enforce_admin_role_assignment` (prevents self-assigning admin)
- **Created by:** `on_auth_user_created` trigger from `handle_new_user()` function

### `events`
- **Purpose:** All event listings
- **Key Columns:** `id`, `title`, `description`, `type`, `type_label`, `event_types[]`, `parish`, `date`, `start_time`, `end_time`, `venue`, `address`, `cover_image`, `flyer_images[]`, `ticket_price`, `ticket_link`, `dress_code`, `age_limit`, `lineup[]`, `lineup_entries` (jsonb), `recurring`, `recurring_frequency`, `promoter_id`, `promoter_name`, `going_count`, `interested_count`, `view_count`, `featured`, `tags[]`, `status` (`pending|live|rejected|flagged`), `flag_reason`, `rejected_reason`, `report_count`, `event_photos_link`, `contact_info`, `boosted`, `boost_type`, `boost_status`, `boost_started_at`, `boost_expires_at`, `boost_impressions`, `boost_payment_intent`, `boost_checkout_session`, `boost_amount`, `boost_currency`, `promoter_tier`, `created_at`, `updated_at`, `selling_tickets_in_app`, `ticket_commission_pct`, `tickets_sold`
- **RLS:** Anon: live only. Authenticated: live + own all statuses. Admin: all
- **Triggers:** `set_events_updated_at`, `protect_boost_fields_trigger` (prevents unauthorized boost field writes), `sync_event_rsvp_counts` (via `user_rsvps`)
- **Functions:** `increment_view_count`, `increment_event_view`, `expire_stale_boosts`
- **Indices:** `events_active_boost_idx`

### `user_rsvps`
- **Purpose:** User RSVP tracking (going/interested/bookmarked)
- **Key Columns:** `id`, `user_id`, `event_id`, `status` (`going|interested|bookmarked`), `created_at`
- **Unique Constraint:** `(user_id, event_id, status)`
- **RLS:** Authenticated users read/write/delete own rows
- **Triggers:** `sync_event_rsvp_counts` (UPDATE on `events.going_count`/`interested_count`)
- **Cascade:** `ON DELETE CASCADE` from both `auth.users` and `events`

### `notifications`
- **Purpose:** In-app notification records
- **Key Columns:** `id`, `user_id`, `type`, `title`, `body`, `event_id`, `read`, `created_at`
- **RLS:** Authenticated users CRUD own notifications; admin SELECT all
- **Indices:** `notifications_user_id_created_idx`
- **Cascade:** `ON DELETE SET NULL` on event_id; `ON DELETE CASCADE` on user_id

### `follows`
- **Purpose:** Dedicated follow relationships (dual-write with `user_profiles.followed_promoters`)
- **Key Columns:** `id`, `follower_id`, `promoter_id`, `created_at`
- **Unique Constraint:** `(follower_id, promoter_id)`
- **RLS:** Anon + authenticated SELECT all; authenticated INSERT/DELETE own

### `subscriptions`
- **Purpose:** Stripe subscription records (written by webhook only)
- **Key Columns:** `id`, `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `plan`, `billing_cycle`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `created_at`, `updated_at`
- **Unique Constraint:** `stripe_subscription_id`
- **RLS:** Authenticated read own; admin read all

### `boost_purchases`
- **Purpose:** Boost payment audit trail
- **Key Columns:** `id`, `event_id`, `promoter_id`, `stripe_payment_intent`, `stripe_checkout_session`, `stripe_customer_id`, `boost_type`, `amount`, `currency`, `status`, `created_at`, `completed_at`
- **RLS:** Admin INSERT + SELECT all; authenticated SELECT own

### `admin_settings`
- **Purpose:** Global admin-configurable settings (key-value store)
- **Key Columns:** `key`, `value` (jsonb), `updated_by`, `updated_at`
- **RLS:** Anon + authenticated SELECT (public); admin INSERT/UPDATE/DELETE
- **Active Keys:** `require_event_approval`, `custom_parishes`, `custom_event_types`

### `ad_placements`
- **Purpose:** Named ad placement slots in the app
- **Key Columns:** `id`, `name`, `size` (`rectangle|square`), `enabled`, `created_at`
- **Unique Constraint:** `name`
- **RLS:** Anon SELECT enabled only; admin full CRUD

### `ads`
- **Purpose:** Individual ad creatives linked to placements
- **Key Columns:** `id`, `placement_id`, `image_url`, `target_url`, `label`, `active`, `sort_order`, `created_at`
- **RLS:** Anon SELECT active; authenticated SELECT (active OR admin); admin full CRUD

### `account_deletion_requests`
- **Purpose:** User-submitted account deletion requests pending admin review
- **Key Columns:** `id`, `user_id`, `user_email`, `user_name`, `status` (`pending|approved|rejected`), `reason`, `created_at`, `reviewed_at`, `reviewed_by`
- **RLS:** Authenticated INSERT + SELECT own; admin SELECT + UPDATE all
- **Cascade:** `ON DELETE CASCADE` on `user_id`; `ON DELETE SET NULL` on `reviewed_by`

### `push_tokens`
- **Purpose:** Device push tokens for FCM (Android) and Expo (iOS)
- **Key Columns:** `id`, `user_id`, `token`, `device_info`, `created_at`, `updated_at`, `token_type` (`expo|fcm`), `platform`
- **Unique Constraint:** `(user_id, token)`
- **RLS:** Authenticated CRUD own tokens only

### `push_receipt_queue`
- **Purpose:** Expo push receipt IDs awaiting deferred check (15+ min)
- **Key Columns:** `id`, `receipt_id`, `token_db_id`, `sent_at`, `checked_at`
- **Cascade:** `ON DELETE CASCADE` on `token_db_id`
- **Indices:** `push_receipt_queue_pending_idx`

---

## 23. Edge Functions

### `send-email`
- **Purpose:** Sends transactional emails (Postal/SMTP) AND push notifications (FCM + Expo) in one pass
- **Authentication:** JWT required; validates via `supabaseAdmin.auth.getUser(token)`
- **Inputs (body):**
  - `type`: `new_event_parish | new_event_promoter | event_change | event_cancelled | rsvp_reminder | test_email`
  - `data`: `{ eventTitle, eventId, parish, date, startTime, venue, ticketPrice, promoterName, changeDetails }`
  - `parishForNewEvent`: bulk mode — notifies all users with matching home/preferred parish
  - `promoterIdForFollowerLookup`: bulk mode — notifies all followers
  - `eventIdForRsvpLookup`: bulk mode — notifies all RSVP'd users
  - `testPushOnly: true` — sends test push to admin's devices only
  - `testSmtpHandshake: true` — runs SMTP handshake probe
- **Email Transport Priority:** Postal API (`POSTAL_API_URL` + `POSTAL_API_KEY`) → SMTP relay (`SMTP_HOST/PORT/USER/PASS`)
- **Push (FCM/Android):** Direct FCM HTTP v1 via OAuth2 token exchange from `FCM_SERVICE_ACCOUNT_JSON`; caches token in module-level state; stale token cleanup (HTTP 404 + UNREGISTERED only)
- **Push (Expo/iOS):** Posts to `https://exp.host/--/api/v2/push/send`; queues receipt IDs into `push_receipt_queue`; calls `check-push-receipts` fire-and-forget
- **Preference Mapping:**
  - `new_event_parish` → `email_notif_new_parish` / `push_notif_new_parish`
  - `new_event_promoter` → `email_notif_new_promoter` / `push_notif_new_promoter`
  - `event_change` / `event_cancelled` → `email_notif_event_change` / `push_notif_event_change`
  - `rsvp_reminder` → `email_notif_event_reminder` (no push)
- **Exclusions:** Promoter posting an event excluded from parish/follower notifications

### `stripe-webhook`
- **Purpose:** Processes Stripe events; activates boosts; syncs subscription entitlements
- **Authentication:** Stripe signature verification (`webhooks.constructEventAsync`)
- **Handled Events:**
  - `checkout.session.completed` (mode=payment) → activate boost, mark `boost_purchases` completed
  - `checkout.session.completed` (mode=subscription) → activate subscription + entitlements
  - `customer.subscription.updated` → sync plan/status/entitlements
  - `customer.subscription.deleted` → downgrade to free, zero boost credits
  - `invoice.payment_succeeded` (billing_reason=subscription_cycle) → reset `remaining_boosts`
  - `invoice.payment_failed` → mark `past_due`
  - `charge.refunded` → expire boost if matching active session
- **Entitlements by Plan:**
  - free: `verified_promoter=false, monthly_boost_allowance=0, featured_priority=0`
  - pro: `verified_promoter=true, monthly_boost_allowance=1, featured_priority=1`
  - elite: `verified_promoter=true, monthly_boost_allowance=5, featured_priority=2`
- **Idempotency:** Duplicate boost delivery detection via `boost_purchases.status === 'completed'`
- **promoter_tier sync:** Updates all events by the user on any subscription change

### `create-boost-checkout`
- **Purpose:** Creates Stripe Checkout session for event boost
- **Authentication:** JWT required
- **iOS Gate:** Rejects `platform: 'ios'` requests with 403
- **Inputs:** `{ event_id, boost_type, platform }`
- **Ownership Check:** `events WHERE id=event_id AND promoter_id=user.id`
- **Server-side Prices:** Never trusts client prices; maps `boost_type` → cents
- **Upgrade Detection:** Checks active boost; calculates delta price from `UPGRADE_DELTA`
- **Pre-create:** Inserts `boost_purchases` row with placeholder session ID before Stripe call
- **Post-create:** Updates `boost_purchases` with real Stripe session ID
- **Cleanup:** Deletes orphaned pending row on Stripe failure
- **Redirect URLs:** `onspaceapp://boost-success` / `onspaceapp://boost-cancel`

### `create-subscription-checkout`
- **Purpose:** Creates Stripe Checkout session for subscriptions
- **Authentication:** JWT required
- **iOS Gate:** Rejects `platform: 'ios'` requests with 403
- **Inputs:** `{ plan, billing_cycle, platform }`
- **Customer Management:** Creates/looks-up Stripe customer; saves `stripe_customer_id` to `user_profiles`
- **Existing Subscription Check:** Returns `{ redirect_to_portal: true }` if active subscription exists
- **Price Resolution:** `STRIPE_PRICE_{PLAN}_{CYCLE}` environment secrets
- **Redirect URLs:** `onspaceapp://subscription-success` / `onspaceapp://subscription-cancel`

### `customer-portal`
- **Purpose:** Creates Stripe Customer Portal session
- **Authentication:** JWT required
- **Requires:** `user_profiles.stripe_customer_id` must exist (user must have subscribed)
- **Return URL:** `onspaceapp://subscription-portal-return`

### `delete-account`
- **Purpose:** Admin-initiated permanent account deletion
- **Authentication:** JWT required; caller must have `admin` role
- **Inputs:** `{ request_id }` (from `account_deletion_requests` table)
- **Process:**
  1. Verify caller is admin
  2. Fetch deletion request (must be `status = 'pending'`)
  3. `supabaseAdmin.auth.admin.deleteUser(target_user_id)` — cascades via FK
  4. Update request to `status = 'approved'`
- **Note:** Account submissions handled client-side; this function only handles approval

### `check-push-receipts`
- **Purpose:** Deferred Expo push receipt verification; removes stale tokens
- **Authentication:** Service-role (called internally from `send-email`)
- **Process:**
  1. Cleanup: delete checked queue entries >24h old
  2. Fetch unchecked entries ≥15 min old (max 300)
  3. POST to `https://exp.host/--/api/v2/push/getReceipts`
  4. Identify `DeviceNotRegistered` errors → delete `push_tokens` rows
  5. Mark all fetched entries as checked
- **Trigger:** Called fire-and-forget from `send-email` after each push batch

---

## 24. Storage Buckets

### `event-images` (public)
- **Purpose:** Event flyer and cover images
- **Max Size:** 10 MB
- **Allowed Types:** `image/jpeg, image/png, image/webp, image/gif`
- **Naming:** `{userId}/{pathPrefix}/{index}_{timestamp}_{variant}.jpg`
  - Variants: `_full.jpg` (1600px), `_card.jpg` (720px), `_thumb.jpg` (320px)
- **RLS:** Public SELECT; authenticated INSERT/DELETE to own folder (`storage.foldername(name)[1] = auth.uid()`)

### `profile-images` (public)
- **Purpose:** User profile photos
- **Max Size:** 5 MB
- **Allowed Types:** `image/jpeg, image/png, image/webp`
- **Naming:** `{userId}/avatar_{timestamp}.jpg` (timestamp for cache-busting)
- **RLS:** Public SELECT; authenticated INSERT/UPDATE/DELETE to own folder

### `ad-images` (public)
- **Purpose:** Ad creative images
- **Max Size:** 5 MB
- **Allowed Types:** `image/jpeg, image/png, image/webp`
- **Naming:** `ads/{userId}_{timestamp}_full.jpg`
- **RLS:** Public SELECT; admin INSERT/UPDATE/DELETE

---

## 25. Image Processing Pipeline

**Source:** `lib/storage.ts`

### 3-Variant Compression
Every local image upload creates 3 variants in parallel:
| Variant | Max Size | Quality | Usage |
|---|---|---|---|
| `_full.jpg` | 1600px long edge | 0.80 | Event detail hero/gallery |
| `_card.jpg` | 720px width | 0.78 | EventCard, EventCardFeatured |
| `_thumb.jpg` | 320px width | 0.75 | List cards, related cards |

### URL Helpers
```typescript
getThumbUrl(url)  // Replace _full.jpg → _thumb.jpg
getCardUrl(url)   // Replace _full.jpg → _card.jpg
getFullUrl(url)   // Normalize any variant → _full.jpg
```

### Process Per Image
1. Probe source dimensions via `manipulateAsync(uri, [], { compress: 1 })`
2. Compress 3 variants in parallel via `Promise.all`
3. Read all 3 into `ArrayBuffer` in parallel
4. Upload all 3 to Supabase Storage in parallel via `Promise.allSettled`
5. Return public URL of `_full` variant
6. Caller substitutes appropriate variant via URL helpers

### Mobile `readToBuffer`
- iOS/Android: `expo-file-system` + `FileSystem.readAsStringAsync(base64)` → `atob` → `Uint8Array`
- Web: `fetch(uri).then(r => r.arrayBuffer())`

### Profile Photo Upload
- Compress to max 512px square (not 3-variant)
- Quality: 0.82
- Uploads to `profile-images` bucket

### Ad Image Upload
- Single `_full` variant at 1600px / 0.80
- Uploads to `ad-images` bucket

### Progress Callbacks
- `ImageUploadProgress` type: `{ index, total, status, originalBytes, compressedBytes, originalDimensions, compressedDimensions }`
- Shown in Post form Step 6 during upload with progress bar

### EXIF Orientation
- `manipulateAsync` handles EXIF correction automatically

---

## 26. Push Notifications Architecture

### Token Types
| Platform | Token Type | Delivery Path |
|---|---|---|
| Android | `fcm` | Direct FCM HTTP v1 via `getFcmAccessToken()` |
| iOS | `expo` | Expo Push Service → APNs |

### Permission Flow
1. **Cold launch:** No permission requested
2. **After sign-in (first time only):** `NotificationPermissionModal` shown
3. User taps "Enable Notifications" → `requestAndRegisterPushNotifications(userId)` → OS prompt
4. **Subsequent sign-ins:** `checkAndSyncExistingPushPermission(userId)` — silent token refresh only
5. **Retry from profile:** `retryPushToken()` → `requestAndRegisterPushNotifications()` → if still denied, offers "Open Settings"

### FCM OAuth2
- `parseFcmServiceAccount()` reads `FCM_SERVICE_ACCOUNT_JSON` secret
- Module-level token cache with 5-minute buffer before expiry
- RS256 JWT signed with service account private key using Deno Web Crypto
- Exchange at `https://oauth2.googleapis.com/token`

### Stale Token Cleanup
- FCM: HTTP 404 + `UNREGISTERED` or `NOT_FOUND` → immediate delete from `push_tokens`
- Expo: `DeviceNotRegistered` at ticket level → immediate delete
- Expo: `DeviceNotRegistered` at receipt level (deferred via `check-push-receipts`) → delete

### Token Removal on Sign-out
- `removePushToken(userId)` called before `supabase.auth.signOut()`
- Non-blocking: `catch(() => {})` prevents sign-out blocking

### Local Notifications (Reminders)
- Scheduled via `ExpoNotifications.scheduleNotificationAsync` with `DATE` trigger
- 2 hours before event start time (Jamaica timezone calculation)
- Stored by eventId in `@vybzhub_reminder_ids` AsyncStorage
- Cancelled when user removes "Going" RSVP

### Notification Channel (Android)
- ID: `vybzhub`
- Importance: HIGH
- Vibration pattern: `[0, 250, 250, 250]`
- Light color: `#FFD700`

---

## 27. Email System

### Transport Priority
1. **Postal HTTP API** (`POSTAL_API_URL` + `POSTAL_API_KEY`) — primary
2. **SMTP relay** (`SMTP_HOST/PORT/USER/PASS`) — fallback via `denomailer`

### Email Types & Subjects
| Type | Subject Pattern |
|---|---|
| `new_event_parish` | "New event in {parish}: {title}" |
| `new_event_promoter` | "{promoterName} just posted: {title}" |
| `event_change` | "Event updated — {title}" |
| `event_cancelled` | "Cancelled: {title}" |
| `rsvp_reminder` | "Tonight: {title} 🎉" |
| `test_email` | "Vybz Hub — Email System Test" |

### HTML Templates (`emailTemplates.ts`)
- Dark Jamaica-themed (background `#0B1710`, gold `#FFC72C`, green `#0F6B37`)
- `shell()` wrapper with header (VYBZ HUB + "Jamaica's Event Scene"), body, footer
- `eventCard()` helper with date, time, venue, parish, price
- `ctaBtn()` helper with gold CTA button

### Notification Preferences
- Checked per-recipient at Edge Function level
- Parish bulk: reads `email_notif_new_parish`
- Follower bulk: reads `email_notif_new_promoter`
- RSVP bulk: reads preference column based on event type

### SMTP Probe Tool
- Full TCP → EHLO → STARTTLS → AUTH LOGIN handshake measurement
- Returns per-phase timing (tcpMs, bannerMs, ehloMs, tlsMs, authMs)
- 13-second timeout protection
- Purpose: detect when approaching Supabase Auth's 10s deadline for password reset emails

---

## 28. Ranking & Sorting Logic

**Source:** `constants/rankingUtils.ts`

### Boost Scores
| Boost Type | Score |
|---|---|
| `until_event_end` (active) | 3 |
| `seven_day` (not expired) | 2 |
| `three_day` (not expired) | 1 |
| Legacy (no type, not expired) | 1 |
| Expired / inactive | 0 |

### Tier Scores
| Tier | Score |
|---|---|
| `elite` | 2 |
| `pro` | 1 |
| `free` | 0 |

### `compareBrowse` (Browse/Search results)
1. Boost score (desc)
2. Tier score (desc)
3. Engagement (going + interested, desc)
4. Date (asc — soonest first)

### `compareFeatured` (Home featured carousel)
1. Boost score (desc)
2. Tier score (desc)
3. Engagement (desc)

### `compareTrending` (Home trending rail)
```
score = engagement + (boostScore × 0.5) + (tierScore × 0.01)
```
Fractional bonuses ensure popular events are never buried by boosted events.

### `getFeaturedEvents()`
- Includes: `featured === true` OR `boostScore > 0`
- Sorted by `compareFeatured`

### `getBoostedEvents()`
- Events where `boostScore > 0` (delegates to `getBoostScore()`)

---

## 29. Weather Widget

**Source:** `components/ui/WeatherWidget.tsx`

### Display Condition
Only rendered for outdoor event types:
`beach, carnival, community, sporting, party, all-inclusive, dancehall, culture`

### Algorithm (deterministic simulation)
- Parish determines base temperature: Cool parishes (Manchester, St. Elizabeth) → 23-26°C; others → 29-33°C
- Month determines rainy season: May-October → higher rain chance
- Wet parishes (Portland, St. Thomas, St. Mary) → higher rain baseline
- Sun parishes (Westmoreland, Hanover, St. James, St. Ann) → lower rain baseline
- Parish name hash provides deterministic variance (no randomness)

### Output Fields
- Condition: Sunny & Hot / Partly Cloudy / Rainy Spells
- Temperature: Celsius + Fahrenheit
- UV Index + label (Very High / High / Moderate)
- Humidity %
- Rain chance %
- Advice text
- Disclaimer: "Simulated forecast based on typical {parish} weather patterns"

---

## 30. Internationalization (i18n)

**Source:** `constants/translations.ts`, `contexts/LanguageContext.tsx`

### Languages
- **English (EN)** — default
- **Jamaican Patois (PATOIS)** — full translation

### Translation Keys (37 strings)
- Navigation labels, section headers, RSVP button labels, weather labels, squad feature strings, profile strings, language strings

### Usage
- `useLanguage()` hook returns `{ language, setLanguage, t }` where `t` is current `Translations` object
- Language persisted via `LanguageContext` (wraps entire app)
- Time-aware greeting in English only (Good morning/afternoon/evening); Patois uses "Big Up Yaself"

---

## 31. iOS Purchase Gate

**Source:** `constants/purchaseGate.ts`

### Flag
```typescript
export const IOS_DIGITAL_PURCHASES_ENABLED = false; // Currently disabled
export const canPurchaseDigitalFeatures = Platform.OS !== 'ios' || IOS_DIGITAL_PURCHASES_ENABLED;
```

### Affected Features (hidden on iOS)
- Subscription Upgrade screen redirects to profile
- Boost Purchase screen redirects to profile
- Subscription Status Card in profile (hidden)
- Upgrade CTA Card in profile (hidden)
- Boost button in My Events (hidden)
- Customer Portal button in profile (hidden)
- "Plans" button in subscription card (hidden)

### Server-Side Defense
- `create-boost-checkout` rejects `platform: 'ios'` with 403
- `create-subscription-checkout` rejects `platform: 'ios'` with 403

---

## 32. Categories System (Admin-Configurable)

**Source:** `contexts/CategoriesContext.tsx`

### Parishes
- Default: 14 Jamaican parishes (constants/data.ts)
- Admin can add/remove custom parishes
- Persisted to `admin_settings.custom_parishes` (cross-device sync for admins)
- Falls back to `@vybzhub_custom_parishes` AsyncStorage

### Event Types
- Default: 12 categories with id, label, icon, color
- Admin can add/edit/remove types
- Persisted to `admin_settings.custom_event_types`
- Falls back to `@vybzhub_custom_event_types` AsyncStorage

### Reset to Defaults
- Restores hardcoded default arrays
- Removes both AsyncStorage keys and Supabase records

---

## 33. Account Deletion Workflow

### User Submission Flow
1. User taps "Delete Account" in profile
2. Check for existing pending request (SELECT from `account_deletion_requests`)
3. If existing: show "Already Requested" alert
4. If none: confirmation alert with disclaimer ("cannot be recovered")
5. On confirm: client-side INSERT into `account_deletion_requests` (RLS-enforced)
6. User sees "Deletion requested — pending admin review" banner in profile

### Admin Review Flow
1. Admin opens Deletions tab in Admin Panel
2. Sees list of requests with status
3. Tap "Approve" → confirmation alert → calls `delete-account` Edge Function with `request_id`
4. Edge Function: verifies admin, deletes user from `auth.users` (cascades), marks request `approved`
5. Tap "Reject" → inline update of `status = 'rejected'`

### Real-time User Sign-out
- `AuthContext` subscribes to `account_deletion_requests` via Realtime for current user
- On `status → 'approved'`: sets `accountDeleted = true` → `supabase.auth.signOut()`
- `AuthDeletionListener` in `app/_layout.tsx` detects `accountDeleted = true` → shows alert → navigates to onboarding

---

## 34. Permissions Model

### Notification Permission
- **When requested:** Only after user taps "Enable Notifications" on branded "Stay Connected" modal (post first sign-in)
- **Silent check:** `getPermissionsAsync()` on each sign-in (no prompt)
- **Why:** Users need to understand the value before native OS prompt appears

### Photo/Media Permission
- **When requested:** At the moment user taps an upload button in:
  - Post event screen → flyer upload
  - Edit event screen → flyer upload
  - Profile screen → avatar upload
  - Admin ads screen → ad image upload
- **Why:** Per-feature, just-in-time permission model

### Location Permission
- **Status:** Architecturally blocked
- **Why:** Map shows pre-geocoded parish pins; no user location feature
- **Blocked via:** `blockedPermissions` array in `app.json`

### Camera Permission
- **Status:** Architecturally blocked (photo uploads use gallery only)

### Microphone Permission
- **Status:** Architecturally blocked

### Other Blocked (Android)
- `ACCESS_BACKGROUND_LOCATION`, `BLUETOOTH*`, `AD_ID`
- Blocked via `androidManifest.blockedPermissions` in `app.json`

### `expo-image-picker` Configuration
```json
{
  "cameraPermission": false,
  "microphonePermission": false
}
```

---

## 35. Services Reference

### `emailService.ts`
- `sendEmailNotification(type, data)` — single-recipient via send-email Edge Function
- `notifyParishUsersNewEvent(parish, data)` — bulk parish broadcast
- `notifyFollowersNewEvent(promoterId, data)` — bulk follower fan-out
- `notifyRsvpUsersEventChange(eventId, data)` — bulk RSVP user notification
- `notifyRsvpUsersEventCancelled(eventId, data)` — bulk RSVP cancellation notification
- `sendTestEmail()` — admin test
- `sendTestPush()` — admin test push with per-device FCM results
- `testSmtpConnection()` — admin SMTP probe with per-phase timing

### `subscriptionService.ts`
- `createSubscriptionCheckout(plan, cycle)` — creates Stripe Checkout URL or returns portal redirect flag
- `createCustomerPortalSession()` — creates Stripe Customer Portal URL
- `fetchSubscription()` — fetches most recent subscription record
- `useBoostCredit(eventId, boostType)` — decrements `remaining_boosts` and activates boost (for free credits)

### `adsService.ts`
- `fetchActiveAdsByPlacementName(name)` — public: enabled placement + active ads
- `fetchAllPlacementsAdmin()` — admin: all placements
- `fetchPlacementWithAdsAdmin(placementId)` — admin: placement + all ads (active + inactive)
- `fetchAdCountsByPlacement()` — admin: total ad count per placement
- `togglePlacementEnabled(id, enabled)`
- `toggleAdActive(id, active)`
- `updateAdSortOrder(id, sort_order)`
- `deleteAd(id)`
- `insertAd(placementId, imageUrl, targetUrl, label, sortOrder)`
- `updateAd(id, fields)`
- `insertPlacement(name, size)`

### `openCustomerPortal()` (inline in profile.tsx)
- Calls `subscriptionService.createCustomerPortalSession()`, opens URL with `Linking.openURL`, schedules profile refresh after 3s

---

## 36. Constants & Business Rules Reference

### Event Statuses
`pending | live | rejected | flagged`

### Performer Roles
`DJ | Artist | MC | Host | Band | Live Act | Comedian | Sound System | Other`

### Age Limits
`All Ages | 18+ | 21+`

### Recurring Frequencies
`Weekly | Bi-Weekly | Monthly`

### Free Plan Event Limit
- 3 events per calendar month
- Counts events where `promoterId = user.id` AND `status !== 'rejected'`
- Uses `createdAt` date for month comparison (falls back to event date if null)

### Jamaica Timezone
- UTC-5, no DST
- `getJamaicaMs() = Date.now() - 5 * 60 * 60 * 1000`
- Event "passes" 7:00 AM next day Jamaica time (threshold: event_date+1 at 12:00 UTC)

### "This Weekend" Logic
- From upcoming Saturday midnight Jamaica to end of Sunday midnight Jamaica
- On Sunday: includes current weekend (Saturday = yesterday)

### Event Type Colors
```
party: #FF6B35, all-inclusive: #E91E63, dancehall: #FF9800, beach: #00BCD4,
club: #9C27B0, concert: #5C6BC0, carnival: #F44336, culture: #27AE60,
community: #00897B, sporting: #1565C0, corporate: #607D8B, private: #795548
```

### Support Contact
- **Email:** `info@vybzhub.com`
- **Subjects:** General, Account Help, Payment Issue

---

## 37. Website Feature Parity Checklist

For each feature, status is:
- ✅ Already implemented on website
- ❌ Missing from website
- ⚠ Partially implemented

---

### Authentication & Onboarding

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Splash / Auth routing | ❌ | Critical | Low | Check Supabase session on load; route to home or onboarding |
| Onboarding slides | ❌ | Medium | Low | 3 image slides + parish + interests; can simplify to single page on web |
| Parish selection | ❌ | High | Low | Required to populate `home_parish` |
| Interests selection | ❌ | High | Low | Required for personalized feed |
| Email/password Sign In | ❌ | Critical | Low | `signInWithPassword` |
| Email/password Register | ❌ | Critical | Low | Role selection (attendee/promoter), name, password strength |
| Password Reset (forgot) | ❌ | High | Low | `resetPasswordForEmail` with retry logic |
| Password Recovery Mode | ❌ | High | Medium | Handle `PASSWORD_RECOVERY` auth event; `redirectTo` URL must match |
| Phone OTP Sign In | ❌ | Low | Medium | Requires Twilio config in Supabase |
| Register Success screen | ❌ | Medium | Low | "Check your inbox" confirmation |
| Session persistence | ❌ | Critical | Low | `localStorage` on web |
| Auto-refresh (AppState equivalent) | ❌ | High | Low | Browser `visibilitychange` event instead of AppState |
| Notification Permission Modal | ❌ | Medium | Low | Not applicable on web (no push without service worker) |

---

### Home Screen

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Featured events carousel | ❌ | Critical | Medium | Horizontal scroll with `compareFeatured` sorting |
| Trending events rail | ❌ | High | Medium | `compareTrending` sorting, top 6 |
| Browse by Category | ❌ | High | Low | 12 type chips |
| Browse by Parish | ❌ | High | Low | 8 parishes + overflow |
| Near You section | ❌ | Medium | Low | Based on `user.homeParish` |
| This Week section | ❌ | High | Low | Jamaica UTC-5 date calc |
| Quick date shortcuts | ❌ | Medium | Low | Today / This Weekend chips |
| Home Feed Ad | ❌ | High | Medium | `PlacementAd` component |
| Error banner + retry | ❌ | Medium | Low | Network error handling |
| Pull to refresh | ❌ | Low | Low | Web equivalent: refresh button |
| Greeting by time of day | ❌ | Low | Low | Good morning/afternoon/evening |

---

### Browse Screen

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Parish grid view | ❌ | Critical | Medium | 14 parishes with images + counts |
| Category grid view | ❌ | Critical | Medium | 12 types with counts |
| Full-text search | ❌ | Critical | Low | Title, venue, address, promoter, parish |
| Parish filter | ❌ | Critical | Low | Select from list |
| Type filter | ❌ | Critical | Low | Select from list |
| Date filter (Today / Weekend) | ❌ | High | Medium | Jamaica timezone logic |
| Upcoming / Past toggle | ❌ | High | Low | `isEventPassed` check |
| Results sorted by boost/tier/engagement | ❌ | Critical | Medium | `compareBrowse` |
| Boosted events horizontal rail | ❌ | High | Low | Before results list |
| Browse Ad injection | ❌ | Medium | Medium | Every 5 results |
| Auth prompt on RSVP (guest) | ❌ | High | Low | Modal/redirect to sign in |
| URL params (parish, type, dateFilter) | ❌ | High | Low | Deep-linkable filters |
| Collapsible filter bar with active chips | ❌ | Medium | Medium | Collapsed chip summary |

---

### Map Screen

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Jamaica map with parish pins | ❌ | High | High | `react-leaflet` with OpenStreetMap tiles on web |
| Parish pin colors (gold/green/gray) | ❌ | Medium | Medium | Active/selected/empty states |
| Date filter chips (All/Today/Weekend) | ❌ | High | Low | Filters `parishCounts` |
| Parish chip strip | ❌ | Medium | Medium | Scrollable; active parishes only |
| Parish detail (event preview cards) | ❌ | High | Medium | EventPreviewCard list |
| Island overview stats | ❌ | Medium | Low | Events, parishes, going totals |
| Parish list with thumbnail | ❌ | Medium | Medium | Map screen list view |
| Real-time indicator | ❌ | Low | Low | Pulsing dot |
| Map ad placement | ❌ | Medium | Medium | PlacementAd |

---

### Event Detail Screen

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Flyer gallery (multi-image) | ❌ | Critical | Medium | Carousel with dots, lightbox |
| Event meta (date, time, venue, parish) | ❌ | Critical | Low | Details card |
| RSVP buttons (Going / Interested) | ❌ | Critical | Medium | Mutual exclusion, auth guard |
| Attendee counts | ❌ | Critical | Low | Going, Interested, Views |
| Ticket price + "Get Tickets" link | ❌ | High | Low | Opens ticketLink |
| Age restriction display | ❌ | Medium | Low | Red, only if not "All Ages" |
| Dress code display | ❌ | Medium | Low | |
| Lineup (grouped by role) | ❌ | High | Medium | Legacy "Speaker" → "Sound System" normalization |
| Tags | ❌ | Low | Low | Hashtag chips |
| Description | ❌ | Critical | Low | |
| Map section (venue pin + open maps) | ❌ | High | Medium | Stylized map or embed |
| Weather widget | ❌ | Medium | Medium | Simulated, outdoor types only |
| Promoter card | ❌ | High | Low | Links to promoter profile |
| Share (Web Share API) | ❌ | High | Low | `navigator.share()` fallback |
| Related events | ❌ | Medium | Medium | Same parish or promoter |
| QR Ticket modal | ❌ | Low | Medium | Not a real ticket; visual only |
| Event photos link | ❌ | Medium | Low | External link |
| Boost badge | ❌ | Medium | Low | On active boost |
| View count increment | ❌ | Medium | Low | `increment_view_count` RPC |
| Event Detail Ad | ❌ | High | Medium | PlacementAd |
| Squad Up link | ❌ | Low | Low | Link to squad page |
| Bookmark toggle | ❌ | High | Low | user_rsvps bookmarked status |
| Auth prompt for RSVP | ❌ | Critical | Low | Guest trying to RSVP |

---

### RSVP System

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Going toggle (with mutual exclusion) | ❌ | Critical | Medium | Removes Interested if switching |
| Interested toggle (with mutual exclusion) | ❌ | Critical | Medium | Removes Going if switching |
| Bookmark toggle | ❌ | High | Low | Independent of Going/Interested |
| Optimistic UI updates | ❌ | High | Medium | Local state first, DB async |
| 400ms debounce per event | ❌ | Medium | Low | Prevent double-taps |
| Load RSVPs on sign-in | ❌ | Critical | Low | `user_rsvps` fetch |
| Local event reminders | ❌ | Low | High | Browser notifications; requires service worker |

---

### Event Creation (Post)

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| 7-step wizard | ❌ | Critical | High | Adapts naturally to web form |
| Date picker (calendar) | ❌ | Critical | Medium | `<input type="date">` or library |
| Time picker | ❌ | High | Medium | `<input type="time">` |
| Parish dropdown | ❌ | Critical | Low | Select from dynamic list |
| Category multi-select | ❌ | Critical | Low | Checkbox grid |
| Recurring toggle | ❌ | Medium | Low | Weekly/Bi-Weekly/Monthly |
| Image upload (multi, up to 5) | ❌ | Critical | High | `<input type="file" multiple>`; 3-variant compression |
| Gallery picker (preset images) | ❌ | Low | Low | Optional preset URL selection |
| Lineup builder | ❌ | High | Medium | Role chip + name input |
| Free toggle | ❌ | Critical | Low | |
| Ticket price | ❌ | High | Low | |
| Age restriction | ❌ | High | Low | Button group |
| Dress code | ❌ | Low | Low | |
| Ticket link | ❌ | Medium | Low | URL input |
| Contact info | ❌ | Medium | Low | |
| Event photos link | ❌ | Low | Low | |
| Step validation (required fields) | ❌ | High | Low | |
| Submit guard (duplicate prevention) | ❌ | High | Low | `isSubmittingRef` equivalent |
| Upload progress UI | ❌ | Medium | Medium | Progress bar + compression stats |
| Upload error UI | ❌ | High | Low | Clear error banner |
| Parish / follower notifications on publish | ❌ | High | Low | Non-blocking Edge Function calls |
| Moderation mode (pending on submit) | ❌ | High | Low | `requireEventApproval` flag |
| Free plan event limit gate | ❌ | High | Medium | 3/month check |
| Become Promoter gate | ❌ | High | Low | Role activation before posting |

---

### Edit Event

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Pre-populated edit form | ❌ | Critical | High | All fields from create form |
| Ownership guard | ❌ | Critical | Low | `event.promoterId === user.id` |
| Save changes | ❌ | Critical | Medium | `editEvent()` with upload handling |
| Delete event | ❌ | High | Low | Confirmation + delete |
| Change detection + RSVP notifications | ❌ | High | Medium | Date/time/venue changes trigger bulk notify |

---

### Profile Screen

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Avatar display (image or letter) | ❌ | High | Low | |
| Avatar upload | ❌ | High | Medium | File input + compress + `profile-images` bucket |
| Name editing | ❌ | High | Low | Inline edit with save |
| Role badges | ❌ | Medium | Low | |
| 4-stat row (Going/Interested/Saved/Posted) | ❌ | High | Low | |
| Preferred parishes modal | ❌ | High | Medium | Multi-select with save |
| Event interests display | ❌ | Medium | Low | |
| Promoter card | ❌ | Medium | Low | |
| Subscription status card | ❌ | High | Medium | Show on Android/web only |
| Subscription management portal | ❌ | High | Medium | Customer Portal link |
| Upgrade CTA | ❌ | High | Low | |
| Admin panel link | ❌ | High | Low | Admin role check |
| Support contact | ❌ | Medium | Low | mailto link |
| Notification settings | ❌ | High | Low | Link to settings page |
| Language toggle | ❌ | Low | Low | EN / Patois |
| Activity tabs (Going/Interested/Saved/Posted) | ❌ | High | High | Per-tab event lists with sub-tabs |
| Delete account | ❌ | High | Low | Submission flow |
| Push token status | ❌ | Low | Low | Not applicable on web |
| Sign out | ❌ | Critical | Low | |

---

### Admin Panel

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Admin role gate | ❌ | Critical | Low | |
| Event queue (approve/reject) | ❌ | Critical | Medium | |
| Flagged events (unflag/remove) | ❌ | High | Low | |
| Analytics (parish/type charts) | ❌ | High | Medium | Bar charts |
| Subscription analytics | ❌ | High | Medium | Plan counts + MRR estimate |
| Categories editor (parish/type CRUD) | ❌ | High | Medium | |
| Moderation toggle | ❌ | High | Low | `require_event_approval` |
| Email test | ❌ | Medium | Low | |
| SMTP probe tool | ❌ | Medium | Medium | Phase timing display |
| Push test | ❌ | Medium | Medium | FCM result display |
| Ad placements management | ❌ | High | High | Placement list + ads management |
| Boost overview + grant | ❌ | High | Medium | |
| Boost purchase history | ❌ | Medium | Low | |
| Deletion requests | ❌ | Critical | Medium | Approve/reject flow |

---

### Notifications

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Notification list with filter | ❌ | High | Medium | All / Unread tabs |
| Mark read / mark all read | ❌ | High | Low | |
| Dismiss individual | ❌ | High | Low | |
| Clear all | ❌ | Low | Low | |
| Navigate to event/promoter on tap | ❌ | High | Low | |
| Unread count badge | ❌ | Medium | Low | Tab icon / header badge |
| Real-time sync with Supabase | ❌ | Medium | Medium | Subscribe to notifications table |
| Notification settings page | ❌ | High | Medium | Per-type email/push toggles |

---

### Subscriptions & Payments

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Plan comparison page | ❌ | High | High | Monthly/yearly toggle, plan cards |
| Stripe Checkout (subscription) | ❌ | High | High | Edge Function → Stripe URL → redirect back |
| Customer Portal | ❌ | High | Medium | Upgrade/downgrade/cancel/billing |
| Boost purchase checkout | ❌ | High | High | Package selection + Stripe Checkout |
| Boost upgrade pricing | ❌ | Medium | Medium | Delta pricing from active boost |
| Boost performance screen | ❌ | High | Medium | Analytics + timeline |
| Webhook-driven entitlements | ✅ | — | — | Same backend; already working |
| Post-checkout refresh | ❌ | High | Medium | Poll for webhook confirmation |

---

### Other Features

| Feature | Status | Priority | Complexity | Notes |
|---|---|---|---|---|
| Weather widget | ❌ | Medium | Low | Same algorithm; pure computation |
| Language toggle (Patois/EN) | ❌ | Low | Low | All 37 strings |
| Image lightbox | ❌ | High | Medium | Fullscreen image viewer |
| QR ticket modal | ❌ | Low | Low | Visual only |
| Squad Up page | ❌ | Low | Low | Share-based; no real social graph |
| Promoter profile page | ❌ | High | Medium | |
| My Events management page | ❌ | High | Medium | |
| PlacementAd component | ❌ | High | Medium | Ad rotation every 10s |
| Real-time event updates | ❌ | High | Medium | Supabase Realtime subscriptions |
| Account deletion request | ❌ | High | Low | Client-side insert |
| Real-time deletion watch + auto-sign-out | ❌ | High | Medium | Realtime subscription on own request row |
| iOS purchase gate | ✅ | — | — | N/A on web (`canPurchaseDigitalFeatures = true`) |

---

### Priority Summary for Website Implementation

| Priority | Feature Group | Estimated Effort |
|---|---|---|
| **P0 — Critical** | Auth (sign in/register/reset), Event browsing, Event detail, RSVP, Home feed | 2-3 weeks |
| **P1 — High** | Profile (view/edit), Post event, Notifications, Admin panel basics, Browse filters, Map | 2-3 weeks |
| **P2 — Medium** | Subscriptions/Stripe, Boost purchase, My events, Promoter profiles, Notification settings | 2-3 weeks |
| **P3 — Lower** | Weather widget, Language toggle, Squad, QR ticket, Push receipt diagnostics | 1 week |

### Key Implementation Notes for Website

1. **No iOS purchase gate needed** — All Stripe features are available on web; `canPurchaseDigitalFeatures = true`
2. **Supabase client setup** — Use same anon key; session via `localStorage`; add `detectSessionInUrl: true` for magic link/OAuth
3. **Map provider** — Use `react-leaflet` with OpenStreetMap tiles (no Google Maps key needed on web)
4. **Push notifications** — Replace with Web Push API / service worker; Expo push tokens not applicable
5. **Image compression** — `browser-image-compression` library or Canvas API as alternatives to `expo-image-manipulator`
6. **Deep links** — Replace `onspaceapp://` scheme with web URLs for Stripe redirects (e.g., `https://yourdomain.com/subscription-success`)
7. **Password reset** — Update `redirectTo` in `resetPasswordForEmail` to website URL; update Supabase Auth Site URL
8. **Real-time** — Same Supabase Realtime API works on web
9. **Local notifications** — Use `Notification` Web API + service worker (requires HTTPS)
10. **File uploads** — `<input type="file">` instead of `expo-image-picker`; same `supabase.storage.from().upload()` flow

---

*Document generated from full source code audit of VybzHub mobile application. All features verified against production code.*
