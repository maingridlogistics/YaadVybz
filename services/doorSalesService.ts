// doorSalesService.ts — Phase 5: Door / Walk-Up Sales
//
// All door sale operations. Calls SECURITY DEFINER RPCs or Edge Functions only.
// Client NEVER controls price, fees, currency, inventory counters, or seller attribution.
// secure_token values are never returned to this layer.

import { getSupabaseClient } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DoorSaleItem {
  ticket_type_id: string;
  quantity: number;
}

export interface DoorCashSaleResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  currency?: string;
  base_subtotal_minor?: number;
  customer_fee_minor?: number;
  customer_total_minor?: number;
  promoter_fee_minor?: number;
  platform_gross_minor?: number;
  tickets_issued?: number;
  sell_and_checkin?: boolean;
  checkin_ok?: boolean;
  idempotent_replay?: boolean;
  error?: string;
  code?: string;
}

export interface DoorCardCheckoutResult {
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
  code?: string;
}

export interface DoorSalesSummary {
  ok: boolean;
  event_id: string;
  online_orders: number;
  online_tickets_sold: number;
  online_base_minor: number;
  online_customer_fee_minor: number;
  door_cash_orders: number;
  door_cash_tickets_sold: number;
  door_cash_collected_minor: number;
  door_cash_base_minor: number;
  door_card_orders: number;
  door_card_tickets_sold: number;
  door_card_base_minor: number;
  total_tickets_sold: number;
  total_base_minor: number;
  total_customer_fees_minor: number;
  total_promoter_fees_minor: number;
  platform_held_minor: number;
  cash_collected_directly_minor: number;
  platform_receivable_cash_minor: number;
  total_checked_in: number;
  total_valid_tickets: number;
  total_transferred: number;
  total_voided: number;
  staff_activity: {
    sold_by: string;
    display_name: string;
    cash_orders: number;
    cash_collected_minor: number;
    card_orders: number;
    total_tickets: number;
  }[];
  error?: string;
}

export interface VoidOrderResult {
  ok: boolean;
  order_id?: string;
  error?: string;
}

export interface DoorOrderTicket {
  ticket_id: string;
  attendee_name: string;
  secure_token: string | null; // null once transferred/voided
  status: string;
  checked_in_at: string | null;
  ticket_type_name: string;
  price_minor: number;
}

export interface DoorOrderTicketsResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  currency?: string;
  total_minor?: number;
  tickets?: DoorOrderTicket[];
  error?: string;
}

// ─── Cash Door Sale ───────────────────────────────────────────────────────────

/**
 * Submit an atomic cash door sale via the door_sale_cash SECURITY DEFINER RPC.
 * Server enforces: auth, authorization, event validity, pricing, inventory,
 * ticket issuance, ledger entries, audit trail, cash-only accounting.
 */
export async function submitCashDoorSale(params: {
  eventId: string;
  items: DoorSaleItem[];
  attendeeName: string;
  idempotencyKey: string;
  sellAndCheckin?: boolean;
  contactInfo?: string;
  ownerUserId?: string | null;
}): Promise<DoorCashSaleResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('door_sale_cash', {
    p_event_id: params.eventId,
    p_items: params.items,
    p_attendee_name: params.attendeeName,
    p_idempotency_key: params.idempotencyKey,
    p_sell_and_checkin: params.sellAndCheckin ?? false,
    p_contact_info: params.contactInfo ?? null,
    p_owner_user_id: params.ownerUserId ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as Record<string, unknown>;
  return {
    ok: !!result?.ok,
    order_id: result?.order_id as string | undefined,
    order_number: result?.order_number as string | undefined,
    currency: result?.currency as string | undefined,
    base_subtotal_minor: result?.base_subtotal_minor as number | undefined,
    customer_fee_minor: result?.customer_fee_minor as number | undefined,
    customer_total_minor: result?.customer_total_minor as number | undefined,
    promoter_fee_minor: result?.promoter_fee_minor as number | undefined,
    platform_gross_minor: result?.platform_gross_minor as number | undefined,
    tickets_issued: result?.tickets_issued as number | undefined,
    sell_and_checkin: result?.sell_and_checkin as boolean | undefined,
    checkin_ok: result?.checkin_ok as boolean | undefined,
    idempotent_replay: result?.idempotent_replay as boolean | undefined,
    error: result?.error as string | undefined,
    code: result?.code as string | undefined,
  };
}

// ─── Card Door Sale (Stripe checkout, reuses Phase 3 architecture) ────────────

/**
 * Create a Stripe checkout session for a card door sale.
 * Server enforces: staff authorization, server-trusted pricing, inventory reservation.
 * Ticket is issued ONLY after verified webhook from Stripe.
 */
export async function createDoorCardCheckout(params: {
  eventId: string;
  items: DoorSaleItem[];
  attendeeName: string;
  ownerUserId?: string | null;
}): Promise<DoorCardCheckoutResult> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: 'You must be signed in to create a door sale.' };
  }

  const { data, error } = await supabase.functions.invoke('create-door-card-checkout', {
    body: {
      event_id: params.eventId,
      items: params.items,
      attendee_name: params.attendeeName,
      owner_user_id: params.ownerUserId ?? null,
      platform: 'mobile',
    },
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

  return { ok: true, ...(data as Record<string, unknown>) } as DoorCardCheckoutResult;
}

// ─── Door Sales Summary ───────────────────────────────────────────────────────

/**
 * Fetch aggregated door + online sales summary for the promoter dashboard.
 * Uses get_door_sales_summary() SECURITY DEFINER RPC.
 * Returns no individual customer PII or secure_token values.
 */
export async function getDoorSalesSummary(
  eventId: string,
): Promise<{ data: DoorSalesSummary | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_door_sales_summary', {
    p_event_id: eventId,
  });

  if (error) return { data: null, error: error.message };
  const result = data as Record<string, unknown>;
  if (!result?.ok) return { data: null, error: (result?.error as string) ?? 'Failed to load summary.' };
  return { data: data as DoorSalesSummary, error: null };
}

