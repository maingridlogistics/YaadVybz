// app/my-tickets.tsx
// Phase 3 — Customer My Tickets screen.
// Shows all tickets purchased by the current user, grouped into Upcoming / Used / Past.
// Customers can view their QR code for entry.
// secure_token is accessible to customers via RLS (authenticated_select_own_tickets).
//
// TICKET LIFECYCLE:
//   UPCOMING — valid tickets for events that have not yet passed, not checked in
//   USED     — tickets where checked_in_at IS NOT NULL (permanent record of admission)
//   PAST     — unscanned tickets for events that have already passed
//   TRANSFERRED — tickets transferred out to another user
//
// A checked-in ticket is NEVER hidden, deleted, or moved to a void category.
// checked_in_at is the authoritative check-in signal: isUsed = checked_in_at != null

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { SafeQRCode } from '../components/ui/SafeQRCode';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useMyTickets } from '../hooks/useCustomerTicketing';
import { getSupabaseClient } from '../lib/supabase';
import { formatMinorAmount, type MyTicket } from '../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { formatDate } from '../constants/data';
import { getCardUrl } from '../lib/storage';
import { TICKETING_ENABLED } from '../constants/featureFlags';
import { LEGAL_URLS } from '../constants/legalUrls';

// ─── QR Display ───────────────────────────────────────────────────────────────

function QRDisplay({ token, size = 180 }: { token: string; size?: number }) {
  return (
    <SafeQRCode
      value={token}
      size={size}
      color="#0A0A0A"
      backgroundColor="#F8F8F0"
    />
  );
}

// ─── Ticket Detail Modal ──────────────────────────────────────────────────────

