// payoutService.ts — Phase 6: Payouts, Refunds, Cancellations, Finance
//
// All financial operations use SECURITY DEFINER RPCs — client never
// controls amounts, statuses, or payout eligibility.

import { getSupabaseClient } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PromoterPayoutBalance {
  ok: boolean;
  promoter_id?: string;
  currency?: string;
  gross_platform_minor?: number;
  total_refunded_minor?: number;
  total_liability_minor?: number;
  total_paid_out_minor?: number;
  in_flight_minor?: number;  // requested + processing payouts not yet paid
  post_event_hold_minor?: number;
  pending_event_minor?: number;
  eligible_minor?: number;
  has_financial_hold?: boolean;
  notes?: string | null;
  error?: string;
}

export interface PromoterFinanceSummary {
  ok: boolean;
  event_id?: string;
  payout_status?: string;
  cancellation_status?: string | null;
  payout_eligible_at?: string | null;
  event_date?: string;
  platform_gross_minor?: number;
  platform_customer_fees_minor?: number;
  platform_promoter_fees_minor?: number;
  promoter_proceeds_minor?: number;
  cash_collected_directly_minor?: number;
  total_refunded_minor?: number;
  refunds_pending_minor?: number;
  cash_orders_promoter_must_refund?: number;
  open_liabilities_minor?: number;
  payouts?: PayoutRecord[];
  disputes?: DisputeRecord[];
  has_financial_hold?: boolean;
  currency?: string | null;
  error?: string;
}

export interface PayoutRecord {
  id: string;
  amount_minor: number;
  currency: string;
  status: string;
  requested_at: string;
  paid_at: string | null;
}

export interface DisputeRecord {
  id: string;
  amount_minor: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export interface PayoutAccount {
  id: string;
  promoter_id: string;
  currency: string;
  payout_method: string;
  display_name: string;
  bank_country: string;
  status: string;
  verified_at: string | null;
  created_at: string;
}

export interface CancellationRequest {
  id: string;
  event_id: string;
  requested_by: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

// ─── Promoter Finance ──────────────────────────────────────────────────────

export async function getPromoterFinanceSummary(
  eventId: string,
): Promise<PromoterFinanceSummary> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_promoter_finance_summary', {
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: error.message };
  return data as PromoterFinanceSummary;
}

export async function getPromoterPayoutBalance(
  promoterId: string,
  currency: string,
): Promise<PromoterPayoutBalance> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_promoter_payout_balance', {
    p_promoter_id: promoterId,
    p_currency: currency,
  });
  if (error) return { ok: false, error: error.message };
  return data as PromoterPayoutBalance;
}

// ─── Payout Account Management ─────────────────────────────────────────────