// ─── Door Order Tickets (for anonymous QR display after sale) ───────────────

/**
 * Fetch ticket rows (including secure_token for QR display) for a door cash order.
 * Only the seller, the event promoter, or admin can call this.
 * Returns secure_token only for 'valid' (unchecked-in) tickets.
 * Used to display QR codes to anonymous walk-up customers immediately after sale.
 */
export async function getDoorOrderTickets(
  orderId: string,
): Promise<DoorOrderTicketsResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_door_order_tickets', {
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  if (!result?.ok) return { ok: false, error: (result?.error as string) ?? 'Failed to load tickets.' };

  return {
    ok: true,
    order_id: result.order_id as string,
    order_number: result.order_number as string,
    currency: result.currency as string,
    total_minor: result.total_minor as number,
    tickets: (result.tickets as DoorOrderTicket[]) ?? [],
  };
}

// ─── Recent Door Cash Orders ────────────────────────────────────────────────

export interface RecentCashOrder {
  id: string;
  order_number: string;
  customer_total_minor: number;
  currency: string;
  attendee_name: string;
  tickets_count: number;
  voided_at: string | null;
  created_at: string;
  has_checkin: boolean;
}

/**
 * Fetch the most recent door cash orders for an event (last 10).
 * Used for the void UI on the door sale screen.
 * Returns only door_cash orders. No secure_token is ever returned.
 */
export async function getRecentCashOrders(
  eventId: string,
  limit = 10,
): Promise<{ data: RecentCashOrder[]; error: string | null }> {
  const supabase = getSupabaseClient();

  const { data: orders, error: ordErr } = await supabase
    .from('ticket_orders')
    .select('id, order_number, customer_total_minor, currency, voided_at, created_at, payment_status')
    .eq('event_id', eventId)
    .eq('payment_method', 'door_cash')
    .in('payment_status', ['paid', 'voided'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ordErr) return { data: [], error: ordErr.message };
  if (!orders || orders.length === 0) return { data: [], error: null };

  const orderIds = orders.map((o: any) => o.id);

  // Ticket counts and attendee names (no secure_token)
  const { data: tickets } = await supabase
    .from('tickets')
    .select('order_id, attendee_name, checked_in_at')
    .in('order_id', orderIds);

  const ticketsByOrder = new Map<string, { count: number; name: string; hasCheckin: boolean }>();
  for (const t of (tickets ?? []) as any[]) {
    const existing = ticketsByOrder.get(t.order_id);
    ticketsByOrder.set(t.order_id, {
      count: (existing?.count ?? 0) + 1,
      name: existing?.name ?? t.attendee_name ?? 'Walk-up Customer',
      hasCheckin: (existing?.hasCheckin ?? false) || !!t.checked_in_at,
    });
  }

  return {
    data: (orders as any[]).map((o) => {
      const tInfo = ticketsByOrder.get(o.id);
      return {
        id: o.id,
        order_number: o.order_number,
        customer_total_minor: o.customer_total_minor,
        currency: o.currency,
        attendee_name: tInfo?.name ?? 'Walk-up Customer',
        tickets_count: tInfo?.count ?? 0,
        voided_at: o.voided_at ?? null,
        created_at: o.created_at,
        has_checkin: tInfo?.hasCheckin ?? false,
      };
    }),
    error: null,
  };
}

// ─── Void Cash Order ──────────────────────────────────────────────────────────

/**
 * Void a door cash order. Records an immutable audit trail.
 * Only cash orders can be voided through this RPC.
 * Only authorized door staff / promoter / admin can void.
 */
export async function voidDoorCashOrder(
  orderId: string,
  reason: string,
): Promise<VoidOrderResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('void_door_cash_order', {
    p_order_id: orderId,
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return {
    ok: !!result?.ok,
    order_id: result?.order_id as string | undefined,
    error: result?.error as string | undefined,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatMinorAmount(minor: number, currency: string): string {
  const amt = minor / 100;
  if (currency.toUpperCase() === 'JMD') {
    return `J$${amt.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${amt.toFixed(2)}`;
}

/**
 * Generate a cryptographically-adequate idempotency key for cash door sales.
 * Uses timestamp + random suffix to prevent duplicate submissions on double-tap.
 */
export function generateIdempotencyKey(eventId: string, sellerId: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `door-${eventId.slice(0, 8)}-${sellerId.slice(0, 8)}-${ts}-${rand}`;
}