function TicketDetailModal({
  ticket,
  visible,
  onClose,
}: {
  ticket: MyTicket | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  if (!ticket) return null;

  const isUsed = ticket.checked_in_at != null;
  const isVoided = ticket.status === 'voided' || ticket.status === 'refunded' || ticket.status === 'cancelled';
  const isTransferred = ticket.status === 'transferred_out';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={detailStyles.overlay} onPress={onClose}>
        <Pressable style={[detailStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={detailStyles.handle} />

          {/* Event header */}
          <View style={detailStyles.eventRow}>
            {ticket.event_cover_image ? (
              <Image
                source={{ uri: getCardUrl(ticket.event_cover_image) }}
                style={detailStyles.eventThumb}
                contentFit="cover"
                transition={200}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={detailStyles.eventTitle} numberOfLines={2}>{ticket.event_title}</Text>
              <Text style={detailStyles.eventMeta}>{formatDate(ticket.event_date)}</Text>
              <Text style={detailStyles.eventMeta}>{ticket.event_venue}, {ticket.event_parish}</Text>
            </View>
          </View>

          {/* Ticket info */}
          <View style={detailStyles.infoRow}>
            <View style={detailStyles.infoItem}>
              <Text style={detailStyles.infoLabel}>Ticket Type</Text>
              <Text style={detailStyles.infoValue}>{ticket.ticket_type_name}</Text>
            </View>
            <View style={detailStyles.infoItem}>
              <Text style={detailStyles.infoLabel}>Price</Text>
              <Text style={detailStyles.infoValue}>{formatMinorAmount(ticket.price_minor, ticket.currency)}</Text>
            </View>
            {ticket.attendee_name ? (
              <View style={detailStyles.infoItem}>
                <Text style={detailStyles.infoLabel}>Attendee</Text>
                <Text style={detailStyles.infoValue}>{ticket.attendee_name}</Text>
              </View>
            ) : null}
            <View style={detailStyles.infoItem}>
              <Text style={detailStyles.infoLabel}>Order #</Text>
              <Text style={detailStyles.infoValue}>{ticket.order_number}</Text>
            </View>
          </View>

          {/* Used check-in banner — prominent success treatment */}
          {isUsed && !isVoided && !isTransferred && (
            <View style={detailStyles.usedBanner}>
              <MaterialIcons name="check-circle" size={18} color={Colors.greenLight} />
              <View style={{ flex: 1 }}>
                <Text style={detailStyles.usedBannerTitle}>Checked In — Entry Recorded</Text>
                {ticket.checked_in_at ? (
                  <Text style={detailStyles.usedBannerTime}>
                    {(() => {
                      try {
                        return new Date(ticket.checked_in_at).toLocaleString('en-JM', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        });
                      } catch {
                        return 'Checked in';
                      }
                    })()}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Status */}
          {isVoided && (
            <View style={detailStyles.voidedBanner}>
              <MaterialIcons name="cancel" size={16} color={Colors.error} />
              <Text style={detailStyles.voidedText}>
                This ticket has been {ticket.status}. It is no longer valid for entry.
              </Text>
            </View>
          )}
          {isTransferred && (
            <View style={[detailStyles.voidedBanner, { borderColor: '#FF980044', backgroundColor: 'rgba(255,152,0,0.08)' }]}>
              <MaterialIcons name="swap-horiz" size={16} color="#FF9800" />
              <Text style={[detailStyles.voidedText, { color: '#FF9800' }]}>
                This ticket has been transferred. The new owner holds the valid QR code.
              </Text>
            </View>
          )}

          {/* QR Code / Used state */}
          {!isVoided && !isTransferred && (
            <View style={detailStyles.qrSection}>
              {isUsed ? (
                <View style={detailStyles.usedQRWrap}>
                  <View style={detailStyles.usedQRBadge}>
                    <MaterialIcons name="verified" size={40} color={Colors.greenLight} />
                  </View>
                  <Text style={detailStyles.usedQRLabel}>TICKET USED</Text>
                  <Text style={detailStyles.usedQRSub}>
                    Admission was recorded at entry. This ticket is kept as a permanent record.
                  </Text>
                </View>
              ) : (
                <QRDisplay token={ticket.secure_token} size={200} />
              )}
              <Text style={detailStyles.qrHint}>
                {isUsed ? 'QR deactivated — entry already recorded.' : 'Show this QR code at the event entrance.'}
              </Text>
              <Text style={detailStyles.tokenId}>
                {ticket.id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
          )}

          {/* View full ticket */}
          <Pressable
            onPress={() => {
              onClose();
              router.push(`/ticketing/ticket/${ticket.id}` as any);
            }}
            style={({ pressed }) => [detailStyles.orderBtn, { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44`, marginBottom: Spacing.sm }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="qr-code-2" size={16} color={Colors.gold} />
            <Text style={detailStyles.orderBtnText}>Open Full Ticket &amp; Actions</Text>
            <MaterialIcons name="chevron-right" size={16} color={Colors.gold} />
          </Pressable>

          {/* View Order Receipt */}
          <Pressable
            onPress={() => {
              onClose();
              router.push(`/ticketing/order/${ticket.order_id}` as any);
            }}
            style={({ pressed }) => [detailStyles.orderBtn, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="receipt" size={16} color={Colors.gold} />
            <Text style={detailStyles.orderBtnText}>View Order Receipt</Text>
            <MaterialIcons name="chevron-right" size={16} color={Colors.gold} />
          </Pressable>

          <Pressable onPress={onClose} style={({ pressed }) => [detailStyles.closeBtn, pressed && { opacity: 0.8 }]}>
            <Text style={detailStyles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
    gap: Spacing.base,
    maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs },
  eventRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  eventThumb: { width: 64, height: 64, borderRadius: Radius.md, flexShrink: 0 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  infoItem: { minWidth: 120, gap: 2 },
  infoLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },

  // Used check-in banner
  usedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(0,200,83,0.1)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(0,200,83,0.3)',
  },
  usedBannerTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.greenLight },
  usedBannerTime: { fontSize: Typography.xs, color: Colors.greenLight, opacity: 0.8, marginTop: 2 },

  voidedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)',
  },
  voidedText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  qrSection: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  // Used QR replacement
  usedQRWrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  usedQRBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(0,200,83,0.1)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(0,200,83,0.3)',
  },
  usedQRLabel: {
    fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.greenLight, letterSpacing: 2,
  },
  usedQRSub: {
    fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 260,
  },
  qrHint: { fontSize: Typography.xs, color: Colors.textMuted },
  tokenId: {
    fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  orderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    padding: Spacing.base, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  orderBtnText: { flex: 1, fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  closeBtn: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingVertical: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  closeBtnText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
});

// ─── Ticket List Card ─────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onPress,
}: {
  ticket: MyTicket;
  onPress: () => void;
}) {
  // isUsed takes precedence over all other status display logic
  const isUsed = ticket.checked_in_at != null;
  const isVoided = ticket.status === 'voided' || ticket.status === 'refunded' || ticket.status === 'cancelled';
  const isTransferred = ticket.status === 'transferred_out';

  const statusColor = isVoided
    ? Colors.error
    : isTransferred
      ? '#FF9800'
      : isUsed
        ? Colors.greenLight
        : Colors.gold;

  const statusLabel = isVoided
    ? ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)
    : isTransferred
      ? 'Transferred'
      : isUsed
        ? 'Checked In'
        : 'Valid';

  const statusIcon = isVoided
    ? 'cancel'
    : isTransferred
      ? 'swap-horiz'
      : isUsed
        ? 'verified'
        : 'confirmation-number';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        cardStyles.card,
        isUsed && !isVoided && cardStyles.cardUsed,
        pressed && { opacity: 0.88 },
      ]}
    >
      {ticket.event_cover_image ? (
        <Image
          source={{ uri: getCardUrl(ticket.event_cover_image) }}
          style={[cardStyles.cover, isUsed && !isVoided && cardStyles.coverUsed]}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[cardStyles.cover, { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
          <MaterialIcons name="event" size={24} color={Colors.textMuted} />
        </View>
      )}
      <View style={cardStyles.content}>
        <Text style={cardStyles.eventTitle} numberOfLines={1}>{ticket.event_title}</Text>
        <Text style={cardStyles.tierName}>{ticket.ticket_type_name}</Text>
        <View style={cardStyles.metaRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={cardStyles.meta}>{formatDate(ticket.event_date)}</Text>
          <View style={cardStyles.dot} />
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={cardStyles.meta}>{ticket.event_parish}</Text>
        </View>
        {ticket.attendee_name ? (
          <Text style={cardStyles.attendee}>{ticket.attendee_name}</Text>
        ) : null}
        {/* checked_in_at timestamp shown on used tickets */}
        {isUsed && ticket.checked_in_at ? (
          <Text style={cardStyles.checkedInTime} numberOfLines={1}>
            {(() => {
              try {
                return `Scanned ${new Date(ticket.checked_in_at).toLocaleString('en-JM', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}`;
              } catch {
                return 'Checked in';
              }
            })()}
          </Text>
        ) : null}
        <View style={[cardStyles.statusBadge, { backgroundColor: `${statusColor}15`, borderColor: `${statusColor}44` }]}>
          <MaterialIcons name={statusIcon as any} size={11} color={statusColor} />
          <Text style={[cardStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <MaterialIcons
        name={isUsed && !isVoided ? 'check-circle' : 'qr-code'}
        size={22}
        color={isUsed && !isVoided ? Colors.greenLight : Colors.gold}
      />
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  // Used tickets get a subtle green-tinted border to distinguish them positively
  cardUsed: {
    borderColor: 'rgba(0,200,83,0.2)',
    backgroundColor: 'rgba(0,200,83,0.04)',
  },
  cover: { width: 72, height: 72, borderRadius: Radius.md, flexShrink: 0 },
  coverUsed: { opacity: 0.75 },
  content: { flex: 1, gap: 3 },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  tierName: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, color: Colors.textMuted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.surfaceBorder },
  attendee: { fontSize: Typography.xs, color: Colors.textSecondary },
  checkedInTime: { fontSize: Typography.xs, color: Colors.greenLight, opacity: 0.85 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: Typography.bold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

// UPCOMING — valid, not checked in, event not yet past
// USED     — checked_in_at IS NOT NULL (permanent record; takes precedence over date)
// PAST     — not checked in, event has passed
// TRANSFERRED — transferred_out status
type TicketTab = 'upcoming' | 'used' | 'past' | 'transferred';

// ─── Pending Transfers Hook ───────────────────────────────────────────────────

interface PendingTransfer {
  id: string;
  ticket_id: string;
  event_id: string;
  from_user_id: string;
  status: string;
  to_email: string | null;
  initiated_at: string;
  claim_expires_at: string | null;
  event_title: string;
  event_date: string;
  event_venue: string;
  event_parish: string;
  ticket_type_name: string;
  sender_name: string;
}

function usePendingTransfers(userId: string | undefined) {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data } = await supabase.rpc('get_pending_incoming_transfers', { p_user_id: userId });
    setTransfers((data ?? []) as PendingTransfer[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { transfers, loading, reload: load };
}

// ─── Pending Transfer Card ────────────────────────────────────────────────────

function PendingTransferCard({
  transfer,
  onAccept,
  onDecline,
}: {
  transfer: PendingTransfer;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isExpired = transfer.claim_expires_at
    ? new Date(transfer.claim_expires_at) < new Date()
    : false;

  return (
    <View style={ptStyles.card}>
      <View style={ptStyles.header}>
        <View style={ptStyles.icon}>
          <MaterialIcons name="swap-horiz" size={20} color="#42A5F5" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ptStyles.eventTitle} numberOfLines={1}>{transfer.event_title}</Text>
          <Text style={ptStyles.meta}>
            {transfer.event_date ? `${transfer.event_date} · ` : ''}{transfer.event_venue || transfer.event_parish}
          </Text>
          <Text style={ptStyles.tier}>{transfer.ticket_type_name}</Text>
          <Text style={ptStyles.sender}>From: {transfer.sender_name}</Text>
          {isExpired && (
            <Text style={ptStyles.expired}>Invitation expired</Text>
          )}
          {!isExpired && transfer.claim_expires_at && (
            <Text style={ptStyles.expiry}>
              Expires {new Date(transfer.claim_expires_at).toLocaleDateString('en-JM', {
                month: 'short', day: 'numeric',
              })}
            </Text>
          )}
        </View>
      </View>
      {!isExpired && (
        <View style={ptStyles.actions}>
          <Pressable
            onPress={onDecline}
            style={({ pressed }) => [ptStyles.declineBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={ptStyles.declineBtnText}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            style={({ pressed }) => [ptStyles.acceptBtn, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="check" size={15} color={Colors.textOnGold} />
            <Text style={ptStyles.acceptBtnText}>Accept Transfer</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const ptStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(33,150,243,0.06)', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(33,150,243,0.25)',
    padding: Spacing.base, marginBottom: Spacing.sm, gap: Spacing.base,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  icon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(33,150,243,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(33,150,243,0.3)', flexShrink: 0,
  },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  meta: { fontSize: Typography.xs, color: Colors.textMuted },
  tier: { fontSize: Typography.xs, color: '#42A5F5', fontWeight: Typography.semibold },
  sender: { fontSize: Typography.xs, color: Colors.textSecondary },
  expired: { fontSize: Typography.xs, color: Colors.error, fontWeight: Typography.semibold },
  expiry: { fontSize: Typography.xs, color: '#FF9800' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  declineBtn: {
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  declineBtnText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: Spacing.sm,
  },
  acceptBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
});

export default function MyTicketsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { tickets, loading, loadingMore, error, reload, loadMore } = useMyTickets();

  // ── Refresh on screen focus ───────────────────────────────────────────────
  // Ensures that when a customer returns from the scanner (or from anywhere
  // else), their ticket list reflects any check-in that just occurred.
  // useFocusEffect skips the initial mount load (useMyTickets already handles
  // that via its own useEffect) and only fires on subsequent focus events.
  const hasMounted = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasMounted.current) {
        hasMounted.current = true;
        return;
      }
      reload();
    }, [reload]),
  );

  // ── Prefetch ticket cache for offline QR access ───────────────────────────
  useEffect(() => {
    if (tickets.length === 0) return;
    tickets.forEach((t) => {
      if (!t.secure_token) return;
      AsyncStorage.setItem(
        `@vybzhub/ticket_cache_${t.id}`,
        JSON.stringify({
          id: t.id,
          order_id: t.order_id ?? '',
          event_id: t.event_id ?? '',
          ticket_type_id: (t as any).ticket_type_id ?? '',
          attendee_name: t.attendee_name ?? '',
          secure_token: t.secure_token,
          status: t.status,
          checked_in_at: t.checked_in_at ?? null,
          transfer_count: (t as any).transfer_count ?? 0,
          created_at: (t as any).created_at ?? '',
          event_title: t.event_title,
          event_date: t.event_date,
          event_start_time: '',
          event_venue: t.event_venue,
          event_parish: t.event_parish,
          event_cover_image: t.event_cover_image ?? '',
          ticket_type_name: t.ticket_type_name,
          price_minor: t.price_minor,
          currency: t.currency,
          order_number: t.order_number ?? '',
          cached_at: Date.now(),
        }),
      ).catch(() => {});
    });
  }, [tickets]);

  const pendingTransfers = usePendingTransfers(user?.id);
  const [activeTab, setActiveTab] = useState<TicketTab>('upcoming');
  const [selectedTicket, setSelectedTicket] = useState<MyTicket | null>(null);

  const handleAcceptTransfer = useCallback(async (transfer: PendingTransfer) => {
    const supabase = getSupabaseClient();
    const { data, error: rpcErr } = await supabase.rpc('complete_ticket_transfer', {
      p_ticket_id: transfer.ticket_id,
      p_recipient_id: user!.id,
    });
    const res = data as Record<string, unknown>;
    if (rpcErr || !res?.ok) {
      Alert.alert('Transfer Failed', (res?.error as string) ?? rpcErr?.message ?? 'Could not complete transfer. Please try again.');
      return;
    }
    await Promise.all([pendingTransfers.reload(), reload()]);
    Alert.alert('Transfer Accepted', 'The ticket has been added to your wallet. Your QR code is ready.');
  }, [user, pendingTransfers, reload]);

  const handleDeclineTransfer = useCallback(async (transfer: PendingTransfer) => {
    Alert.alert('Decline Transfer', 'Are you sure you want to decline this ticket? The sender will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const supabase = getSupabaseClient();
          await supabase.rpc('decline_ticket_transfer', {
            p_transfer_id: transfer.id,
            p_user_id: user!.id,
          });
          await pendingTransfers.reload();
        },
      },
    ]);
  }, [user, pendingTransfers]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>My Tickets</Text>
          </View>
        </SafeAreaView>
        <View style={[styles.centered, { flex: 1 }]}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Coming Soon</Text>
          <Text style={styles.centeredSub}>In-app ticketing is not yet enabled.</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  // ── Ticket categorization ─────────────────────────────────────────────────
  // USED takes precedence — a ticket with checked_in_at is categorized as Used
  // regardless of whether the event date has passed.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isUpcomingDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d) >= today;
  };

  const isInactiveStatus = (status: string) =>
    ['transferred_out', 'voided', 'refunded', 'cancelled'].includes(status);

  // Used: checked_in_at is non-null (authoritative check-in signal)
  const usedTickets = tickets.filter(
    (t) => t.checked_in_at != null && !isInactiveStatus(t.status),
  );

  // Upcoming: valid, not checked in, event date not yet past
  const upcomingTickets = tickets.filter(
    (t) =>
      t.checked_in_at == null &&
      isUpcomingDate(t.event_date) &&
      !isInactiveStatus(t.status),
  );

  // Past: not checked in, event has passed, not in an inactive status
  const pastTickets = tickets.filter(
    (t) =>
      t.checked_in_at == null &&
      !isUpcomingDate(t.event_date) &&
      !['transferred_out'].includes(t.status),
  );

  // Transferred out
  const transferredTickets = tickets.filter((t) => t.status === 'transferred_out');

  const displayedTickets =
    activeTab === 'upcoming' ? upcomingTickets :
    activeTab === 'used' ? usedTickets :
    activeTab === 'past' ? pastTickets :
    transferredTickets;

  const TABS: { key: TicketTab; label: string; count: number; icon: string }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcomingTickets.length, icon: 'event-available' },
    { key: 'used', label: 'Used', count: usedTickets.length, icon: 'verified' },
    { key: 'past', label: 'Past', count: pastTickets.length, icon: 'history' },
    { key: 'transferred', label: 'Transferred', count: transferredTickets.length, icon: 'swap-horiz' },
  ];

  const pendingTransferCount = pendingTransfers.transfers.length;

  const emptyConfig: Record<TicketTab, { icon: string; title: string; sub: string; showBrowse: boolean }> = {
    upcoming: {
      icon: 'confirmation-number',
      title: 'No upcoming tickets',
      sub: 'Purchase tickets for upcoming events to see them here.',
      showBrowse: true,
    },
    used: {
      icon: 'verified',
      title: 'No used tickets',
      sub: 'Tickets that have been scanned at entry will appear here permanently.',
      showBrowse: false,
    },
    past: {
      icon: 'history',
      title: 'No past tickets',
      sub: 'Unscanned tickets for events that have passed will appear here.',
      showBrowse: false,
    },
    transferred: {
      icon: 'swap-horiz',
      title: 'No transferred tickets',
      sub: 'Tickets you have transferred to others will appear here.',
      showBrowse: false,
    },
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>My Tickets</Text>
          <Text style={styles.totalBadge}>{tickets.length}</Text>
        </View>

        {/* Tab strip */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive,
                // Used tab gets a green tint when active
                activeTab === tab.key && tab.key === 'used' && styles.tabBtnUsedActive,
              ]}
            >
              <MaterialIcons
                name={tab.icon as any}
                size={12}
                color={
                  activeTab === tab.key && tab.key === 'used'
                    ? Colors.greenLight
                    : activeTab === tab.key
                      ? Colors.textOnGold
                      : Colors.textMuted
                }
              />
              <Text style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
                activeTab === tab.key && tab.key === 'used' && styles.tabTextUsedActive,
              ]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[
                  styles.tabCount,
                  activeTab === tab.key && styles.tabCountActive,
                  activeTab === tab.key && tab.key === 'used' && styles.tabCountUsedActive,
                ]}>
                  <Text style={[
                    styles.tabCountText,
                    activeTab === tab.key && styles.tabCountTextActive,
                  ]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={styles.centeredSub}>Loading your tickets...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Failed to load tickets</Text>
          <Text style={styles.centeredSub}>{error}</Text>
          <Pressable onPress={reload} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayedTickets}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            activeTab === 'upcoming' && pendingTransferCount > 0 ? (
              <View style={styles.pendingSection}>
                <View style={styles.pendingSectionHeader}>
                  <MaterialIcons name="swap-horiz" size={16} color="#42A5F5" />
                  <Text style={styles.pendingSectionTitle}>
                    Pending Transfers ({pendingTransferCount})
                  </Text>
                  {pendingTransfers.loading && <ActivityIndicator size="small" color="#42A5F5" />}
                </View>
                <Text style={styles.pendingSectionSub}>
                  Accept to add these tickets to your wallet.
                </Text>
                {pendingTransfers.transfers.map((t) => (
                  <PendingTransferCard
                    key={t.id}
                    transfer={t}
                    onAccept={() => handleAcceptTransfer(t)}
                    onDecline={() => handleDeclineTransfer(t)}
                  />
                ))}
                <View style={styles.pendingDivider} />
              </View>
            ) : activeTab === 'used' && usedTickets.length > 0 ? (
              <View style={styles.usedHeaderNote}>
                <MaterialIcons name="info-outline" size={14} color={Colors.greenLight} />
                <Text style={styles.usedHeaderNoteText}>
                  Used tickets are kept permanently as proof of admission.
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xl) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={Colors.gold} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <MaterialIcons
                  name={emptyConfig[activeTab].icon as any}
                  size={36}
                  color={Colors.textMuted}
                />
              </View>
              <Text style={styles.emptyTitle}>{emptyConfig[activeTab].title}</Text>
              <Text style={styles.emptySub}>{emptyConfig[activeTab].sub}</Text>
              {emptyConfig[activeTab].showBrowse && (
                <Pressable
                  onPress={() => router.push('/(tabs)/' as any)}
                  style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={[Colors.gold, Colors.goldDim]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.browseBtnInner}
                  >
                    <MaterialIcons name="search" size={16} color={Colors.textOnGold} />
                    <Text style={styles.browseBtnText}>Browse Events</Text>
                  </LinearGradient>
                </Pressable>
              )}
              {/* Legal help links */}
              <View style={styles.legalFooter}>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.ticketTerms)} hitSlop={8}>
                  <Text style={styles.legalFooterLink}>Ticket Terms</Text>
                </Pressable>
                <Text style={styles.legalFooterSep}>·</Text>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.refundPolicy)} hitSlop={8}>
                  <Text style={styles.legalFooterLink}>Refund Policy</Text>
                </Pressable>
                <Text style={styles.legalFooterSep}>·</Text>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.transferPolicy)} hitSlop={8}>
                  <Text style={styles.legalFooterLink}>Transfer Policy</Text>
                </Pressable>
              </View>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: Spacing.base, alignItems: 'center' }}>
                <ActivityIndicator color={Colors.gold} size="small" />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TicketCard
              ticket={item}
              onPress={() => setSelectedTicket(item)}
            />
          )}
        />
      )}

      {/* Ticket detail modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        visible={selectedTicket !== null}
        onClose={() => setSelectedTicket(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.base, paddingHorizontal: Spacing.xl,
  },
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
  headerTitle: {
    flex: 1, fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary,
  },
  totalBadge: {
    fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.gold,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },

  tabRow: {
    flexDirection: 'row', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  // Used tab active state: green instead of gold
  tabBtnUsedActive: {
    backgroundColor: 'rgba(0,200,83,0.12)',
    borderColor: 'rgba(0,200,83,0.4)',
  },
  tabText: { fontSize: 10, fontWeight: Typography.medium, color: Colors.textMuted },
  tabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  tabTextUsedActive: { color: Colors.greenLight },
  tabCount: {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabCountActive: { backgroundColor: 'rgba(0,0,0,0.2)' },
  tabCountUsedActive: { backgroundColor: 'rgba(0,200,83,0.2)' },
  tabCountText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textMuted },
  tabCountTextActive: { color: Colors.textOnGold },

  listContent: { padding: Spacing.base },

  // Used tab header note
  usedHeaderNote: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(0,200,83,0.06)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(0,200,83,0.2)',
    marginBottom: Spacing.md,
  },
  usedHeaderNoteText: {
    flex: 1, fontSize: Typography.xs, color: Colors.greenLight, lineHeight: 17,
  },

  emptyWrap: {
    alignItems: 'center', paddingVertical: Spacing.xxl,
    gap: Spacing.base, paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  emptySub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  browseBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm, alignSelf: 'stretch' },
  browseBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  browseBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  legalFooter: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: Spacing.md, marginTop: Spacing.sm,
  },
  legalFooterLink: { fontSize: 11, color: Colors.textMuted, textDecorationLine: 'underline' },
  legalFooterSep: { fontSize: 11, color: Colors.textMuted },

  // Pending transfers section
  pendingSection: { marginBottom: Spacing.md },
  pendingSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.xs, paddingVertical: Spacing.xs,
  },
  pendingSectionTitle: {
    flex: 1, fontSize: Typography.xs, fontWeight: Typography.bold,
    color: '#42A5F5', textTransform: 'uppercase', letterSpacing: 0.8,
  },
  pendingSectionSub: {
    fontSize: Typography.xs, color: Colors.textMuted,
    marginBottom: Spacing.md, lineHeight: 17,
  },
  pendingDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginTop: Spacing.sm, marginBottom: Spacing.md },
});
