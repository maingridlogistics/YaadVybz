/**
 * Vybz Hub — Canonical Route Constants
 *
 * Single source of truth for all public-facing URL patterns.
 * Used by email templates, push notifications, and deep-link handlers
 * to ensure consistent, non-dead routing across mobile and web.
 *
 * Production domain: https://vybzhub.com
 *
 * NEVER use preview URLs, localhost, or old domain prefixes in production emails.
 */

export const VYBZ_DOMAIN = 'https://vybzhub.com';

// ─── URL Builders ─────────────────────────────────────────────────────────────

/** Public event detail page */
export function getEventUrl(eventId: string): string {
  if (!eventId || eventId === 'undefined' || eventId === 'null') return VYBZ_DOMAIN;
  return `${VYBZ_DOMAIN}/event/${eventId}`;
}

/**
 * Ticket transfer claim page.
 * Recipient clicks this link in the invitation email.
 * If the mobile app is installed, the universal link opens the app's /claim-ticket route.
 * If not, the website serves the claim-ticket page as a fallback.
 */
export function getTicketClaimUrl(transferId: string): string {
  if (!transferId || transferId === 'undefined' || transferId === 'null') return VYBZ_DOMAIN;
  return `${VYBZ_DOMAIN}/claim-ticket?transfer=${transferId}`;
}

/** Customer order receipt */
export function getOrderUrl(orderId: string): string {
  if (!orderId || orderId === 'undefined' || orderId === 'null') return `${VYBZ_DOMAIN}/my-tickets`;
  return `${VYBZ_DOMAIN}/ticketing/order/${orderId}`;
}

/** My Tickets (canonical attendee landing for ticket-related emails) */
export const MY_TICKETS_URL = `${VYBZ_DOMAIN}/my-tickets`;

/** Auth / Sign In */
export const AUTH_URL = `${VYBZ_DOMAIN}/auth`;

/** Home / Browse */
export const HOME_URL = VYBZ_DOMAIN;

// ─── Notification → Route Map ─────────────────────────────────────────────────
// Reference documentation for _layout.tsx push notification routing.
//
// Notification Type                  → App Route                        → Web Route
// ───────────────────────────────────────────────────────────────────────────────
// ticket_purchase_confirmed           → /my-tickets                      → /my-tickets
// ticket_transfer_pending             → /my-tickets                      → /my-tickets
// ticket_transfer_accepted            → /my-tickets                      → /my-tickets
// ticket_transfer_completed           → /my-tickets                      → /my-tickets
// ticket_transfer_declined            → /my-tickets                      → /my-tickets
// ticket_transfer_cancelled           → /my-tickets                      → /my-tickets
// ticket_inventory_low                → /ticketing/dashboard/[eventId]   → /ticketing/dashboard/[eventId]
// event_approved                      → /event/[eventId]                 → /event/[eventId]
// event_rejected                      → /edit-event/[eventId]            → n/a (app only)
// event_cancelled                     → /(tabs)                          → /
// event_reminder / new_event_parish   → /event/[eventId]                 → /event/[eventId]
// new_event_promoter                  → /event/[eventId]                 → /event/[eventId]
// boost_expiring                      → /monetization/boost/[eventId]    → n/a (app only)
// payment_failed                      → /monetization/upgrade            → n/a
// subscription_cancellation_scheduled → /monetization/upgrade            → n/a
// new_follower                        → /(tabs)/profile                  → n/a
// account_deletion_request            → /admin/users                         → n/a (admin only)
// account_deletion_approved           → /onboarding                           → /
// account_deletion_rejected           → /(tabs)/profile                       → n/a

// ─── Email → CTA Route Map ────────────────────────────────────────────────────
// Reference documentation for email template CTAs.
//
// Email Template                 → CTA Label                → Canonical URL
// ──────────────────────────────────────────────────────────────────────────────
// new_event_parish               → View Event               → /event/[eventId]
// new_event_promoter             → See Full Details         → /event/[eventId]
// event_change                   → View Updated Event       → /event/[eventId]
// event_cancelled                → Find Other Events        → /
// rsvp_reminder                  → View Event Details       → /event/[eventId]
// event_approved                 → View Your Event          → /event/[eventId]
// ticket_purchase_confirmed      → View My Tickets in App   → /my-tickets
// ticket_transfer_invitation     → Claim Your Free Ticket   → /claim-ticket?transfer=[id]
// ticket_transfer_accepted       → View My Tickets          → /my-tickets
// ticket_transfer_declined       → View My Tickets          → /my-tickets
// account_deletion_approved      → Create a New Account     → /
