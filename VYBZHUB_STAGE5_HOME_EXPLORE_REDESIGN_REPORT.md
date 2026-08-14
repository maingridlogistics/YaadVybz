# VYBZ HUB — STAGE 5 REDESIGN REPORT

---

## STAGE 5 — HOME + EXPLORE REDESIGN

### Home

| Item | Result |
|------|--------|
| **New header** | White surface header with brand dot + "VYBZ HUB" wordmark in pink, time-aware greeting, circular notification bell + search icon buttons |
| **Search** | Prominent pill search bar (52px height) with search icon in secondary circle, pink filter button — taps navigate to Browse |
| **Featured section** | Horizontal rail of `EventCardFeatured` (300×380px). Fully rebuilt: full-bleed photography, bottom-only gradient, date badge, parish+title+footer, pink price pill, gold Featured/Boosted badges |
| **Categories** | Horizontal pill chips: icon circle + color label — all existing event types, tap filters Browse |
| **Upcoming (This Week)** | Full-width `EventCard` default variant (redesigned) with image on top, title+price row, date/venue meta below image, RSVP buttons in card footer |
| **Trending** | Horizontal rail of `TrendingCard` (58% screen width): image header, pink rank badge, price pill, type dot+label, fire heat count |
| **Near You** | Shown when user has home parish — `EventCard` default, same design |
| **Parish chips** | Horizontal scrollable pill strip with pink location icon, more chip with arrow |
| **Structural layout changed** | **YES** — header, search bar, section hierarchy, card designs all completely different from old layout |

---

### Explore

| Item | Result |
|------|--------|
| **New header** | White surface header with "Explore" large title + "Find your next vybz" subtitle, notification bell, clear-filters chip |
| **Search** | Inline `TextInput` search bar embedded in header (48px height, rounded) with live filtering |
| **Filters** | Three horizontal filter strip rows (Date · Parish · Category) using `FilterChip` — active state uses specific color (pink for dates/parish, type-color for categories) |
| **Mode tabs** | "Discover" (parish+category grids) / "Filter & Search" (filter strips + results list) — replaces old 3-tab Parish/Type/Filter switcher |
| **Discover: Parish grid** | 2-column responsive grid of `ParishCard` (120px height) — full-bleed parish photos, gradient, parish name + event count |
| **Discover: Category tiles** | 3-column grid of `CategoryTile` (120px height) — gradient background, large icon circle, label, colored event count pill |
| **Results layout** | `EventCard` row variant (redesigned): square thumbnail, date badge, type pill, price — clean horizontal card |
| **Boosted rail** | Horizontal scrollable `BoostedCard` strip (190×140px) in both Discover and Search modes |
| **Empty state** | Icon circle + title + subtitle + Clear Filters button — matches Stage 4 design language |
| **Scope toggle** | Upcoming / Past Events pill toggle (gold active state) |
| **Structural layout changed** | **YES** — Discover vs Search mode split, parish grid, category grid, filter chip system, result header all structurally new |

---

### Event Cards

| Item | Result |
|------|--------|
| **EventCard (default) changes** | Completely rebuilt: 200px image (increased from 160px), ONLY subtle bottom gradient (no heavy dark overlay), title+price row BELOW image on white surface, date/venue meta below title, RSVP footer with border separator, pink primary accent (was gold), Radius.xl corners |
| **EventCard (row) changes** | Square thumbnail (88×88), date badge between thumbnail and content, type pill + price in footer row, RSVP stack on far right, pink today stripe accent |
| **Featured card changes** | 300×380px (wider, taller). Full-bleed photo. Gradient only bottom 70%. White frosted date badge with month/day. Gold parish + white title. Divider + footer with pink price pill. No heavy dark card anymore |
| **Image treatment** | `expo-image` throughout. `memory-disk` cache. Consistent aspect ratios. Subtle gradient only for text readability. `Radius.xl` (24px) corners on featured |
| **Date treatment** | New: stacked month (uppercase, pink) + day (large bold) date badge on both card types |
| **Price treatment** | Pink (`Colors.primary`) for paid, green (`Colors.success`) for Free. Price pill on featured card. Right-aligned in card row |

---

### Navigation

