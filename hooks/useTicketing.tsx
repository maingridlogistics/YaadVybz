// useTicketing.tsx — Phase 2: Promoter Ticketing Setup & Management Hook
//
// Manages state and business logic for promoter ticket configuration.
// No customer checkout, no payment, no QR operations.

import { useState, useCallback } from 'react';
import {
  getEventTicketSettings,
  upsertEventTicketSettings,
  getTicketTiers,
  createTicketTier,
  updateTicketTier,
  cancelTicketTier,
  getEventTicketSummary,
  getEventTicketsForPromoter,
  type EventTicketSettings,
  type TicketTier,
  type EventTicketSummary,
  type PromoterTicketRow,
  type CreateTicketTierInput,
  type UpdateTicketTierInput,
} from '../services/ticketingService';

// ─── Settings Hook ────────────────────────────────────────────────────────────

export function useTicketSettings(eventId: string) {
  const [settings, setSettings] = useState<EventTicketSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getEventTicketSettings(eventId);
    setSettings(data);
    if (err) setError(err);
    setLoading(false);
  }, [eventId]);

  const save = useCallback(async (
    updates: Partial<Pick<EventTicketSettings,
      'enabled' | 'currency' | 'sales_status' | 'sales_start_at' | 'sales_end_at'
    >>,
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const { data, error: err } = await upsertEventTicketSettings(eventId, updates);
    if (err) {
      setError(err);
      setSaving(false);
      return false;
    }
    setSettings(data);
    setSaving(false);
    return true;
  }, [eventId]);

  return { settings, loading, saving, error, load, save };
}

// ─── Tiers Hook ───────────────────────────────────────────────────────────────

export function useTicketTiers(eventId: string) {
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getTicketTiers(eventId);
    setTiers(data);
    if (err) setError(err);
    setLoading(false);
  }, [eventId]);

  const addTier = useCallback(async (
    input: Omit<CreateTicketTierInput, 'event_id'>,
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const { data, error: err } = await createTicketTier({ ...input, event_id: eventId });
    if (err) {
      setError(err);
      setSaving(false);
      return false;
    }
    if (data) setTiers((prev) => [...prev, data]);
    setSaving(false);
    return true;
  }, [eventId]);

  const editTier = useCallback(async (
    tierId: string,
    updates: UpdateTicketTierInput,
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const { data, error: err } = await updateTicketTier(tierId, updates);
    if (err) {
      setError(err);
      setSaving(false);
      return false;
    }
    if (data) {
      setTiers((prev) => prev.map((t) => (t.id === tierId ? data : t)));
    }
    setSaving(false);
    return true;
  }, []);

  const removeTier = useCallback(async (tierId: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const { error: err } = await cancelTicketTier(tierId);
    if (err) {
      setError(err);
      setSaving(false);
      return false;
    }
    setTiers((prev) => prev.filter((t) => t.id !== tierId));
    setSaving(false);
    return true;
  }, []);

  const toggleTierStatus = useCallback(async (
    tierId: string,
    currentStatus: TicketTier['status'],
  ): Promise<boolean> => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    return editTier(tierId, { status: nextStatus });
  }, [editTier]);

  return {
    tiers,
    loading,
    saving,
    error,
    load,
    addTier,
    editTier,
    removeTier,
    toggleTierStatus,
  };
}

// ─── Dashboard Hook ───────────────────────────────────────────────────────────

export function useTicketDashboard(eventId: string) {
  const [summary, setSummary] = useState<EventTicketSummary | null>(null);
  const [tickets, setTickets] = useState<PromoterTicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [summaryResult, ticketsResult] = await Promise.all([
      getEventTicketSummary(eventId),
      getEventTicketsForPromoter(eventId, PAGE_SIZE, 0),
    ]);
    if (summaryResult.error) setError(summaryResult.error);
    if (ticketsResult.error) setError(ticketsResult.error);
    setSummary(summaryResult.data);
    setTickets(ticketsResult.data);
    setHasMore(ticketsResult.data.length === PAGE_SIZE);
    setLoading(false);
  }, [eventId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data, error: err } = await getEventTicketsForPromoter(
      eventId, PAGE_SIZE, tickets.length,
    );
    if (err) setError(err);
    setTickets((prev) => [...prev, ...data]);
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [eventId, tickets.length, loadingMore, hasMore]);

  return { summary, tickets, loading, loadingMore, hasMore, error, load, loadMore };
}
