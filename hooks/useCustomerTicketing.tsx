// hooks/useCustomerTicketing.tsx
// Phase 3 — Customer-facing ticketing hooks.

import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useStripe } from '../lib/stripe';
import {
  getEventTicketingStatus,
  getMyTickets,
  getOrderDetail,
  hasAcceptedCustomerTerms,
  acceptCustomerTerms,
  createTicketCheckout,
  createTicketPaymentIntent,
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

// ─── Native PaymentSheet Checkout Hook ────────────────────────────────────
//
// Initializes a Stripe PaymentIntent on the server, then presents the native
// Stripe PaymentSheet. After the sheet reports success, polls the DB for the
// webhook-authoritative payment_status before navigating.
//
// The client-side PaymentSheet success callback NEVER issues tickets.
// Ticket issuance is always performed by the stripe-webhook Edge Function
// via finalize_ticket_order RPC.

export type NativeCheckoutStatus =
  | 'idle'
  | 'creating'
  | 'presenting'
  | 'processing'
  | 'succeeded'
  | 'cancelled'
  | 'failed';

export interface NativeCheckoutResult {
  status: NativeCheckoutStatus;
  order_id?: string;
  order_number?: string;
  error?: string;
}

export function useNativeTicketCheckout(eventId: string, userId: string) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [quantities, setQuantitiesState] = useState<Record<string, number>>({});
  const [checkoutStatus, setCheckoutStatus] = useState<NativeCheckoutStatus>('idle');
  const [checkoutResult, setCheckoutResult] = useState<NativeCheckoutResult>({ status: 'idle' });

  // Load terms acceptance on mount
  useEffect(() => {
    if (!userId) return;
    setTermsLoading(true);
    hasAcceptedCustomerTerms(userId).then(({ accepted }) => {
      setTermsAccepted(accepted);
      setTermsLoading(false);
    });
  }, [userId]);

  const setQuantity = useCallback((tierId: string, qty: number) => {
    setQuantitiesState((prev) => {
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

  const startCheckout = useCallback(async (): Promise<NativeCheckoutResult> => {
    const items: CheckoutItem[] = Object.entries(quantities).map(([ticket_type_id, quantity]) => ({
      ticket_type_id,
      quantity,
    }));

    if (items.length === 0) {
      return { status: 'failed', error: 'Please select at least one ticket.' };
    }

    // Step 1: Create PaymentIntent on server (validates, reserves, prices)
    setCheckoutStatus('creating');
    const piResult = await createTicketPaymentIntent(eventId, items, termsAccepted);
    if (!piResult.ok || !piResult.payment_intent_client_secret) {
      const result: NativeCheckoutResult = {
        status: 'failed',
        error: piResult.error ?? 'Payment service is temporarily unavailable. Please try again.',
        order_id: piResult.order_id,
      };
      setCheckoutStatus('failed');
      setCheckoutResult(result);
      return result;
    }

    // Step 2: Initialize PaymentSheet
    //
    // IMPORTANT: customerId is intentionally NOT passed here.
    // Stripe PaymentSheet requires customerEphemeralKeySecret alongside
    // customerId — without it, initPaymentSheet fails with a configuration
    // error on native iOS. The PaymentIntent is already attached to the Stripe
    // customer server-side (in create-ticket-payment-intent); the sheet does
    // not need the customer ID to process the payment for a one-time ticket
    // checkout.
    const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
    const isTestMode = publishableKey.startsWith('pk_test_');

    // Validate client secret before passing to SDK
    const clientSecret = piResult.payment_intent_client_secret;
    if (!clientSecret || !clientSecret.startsWith('pi_')) {
      console.warn('[payment-diag] Invalid or missing client secret — cannot initialize PaymentSheet');
      const result: NativeCheckoutResult = {
        status: 'failed',
        order_id: piResult.order_id,
        error: "We couldn't start the payment. Please try again.",
      };
      setCheckoutStatus('failed');
      setCheckoutResult(result);
      return result;
    }

    console.log('[payment-diag] initPaymentSheet — clientSecret present: true, prefix:', clientSecret.slice(0, 8) + '...');

    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      // customerId and customerEphemeralKeySecret are omitted deliberately:
      // passing customerId without a matching ephemeral key causes initPaymentSheet
      // to fail on native iOS. Ticket checkout is a one-time purchase and does
      // not require pre-loading saved payment methods into the sheet.
      merchantDisplayName: 'Vybz Hub',
      returnURL: 'vybzhub://stripe-return',
      // Apple Pay: temporarily disabled pending merchant ID registration with
      // Apple Developer Portal and Stripe Dashboard. Re-enable (and verify
      // merchant.com.chambex.vybzhub is registered) before production release.
      // NOTE: Apple IAP (subscriptions/boosts) is completely separate and unaffected.
      applePay: undefined,
      // Google Pay: only on Android, disabled in test mode
      googlePay: Platform.OS === 'android' ? {
        merchantCountryCode: 'JM',
        testEnv: isTestMode,
      } : undefined,
      // Dark mode appearance matching Vybz Hub design
      appearance: {
        colors: {
          primary: '#FFD700',
          background: '#0D0D0D',
          componentBackground: '#1A1A1A',
          componentBorder: '#2A2A2A',
          componentDivider: '#2A2A2A',
          primaryText: '#FFFFFF',
          secondaryText: '#A0A0A0',
          componentText: '#FFFFFF',
          placeholderText: '#606060',
          icon: '#A0A0A0',
          error: '#FF4444',
        },
        shapes: {
          borderRadius: 12,
          borderWidth: 1,
        },
      },
      // false: do not hold the PaymentSheet open waiting for delayed methods
      // (SEPA, OXXO, etc.) — tickets must be confirmed immediately.
      allowsDelayedPaymentMethods: false,
    });

    if (initError) {
      console.warn('[payment-diag] initPaymentSheet failed — code:', initError.code, 'msg:', initError.message);
      const result: NativeCheckoutResult = {
        status: 'failed',
        order_id: piResult.order_id,
        error: "We couldn't start the payment. Please try again.",
      };
      setCheckoutStatus('failed');
      setCheckoutResult(result);
      return result;
    }

    // Step 3: Present PaymentSheet
    setCheckoutStatus('presenting');
    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      // PaymentSheet cancelled or failed
      const isCancelled = presentError.code === 'Canceled';
      const result: NativeCheckoutResult = {
        status: isCancelled ? 'cancelled' : 'failed',
        order_id: piResult.order_id,
        error: isCancelled
          ? undefined
          : 'Payment was not completed. Please try again.',
      };
      setCheckoutStatus(result.status);
      setCheckoutResult(result);
      return result;
    }

    // Step 4: PaymentSheet reports success.
    // Navigate to the order page immediately — the order page handles
    // Realtime + polling for webhook-authoritative confirmation.
    // DO NOT block here waiting for the webhook before navigating.
    console.log('[payment-timing] PaymentSheet success — navigating to order page');
    const result: NativeCheckoutResult = {
      status: 'succeeded',
      order_id: piResult.order_id,
      order_number: piResult.order_number,
    };
    setCheckoutStatus('succeeded');
    setCheckoutResult(result);
    return result;
  }, [eventId, quantities, termsAccepted, initPaymentSheet, presentPaymentSheet]);

  const totalItems = Object.values(quantities).reduce((s, v) => s + v, 0);
  const isLoading = checkoutStatus === 'creating' || checkoutStatus === 'presenting' || checkoutStatus === 'processing';

  const reset = useCallback(() => {
    setCheckoutStatus('idle');
    setCheckoutResult({ status: 'idle' });
  }, []);

  return {
    quantities,
    setQuantity,
    totalItems,
    termsAccepted,
    termsLoading,
    acceptTerms,
    isLoading,
    checkoutStatus,
    checkoutResult,
    startCheckout,
    reset,
  };
}
