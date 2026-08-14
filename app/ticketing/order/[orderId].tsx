
// app/ticketing/order/[orderId].tsx
// Order receipt screen with real-time confirmation for native PaymentSheet.
//
// When payment_status === 'pending':
//   1. Subscribe to Supabase Realtime on the ticket_orders row (fastest path).
//   2. Poll every 1.5s as fallback in case Realtime misses the update.
//   3. Auto-navigate to My Tickets when status becomes 'paid'.
//   4. After ~45s timeout: show safe timeout UX with manual refresh + My Tickets links.
//   5. Payment button re-entry is disabled while pending to prevent duplicates.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useOrderDetail } from '../../../hooks/useCustomerTicketing';
import { formatMinorAmount } from '../../../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatDate } from '../../../constants/data';
import { getCardUrl } from '../../../lib/storage';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { getSupabaseClient } from '../../../lib/supabase';

// How long (ms) to wait before showing the "taking longer than expected" timeout UI.
const CONFIRMATION_TIMEOUT_MS = 45_000;
// Poll interval while waiting for webhook confirmation (ms).
const POLL_INTERVAL_MS = 1_500;

export default function OrderReceiptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { order, loading, error, reload } = useOrderDetail(orderId ?? '');

  // Confirmation-wait state (only active while payment_status === 'pending')
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const realtimeChannelRef = useRef<ReturnType<typeof getSupabaseClient>['channel'] extends (...args: any[]) => infer R ? R : any>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatedRef = useRef(false);

  const stopWaiting = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (realtimeChannelRef.current) {
      getSupabaseClient().removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    setConfirming(false);
  }, []);

  const handleConfirmed = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    stopWaiting();
    console.log('[payment-timing] client confirmed \u2014 navigating to My Tickets');
    // Reload order first so the receipt shows paid state before nav
    reload();
    router.replace('/my-tickets' as any);
  }, [stopWaiting, reload, router]);

  const checkOrderStatus = useCallback(async () => {
    if (!orderId || navigatedRef.current) return;
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('ticket_orders')
      .select('payment_status')
      .eq('id', orderId)
      .maybeSingle();
    if (!data) return;
    const s = data.payment_status as string;
    if (s === 'paid') {
      console.log('[payment-timing] poll confirmed paid');
      handleConfirmed();
    } else if (s === 'failed' || s === 'voided') {
      stopWaiting();
      reload();
    }
  }, [orderId, handleConfirmed, stopWaiting, reload]);

  // Start real-time + polling when order is loaded and status is pending
  useEffect(() => {
    if (!order || order.payment_status !== 'pending' || navigatedRef.current) return;

    setConfirming(true);
    console.log('[payment-timing] starting Realtime + polling for order', orderId);

    // 1. Realtime subscription (fastest path — fires as soon as DB row updates)
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`order_confirm_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ticket_orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newStatus = (payload.new as Record<string, unknown>)?.payment_status as string;
          console.log('[payment-timing] Realtime update received, status =', newStatus);
          if (newStatus === 'paid') handleConfirmed();
          else if (newStatus === 'failed' || newStatus === 'voided') { stopWaiting(); reload(); }
        },
      )
      .subscribe();
    realtimeChannelRef.current = channel as any;

    // 2. Polling fallback (in case Realtime is delayed or missed)
    pollIntervalRef.current = setInterval(checkOrderStatus, POLL_INTERVAL_MS);

    // Do one immediate check in case the webhook already fired before this screen mounted
    checkOrderStatus();

    // 3. Timeout — show "taking longer" UX after CONFIRMATION_TIMEOUT_MS
    timeoutRef.current = setTimeout(() => {
      if (!navigatedRef.current) {
        console.log('[payment-timing] confirmation timeout reached');
        stopWaiting();
        setConfirmationTimedOut(true);
      }
    }, CONFIRMATION_TIMEOUT_MS);

    return () => { stopWaiting(); };
  }, [order?.payment_status, orderId, reload, stopWaiting, handleConfirmed, checkOrderStatus]); // Added missing dependencies here

  const statusConfig = {
    paid:    { color: Colors.greenLight, icon: 'check-circle',    label: 'Paid' },
    pending: { color: '#FF9800',          icon: 'hourglass-empty', label: 'Processing' },
    failed:  { color: Colors.error,       icon: 'error-outline',   label: 'Failed' },
    refunded:{ color: '#42A5F5',          icon: 'refresh',         label: 'Refunded' },
    flagged: { color: '#FF9800',          icon: 'warning',         label: 'Under Review' },
    expired_reservation: { color: Colors.error, icon: 'timer-off', label: 'Expired' },
  } as Record<string, { color: string; icon: string; label: string }>;

  const paymentConfig = order
    ? (statusConfig[order.payment_status] ?? { color: Colors.textMuted, icon: 'info', label: order.payment_status })
    : null;

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Order Receipt</Text>
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Coming Soon</Text>
          <Text style={styles.centeredSub}>In-app ticketing is not yet enabled.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Order Receipt</Text>
          {/* Manual refresh while confirming */}
          {(confirming || confirmationTimedOut) && (
            <Pressable
              onPress={() => { reload(); checkOrderStatus(); }}
              style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <MaterialIcons name="refresh" size={20} color={Colors.gold} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={styles.centeredSub}>Loading order...</Text>
        </View>
      ) : error || !order ? (
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Order not found</Text>
          <Text style={styles.centeredSub}>{error ?? 'Could not load this order.'}</Text>
          <Pressable onPress={reload} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xl) },
          ]}
        >
          {/* ── Pending: confirming in progress ── */}
          {order.payment_status === 'pending' && confirming && !confirmationTimedOut && (
            <View style={styles.confirmingCard}>
              <ActivityIndicator color={Colors.gold} size="small" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.confirmingTitle}>Payment received — confirming tickets...</Text>
                <Text style={styles.confirmingBody}>
                  This usually completes within a few seconds. Do not close the app.
                </Text>
              </View>
            </View>
          )}

          {/* ── Pending: timeout — safe UX ── */}
          {order.payment_status === 'pending' && confirmationTimedOut && (
            <View style={styles.timeoutCard}>
              <MaterialIcons name="hourglass-bottom" size={24} color="#FF9800" />
              <View style={{ flex: 1, gap: Spacing.sm }}>
                <Text style={styles.timeoutTitle}>Payment received — still confirming</Text>
                <Text style={styles.timeoutBody}>
                  Your payment was accepted. Confirmation is taking longer than usual.
                  {'\n\n'}Your tickets will appear in My Tickets once confirmed. You can safely leave this screen.
                  {'\n\n'}Do not pay again.
                </Text>
                <View style={styles.timeoutActions}>
                  <Pressable
                    onPress={() => router.push('/my-tickets' as any)}
                    style={({ pressed }) => [styles.timeoutBtn, pressed && { opacity: 0.85 }]}
                  >
                    <LinearGradient
                      colors={[Colors.gold, Colors.goldDim]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.timeoutBtnInner}
                    >
                      <MaterialIcons name="confirmation-number" size={14} color={Colors.textOnGold} />
                      <Text style={styles.timeoutBtnText}>Check My Tickets</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    onPress={() => { setConfirmationTimedOut(false); setConfirming(true); checkOrderStatus(); reload(); }}
                    style={({ pressed }) => [styles.timeoutRefreshBtn, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="refresh" size={14} color={Colors.textSecondary} />
                    <Text style={styles.timeoutRefreshText}>Refresh Status</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* ── Flagged / expired ── */}
          {(order.payment_status === 'flagged' || order.payment_status === 'expired_reservation') && (
            <View style={styles.flaggedBanner}>
              <MaterialIcons name="warning" size={16} color="#FF9800" />
              <Text style={styles.flaggedText}>
                This order requires admin review. If you were charged, please contact support with your order number.
              </Text>
            </View>
          )}

          {/* ── Success ── */}
          {order.payment_status === 'paid' && (
            <View style={styles.successCard}>
              <LinearGradient colors={['#001A0D', Colors.surface]} style={StyleSheet.absoluteFillObject} />
              <View style={styles.successIcon}>
                <MaterialIcons name="check-circle" size={40} color={Colors.greenLight} />
              </View>
              <Text style={styles.successTitle}>Payment Confirmed</Text>
              <Text style={styles.successSub}>
                Your tickets are ready. Show the QR code at the event entrance.
              </Text>
              <Pressable
                onPress={() => router.push('/my-tickets' as any)}
                style={({ pressed }) => [styles.myTicketsBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.myTicketsBtnInner}
                >
                  <MaterialIcons name="confirmation-number" size={16} color={Colors.textOnGold} />
                  <Text style={styles.myTicketsBtnText}>View My Tickets</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* ── Failed ── */}
          {order.payment_status === 'failed' && (
            <View style={styles.failedCard}>
              <MaterialIcons name="error-outline" size={24} color={Colors.error} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.failedTitle}>Payment Not Completed</Text>
                <Text style={styles.failedBody}>
                  This payment could not be completed. No charge has been made. You can try purchasing again from the event page.
                </Text>
              </View>
            </View>
          )}

          {/* ── Event info ── */}
          <View style={styles.eventCard}>
            {order.event_cover_image ? (
              <Image
                source={{ uri: getCardUrl(order.event_cover_image) }}
                style={styles.eventThumb}
                contentFit="cover"
                transition={200}
              />
            ) : null}
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <Text style={styles.eventTitle} numberOfLines={2}>{order.event_title}</Text>
              <Text style={styles.eventMeta}>{formatDate(order.event_date)}</Text>
              <Text style={styles.eventMeta}>{order.event_venue}, {order.event_parish}</Text>
            </View>
          </View>

          {/* ── Order receipt ── */}
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeaderRow}>
              <View style={styles.orderIdWrap}>
                <Text style={styles.orderIdLabel}>ORDER #</Text>
                <Text style={styles.orderId}>{order.order_number}</Text>
              </View>
              {paymentConfig && (
                <View style={[styles.statusBadge, { backgroundColor: `${paymentConfig.color}15`, borderColor: `${paymentConfig.color}44` }]}>
                  <MaterialIcons name={paymentConfig.icon as any} size={13} color={paymentConfig.color} />
                  <Text style={[styles.statusText, { color: paymentConfig.color }]}>{paymentConfig.label}</Text>
                </View>
              )}
            </View>

            {order.paid_at && (
              <View style={styles.paidRow}>
                <MaterialIcons name="access-time" size={12} color={Colors.textMuted} />
                <Text style={styles.paidText}>
                  Paid {new Date(order.paid_at).toLocaleString('en-JM', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Line items */}
            {order.items.map((item) => (
              <View key={item.id} style={styles.lineItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineItemName}>{item.ticket_type_name_snap}</Text>
                  <Text style={styles.lineItemMeta}>
                    {formatMinorAmount(item.unit_price_minor_snap, order.currency)} × {item.quantity}
                  </Text>
                </View>
                <Text style={styles.lineItemAmount}>
                  {formatMinorAmount(item.subtotal_minor_snap, order.currency)}
                </Text>
              </View>
            ))}

            <View style={styles.divider} />

            {/* Totals */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatMinorAmount(order.base_subtotal_minor, order.currency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Service fee (5%)</Text>
              <Text style={styles.totalValue}>{formatMinorAmount(order.customer_fee_minor, order.currency)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total Paid</Text>
              <Text style={styles.grandTotalValue}>
                {formatMinorAmount(order.customer_total_minor, order.currency)}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Currency note */}
            <View style={styles.currencyNote}>
              <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.currencyNoteText}>
                {order.currency.toUpperCase()} · Service fee is non-refundable except in event cancellation.
              </Text>
            </View>
          </View>

          {/* ── Ticket list (without QR — use My Tickets for QR) ── */}
          {order.tickets.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tickets ({order.tickets.length})</Text>
              {order.tickets.map((ticket, i) => (
                <View key={ticket.id} style={styles.ticketRow}>
                  <MaterialIcons
                    name={ticket.checked_in_at ? 'check-circle' : 'confirmation-number'}
                    size={16}
                    color={ticket.checked_in_at ? Colors.greenLight : Colors.gold}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketRowLabel}>
                      Ticket {i + 1}
                      {ticket.attendee_name ? ` — ${ticket.attendee_name}` : ''}
                    </Text>
                    <Text style={styles.ticketRowStatus}>
                      {ticket.checked_in_at ? 'Used' : ticket.status === 'valid' ? 'Valid' : ticket.status}
                    </Text>
                  </View>
                  <Text style={styles.ticketRowId}>{ticket.id.slice(0, 8).toUpperCase()}</Text>
                </View>
              ))}
              <Pressable
                onPress={() => router.push('/my-tickets' as any)}
                style={({ pressed }) => [styles.viewQrBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="qr-code" size={16} color={Colors.gold} />
                <Text style={styles.viewQrBtnText}>View QR Codes in My Tickets</Text>
                <MaterialIcons name="chevron-right" size={16} color={Colors.gold} />
              </Pressable>
            </View>
          )}

          {/* ── Important notice ── */}
          <View style={styles.noticeCard}>
            <MaterialIcons name="gavel" size={16} color={Colors.textMuted} />
            <Text style={styles.noticeText}>
              All sales are final. Refunds are only available if the event is cancelled by the organizer.
              Keep your QR code safe — each code is valid for one entry only.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  centeredTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  centeredSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  retryBtnText: { color: Colors.gold, fontWeight: Typography.semibold, fontSize: Typography.sm },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },

  scrollContent: { padding: Spacing.base, gap: Spacing.lg },

  // Confirming state
  confirmingCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.xl,
    padding: Spacing.base, borderWidth: 1.5, borderColor: `${Colors.gold}44`,
  },
  confirmingTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.gold },
  confirmingBody: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  // Timeout state
  timeoutCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.xl,
    padding: Spacing.base, borderWidth: 1, borderColor: 'rgba(255,152,0,0.35)',
  },
  timeoutTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: '#FF9800' },
  timeoutBody: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  timeoutActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginTop: Spacing.xs },
  timeoutBtn: { borderRadius: Radius.md, overflow: 'hidden' },
  timeoutBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  timeoutBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },
  timeoutRefreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  timeoutRefreshText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium as any },

  // Failed state
  failedCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: 'rgba(255,68,68,0.07)', borderRadius: Radius.xl,
    padding: Spacing.base, borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  failedTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.error },
  failedBody: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  // Flagged
  flaggedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  flaggedText: { flex: 1, fontSize: Typography.sm, color: '#FF9800', lineHeight: 18 },

  // Success
  successCard: {
    borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: `${Colors.greenLight}33`,
    padding: Spacing.xl, gap: Spacing.md, alignItems: 'center',
  },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${Colors.greenLight}15`, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.greenLight}44`,
  },
  successTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.greenLight },
  successSub: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  myTicketsBtn: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden' },
  myTicketsBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  myTicketsBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Event card
  eventCard: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base,
  },
  eventThumb: { width: 72, height: 72, borderRadius: Radius.md, flexShrink: 0 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 22 },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  // Receipt card
  receiptCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.md,
  },
  receiptHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderIdWrap: { gap: 2 },
  orderIdLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  orderId: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, letterSpacing: 1 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.bold },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paidText: { fontSize: Typography.xs, color: Colors.textMuted },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder },

  lineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  lineItemName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  lineItemMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  lineItemAmount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  totalValue: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  grandTotalRow: {
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, marginTop: Spacing.xs,
  },
  grandTotalLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  grandTotalValue: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.gold },

  currencyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  currencyNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  section: { gap: Spacing.md },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  ticketRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  ticketRowLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  ticketRowStatus: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  ticketRowId: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1 },
  viewQrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33`,
    marginTop: Spacing.xs,
  },
  viewQrBtnText: { flex: 1, fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  noticeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  noticeText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
});
