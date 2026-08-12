// usePayouts.tsx — Phase 6: Finance, Payouts, Cancellations
//
// Hooks for promoter finance dashboard, payout request flow, and
// event cancellation request flow.

import { useState, useCallback } from 'react';
import {
  getPromoterFinanceSummary,
  getPromoterPayoutBalance,
  getPayoutAccounts,
  getPayoutHistory,
  requestPromoterPayout,
  submitCancellationRequest,
  getCancellationRequest,
  fetchAdminCancellationRequests,
  fetchAdminPayoutRequests,
  adminApproveCancellation,
  adminRejectCancellation,
  adminUpdatePayoutStatus,
  adminPlaceHold,
  adminReleaseHold,
  type PromoterFinanceSummary,
  type PromoterPayoutBalance,
  type PayoutAccount,
  type PromoterPayout,
  type AdminCancellationRequest,
  type AdminPayoutRequest,
  type CancellationRequest,
} from '../services/payoutService';

// ─── Promoter Finance Summary ───────────────────────────────────────────────

export function usePromoterFinance(eventId: string) {
  const [summary, setSummary] = useState<PromoterFinanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    const data = await getPromoterFinanceSummary(eventId);
    if (data.ok) setSummary(data);
    else setError(data.error ?? 'Failed to load finance summary.');
    setLoading(false);
  }, [eventId]);

  return { summary, loading, error, load };
}

// ─── Payout Balance ─────────────────────────────────────────────────────────

export function usePayoutBalance(promoterId: string, currency: string) {
  const [balance, setBalance] = useState<PromoterPayoutBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!promoterId || !currency) return;
    setLoading(true);
    setError(null);
    const data = await getPromoterPayoutBalance(promoterId, currency);
    if (data.ok) setBalance(data);
    else setError(data.error ?? 'Failed to load balance.');
    setLoading(false);
  }, [promoterId, currency]);

  return { balance, loading, error, load };
}

// ─── Payout Accounts ────────────────────────────────────────────────────────

export function usePayoutAccounts(promoterId: string) {
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!promoterId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getPayoutAccounts(promoterId);
    setAccounts(data);
    if (err) setError(err);
    setLoading(false);
  }, [promoterId]);

  return { accounts, loading, error, load };
}

// ─── Payout History ─────────────────────────────────────────────────────────

export function usePayoutHistory(promoterId: string) {
  const [payouts, setPayouts] = useState<PromoterPayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!promoterId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getPayoutHistory(promoterId);
    setPayouts(data);
    if (err) setError(err);
    setLoading(false);
  }, [promoterId]);

  return { payouts, loading, error, load };
}

// ─── Payout Request ─────────────────────────────────────────────────────────

export function usePayoutRequest() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPayout = useCallback(async (params: {
    eventId: string;
    currency: string;
    payoutAccountId: string;
  }) => {
    setError(null);
    setSubmitting(true);
    const result = await requestPromoterPayout(params);
    setSubmitting(false);
    if (!result.ok) setError(result.error ?? 'Payout request failed. Please try again.');
    return result;
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { submitting, error, requestPayout, clearError };
}

// ─── Cancellation Request ───────────────────────────────────────────────────

export function useCancellationRequest(eventId: string) {
  const [request, setRequest] = useState<CancellationRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const { data, error: err } = await getCancellationRequest(eventId);
    setRequest(data);
    if (err) setError(err);
    setLoading(false);
  }, [eventId]);

  const submit = useCallback(async (reason: string) => {
    setError(null);
    setSubmitting(true);
    const result = await submitCancellationRequest({ eventId, reason });
    setSubmitting(false);
    if (!result.ok) setError(result.error ?? 'Failed to submit cancellation request.');
    else await load();
    return result;
  }, [eventId, load]);

  const clearError = useCallback(() => setError(null), []);

  return { request, loading, submitting, error, load, submit, clearError };
}

// ─── Admin: Cancellations ───────────────────────────────────────────────────

export function useAdminCancellations() {
  const [requests, setRequests] = useState<AdminCancellationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminCancellationRequests();
      setRequests(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load cancellation requests.');
    }
    setLoading(false);
  }, []);

  const approve = useCallback(async (requestId: string) => {
    setActionLoading(requestId);
    const result = await adminApproveCancellation(requestId);
    setActionLoading(null);
    if (result.ok) await load();
    return result;
  }, [load]);

  const reject = useCallback(async (requestId: string, reason: string) => {
    setActionLoading(requestId);
    const result = await adminRejectCancellation(requestId, reason);
    setActionLoading(null);
    if (result.ok) await load();
    return result;
  }, [load]);

  return { requests, loading, error, actionLoading, load, approve, reject };
}

// ─── Admin: Payouts ─────────────────────────────────────────────────────────

export function useAdminPayouts() {
  const [payouts, setPayouts] = useState<AdminPayoutRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPayoutRequests();
      setPayouts(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load payout requests.');
    }
    setLoading(false);
  }, []);

  const updateStatus = useCallback(async (params: {
    payoutId: string;
    newStatus: 'processing' | 'paid' | 'failed';
    providerRef?: string;
    notes?: string;
  }) => {
    setActionLoading(params.payoutId);
    const result = await adminUpdatePayoutStatus(params);
    setActionLoading(null);
    if (result.ok) await load();
    return result;
  }, [load]);

  const placeHold = useCallback(async (promoterId: string, reason: string, eventId?: string) => {
    const result = await adminPlaceHold({ promoterId, reason, eventId });
    if (result.ok) await load();
    return result;
  }, [load]);

  const releaseHold = useCallback(async (holdId: string, note?: string) => {
    const result = await adminReleaseHold(holdId, note);
    if (result.ok) await load();
    return result;
  }, [load]);

  return { payouts, loading, error, actionLoading, load, updateStatus, placeHold, releaseHold };
}
