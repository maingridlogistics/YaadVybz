// ─── Creator Analytics Service v2 ────────────────────────────────────────────
//
// Client-side wrapper for Creator Analytics RPCs v2.
// All RPCs are SECURITY DEFINER — identity is derived from auth.uid() server-side.
// Entitlement validated server-side: tier + status + current_period_end.
// Free users receive 'UPGRADE_REQUIRED' error code, never analytics data.
//
// METRIC SOURCES (documented per field):
//
// ALL-TIME METRICS (lifetime counters — cannot be date-filtered):
//   total_event_views       → events.view_count          (lifetime counter)
//   total_going_alltime     → events.going_count          (lifetime counter)
//   total_interested_alltime→ events.interested_count     (lifetime counter)
//   total_tickets_sold_alltime → events.tickets_sold      (lifetime counter)
//   boost_event_impressions_alltime → events.boost_impressions (lifetime counter)
//   total_biz_views         → businesses.view_count       (lifetime counter)
//   total_biz_reviews_alltime → business_reviews (rows, ALL-TIME)
//   weighted_avg_rating     → business_reviews.rating     (weighted avg, ALL-TIME)
//   biz_boost_impressions_alltime → business_promotions.impression_count (sum of paid promos)
//
// PERIOD METRICS (timestamped source tables — Elite date filtering supported):
//   ticket_revenue_by_currency → ticket_orders.paid_at (per currency)
//   period_rsvp_going       → user_rsvps.created_at  (status='going')
//   period_rsvp_interested  → user_rsvps.created_at  (status='interested')
//   period_biz_favorites    → business_favorites.created_at
//   period_biz_reviews      → business_reviews.created_at
//   period_biz_boost_clicks → business_promotion_clicks.created_at
//
// NOTE: Event boost clicks are NOT tracked individually in this schema.
//       Event CTR is not available and is NOT displayed.

import { getSupabaseClient } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalyticsTier = 'pro' | 'elite';

/** Revenue entry: never mixed across currencies */
export interface RevenueByCurrency {
  currency: string;
  amount_minor: number;
}

// ── Overview ──────────────────────────────────────────────────────────────────
export interface AnalyticsOverview {
  ok: true;
  tier: AnalyticsTier;
  period_days: number | null;   // null = All Time
  since: string | null;

  // ── ALL-TIME METRICS (lifetime counters — never date-filtered) ──────────────
  total_events: number;
  total_event_views: number;            // events.view_count (ALL-TIME)
  total_going_alltime: number;          // events.going_count (ALL-TIME)
  total_interested_alltime: number;     // events.interested_count (ALL-TIME)
  total_tickets_sold_alltime: number;   // events.tickets_sold (ALL-TIME)
  boost_event_impressions_alltime: number; // events.boost_impressions (ALL-TIME)

  total_businesses: number;
  total_biz_views: number;              // businesses.view_count (ALL-TIME)
  total_biz_reviews_alltime: number;   // business_reviews rows (ALL-TIME)
  weighted_avg_rating: number | null;  // weighted avg from business_reviews (ALL-TIME)

  biz_boost_impressions_alltime: number; // sum of paid promo impression_count (ALL-TIME)
  biz_boost_clicks_alltime: number;     // eligible clicks from same paid promo population (ALL-TIME)

  // ── PERIOD METRICS (genuine timestamp filtering) ────────────────────────────
  ticket_revenue_by_currency: RevenueByCurrency[]; // ticket_orders.paid_at
  period_rsvp_going: number;            // user_rsvps.created_at (going)
  period_rsvp_interested: number;       // user_rsvps.created_at (interested)
  period_biz_favorites: number;         // business_favorites.created_at
  period_biz_reviews: number;           // business_reviews.created_at
  period_biz_boost_clicks: number;      // business_promotion_clicks.created_at (PERIOD)
}

// ── Event analytics row ───────────────────────────────────────────────────────
export interface EventAnalyticsRow {
  id: string;
  title: string;
  date: string;
  parish: string;
  status: string;

  // ALL-TIME counters (lifetime — never date-filtered)
  view_count: number;
  going_count_alltime: number;
  interested_count_alltime: number;
  tickets_sold_alltime: number;
  boost_impressions_alltime: number;

  boosted: boolean;
  boost_type: string | null;
  boost_status: string | null;
  boost_expires_at: string | null;
  selling_tickets_in_app: boolean;
  created_at: string;

  // PERIOD metrics (timestamped)
  period_rsvp_going: number;
  period_rsvp_interested: number;
  revenue_by_currency: RevenueByCurrency[]; // ticket_orders.paid_at
  period_order_count: number;
}

// ── Business analytics row ────────────────────────────────────────────────────
export interface BusinessAnalyticsRow {
  id: string;
  name: string;
  status: string;
  verified: boolean;
  view_count: number;                  // ALL-TIME
  avg_rating: number | null;           // weighted from reviews (ALL-TIME)
  review_count_alltime: number;        // ALL-TIME
  created_at: string;

  // PERIOD metrics (timestamped)
  period_favorites: number;            // business_favorites.created_at
  period_review_count: number;         // business_reviews.created_at

  // Boost
  boost_status: string | null;
  boost_placement: string | null;
  boost_ends_at: string | null;
  boost_impressions_alltime: number;   // paid promo impression_count sum (ALL-TIME)
  boost_clicks_alltime: number;        // eligible clicks same paid promo population (ALL-TIME)
  period_boost_clicks: number;         // business_promotion_clicks.created_at (PERIOD)
}

