# VYBZ HUB — PHASE 30: STORE SUBMISSION PREPARATION

## STATUS
COMPLETE

## APP STORE CONNECT SUBMISSION MATERIALS

### App Name
Vybz Hub

### Subtitle (30 chars max)
Jamaica Events & Businesses

### Release Notes (Version X.X.X)
```
Vybz Hub — Jamaica's Premier Event & Business Discovery Platform

What's New:
• Enhanced Creator Profiles with Pro/Elite tier badges
• Elite Custom Creator Banner — personalize your public profile
• My Boosts — manage all your Event and Business promotions in one place
• Priority Customer Support for Elite creators
• Improved search ranking with Search Priority for Pro/Elite creators
• Business Map improvements and stability fixes
• Performance and reliability improvements
```

### App Description (4000 chars max)
```
Discover what's happening across Jamaica with Vybz Hub — the ultimate events and local business platform built for Jamaica.

DISCOVER EVENTS
Browse upcoming events island-wide or in your parish. Filter by type — Parties, Concerts, Sports, Food Festivals, and more. See what's trending, what's happening this weekend, and what your favorite promoters are planning.

MAP DISCOVERY
Explore Jamaica's 14 parishes on an interactive map. See event and business hotspots at a glance and drill into any parish for detailed listings.

ATTEND WITH CONFIDENCE
RSVP to events, buy tickets in-app, save events to your collection, and follow your favorite promoters for notifications when they post new events.

FOR CREATORS
List your events. Reach Jamaica. Get discovered.

• Pro Plan ($4.99/mo): 3 events/businesses per billing cycle, 2 Boost Credits, Event & Business Analytics, Search Priority, Creator Profile
• Elite Plan ($14.99/mo): 6 events/businesses per billing cycle, 6 Boost Credits, Advanced Analytics with exports, Custom Creator Banner, Priority Customer Support, Featured Homepage Placement, 5% ticket commission

BOOST YOUR EVENTS
Boost any event or business for increased visibility in search and discovery. Choose 3-Day, 7-Day, or Until Event Ends.

BUSINESS DIRECTORY
Find and list Jamaica businesses. Browse by category and parish. Verified businesses are marked with a badge.

IN-APP TICKETING
Elite creators can sell tickets directly through Vybz Hub. Buyers receive QR code tickets. Staff scan at the door.

YOUR VYBZ, YOUR WAY
Save events, set your preferred parishes, follow promoters, and get personalized recommendations.

Vybz Hub is for Jamaica. Built with Jamaica. Run by Jamaica.
```

### Keywords (100 chars max)
```
jamaica,events,nightlife,concert,parties,business,tickets,promoter,caribbean,entertainment
```

### Support URL
https://vybzhub.com/support

### Privacy Policy URL
https://vybzhub.com/privacy

### Marketing URL (optional)
https://vybzhub.com

## GOOGLE PLAY STORE MATERIALS

### Short Description (80 chars)
Jamaica events, businesses & tickets in one app

### Full Description
(Same as App Store description above, adapted for Play Store style)

### Content Rating
Recommended: 12+ (for event content that may include alcohol-related events)

## PRIVACY & DATA COLLECTION

### Data Collected
| Category | Data | Purpose |
|----------|------|---------|
| Contact | Email, Phone | Account management |
| Identifiers | User ID | App functionality |
| Location | Parish/Home Parish | Event recommendations |
| Purchases | IAP receipts | Subscription/boost management |
| Usage | Events browsed, RSVPs | Personalization |

### Data NOT Collected
- Precise GPS location (only parish-level)
- Financial payment information (handled by Stripe/Apple/Google)
- Private business address for home/mobile businesses

## APP REVIEW INSTRUCTIONS

### Test Account (provide in App Review Notes)
```
Email: reviewer@vybzhub.com
Password: [provide secure temp password]
Role: Pro Creator
Note: Account has sample events, businesses, and an active Pro subscription for testing creator features.
```

### Demo Scenarios for Review
1. Browse events by parish
2. View event detail and RSVP
3. View business directory
4. View Creator Profile (promoter/[id])
5. View Creator Analytics (Pro features accessible)
6. View Upgrade screen (subscription pricing)

### IAP Testing Note
"Subscriptions and boosts use Apple/Google IAP. In sandbox environment, all purchases complete without real charges. Please use a sandbox account for IAP testing."

## ACCOUNT DELETION PATH
Profile → Account Actions → Delete Account → Confirm → Submit Request
(Admin-reviewed deletion with notification)

## SCREENSHOTS CHECKLIST
- [ ] iPhone 6.9" (1320×2868): Home, Browse, Map, Profile, Event Detail
- [ ] iPhone 6.5" (1284×2778): Same 5 screens
- [ ] iPad Pro 12.9" (2048×2732): Home, Browse, Business Directory
- [ ] Apple Watch concept (optional, asset exists)

## SUBSCRIPTION TERMS REQUIREMENTS
- Auto-renewal disclosure in upgrade screen: ✓ (implemented in `upgrade.tsx`)
- Manage subscription link: ✓ (links to App Store Settings / Google Play)
- Cancellation instructions: ✓ (in subscription card on profile)
- Free trial disclosure: ✓ (trialing status shown if applicable)

## NOTES
- App uses `onspaceapp://` URL scheme for OAuth deep links
- Push notifications require user permission (shown after first sign-in)
- No background location tracking
- Account deletion is admin-reviewed (not instant) — this is disclosed in the UI
