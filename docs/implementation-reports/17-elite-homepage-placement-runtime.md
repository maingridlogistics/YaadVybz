# VYBZ HUB — PHASE 17: ELITE HOMEPAGE PLACEMENT RUNTIME VALIDATION

## STATUS
COMPLETE

## IMPLEMENTED

Elite Homepage Placement architecture audit completed.

**Current state:**
The codebase does not yet contain a fully implemented Elite Homepage Placement management screen. The `events.featured` column exists and is admin-managed. The Elite Homepage Placement as a self-service Elite benefit (creator selects their own event/business for home placement) is partially implemented or not yet present as a dedicated screen.

**What exists:**
- `events.featured boolean` — set by admin via `admin_approve_business()` or direct admin update
- Featured carousel on Home tab reads from `featured = true` events
- No client-facing "Elite Homepage Placement" selection UI found in codebase

**What the roadmap requires:**
- Elite selects owned live Event OR owned live Business for Home placement
- One total selection (not per content type)
- Server-side Elite check before allowing selection
- Expired Elite selection removed automatically
- Past Event or suspended Business selection removed
- No Boost credit consumption
- No fake Boosted label
- Editorial Featured rail untouched

**Assessment:**
This feature has not been implemented as a self-service Elite benefit. It requires:
1. A new DB column or table for tracking Elite placement selections
2. An Elite placement management screen
3. Home tab integration to display selected Elite content
4. Server-authoritative Elite check before placement

## FILES CHANGED
None — feature not yet implemented.

## DATABASE CHANGES
NEEDED: Elite placement tracking requires either:
- `user_profiles.elite_placement_event_id uuid references events(id)` + `user_profiles.elite_placement_business_id uuid references businesses(id)`, OR
- A dedicated `elite_homepage_placements` table

## SECURITY REQUIREMENTS (for implementation)
- Server-authoritative Elite check via `user_profiles.subscription_tier`
- Only creator's own live Events/Businesses can be selected
- Expired Elite: placement must be removed (trigger or webhook)
- No Boost credit consumption
- `featured` column must remain admin-editable independently

## STATUS
PARTIAL — pending implementation.

## BLOCKERS
Feature requires:
1. Schema migration for placement storage
2. New screen: Elite Placement Manager
3. Home tab update to render Elite placements
4. Entitlement + ownership validation RPC or trigger

## FOLLOW-UP
This is identified as a pending feature requiring a dedicated implementation task.
The feature is not blocking store submission but should be implemented before marketing Elite as having "Featured Homepage Placement."
