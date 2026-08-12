// app/ticketing/order/[orderId].tsx
// Phase 3 — Order receipt screen.
// Shown after successful checkout redirect or accessed from My Tickets.

import React from 'react';
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

export default function OrderReceiptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { order, loading, error, reload } = useOrderDetail(orderId ?? '');

  const statusConfig = {
    paid: { color: Colors.greenLight, icon: 'check-circle', label: 'Paid' },
    pending: { color: '#FF9800', icon: 'hourglass-empty', label: 'Processing' },
    failed: { color: Colors.error, icon: 'error-outline', label: 'Failed' },
    refunded: { color: '#42A5F5', icon: 'refresh', label: 'Refunded' },
    flagged: { color: '#FF9800', icon: 'warning', label: 'Under Review' },
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
          {/* Processing notice */}
          {order.payment_status === 'pending' && (
            <View style={styles.processingBanner}>
              <ActivityIndicator color="#FF9800" size="small" />
              <Text style={styles.processingText}>
                Your payment is being processed. Tickets will appear in My Tickets once confirmed. This may take a moment.
              </Text>
            </View>
          )}

          {/* Late payment / flagged notice */}
          {(order.payment_status === 'flagged' || order.payment_status === 'expired_reservation') && (
            <View style={styles.flaggedBanner}>
              <MaterialIcons name="warning" size={16} color="#FF9800" />
              <Text style={styles.flaggedText}>
                This order requires admin review. If you were charged, please contact support with your order number.
              </Text>
            </View>
          )}

          {/* Success state */}
          {order.payment_status === 'paid' && (
            <View style={styles.successCard}>
              <LinearGradient colors={['#001A0D', Colors.surface]} style={StyleSheet.absoluteFillObject} />
              <View style={styles.successIcon}>
                <MaterialIcons name="check-circle" size={40} color={Colors.greenLight} />
              </View>
              <Text style={styles.successTitle}>Payment Confirmed</Text>
              <Text style={styles.successSub}>
                Your tickets are available in My Tickets. Show the QR code at the event entrance.
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

          {/* Event info */}
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

          {/* Order info */}
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

          {/* Ticket list (without QR — use My Tickets for QR) */}
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

          {/* Important notice */}
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
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },

  scrollContent: { padding: Spacing.base, gap: Spacing.lg },

  processingBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.md,
    padding: Spacing.base, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  processingText: { flex: 1, fontSize: Typography.sm, color: '#FF9800', lineHeight: 18 },

  flaggedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  flaggedText: { flex: 1, fontSize: Typography.sm, color: '#FF9800', lineHeight: 18 },

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

  eventCard: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base,
  },
  eventThumb: { width: 72, height: 72, borderRadius: Radius.md, flexShrink: 0 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 22 },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

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
  ticketRowId: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', letterSpacing: 1 },
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
