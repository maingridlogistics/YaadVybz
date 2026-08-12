// customerTicketingService.ts
// Phase 3 — Customer-facing ticketing service.
// Handles ticket selection, checkout, My Tickets, and order receipts.
// NEVER exposes secure_token to promoters. Customers may read their own tickets.

import { getSupabaseClient } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicTicketTier {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  quantity_reserved: number;
  available: number; // computed: total - sold - reserved
  min_per_order: number;
  max_per_order: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  status: string;
  sort_order: number;
}

export interface EventTicketingStatus {
  enabled: boolean;
  currency: string | null;
  sales_status: string | null; // 'draft' | 'on_sale' | 'paused' | 'ended'
  tiers: PublicTicketTier[];
  // UI state
  buyState: 'buy_tickets' | 'sales_not_started' | 'sold_out' | 'sales_ended' | 'paused' | 'not_configured' | 'past_event';
  salesStartAt: string | null;
}

export interface CheckoutItem {
  ticket_type_id: string;
  quantity: number;
}

export interface CheckoutResult {
  ok: boolean;
  checkout_url?: string;
  session_id?: string;
  order_id?: string;
  order_number?: string;
  expires_at?: string;
  amounts?: {
    base_subtotal_minor: number;
    customer_fee_minor: number;
    customer_total_minor: number;
    currency: string;
  };
  error?: string;
  code?: string; // 'terms_required' | 'jmd_provider_unavailable' | etc.
}

export interface MyTicket {
  id: string;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  attendee_name: string;
  secure_token: string; // customers can read their own token
  status: string;
  checked_in_at: string | null;
  transfer_count: number;
  created_at: string;
  // Joined
  event_title: string;
  event_date: string;
  event_start_time: string;
  event_venue: string;
  event_parish: string;
  event_cover_image: string;
  ticket_type_name: string;
  price_minor: number;
  currency: string;
  order_number: string;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  event_id: string;
  event_title: string;
  event_date: string;
  event_venue: string;
  event_parish: string;
  event_cover_image: string;
  currency: string;
  base_subtotal_minor: number;
  customer_fee_minor: number;
  customer_total_minor: number;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
  items: {
    id: string;
    ticket_type_name_snap: string;
    unit_price_minor_snap: number;
    quantity: number;
    subtotal_minor_snap: number;
    customer_fee_minor_snap: number;
  }[];
  tickets: {
    id: string;
    attendee_name: string;
    secure_token: string;
    status: string;
    checked_in_at: string | null;
  }[];
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export { formatDate } from '../constants/data';

export function formatMinorAmount(minor: number, currency: string): string {
  const amt = minor / 100;
  if (currency.toUpperCase() === 'JMD') {
    return `J$${amt.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${amt.toFixed(2)}`;
}

// ─── Customer Terms ───────────────────────────────────────────────────────────

export const CUSTOMER_TICKET_TERMS_VERSION = '1.0';

export const CUSTOMER_TICKET_TERMS_CONTENT = [
  {
    heading: '1. All Sales Final',
    body: 'All ticket purchases are final. No voluntary refunds are available. Refunds are only issued in the event of an event cancellation by the organizer.',
  },
  {
    heading: '2. Event Cancellation',
    body: 'If an event is cancelled by the organizer, ticket holders will be notified and a refund process will be initiated. Refund timelines may vary by payment method.',
  },
  {
    heading: '3. Ticket Validation',
    body: 'Your ticket QR code is required for entry. Keep it safe and do not share it. Each QR code is unique and can only be scanned once.',
  },
  {
    heading: '4. Transfers',
    body: 'If a ticket is transferred, the previous QR code is invalidated and a new one is issued to the recipient. Only the most recent QR code is valid.',
  },
  {
    heading: '5. Fraud Prevention',
    body: 'Fraudulent, duplicated, or manipulated tickets will be voided. Vybz Hub reserves the right to refuse entry for invalid tickets.',
  },
  {
    heading: '6. Venue Rules',
    body: 'All attendees must comply with the event venue rules and local laws. Your ticket does not guarantee entry if you are refused for conduct or legal reasons.',
  },
  {
    heading: '7. Service Fee',
    body: 'A 5% service fee is added to the ticket price to cover platform costs. This fee is shown clearly before purchase and is non-refundable except in event cancellation.',
  },
];

export async function hasAcceptedCustomerTerms(userId: string): Promise<{ accepted: boolean }> {
  const supabase = getSupabaseClient();
  // Must filter by the CURRENT terms version — a prior acceptance of an old
  // version does not count if the terms have been updated.
  const { data } = await supabase
    .from('customer_ticket_terms_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('terms_version', CUSTOMER_TICKET_TERMS_VERSION)
    .limit(1)
    .maybeSingle();
  return { accepted: !!data };
}

export async function acceptCustomerTerms(userId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('customer_ticket_terms_acceptances')
    .upsert({ user_id: userId, terms_version: CUSTOMER_TICKET_TERMS_VERSION });
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Event Ticketing Status ───────────────────────────────────────────────────

function isEventPastDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d) < today;
}

export async function getEventTicketingStatus(
  eventId: string,
  eventDate: string,
): Promise<{ data: EventTicketingStatus | null; error: string | null }> {
  const supabase = getSupabaseClient();

  const [settingsResult, tiersResult] = await Promise.all([
    supabase
      .from('event_ticket_settings')
      .select('enabled, currency, sales_status, sales_start_at')
      .eq('event_id', eventId)
      .maybeSingle(),
    supabase
      .from('event_ticket_types')
      .select('id, event_id, name, description, price_minor, currency, quantity_total, quantity_sold, quantity_reserved, min_per_order, max_per_order, sales_start_at, sales_end_at, status, sort_order')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .order('sort_order', { ascending: true }),
  ]);

  if (settingsResult.error) return { data: null, error: settingsResult.error.message };

  const settings = settingsResult.data;
  if (!settings || !settings.enabled) {
    return {
      data: {
        enabled: false,
        currency: null,
        sales_status: null,
        tiers: [],
        buyState: 'not_configured',
        salesStartAt: null,
      },
      error: null,
    };
  }

  const rawTiers = (tiersResult.data ?? []).map((t: any) => ({
    ...t,
    available: Math.max(0, t.quantity_total - t.quantity_sold - t.quantity_reserved),
  })) as PublicTicketTier[];

  // Determine buy state
  let buyState: EventTicketingStatus['buyState'];

  if (isEventPastDate(eventDate)) {
    buyState = 'past_event';
  } else if (settings.sales_status === 'draft') {
    buyState = 'sales_not_started';
  } else if (settings.sales_status === 'paused') {
    buyState = 'paused';
  } else if (settings.sales_status === 'ended') {
    buyState = 'sales_ended';
  } else if (settings.sales_status === 'on_sale') {
    const hasAvailable = rawTiers.some((t) => t.available > 0);
    buyState = hasAvailable ? 'buy_tickets' : 'sold_out';
  } else {
    buyState = 'not_configured';
  }

  return {
    data: {
      enabled: settings.enabled,
      currency: settings.currency,
      sales_status: settings.sales_status,
      tiers: rawTiers,
      buyState,
      salesStartAt: settings.sales_start_at ?? null,
    },
    error: null,
  };
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

export async function createTicketCheckout(
  eventId: string,
  items: CheckoutItem[],
  customerTermsAccepted: boolean,
): Promise<CheckoutResult> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: 'You must be signed in to purchase tickets.' };
  }

