// useDoorSales.tsx — Phase 5: Door Sales Hook
//
// State and business logic for door / walk-up ticket sales.
// Enforces network connectivity check before submission.
// Cash sales use idempotency keys to prevent duplicate orders on double-tap.

import { useState, useCallback, useRef } from 'react';
import {
  submitCashDoorSale,
  createDoorCardCheckout,
  getDoorSalesSummary,
  getDoorOrderTickets,
  voidDoorCashOrder,
  generateIdempotencyKey,
  type DoorSaleItem,
  type DoorCashSaleResult,
  type DoorCardCheckoutResult,
  type DoorSalesSummary,
  type DoorOrderTicketsResult,
  type VoidOrderResult,
} from '../services/doorSalesService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'door_cash' | 'door_card';

export interface DoorSaleFormState {
  items: DoorSaleItem[];
  attendeeName: string;
  contactInfo: string;
  paymentMethod: PaymentMethod;
  sellAndCheckin: boolean;
  ownerUserId: string | null;
}

export interface DoorSaleState {
  form: DoorSaleFormState;
  submitting: boolean;
  error: string | null;
  lastCashResult: DoorCashSaleResult | null;
  lastCardResult: DoorCardCheckoutResult | null;
}

// ─── Cash Door Sale Hook ──────────────────────────────────────────────────────

export function useCashDoorSale(eventId: string, sellerId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DoorCashSaleResult | null>(null);

  // Stable idempotency key per sale attempt.
  // Regenerated explicitly by calling resetIdempotencyKey().
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey(eventId, sellerId));

  const resetIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = generateIdempotencyKey(eventId, sellerId);
  }, [eventId, sellerId]);

  const submit = useCallback(async (params: {
    items: DoorSaleItem[];
    attendeeName: string;
    contactInfo?: string;
    sellAndCheckin?: boolean;
    ownerUserId?: string | null;
  }): Promise<DoorCashSaleResult> => {
    setError(null);
    setSubmitting(true);

    const result = await submitCashDoorSale({
      eventId,
      items: params.items,
      attendeeName: params.attendeeName,
      idempotencyKey: idempotencyKeyRef.current,
      sellAndCheckin: params.sellAndCheckin ?? false,
      contactInfo: params.contactInfo,
      ownerUserId: params.ownerUserId ?? null,
    });

    setSubmitting(false);

    if (result.ok) {
      setLastResult(result);
      // Generate a new idempotency key for the next sale
      resetIdempotencyKey();
    } else {
      setError(result.error ?? 'Cash sale failed. Please try again.');
    }

    return result;
  }, [eventId, resetIdempotencyKey]);

  const clearError = useCallback(() => setError(null), []);
  const clearResult = useCallback(() => setLastResult(null), []);

  return {
    submitting,
    error,
    lastResult,
    submit,
    clearError,
    clearResult,
    resetIdempotencyKey,
  };
}

// ─── Card Door Sale Hook ──────────────────────────────────────────────────────

export function useCardDoorSale() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DoorCardCheckoutResult | null>(null);

  const createCheckout = useCallback(async (params: {
    eventId: string;
    items: DoorSaleItem[];
    attendeeName: string;
    ownerUserId?: string | null;
  }): Promise<DoorCardCheckoutResult> => {
    setError(null);
    setSubmitting(true);

    const result = await createDoorCardCheckout(params);

    setSubmitting(false);

    if (result.ok) {
      setLastResult(result);
    } else {
      setError(result.error ?? 'Failed to create card checkout. Please try again.');
    }

    return result;
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearResult = useCallback(() => setLastResult(null), []);

  return { submitting, error, lastResult, createCheckout, clearError, clearResult };
}

// ─── Door Sales Summary Hook ──────────────────────────────────────────────────

export function useDoorSalesSummary(eventId: string) {
  const [summary, setSummary] = useState<DoorSalesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getDoorSalesSummary(eventId);
    setSummary(data);
    if (err) setError(err);
    setLoading(false);
  }, [eventId]);

  return { summary, loading, error, load };
}

// ─── Door Order Tickets Hook (anonymous QR display after sale) ────────────────

export function useDoorOrderTickets() {
  const [result, setResult] = useState<DoorOrderTicketsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (orderId: string) => {
    setLoading(true);
    setError(null);
    const res = await getDoorOrderTickets(orderId);
    if (res.ok) {
      setResult(res);
    } else {
      setError(res.error ?? 'Failed to load tickets.');
    }
    setLoading(false);
    return res;
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, load, clear };
}

// ─── Void Cash Order Hook ─────────────────────────────────────────────────────

export function useVoidCashOrder() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voidOrder = useCallback(async (
    orderId: string,
    reason: string,
  ): Promise<VoidOrderResult> => {
    setError(null);
    setSubmitting(true);

    const result = await voidDoorCashOrder(orderId, reason);

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Failed to void order. Please try again.');
    }

    return result;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { submitting, error, voidOrder, clearError };
}