export async function getPayoutAccounts(
  promoterId: string,
): Promise<{ data: PayoutAccount[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('promoter_payout_accounts')
    .select('*')
    .eq('promoter_id', promoterId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as PayoutAccount[], error: null };
}

export async function addPayoutAccount(params: {
  promoterId: string;
  currency: string;
  payoutMethod: string;
  displayName: string;
  bankCountry?: string;
}): Promise<{ data: PayoutAccount | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('promoter_payout_accounts')
    .insert({
      promoter_id: params.promoterId,
      currency: params.currency.toUpperCase(),
      payout_method: params.payoutMethod,
      display_name: params.displayName,
      bank_country: params.bankCountry ?? 'JM',
      status: 'pending_verification',
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as PayoutAccount, error: null };
}

// ─── Payout Request ────────────────────────────────────────────────────────

export async function requestPromoterPayout(params: {
  eventId: string;
  currency: string;
  payoutAccountId: string;
}): Promise<{ ok: boolean; payout_id?: string; amount_minor?: number; currency?: string; status?: string; error?: string; code?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('request_promoter_payout', {
    p_event_id: params.eventId,
    p_currency: params.currency,
    p_payout_account_id: params.payoutAccountId,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return {
    ok: !!result?.ok,
    payout_id: result?.payout_id as string | undefined,
    amount_minor: result?.amount_minor as number | undefined,
    currency: result?.currency as string | undefined,
    status: result?.status as string | undefined,
    error: result?.error as string | undefined,
    code: result?.code as string | undefined,
  };
}

// ─── Payout History ────────────────────────────────────────────────────────

export interface PromoterPayout {
  id: string;
  promoter_id: string;
  payout_account_id: string | null;
  currency: string;
  amount_minor: number;
  status: string;
  provider_payout_ref: string | null;
  initiated_at: string;
  completed_at: string | null;
  failure_reason: string | null;
  notes: string | null;
}

export async function getPayoutHistory(
  promoterId: string,
): Promise<{ data: PromoterPayout[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('promoter_payouts')
    .select('*')
    .eq('promoter_id', promoterId)
    .order('initiated_at', { ascending: false })
    .limit(50);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as PromoterPayout[], error: null };
}

// ─── Event Cancellation ────────────────────────────────────────────────────

export async function submitCancellationRequest(params: {
  eventId: string;
  reason: string;
}): Promise<{ ok: boolean; request_id?: string; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('submit_event_cancellation_request', {
    p_event_id: params.eventId,
    p_reason: params.reason,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return {
    ok: !!result?.ok,
    request_id: result?.request_id as string | undefined,
    error: result?.error as string | undefined,
  };
}

export async function getCancellationRequest(
  eventId: string,
): Promise<{ data: CancellationRequest | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('event_cancellation_requests')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as CancellationRequest | null, error: null };
}

// ─── Admin: Cancellation Review ────────────────────────────────────────────

export interface AdminCancellationRequest {
  id: string;
  event_id: string;
  requested_by: string;
  reason: string;
  status: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  event_title?: string;
  event_date?: string;
  promoter_name?: string;
}

export async function fetchAdminCancellationRequests(): Promise<AdminCancellationRequest[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('event_cancellation_requests')
    .select('*, events(title, date, promoter_id)')
    .order('created_at', { ascending: false })
    .limit(100);

  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    event_title: r.events?.title ?? '',
    event_date: r.events?.date ?? '',
    promoter_name: '',
  }));
}

export async function adminApproveCancellation(requestId: string): Promise<{ ok: boolean; refund_records_created?: number; cash_orders_promoter_must_refund?: number; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_approve_event_cancellation', {
    p_request_id: requestId,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return {
    ok: !!result?.ok,
    refund_records_created: result?.refund_records_created as number | undefined,
    cash_orders_promoter_must_refund: result?.cash_orders_promoter_must_refund as number | undefined,
    error: result?.error as string | undefined,
  };
}

export async function adminRejectCancellation(requestId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('event_cancellation_requests')
    .update({ status: 'rejected_admin', rejection_reason: reason, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending_admin');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Admin: Payout Management ──────────────────────────────────────────────

export interface AdminPayoutRequest {
  id: string;
  promoter_id: string;
  payout_account_id: string | null;
  currency: string;
  amount_minor: number;
  status: string;
  initiated_at: string;
  completed_at: string | null;
  provider_payout_ref: string | null;
  notes: string | null;
}

export async function fetchAdminPayoutRequests(): Promise<AdminPayoutRequest[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('promoter_payouts')
    .select('*')
    .order('initiated_at', { ascending: false })
    .limit(100);
  return (data ?? []) as AdminPayoutRequest[];
}

export async function adminUpdatePayoutStatus(params: {
  payoutId: string;
  newStatus: 'processing' | 'paid' | 'failed';
  providerRef?: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_update_payout_status', {
    p_payout_id: params.payoutId,
    p_new_status: params.newStatus,
    p_provider_ref: params.providerRef ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return { ok: !!result?.ok, error: result?.error as string | undefined };
}

// ─── Admin: Financial Holds ─────────────────────────────────────────────────

export async function adminPlaceHold(params: {
  promoterId: string;
  reason: string;
  eventId?: string;
}): Promise<{ ok: boolean; hold_id?: string; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_place_payout_hold', {
    p_promoter_id: params.promoterId,
    p_reason: params.reason,
    p_event_id: params.eventId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return { ok: !!result?.ok, hold_id: result?.hold_id as string | undefined, error: result?.error as string | undefined };
}

export async function adminReleaseHold(holdId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_release_payout_hold', {
    p_hold_id: holdId,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown>;
  return { ok: !!result?.ok, error: result?.error as string | undefined };
}

// ─── Fetch refund records ───────────────────────────────────────────────────

export interface TicketRefund {
  id: string;
  order_id: string;
  refund_reason: string;
  amount_minor: number;
  currency: string;
  status: string;
  provider_refund_ref: string | null;
  processed_at: string | null;
  created_at: string;
}

export async function getRefundsByEvent(
  eventId: string,
): Promise<{ data: TicketRefund[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ticket_refunds')
    .select('*, ticket_orders!inner(event_id)')
    .eq('ticket_orders.event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TicketRefund[], error: null };
}

// ─── Format helpers ─────────────────────────────────────────────────────────

export function formatPayoutStatus(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    pending_event:  { label: 'Pending Event',    color: '#607D8B' },
    post_event_hold:{ label: 'Post-Event Hold',  color: '#FF9800' },
    eligible:       { label: 'Eligible',          color: '#4CAF50' },
    requested:      { label: 'Requested',         color: '#2196F3' },
    processing:     { label: 'Processing',        color: '#9C27B0' },
    paid:           { label: 'Paid Out',          color: '#4CAF50' },
    held:           { label: 'On Hold',           color: '#F44336' },
    failed:         { label: 'Failed',            color: '#F44336' },
    cancelled:      { label: 'Cancelled',         color: '#607D8B' },
  };
  return map[status] ?? { label: status, color: '#607D8B' };
}

export function formatCancellationStatus(status: string | null): { label: string; color: string } {
  if (!status) return { label: 'Active', color: '#4CAF50' };
  const map: Record<string, { label: string; color: string }> = {
    cancellation_requested: { label: 'Cancellation Requested', color: '#FF9800' },
    cancellation_approved:  { label: 'Cancelled',              color: '#F44336' },
  };
  return map[status] ?? { label: status, color: '#607D8B' };
}

export async function executeProviderRefunds(eventId: string): Promise<{ ok: boolean; processed?: number; error?: string }> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not authenticated.' };

  const { data, error } = await supabase.functions.invoke('process-event-refunds', {
    body: { event_id: eventId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { const t = await error.context?.text(); if (t) msg = t; } catch {}
    }
    return { ok: false, error: msg };
  }

  return { ok: true, ...(data as Record<string, unknown>) } as { ok: boolean; processed?: number };
}