  const { data, error } = await supabase.functions.invoke('create-ticket-checkout', {
    body: { event_id: eventId, items, customer_terms_accepted: customerTermsAccepted },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    let errorMessage = error.message;
    let code: string | undefined;
    if (error instanceof FunctionsHttpError) {
      try {
        const text = await error.context?.text();
        if (text) {
          const parsed = JSON.parse(text);
          errorMessage = parsed.error ?? text;
          code = parsed.code;
        }
      } catch {
        errorMessage = error.message;
      }
    }
    return { ok: false, error: errorMessage, code };
  }

  return { ok: true, ...(data as Record<string, unknown>) } as CheckoutResult;
}

// ─── My Tickets ───────────────────────────────────────────────────────────────

export async function getMyTickets(
  limit = 50,
  offset = 0,
): Promise<{ data: MyTicket[]; error: string | null }> {
  const supabase = getSupabaseClient();

  const { data: tickets, error: ticketsErr } = await supabase
    .from('tickets')
    .select(`
      id, order_id, event_id, ticket_type_id, attendee_name, secure_token,
      status, checked_in_at, transfer_count, created_at
    `)
    .eq('owner_user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (ticketsErr) return { data: [], error: ticketsErr.message };
  if (!tickets || tickets.length === 0) return { data: [], error: null };

  // Fetch related events, ticket types, and order numbers in parallel
  const eventIds = [...new Set(tickets.map((t: any) => t.event_id))];
  const ticketTypeIds = [...new Set(tickets.map((t: any) => t.ticket_type_id))];
  const orderIds = [...new Set(tickets.map((t: any) => t.order_id))];

  const [eventsRes, typesRes, ordersRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, date, start_time, venue, parish, cover_image')
      .in('id', eventIds),
    supabase
      .from('event_ticket_types')
      .select('id, name, price_minor, currency')
      .in('id', ticketTypeIds),
    supabase
      .from('ticket_orders')
      .select('id, order_number')
      .in('id', orderIds),
  ]);

  const eventMap = new Map((eventsRes.data ?? []).map((e: any) => [e.id, e]));
  const typeMap = new Map((typesRes.data ?? []).map((t: any) => [t.id, t]));
  const orderMap = new Map((ordersRes.data ?? []).map((o: any) => [o.id, o]));

  const result: MyTicket[] = tickets.map((t: any) => {
    const ev = eventMap.get(t.event_id) ?? {};
    const ty = typeMap.get(t.ticket_type_id) ?? {};
    const or = orderMap.get(t.order_id) ?? {};
    return {
      ...t,
      event_title: (ev as any).title ?? '',
      event_date: (ev as any).date ?? '',
      event_start_time: (ev as any).start_time ?? '',
      event_venue: (ev as any).venue ?? '',
      event_parish: (ev as any).parish ?? '',
      event_cover_image: (ev as any).cover_image ?? '',
      ticket_type_name: (ty as any).name ?? '',
      price_minor: (ty as any).price_minor ?? 0,
      currency: (ty as any).currency ?? 'USD',
      order_number: (or as any).order_number ?? '',
    };
  });

  return { data: result, error: null };
}

// ─── Order Detail ─────────────────────────────────────────────────────────────

export async function getOrderDetail(orderId: string): Promise<{ data: OrderDetail | null; error: string | null }> {
  const supabase = getSupabaseClient();

  const [orderRes, itemsRes] = await Promise.all([
    supabase
      .from('ticket_orders')
      .select('id, order_number, event_id, currency, base_subtotal_minor, customer_fee_minor, customer_total_minor, payment_status, paid_at, created_at')
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('ticket_order_items')
      .select('id, ticket_type_name_snap, unit_price_minor_snap, quantity, subtotal_minor_snap, customer_fee_minor_snap')
      .eq('order_id', orderId),
  ]);

  if (orderRes.error || !orderRes.data) {
    return { data: null, error: orderRes.error?.message ?? 'Order not found.' };
  }

  const order = orderRes.data as any;

  // Use sanitized RPC for tickets — returns secure_token only for tickets still owned
  // by the current buyer, null for any transferred away. This prevents the original
  // purchaser from seeing the new owner's QR after a transfer.
  const { data: ticketsRpc, error: ticketsRpcErr } = await supabase
    .rpc('get_purchase_history_tickets', { p_order_id: orderId });

  // Fetch event info
  const { data: ev } = await supabase
    .from('events')
    .select('id, title, date, venue, parish, cover_image')
    .eq('id', order.event_id)
    .maybeSingle();

  return {
    data: {
      ...order,
      event_title: (ev as any)?.title ?? '',
      event_date: (ev as any)?.date ?? '',
      event_venue: (ev as any)?.venue ?? '',
      event_parish: (ev as any)?.parish ?? '',
      event_cover_image: (ev as any)?.cover_image ?? '',
      items: itemsRes.data ?? [],
      tickets: (ticketsRpcErr ? [] : ticketsRpc) ?? [],
    },
    error: null,
  };
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export interface TransferResult {
  ok: boolean;
  transfer_id?: string;
  error?: string;
  code?: string;
}

export async function lookupTransferRecipient(
  identifier: string,
): Promise<{ ok: boolean; recipient_id?: string; display_name?: string; display_hint?: string; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .rpc('lookup_transfer_recipient', { p_identifier: identifier.trim() });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; recipient_id?: string; display_name?: string; display_hint?: string; error?: string };
}

export async function transferTicket(
  ticketId: string,
  recipientId: string,
): Promise<TransferResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('complete_ticket_transfer', {
    p_ticket_id: ticketId,
    p_recipient_id: recipientId,
  });
  if (error) return { ok: false, error: error.message };
  const res = data as Record<string, unknown>;
  return {
    ok: !!res?.ok,
    transfer_id: res?.transfer_id as string | undefined,
    error: res?.error as string | undefined,
    code: res?.code as string | undefined,
  };
}

// ─── Attendee rename ──────────────────────────────────────────────────────────

export async function changeAttendeeName(
  ticketId: string,
  newName: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('change_ticket_attendee_name', {
    p_ticket_id: ticketId,
    p_new_name: newName.trim(),
  });
  if (error) return { ok: false, error: error.message };
  const res = data as Record<string, unknown>;
  return { ok: !!res?.ok, error: res?.error as string | undefined };
}
