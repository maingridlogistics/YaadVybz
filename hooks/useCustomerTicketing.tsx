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
        error: piResult.error ?? 'Unable to start checkout. Please try again.',
        order_id: piResult.order_id,
      };
      setCheckoutStatus('failed');
      setCheckoutResult(result);
      return result;
    }

    // Step 2: Initialize PaymentSheet
    //
    // Apple Pay: merchant.com.chambex.vybzhub is registered in Apple Developer
    // Portal and verified in Stripe Dashboard. Certificate is active.
    // merchantIdentifier in app.config.js and StripeProvider match exactly.
    // com.apple.developer.in-app-payments entitlement is set in app.config.js.
    //
    // Google Pay on Android: continues to work as before.
    const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: piResult.payment_intent_client_secret,
      customerId: piResult.customer_id,
      // Ephemeral key enables saved payment method display in the sheet.
      // Safe to send to client — scoped to this customer, cannot create charges.
      customerEphemeralKeySecret: piResult.customer_ephemeral_key_secret ?? undefined,
      merchantDisplayName: 'Vybz Hub',
      returnURL: 'vybzhub://stripe-return',
      // Apple Pay — iOS only (merchant.com.chambex.vybzhub, registered & verified)
      // Requires com.apple.developer.in-app-payments entitlement in provisioning profile.
      applePay: Platform.OS === 'ios' ? {
        merchantCountryCode: 'US',
      } : undefined,
      // Google Pay — Android only
      googlePay: Platform.OS === 'android' ? {
        merchantCountryCode: 'US',
        testEnv: publishableKey.startsWith('pk_test_'),
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
      allowsDelayedPaymentMethods: true,
    });

    if (initError) {
      // Log the real Stripe error code/message for diagnostics.
      // Never logs client secrets, keys, or payment credentials.
      console.error(
        '[stripe-init] initPaymentSheet failed on',
        Platform.OS,
        '— code:', initError.code,
        '— message:', initError.message,
      );
      const result: NativeCheckoutResult = {
        status: 'failed',
        order_id: piResult.order_id,
        error: 'Unable to initialize payment. Please try again.',
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
