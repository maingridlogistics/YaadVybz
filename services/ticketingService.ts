// ticketingService.ts — Phase 2: Promoter Ticketing Setup & Management
//
// All database access for promoter ticketing configuration.
// No customer checkout, no payment processing, no QR/token operations.
// Promoter ticket dashboard uses sanitized RPCs (no secure_token exposure).

import { getSupabaseClient } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketSalesStatus = 'draft' | 'on_sale' | 'paused' | 'ended' | 'cancelled';
export type TicketCurrency = 'USD' | 'JMD';
export type TicketTierStatus = 'active' | 'paused' | 'sold_out' | 'ended' | 'cancelled';

export interface EventTicketSettings {
  id: string;
  event_id: string;
  enabled: boolean;
  currency: TicketCurrency;
  sales_status: TicketSalesStatus;
  sales_start_at: string | null;
  sales_end_at: string | null;
  currency_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price_minor: number;        // integer minor units (cents for USD, cents for JMD)
  currency: TicketCurrency;
  quantity_total: number;
  quantity_reserved: number;
  quantity_sold: number;
  min_per_order: number;
  max_per_order: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  status: TicketTierStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTicketTierInput {
  event_id: string;
  name: string;
  description: string;
  price_minor: number;
  currency: TicketCurrency;
  quantity_total: number;
  min_per_order: number;
  max_per_order: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  sort_order?: number;
}

export interface UpdateTicketTierInput {
  name?: string;
  description?: string;
  price_minor?: number;
  quantity_total?: number;
  min_per_order?: number;
  max_per_order?: number;
  sales_start_at?: string | null;
  sales_end_at?: string | null;
  status?: TicketTierStatus;
  sort_order?: number;
}

// Sanitized row returned by get_event_tickets_for_promoter() RPC
// secure_token is structurally absent from this type.
export interface PromoterTicketRow {
  id: string;
  event_id: string;
  ticket_type_id: string;
  ticket_type_name: string;
  owner_user_id: string | null;
  purchaser_user_id: string | null;
  attendee_name: string;
  status: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  transfer_count: number;
  created_at: string;
  updated_at: string;
}

export interface EventTicketSummary {
  event_id: string;
  total_tickets: number;
  checked_in: number;
  not_checked_in: number;
  valid: number;
  transferred_out: number;
  voided: number;
  cancelled: number;
  refunded: number;
  by_type: {
    ticket_type_id: string;
    ticket_type_name: string;
    total: number;
    checked_in: number;
  }[];
}

// ─── Ticketing Terms Acceptance ───────────────────────────────────────────────

/**
 * Current ticketing terms version.
 * Bump this string whenever terms are materially updated to re-trigger acceptance.
 * NOTE: Placeholder wording below is NOT attorney-approved legal advice.
 * Replace with reviewed legal copy before production launch.
 */
export const TICKETING_TERMS_VERSION = '2026-08-v1';

export const TICKETING_TERMS_CONTENT = [
  {
    heading: 'Platform Fee',
    body: 'Vybz Hub collects a 5% platform fee from your ticket proceeds. Customers pay an additional 5% convenience fee on their purchase. Example: $100 ticket — customer pays $105, you receive $95.',
  },
  {
    heading: 'Payout Timeline',
    body: 'Your proceeds become eligible for payout 5–7 business days after the event ends. Funds may be held longer for disputes, chargebacks, fraud review, refunds, or admin holds.',
  },
  {
    heading: 'No Voluntary Refunds',
    body: 'Ticket sales are final. You may not offer voluntary refunds directly. Vybz Hub may authorize refunds for event cancellations, duplicate payments, fraud, or legally required situations.',
  },
  {
    heading: 'Cancellation Responsibility',
    body: 'If you cancel an event that has paid ticket sales, you are responsible for all associated refunds, processing costs, and platform fees. Cancellation requires admin approval.',
  },
  {
    heading: 'Chargeback & Dispute Liability',
    body: 'You are financially responsible for chargebacks and payment disputes related to your event. Disputed amounts and associated fees may be deducted from your pending proceeds.',
  },
  {
    heading: 'Accurate Event Information',
    body: 'You must keep event details (date, venue, lineup) accurate at all times. Material changes after ticket sales begin may require admin approval and customer notification.',
  },
  {
    heading: 'Permanent Financial Records',
    body: 'All ticket transaction records are permanently retained for financial, legal, and compliance purposes. You cannot request deletion of financial transaction history.',
  },
  {
    heading: 'Fraud Prohibition',
    body: 'Fraudulent activity — including manipulating sales data, fabricating attendance, or abusing the platform — will result in immediate suspension and potential legal action.',
  },
] as const;

/**
 * Check if the current user has accepted the current ticketing terms version.
 */
export async function hasAcceptedTicketingTerms(
  userId: string,
): Promise<{ accepted: boolean; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ticketing_terms_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('terms_version', TICKETING_TERMS_VERSION)
    .maybeSingle();
  if (error) return { accepted: false, error: error.message };
  return { accepted: !!data, error: null };
}

/**
 * Record that the current user has accepted the ticketing terms.
 */
export async function acceptTicketingTerms(
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('ticketing_terms_acceptances')
    .upsert(
      {
        user_id: userId,
        terms_version: TICKETING_TERMS_VERSION,
        platform: 'mobile',
      },
      { onConflict: 'user_id,terms_version' },
    );
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Admin Helper ─────────────────────────────────────────────────────────────

/**
 * Fetch lightweight ticketing summary for admin event listing.
 * Returns tier count, currency, sales status, and enabled state.
 */
export async function getAdminTicketingInfo(
  eventId: string,
): Promise<{ enabled: boolean; currency: string | null; salesStatus: string | null; tiersCount: number }> {
  const supabase = getSupabaseClient();
  const [settingsRes, tiersRes] = await Promise.all([
    supabase
      .from('event_ticket_settings')
      .select('enabled, currency, sales_status')
      .eq('event_id', eventId)
      .maybeSingle(),
    supabase
      .from('event_ticket_types')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .neq('status', 'cancelled'),
  ]);
  return {
    enabled: (settingsRes.data as any)?.enabled ?? false,
    currency: (settingsRes.data as any)?.currency ?? null,
    salesStatus: (settingsRes.data as any)?.sales_status ?? null,
    tiersCount: tiersRes.count ?? 0,
  };
}

// ─── Ticket Settings ──────────────────────────────────────────────────────────

/**
 * Fetch the ticket settings for an event. Returns null if not yet configured.
 */
export async function getEventTicketSettings(
  eventId: string,
): Promise<{ data: EventTicketSettings | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_ticket_settings')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as EventTicketSettings | null, error: null };
}

/**
 * Create ticket settings for an event (first-time setup).
 */
export async function createEventTicketSettings(
  eventId: string,
  currency: TicketCurrency,
): Promise<{ data: EventTicketSettings | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_ticket_settings')
    .insert({
      event_id: eventId,
      enabled: false,
      currency,
      sales_status: 'draft',
      currency_locked: false,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as EventTicketSettings, error: null };
}

/**
 * Update ticket settings. Currency cannot be changed if locked.
 */
export async function updateEventTicketSettings(
  settingsId: string,
  updates: Partial<Pick<EventTicketSettings,
    'enabled' | 'currency' | 'sales_status' | 'sales_start_at' | 'sales_end_at'
  >>,
): Promise<{ data: EventTicketSettings | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_ticket_settings')
    .update(updates)
    .eq('id', settingsId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as EventTicketSettings, error: null };
}

/**
 * Upsert ticket settings — creates if not existing, updates if present.
 */
export async function upsertEventTicketSettings(
  eventId: string,
  updates: Partial<Pick<EventTicketSettings,
    'enabled' | 'currency' | 'sales_status' | 'sales_start_at' | 'sales_end_at'
  >>,
): Promise<{ data: EventTicketSettings | null; error: string | null }> {
  const supabase = getSupabaseClient();

  // Try to fetch existing first
  const { data: existing } = await supabase
    .from('event_ticket_settings')
    .select('id, currency_locked')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    // If currency is being changed but is already locked, reject client-side too
    if (updates.currency && (existing as any).currency_locked) {
      return {
        data: null,
        error: 'Currency cannot be changed after the first paid ticket order has been placed.',
      };
    }
    return updateEventTicketSettings((existing as any).id, updates);
  }

  // Create new settings
  const { data, error } = await supabase
    .from('event_ticket_settings')
    .insert({
      event_id: eventId,
      enabled: updates.enabled ?? false,
      currency: updates.currency ?? 'USD',
      sales_status: updates.sales_status ?? 'draft',
      sales_start_at: updates.sales_start_at ?? null,
      sales_end_at: updates.sales_end_at ?? null,
      currency_locked: false,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as EventTicketSettings, error: null };
}

// ─── Ticket Tiers ─────────────────────────────────────────────────────────────

/**
 * Fetch all non-cancelled ticket tiers for an event.
 */
export async function getTicketTiers(
  eventId: string,
): Promise<{ data: TicketTier[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .not('status', 'eq', 'cancelled')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TicketTier[], error: null };
}

/**
 * Create a new ticket tier.
 */
export async function createTicketTier(
  input: CreateTicketTierInput,
): Promise<{ data: TicketTier | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_ticket_types')
    .insert({
      event_id: input.event_id,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      price_minor: input.price_minor,
      currency: input.currency,
      quantity_total: input.quantity_total,
      quantity_reserved: 0,
      quantity_sold: 0,
      min_per_order: input.min_per_order,
      max_per_order: input.max_per_order,
      sales_start_at: input.sales_start_at,
      sales_end_at: input.sales_end_at,
      status: 'active',
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as TicketTier, error: null };
}

/**
 * Update an existing ticket tier.
 */
export async function updateTicketTier(
  tierId: string,
  updates: UpdateTicketTierInput,
): Promise<{ data: TicketTier | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_ticket_types')
    .update(updates)
    .eq('id', tierId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as TicketTier, error: null };
}

/**
 * Soft-delete a ticket tier by setting status to 'cancelled'.
 * Cannot cancel a tier that has sold tickets (safety guard).
 */
export async function cancelTicketTier(
  tierId: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  // Fetch current state
  const { data: tier } = await supabase
    .from('event_ticket_types')
    .select('quantity_sold, name')
    .eq('id', tierId)
    .single();

  if ((tier as any)?.quantity_sold > 0) {
    return {
      error: `Cannot remove "${(tier as any).name}" — ${(tier as any).quantity_sold} ticket(s) have already been sold. Contact support to cancel a tier with sold tickets.`,
    };
  }

  const { error } = await supabase
    .from('event_ticket_types')
    .update({ status: 'cancelled' })
    .eq('id', tierId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Reorder ticket tiers by updating sort_order for each.
 */
export async function reorderTicketTiers(
  tiers: { id: string; sort_order: number }[],
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const updates = tiers.map(({ id, sort_order }) =>
    supabase.from('event_ticket_types').update({ sort_order }).eq('id', id),
  );
  await Promise.all(updates);
  return { error: null };
}

// ─── Promoter Dashboard (sanitized RPCs) ─────────────────────────────────────

/**
 * Get ticket sales summary for an event.
 * Uses get_event_ticket_summary() RPC — no secure_token, no PII.
 */
export async function getEventTicketSummary(
  eventId: string,
): Promise<{ data: EventTicketSummary | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .rpc('get_event_ticket_summary', { p_event_id: eventId });

  if (error) return { data: null, error: error.message };
  return { data: data as EventTicketSummary, error: null };
}

/**
 * Get paginated attendee list for an event.
 * Uses get_event_tickets_for_promoter() RPC — secure_token is structurally absent.
 */
export async function getEventTicketsForPromoter(
  eventId: string,
  limit = 50,
  offset = 0,
): Promise<{ data: PromoterTicketRow[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .rpc('get_event_tickets_for_promoter', {
      p_event_id: eventId,
      p_limit: limit,
      p_offset: offset,
    });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as PromoterTicketRow[], error: null };
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

/**
 * Format a minor-unit amount as a display string.
 * e.g. formatMinorAmount(2500, 'USD') => "$25.00"
 *      formatMinorAmount(150000, 'JMD') => "J$1,500.00"
 */
export function formatMinorAmount(minor: number, currency: TicketCurrency): string {
  const major = minor / 100;
  const formatted = major.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'JMD' ? `J$${formatted}` : `$${formatted}`;
}

/**
 * Parse a user-entered price string (e.g. "25.00" or "25") into minor units.
 * Returns null if the input is not a valid non-negative number.
 */
export function parsePriceToMinor(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed < 0) return null;
  // Round to nearest cent to avoid floating-point issues
  return Math.round(parsed * 100);
}

/**
 * Format minor units back to a human-readable input string (e.g. "25.00").
 */
export function formatMinorToInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Sales status display config.
 */
export const SALES_STATUS_CONFIG: Record<TicketSalesStatus, {
  label: string;
  description: string;
  color: string;
  icon: string;
}> = {
  draft: {
    label: 'Draft',
    description: 'Not visible or available for purchase',
    color: '#666666',
    icon: 'edit',
  },
  on_sale: {
    label: 'On Sale',
    description: 'Tickets are live and available to purchase',
    color: '#00A846',
    icon: 'sell',
  },
  paused: {
    label: 'Paused',
    description: 'Sales temporarily suspended',
    color: '#FFD700',
    icon: 'pause-circle',
  },
  ended: {
    label: 'Ended',
    description: 'Sales period has closed',
    color: '#AAAAAA',
    icon: 'stop-circle',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Ticketing cancelled for this event',
    color: '#FF4444',
    icon: 'cancel',
  },
};

/**
 * Ticket tier status display config.
 */
export const TIER_STATUS_CONFIG: Record<TicketTierStatus, {
  label: string;
  color: string;
  icon: string;
}> = {
  active: { label: 'Active', color: '#00A846', icon: 'check-circle' },
  paused: { label: 'Paused', color: '#FFD700', icon: 'pause-circle' },
  sold_out: { label: 'Sold Out', color: '#FF9800', icon: 'do-not-disturb' },
  ended: { label: 'Ended', color: '#AAAAAA', icon: 'stop-circle' },
  cancelled: { label: 'Cancelled', color: '#FF4444', icon: 'cancel' },
};
