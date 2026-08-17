# VYBZ HUB — PHASE 09: PRIORITY CUSTOMER SUPPORT (ELITE)

## STATUS
COMPLETE

## IMPLEMENTED

**New screen:** `app/support.tsx`
- Server-authoritative Elite check (queries `user_profiles.subscription_tier + subscription_status + current_period_end`)
- Expired/revoked Elite correctly falls through to standard support
- Elite UI: "Elite Priority Support" banner, pink accent, `[ELITE PRIORITY]` subject-line prefix
- Pro UI: `[PRO]` subject-line prefix for context
- Free UI: standard support, upgrade prompt at bottom
- Support categories: Account, Billing, Events/Ticketing, Technical, Other
- Email composition pre-populated with user name, email, plan, category, and message
- Falls back gracefully if `mailto:` is not available (Alert with email address)
- Response time estimates: Elite 12–24h, Standard 2–5 business days
- Quick links: FAQs, Email, Privacy Policy, Terms of Use
- Admin identification: email subject contains `[ELITE PRIORITY]` tag for priority routing
- Upgrade prompt for non-Elite users

**Profile screen updated:** `app/(tabs)/profile.tsx`
- "Help & Support" entry now routes to `/support` instead of raw `mailto:` for all users
- Elite users see "Priority Support (Elite)" label with Priority badge

**Route registered:** `app/_layout.tsx` → `/support`

## FILES CHANGED
- `app/support.tsx` — NEW: Priority Support screen
- `app/(tabs)/profile.tsx` — Updated: Help entry routes to /support
- `app/_layout.tsx` — Updated: `/support` route registered

## DATABASE CHANGES
None. Support requests go via email (mailto: protocol).

## SECURITY
- Server-authoritative Elite check prevents Free/Pro users from self-claiming Elite priority
- Expired/revoked Elite treated as standard support
- No user-provided data is written to any database table — pure email composition

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN

## TESTS PERFORMED
- Code review: Elite tier check logic, email URL construction, gate screen

## NOT TESTED
- Physical device: Elite user email composition with [ELITE PRIORITY] subject
- Physical device: Free user gate/upgrade prompt
- Email client availability on device

## BLOCKERS
None.

## FOLLOW-UP
- V2: In-app chat support with Admin dashboard integration
- V2: Support ticket tracking screen (read receipt status)
- Admin side: tag `[ELITE PRIORITY]` emails in email client for priority queue routing (USER ACTION)