// ── Export rows ───────────────────────────────────────────────────────────────
// Events and Businesses have different shapes — no fake zeros for N/A fields.
export interface ExportEventRow {
  content_type: 'Event';
  name: string;
  date: string;
  parish: string;
  status: string;
  views_alltime: number;
  rsvp_going_alltime: number;
  rsvp_interested_alltime: number;
  tickets_sold_alltime: number;
  revenue_by_currency: string;         // e.g. "JMD: 150.00 | USD: 30.00"
  boosted: string;
  boost_type: string;
  boost_impressions_alltime: number;
  // Note: Event boost_clicks intentionally omitted — no individual click records exist
}

export interface ExportBusinessRow {
  content_type: 'Business';
  name: string;
  date: string;
  parish: string;
  status: string;
  views_alltime: number;
  favorites_alltime: number;
  reviews_alltime: number;
  avg_rating: number | null;
  boosted: string;
  boost_type: string;
  boost_impressions_alltime: number;
  boost_clicks_alltime: number;
  boost_ctr_pct: number | null;
  verified: string;
}

export interface AnalyticsError {
  ok: false;
  error: string;
  code?: string;
}

export type OverviewResult = AnalyticsOverview | AnalyticsError;
export type EventAnalyticsResult =
  | { ok: true; tier: AnalyticsTier; period_days: number | null; since: string | null; events: EventAnalyticsRow[] }
  | AnalyticsError;
export type BusinessAnalyticsResult =
  | { ok: true; tier: AnalyticsTier; period_days: number | null; since: string | null; businesses: BusinessAnalyticsRow[] }
  | AnalyticsError;
export type ExportResult =
  | { ok: true; tier: 'elite'; events: ExportEventRow[]; businesses: ExportBusinessRow[] }
  | AnalyticsError;

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchAnalyticsOverview(days?: number | null): Promise<OverviewResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_creator_analytics_overview', {
    p_days: days ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return data as OverviewResult;
}

export async function fetchEventAnalytics(days?: number | null): Promise<EventAnalyticsResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_creator_event_analytics', {
    p_days: days ?? null,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) return { ok: false, error: error.message };
  return data as EventAnalyticsResult;
}

export async function fetchBusinessAnalytics(days?: number | null): Promise<BusinessAnalyticsResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_creator_business_analytics', {
    p_days: days ?? null,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) return { ok: false, error: error.message };
  return data as BusinessAnalyticsResult;
}

export async function fetchAnalyticsExport(): Promise<ExportResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_creator_analytics_export');
  if (error) return { ok: false, error: error.message };
  return data as ExportResult;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Format a single currency amount from minor units */
export function formatRevenueSingle(minor: number, currency: string): string {
  const amt = minor / 100;
  if (currency.toUpperCase() === 'JMD') {
    return `J$${amt.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${amt.toFixed(2)} ${currency.toUpperCase()}`;
}

/** Format a revenue-by-currency array as a readable string */
export function formatRevenueByCurrency(revenues: RevenueByCurrency[]): string {
  if (!revenues || revenues.length === 0) return '—';
  return revenues
    .map((r) => formatRevenueSingle(r.amount_minor, r.currency))
    .join(' · ');
}

/** Calculate click-through rate safely */
export function safeCtr(clicks: number, impressions: number): string {
  if (impressions <= 0 || clicks <= 0) return '—';
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

/** Format period label for display */
export function periodLabel(days: number | null): string {
  if (!days) return 'All Time';
  return `Last ${days} Days`;
}

/**
 * Build a CSV string from separate Event and Business export rows.
 * Events and Businesses use different columns — no fake zeros for N/A fields.
 * Output has two sections separated by a blank line.
 */
export function buildCsvString(events: ExportEventRow[], businesses: ExportBusinessRow[]): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  // ── Events section ─────────────────────────────────────────────────────────
  const eventHeaders = [
    'Type', 'Name', 'Date', 'Parish', 'Status',
    'Views (All-Time)', 'RSVP Going (All-Time)', 'RSVP Interested (All-Time)',
    'Tickets Sold (All-Time)', 'Revenue by Currency',
    'Boosted', 'Boost Type', 'Boost Impressions (All-Time)',
  ].join(',');

  const eventRows = (events ?? []).map((r) => [
    escape(r.content_type),
    escape(r.name),
    escape(r.date),
    escape(r.parish),
    escape(r.status),
    escape(r.views_alltime),
    escape(r.rsvp_going_alltime),
    escape(r.rsvp_interested_alltime),
    escape(r.tickets_sold_alltime),
    escape(r.revenue_by_currency),
    escape(r.boosted),
    escape(r.boost_type),
    escape(r.boost_impressions_alltime),
  ].join(','));

  // ── Businesses section ──────────────────────────────────────────────────────
  const bizHeaders = [
    'Type', 'Name', 'Listed Date', 'Parish', 'Status',
    'Views (All-Time)', 'Favorites (All-Time)', 'Reviews (All-Time)', 'Avg Rating',
    'Boosted', 'Boost Placement', 'Boost Impressions (All-Time)',
    'Boost Clicks (All-Time)', 'Boost CTR', 'Verified',
  ].join(',');

  const bizRows = (businesses ?? []).map((r) => [
    escape(r.content_type),
    escape(r.name),
    escape(r.date),
    escape(r.parish),
    escape(r.status),
    escape(r.views_alltime),
    escape(r.favorites_alltime),
    escape(r.reviews_alltime),
    escape(r.avg_rating ?? ''),
    escape(r.boosted),
    escape(r.boost_type),
    escape(r.boost_impressions_alltime),
    escape(r.boost_clicks_alltime),
    escape(r.boost_ctr_pct != null ? `${r.boost_ctr_pct}%` : ''),
    escape(r.verified),
  ].join(','));

  const eventSection = [eventHeaders, ...eventRows].join('\n');
  const bizSection   = [bizHeaders,   ...bizRows  ].join('\n');

  return `EVENTS\n${eventSection}\n\nBUSINESSES\n${bizSection}`;
}
