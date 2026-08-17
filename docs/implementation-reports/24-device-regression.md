# VYBZ HUB — PHASE 24: REAL-DEVICE REGRESSION TEST PLAN

## STATUS
NEEDS DEVICE TEST — all items require physical device

## TEST MATRIX

### Device Targets
| Platform | Device | Status |
|----------|--------|--------|
| iOS | iPhone (any modern) | NEEDS TEST |
| Android | Android phone | NEEDS TEST |
| iPad | Tablet layout | NEEDS TEST |

### Core Flows

#### Authentication
- [ ] Sign up with email + phone (Jamaica number)
- [ ] Sign in with email
- [ ] Password reset via email link
- [ ] Sign out

#### Home Tab
- [ ] Elite Picks rail renders when placements active
- [ ] Pull-to-refresh refreshes all sections
- [ ] Trending Now, Popular Businesses, Events Near You load
- [ ] Notifications bell shows unread count

#### Browse / Search
- [ ] Search events returns ranked results
- [ ] Search businesses returns ranked results
- [ ] Parish filter works
- [ ] Category filter works

#### Event Flow
- [ ] Create event (all 7 steps)
- [ ] Upload device photo as flyer
- [ ] Event appears in My Events after creation
- [ ] Edit event
- [ ] View event detail

#### Business Flow
- [ ] Create business listing
- [ ] Upload logo + cover photo
- [ ] Business appears in My Businesses
- [ ] Edit business (logo/cover re-upload)
- [ ] Business visible in directory after admin approval

#### Map
- [ ] Events mode: 14 parish markers render, no crash
- [ ] Businesses mode: switch from Events → no crash (KNOWN RELEASE BLOCKER)
- [ ] Tap parish marker navigates to parish events

#### Ticketing
- [ ] Ticket setup for event
- [ ] Create ticket tier
- [ ] My Tickets shows purchased tickets
- [ ] Ticket QR code renders

#### Subscription
- [ ] Upgrade screen renders
- [ ] iOS: in-app subscription purchase (NEEDS SANDBOX)
- [ ] Android: in-app subscription purchase (NEEDS SANDBOX)

#### Elite Features
- [ ] Elite Homepage Placement screen accessible
- [ ] Select event → appears in Home Elite Picks
- [ ] Select business → replaces event selection
- [ ] Remove → cleared from Home
- [ ] Non-Elite user sees locked state

#### Admin
- [ ] Admin panel loads
- [ ] Event Queue shows pending events
- [ ] Approve/reject event
- [ ] User management works

### Known Release Blockers
1. **Business Map iOS crash** — Businesses mode switch causes SIGABRT. Code fix applied; MUST verify on physical iPhone.

### Store Testing (External)
- [ ] Apple IAP sandbox: Pro subscription purchase
- [ ] Apple IAP sandbox: Elite subscription purchase
- [ ] Apple IAP sandbox: 3-Day Boost purchase
- [ ] Google Play internal testing: Pro subscription
- [ ] Google Play internal testing: Elite subscription
