# VYBZ HUB — PHASE 24: REAL-DEVICE REGRESSION TEST PLAN

## STATUS
COMPLETE — TEST PLAN CREATED, EXECUTION PENDING

## TEST MATRIX

### Platforms Required
- [ ] Physical iPhone (iOS 16+)
- [ ] Physical Android (Android 12+)
- [ ] TestFlight build
- [ ] Android internal testing track

### Install States
- [ ] Fresh install (first launch)
- [ ] Update from previous version
- [ ] Foreground → Background → Foreground
- [ ] Force-quit → Relaunch

### Test Accounts Required
1. **Logged out** — guest browsing
2. **Attendee** — free, no promoter role
3. **Free Creator** — promoter role, no subscription
4. **Pro Creator** — active Pro subscription
5. **Elite Creator** — active Elite subscription
6. **Business Owner** — owns businesses, promoter role
7. **Admin** — admin role

### Network Conditions
- [ ] Normal WiFi
- [ ] Slow 3G (throttled)
- [ ] Offline / airplane mode
- [ ] Mid-flight network switch

---

## CRITICAL TEST SCENARIOS

### Authentication
- [ ] Sign up new account
- [ ] Sign in with email/password
- [ ] Sign out
- [ ] Password recovery
- [ ] Session persistence across app restart

### Home Tab
- [ ] Featured events carousel renders
- [ ] Trending events load
- [ ] Parish chips filter events
- [ ] Followed promoter events appear
- [ ] Elite homepage placement slot renders (when implemented)

### Browse / Explore
- [ ] Event categories load
- [ ] Business categories load
- [ ] Parish browse for events
- [ ] Parish browse for businesses
- [ ] Event results with RPC ranking
- [ ] Business results with RPC ranking

### Search
- [ ] Text search for events
- [ ] Text search for businesses
- [ ] All tab combined results
- [ ] 300ms debounce working
- [ ] Empty state on no results

### Events
- [ ] Create event (promoter)
- [ ] Edit event (promoter)
- [ ] Event detail page
- [ ] RSVP going/interested
- [ ] Bookmark event
- [ ] Share event

### Businesses
- [ ] Create business (wizard all 10 steps)
- [ ] Business detail page
- [ ] Business categories/parishes
- [ ] Upload logo (iOS)
- [ ] Upload logo (Android)
- [ ] Business review submission
- [ ] Business verification badge display

### MAP — CRITICAL
- [ ] **Events Map renders on iPhone**
- [ ] **Switch Events → Businesses on iPhone (NO CRASH)**
- [ ] **Switch Businesses → Events on iPhone**
- [ ] **Repeat 10 times without crash**
- [ ] Parish tap → event/business list
- [ ] Business map with 0 results (Verified filter)
- [ ] Android Events Map renders
- [ ] Android Business Map renders

### Tickets
- [ ] Browse ticket tiers
- [ ] Complete ticket purchase (Apple Pay / card)
- [ ] My Tickets — QR code display
- [ ] Ticket scanner (staff role)
- [ ] Transfer ticket

### Subscriptions
- [ ] View upgrade screen
- [ ] Purchase Pro (Apple IAP)
- [ ] Purchase Elite (Apple IAP)
- [ ] Restore purchases
- [ ] Purchase Pro (Google Play)
- [ ] Purchase Elite (Google Play)

### Boosts
- [ ] Boost event (paid)
- [ ] Boost event (credit — Pro/Elite)
- [ ] My Boosts screen: active + history tabs
- [ ] Boost performance screen

### Creator Profile
- [ ] View own Creator Profile
- [ ] View another creator's profile
- [ ] Elite banner displays correctly
- [ ] Pro badge displays
- [ ] Follow/unfollow

### Elite Custom Creator Banner
- [ ] Upload banner (Elite)
- [ ] Preview renders on Creator Profile
- [ ] Replace banner
- [ ] Remove banner
- [ ] Gate screen (Free/Pro user)

### Creator Analytics
- [ ] Free: locked state
- [ ] Pro: overview stats
- [ ] Elite: date range filter
- [ ] Elite: CSV export + share sheet

### Support
- [ ] Elite: Priority Support screen with pink theme
- [ ] Free: Standard support screen with upgrade prompt
- [ ] Email compose opens with correct subject prefix

### Notifications
- [ ] Push notification received (foreground)
- [ ] Tap notification → correct route
- [ ] Notification settings screen

### Admin (Admin account)
- [ ] Event queue
- [ ] Business approval
- [ ] User management
- [ ] System tools

---

## NOT RUN
All of the above require physical device testing. This plan documents what MUST be tested before release.

## BLOCKERS
- Business Map crash (Phase 12): requires physical iPhone test
- Apple IAP: requires TestFlight build and sandbox account
- Google Play IAP: requires Android internal testing track

## DEFINITION OF DONE
All [ ] checkboxes above marked PASS before production release.
