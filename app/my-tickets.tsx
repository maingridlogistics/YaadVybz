// app/my-tickets.tsx
// Phase 3 — Customer My Tickets screen.
// Shows all tickets purchased by the current user, grouped into Upcoming / Past.
// Customers can view their QR code for entry.
// secure_token is accessible to customers via RLS (authenticated_select_own_tickets).

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useMyTickets } from '../hooks/useCustomerTicketing';
import { formatMinorAmount, type MyTicket } from '../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { formatDate } from '../constants/data';
import { getCardUrl } from '../lib/storage';
import { TICKETING_ENABLED } from '../constants/featureFlags';

// ─── QR Display ───────────────────────────────────────────────────────────────

function QRDisplay({ token, size = 180 }: { token: string; size?: number }) {
  // Generate a deterministic pixel-art QR pattern from the token.
  // This is a visual representation only — Phase 4 scanner validates via checkin_ticket() RPC.
  const CELLS = 21;
  const cellSize = Math.floor(size / CELLS);

  const isFinder = (r: number, c: number): boolean => {
    const regions = [
      [0, 0], [0, CELLS - 7], [CELLS - 7, 0],
    ] as [number, number][];
    for (const [br, bc] of regions) {
      const lr = r - br;
      const lc = c - bc;
      if (lr >= 0 && lr <= 6 && lc >= 0 && lc <= 6) {
        return lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
      }
    }
    return false;
  };

  // Hash the token into a stable bit pattern
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash) ^ token.charCodeAt(i);
    hash = hash >>> 0;
  }

  const isDataCell = (r: number, c: number): boolean => {
    if (isFinder(r, c)) return isFinder(r, c);
    const idx = r * CELLS + c;
    const byteIdx = Math.floor(idx / 8);
    const bitIdx = idx % 8;
    const byte = (hash + byteIdx * 31 + r * 17 + c * 7) & 0xFF;
    return !!(byte & (1 << bitIdx));
  };

  return (
    <View style={{ backgroundColor: '#F8F8F0', padding: 8, borderRadius: 4 }}>
      {Array.from({ length: CELLS }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: CELLS }, (_, col) => (
            <View
              key={col}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: isDataCell(row, col) ? '#0A0A0A' : '#F8F8F0',
              }}
            />
          ))}
        </View>
      ))}
    </View>
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

          {/* QR Code */}
          {!isVoided && !isTransferred && (
            <View style={detailStyles.qrSection}>
              {isUsed ? (
                <View style={detailStyles.usedOverlay}>
                  <MaterialIcons name="check-circle" size={48} color={Colors.greenLight} />
                  <Text style={detailStyles.usedText}>Checked In</Text>
                  <Text style={detailStyles.usedSubText}>
                    {new Date(ticket.checked_in_at!).toLocaleString('en-JM')}
                  </Text>
                </View>
              ) : (
                <QRDisplay token={ticket.secure_token} size={200} />
              )}
              <Text style={detailStyles.qrHint}>
                {isUsed ? 'This ticket has been used.' : 'Show this QR code at the event entrance.'}
              </Text>
              <Text style={detailStyles.tokenId}>
                {ticket.id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
          )}

          {/* View order */}
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
  voidedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)',
  },
  voidedText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },
  qrSection: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  usedOverlay: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },
  usedText: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.greenLight },
  usedSubText: { fontSize: Typography.sm, color: Colors.textMuted },
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
  const isCheckedIn = ticket.checked_in_at != null;
  const isVoided = ticket.status === 'voided' || ticket.status === 'refunded' || ticket.status === 'cancelled';
  const isTransferred = ticket.status === 'transferred_out';

  const statusColor = isVoided
    ? Colors.error
    : isTransferred
      ? '#FF9800'
      : isCheckedIn
        ? Colors.greenLight
        : Colors.gold;

  const statusLabel = isVoided
    ? ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)
    : isTransferred
      ? 'Transferred'
      : isCheckedIn
        ? 'Used'
        : 'Valid';

  const statusIcon = isVoided
    ? 'cancel'
    : isTransferred
      ? 'swap-horiz'
      : isCheckedIn
        ? 'check-circle'
        : 'confirmation-number';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cardStyles.card, pressed && { opacity: 0.88 }]}
    >
      {ticket.event_cover_image ? (
        <Image
          source={{ uri: getCardUrl(ticket.event_cover_image) }}
          style={cardStyles.cover}
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
        <View style={[cardStyles.statusBadge, { backgroundColor: `${statusColor}15`, borderColor: `${statusColor}44` }]}>
          <MaterialIcons name={statusIcon as any} size={11} color={statusColor} />
          <Text style={[cardStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <MaterialIcons name="qr-code" size={22} color={Colors.gold} />
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
  cover: { width: 72, height: 72, borderRadius: Radius.md, flexShrink: 0 },
  content: { flex: 1, gap: 3 },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  tierName: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, color: Colors.textMuted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.surfaceBorder },
  attendee: { fontSize: Typography.xs, color: Colors.textSecondary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: Typography.bold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

type TicketTab = 'upcoming' | 'past' | 'transferred';

export default function MyTicketsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { tickets, loading, loadingMore, hasMore, error, reload, loadMore } = useMyTickets();
  const [activeTab, setActiveTab] = useState<TicketTab>('upcoming');
  const [selectedTicket, setSelectedTicket] = useState<MyTicket | null>(null);

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

  // Group tickets
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isUpcomingDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d) >= today;
  };

  const activeStatuses = ['valid'];
  const usedStatuses = ['checked_in'];
  const inactiveStatuses = ['voided', 'refunded', 'cancelled'];

  const upcomingTickets = tickets.filter(
    (t) => isUpcomingDate(t.event_date) &&
      !['transferred_out', 'voided', 'refunded', 'cancelled'].includes(t.status),
  );
  const pastTickets = tickets.filter(
    (t) => !isUpcomingDate(t.event_date) &&
      !['transferred_out'].includes(t.status),
  );
  const transferredTickets = tickets.filter((t) => t.status === 'transferred_out');

  const displayedTickets =
    activeTab === 'upcoming' ? upcomingTickets :
    activeTab === 'past' ? pastTickets :
    transferredTickets;

  const TABS: { key: TicketTab; label: string; count: number; icon: string }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcomingTickets.length, icon: 'event-available' },
    { key: 'past', label: 'Past', count: pastTickets.length, icon: 'history' },
    { key: 'transferred', label: 'Transferred', count: transferredTickets.length, icon: 'swap-horiz' },
  ];

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
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            >
              <MaterialIcons
                name={tab.icon as any}
                size={13}
                color={activeTab === tab.key ? Colors.textOnGold : Colors.textMuted}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, activeTab === tab.key && styles.tabCountTextActive]}>
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
                  name={activeTab === 'upcoming' ? 'confirmation-number' : activeTab === 'past' ? 'history' : 'swap-horiz'}
                  size={36}
                  color={Colors.textMuted}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'upcoming' ? 'No upcoming tickets' :
                 activeTab === 'past' ? 'No past tickets' :
                 'No transferred tickets'}
              </Text>
              <Text style={styles.emptySub}>
                {activeTab === 'upcoming'
                  ? 'Purchase tickets for upcoming events to see them here.'
                  : activeTab === 'past'
                    ? 'Tickets for events that have passed will appear here.'
                    : 'Tickets you have transferred to others will appear here.'}
              </Text>
              {activeTab === 'upcoming' && (
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
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textMuted },
  tabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabCountActive: { backgroundColor: 'rgba(0,0,0,0.2)' },
  tabCountText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textMuted },
  tabCountTextActive: { color: Colors.textOnGold },

  listContent: { padding: Spacing.base },

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
});
