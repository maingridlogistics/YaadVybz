// hooks/useCustomerTicketing.tsx
// Phase 3 — Customer-facing ticketing hooks.

import { useState, useCallback, useEffect } from 'react';
import {
  getEventTicketingStatus,
  getMyTickets,
  getOrderDetail,
  hasAcceptedCustomerTerms,
  acceptCustomerTerms,
  createTicketCheckout,
  type EventTicketingStatus,
  type MyTicket,
  type OrderDetail,
  type CheckoutItem,
  type CheckoutResult,
} from '../services/customerTicketingService';

// ─── Event Ticketing Status Hook ──────────────────────────────────────────────

export function useEventTicketingStatus(eventId: string, eventDate: string) {
  const [status, setStatus] = useState<EventTicketingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId || !eventDate) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getEventTicketingStatus(eventId, eventDate);
    setStatus(data);
    if (err) setError(err);
    setLoading(false);
  }, [eventId, eventDate]);

  useEffect(() => { load(); }, [load]);

  return { status, loading, error, reload: load };
}

// ─── My Tickets Hook ──────────────────────────────────────────────────────────

export function useMyTickets() {
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getMyTickets(PAGE_SIZE, 0);
    setTickets(data);
    setHasMore(data.length === PAGE_SIZE);
    if (err) setError(err);
    setLoading(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data, error: err } = await getMyTickets(PAGE_SIZE, tickets.length);
    setTickets((prev) => [...prev, ...data]);
    setHasMore(data.length === PAGE_SIZE);
    if (err) setError(err);
    setLoadingMore(false);
  }, [tickets.length, loadingMore, hasMore]);

  useEffect(() => { load(); }, [load]);

  return { tickets, loading, loadingMore, hasMore, error, reload: load, loadMore };
}

// ─── Order Detail Hook ────────────────────────────────────────────────────────

export function useOrderDetail(orderId: string) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getOrderDetail(orderId);
    setOrder(data);
    if (err) setError(err);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  return { order, loading, error, reload: load };
}

// ─── Checkout Hook ────────────────────────────────────────────────────────────

export function useTicketCheckout(eventId: string, userId: string) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Load terms acceptance
  useEffect(() => {
    if (!userId) return;
    setTermsLoading(true);
    hasAcceptedCustomerTerms(userId).then(({ accepted }) => {
      setTermsAccepted(accepted);
      setTermsLoading(false);
    });
  }, [userId]);

  const setQuantity = useCallback((tierId: string, qty: number) => {
    setQuantities((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[tierId];
        return next;
      }
      return { ...prev, [tierId]: qty };
    });
  }, []);

  const acceptTerms = useCallback(async (): Promise<boolean> => {
    const { error } = await acceptCustomerTerms(userId);
    if (!error) {
      setTermsAccepted(true);
      return true;
    }
    return false;
  }, [userId]);

  const checkout = useCallback(async (): Promise<CheckoutResult> => {
    setCheckingOut(true);
    setResult(null);
    const items: CheckoutItem[] = Object.entries(quantities).map(([ticket_type_id, quantity]) => ({
      ticket_type_id,
      quantity,
    }));
    const res = await createTicketCheckout(eventId, items, termsAccepted);
    setResult(res);
    setCheckingOut(false);
    return res;
  }, [eventId, quantities, termsAccepted]);

  const totalItems = Object.values(quantities).reduce((s, v) => s + v, 0);

  return {
    quantities,
    setQuantity,
    totalItems,
    termsAccepted,
    termsLoading,
    acceptTerms,
    checkingOut,
    result,
    checkout,
  };
}