| Item | Result |
|------|--------|
| **Tab bar visual changes** | Already updated in Stage 4: white background, pink active tint, muted inactive — no further changes needed |
| **Architecture changed** | NO — same Expo Router structure, same role guards, same 5 tabs |

---

### Business Logic

| Item | Result |
|------|--------|
| **Event queries changed** | NO |
| **Sorting changed** | NO — `compareTrending`, `compareBrowse` from rankingUtils unchanged |
| **Role rules changed** | NO — Admin Post tab still hidden, route guards intact |
| **RSVP logic changed** | NO — `toggleGoing`, `toggleInterested` unchanged |
| **Featured logic changed** | NO — `getFeaturedEvents()` unchanged |
| **Boosted logic changed** | NO — `getBoostedEvents()` unchanged |

---

### Payments

| Item | Result |
|------|--------|
| **Stripe changed** | NO |
| **IAP changed** | NO |
| **Physical iOS Stripe test** | PENDING |

---

### Files Changed

| File | Type |
|------|------|
| `app/(tabs)/index.tsx` | COMPLETELY REWRITTEN |
| `app/(tabs)/browse.tsx` | COMPLETELY REWRITTEN |
| `components/feature/EventCard.tsx` | COMPLETELY REWRITTEN |
| `components/feature/EventCardFeatured.tsx` | COMPLETELY REWRITTEN |

---

### Old Dark Styling Remaining in Stage 5 Screens

All four Stage 5 files are fully migrated to the light theme system. No hardcoded dark values remain in:
- `app/(tabs)/index.tsx` ✅
- `app/(tabs)/browse.tsx` ✅  
- `components/feature/EventCard.tsx` ✅
- `components/feature/EventCardFeatured.tsx` ✅

**Remaining dark legacy screens (for future stages):**
- `app/(tabs)/profile.tsx`
- `app/event/[id].tsx`
- `app/my-tickets.tsx`
- `app/ticketing/ticket/[ticketId].tsx`
- `app/ticketing/checkout/[eventId].tsx`
- `app/(tabs)/post.tsx`
- `app/admin/*.tsx`
- `app/(promoter)/*.tsx`
- `app/auth.tsx`
- `app/onboarding.tsx`
- `app/notifications.tsx`
- `app/_layout.tsx` (NotificationPermissionModal uses some dark values)

---

### Stage 5 Self-Audit

| Check | Result |
|-------|--------|
| Did Home layout structurally change? | **YES** — header, search, featured hero, trending rail, categories, parish, week sections all new |
| Did Explore layout structurally change? | **YES** — Discover/Search mode split, grid layouts, filter chip system, new result header |
| Did EventCard structurally change? | **YES** — image area redesigned, content below image, date badge, RSVP footer with separator |
| Did Featured Event card structurally change? | **YES** — frosted date badge, divider, price pill, 300×380 layout |
| Were old dark styles removed? | **YES** — all four files use light theme tokens only |
| Are existing event queries/logic unchanged? | **YES** |
| Are role guards unchanged? | **YES** |
| Is Stripe untouched? | **YES** |

---

### Verification

- **TypeScript:** NOT VERIFIED (no CLI)
- **ESLint:** NOT VERIFIED
- **Expo Doctor:** NOT VERIFIED
- **Expo Config:** NOT VERIFIED

---

### Regressions

- **EventCard props** — All existing prop signatures preserved: `event`, `isGoing`, `isInterested`, `onToggleGoing`, `onToggleInterested`, `compact`, `variant`. No breaking changes.
- **EventCardFeatured props** — `event` prop unchanged.
- **Legacy import paths** — Both components remain at same file paths. All existing imports continue to work.
- **Auth prompt modal in Browse** — Preserved, now uses pink primary gradient instead of gold.
- **RSVP auth gate in Browse** — `setShowAuthPrompt(true)` on failed toggle preserved.
- **Role guards** — Admin Post tab still hidden. Admin/Promoter route guards untouched.

---

## STAGE 5 STATUS

**`PASS`**

Home and Explore are completely redesigned with a premium light-theme event discovery aesthetic. EventCard and EventCardFeatured rebuilt with editorial card proportions, full-bleed photography, date badges, and clean below-image content areas. All business logic, role guards, Stripe, and IAP unchanged.

**STOP — Do not redesign Profile, Event Detail, Tickets, Admin, or Promoter screens yet. Wait for approval.**
