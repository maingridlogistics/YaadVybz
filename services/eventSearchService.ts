// ─── Event Search Service ──────────────────────────────────────────────────────
// Server-authoritative event search via search_events RPC.
// Ranking (blended score) and Search Priority entitlement are resolved
// entirely server-side — client cannot influence the result ordering.
// NO React imports — pure data functions only.

import { getSupabaseClient } from '../lib/supabase';
import { Event } from '../constants/data';

export type EventSearchScope = 'upcoming' | 'past' | 'all';

export interface EventSearchParams {
  parish?: string | null;
  typeId?: string | null;
  query?: string | null;
  /** Controls date scope. Defaults to 'upcoming'. */
  scope?: EventSearchScope;
  limit?: number;
  offset?: number;
}

// ─── DB row → Event model ─────────────────────────────────────────────────────
function mapSearchEventRow(row: any): Event {
  return {
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    type: row.type ?? '',
    typeLabel: row.type_label ?? '',
    eventTypes: row.event_types ?? [],
    parish: row.parish ?? '',
    date: row.date ?? '',
    startTime: row.start_time ?? '',
    endTime: row.end_time ?? '',
    venue: row.venue ?? '',
    address: row.address ?? '',
    coverImage: row.cover_image ?? '',
    flyerImages: row.flyer_images ?? [],
    ticketPrice: row.ticket_price ?? 'Free',
    ticketLink: row.ticket_link ?? '',
    dressCode: row.dress_code ?? undefined,
    ageLimit: row.age_limit ?? 'All Ages',
    lineup: row.lineup ?? [],
    lineupEntries: row.lineup_entries ?? [],
    recurring: row.recurring ?? false,
    recurringFrequency: row.recurring_frequency ?? undefined,
    promoterId: row.promoter_id ?? '',
    promoterName: row.promoter_name ?? '',
    goingCount: row.going_count ?? 0,
    interestedCount: row.interested_count ?? 0,
    viewCount: row.view_count ?? 0,
    featured: row.featured ?? false,
    tags: row.tags ?? [],
    status: row.status ?? 'live',
    boosted: row.boosted ?? false,
    boostType: row.boost_type ?? undefined,
    boostStatus: row.boost_status ?? undefined,
    boostExpiresAt: row.boost_expires_at ?? undefined,
    boostImpressions: row.boost_impressions ?? 0,
    // promoterTier is returned for display only — NOT used for ranking.
    // Server-side blended score already incorporates live entitlement.
    promoterTier: row.promoter_tier ?? 'free',
    sellingTicketsInApp: row.selling_tickets_in_app ?? false,
    ticketProviderName: row.ticket_provider_name ?? undefined,
    physicalTicketLocations: row.physical_ticket_locations ?? [],
    // Fields not returned by search RPC — safe defaults
    flagReason: undefined,
    rejectedReason: undefined,
    reportCount: 0,
    eventPhotosLink: undefined,
    contactInfo: undefined,
    boostStartedAt: undefined,
    boostPaymentIntent: undefined,
    boostCheckoutSession: undefined,
    boostAmount: 0,
    boostCurrency: 'usd',
    ticketCommissionPct: 5,
    ticketsSold: 0,
    createdAt: undefined,
  };
}

// ─── searchEvents ─────────────────────────────────────────────────────────────
// Calls search_events RPC. Server handles:
//   • Hard eligibility filters (status=live, upcoming, parish, type)
//   • Text relevance scoring
//   • Search Priority: Pro/Elite entitlement join on user_profiles (live, not stale)
//   • Boost signal: events.boosted + boost_type + boost_status
//   • Blended final ranking (relevance dominates; paid signals bounded)
//
// The client must NOT apply additional sort passes to the returned slice —
// doing so would corrupt the server-authoritative ranking order.
export async function searchEvents(
  params: EventSearchParams
): Promise<{ results: Event[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const {
    parish  = null,
    typeId  = null,
    query   = null,
    scope   = 'upcoming',
    limit   = 40,
    offset  = 0,
  } = params;

  const { data, error } = await supabase.rpc('search_events', {
    p_parish:  parish  ?? null,
    p_type_id: typeId  ?? null,
    p_query:   query?.trim() || null,
    p_scope:   scope,
    p_limit:   limit,
    p_offset:  offset,
  });

  if (error) {
    console.error('[eventSearchService] searchEvents:', error.message);
    return { results: [], error: error.message };
  }

  return {
    results: ((data ?? []) as any[]).map(mapSearchEventRow),
    error: null,
  };
}
