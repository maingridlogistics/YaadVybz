// app/ticketing/attendees/[eventId].tsx
// Standalone Attendees screen — focused on attendee list, search, and check-in status.
// Data: get_event_tickets_for_promoter RPC (via useTicketDashboard hook).
// secure_token is NEVER present in any data returned by that RPC.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTicketDashboard } from '../../../hooks/useTicketing';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import type { PromoterTicketRow } from '../../../services/ticketingService';

// ─── Attendee Row ─────────────────────────────────────────────────────────────

function AttendeeRow({ ticket }: { ticket: PromoterTicketRow }) {
  const checkedIn = !!ticket.checked_in_at;
  return (
    <View style={s.attendeeRow}>
      {/* Check-in indicator */}
      <View style={[s.checkinDot, { backgroundColor: checkedIn ? Colors.greenLight : Colors.surfaceBorder }]} />

      {/* Info */}
      <View style={s.attendeeInfo}>
        <Text style={s.attendeeName}>
          {ticket.attendee_name || 'No name set'}
        </Text>
        <View style={s.attendeeMeta}>
          <MaterialIcons name="confirmation-number" size={11} color={Colors.textMuted} />
          <Text style={s.attendeeMetaText}>{ticket.ticket_type_name}</Text>
        </View>
        {checkedIn && ticket.checked_in_at ? (
          <View style={[s.attendeeMeta, { marginTop: 1 }]}>
            <MaterialIcons name="access-time" size={11} color={Colors.greenLight} />
            <Text style={[s.attendeeMetaText, { color: Colors.greenLight }]}>
              Checked in {new Date(ticket.checked_in_at).toLocaleTimeString('en-JM', {
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Status badge */}
      <View style={[
        s.statusBadge,
        {
          backgroundColor: ticket.status === 'valid'
            ? 'rgba(0,168,70,0.1)'
            : Colors.surfaceElevated,
        },
      ]}>
        <Text style={[
          s.statusText,
          { color: ticket.status === 'valid' ? Colors.greenLight : Colors.textMuted },
        ]}>
          {checkedIn ? 'IN' : ticket.status}
        </Text>
      </View>
    </View>
  );
}

// ─── Check-in Summary Bar ─────────────────────────────────────────────────────

function CheckInBar({
  total,
  checkedIn,
}: {
  total: number;
  checkedIn: number;
}) {
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
  return (
    <View style={s.checkInBar}>
      <View style={s.checkInBarStats}>
        <View style={s.checkInStat}>
          <Text style={[s.checkInNum, { color: Colors.greenLight }]}>{checkedIn}</Text>
          <Text style={s.checkInLabel}>Checked In</Text>
        </View>
        <View style={s.checkInDivider} />
        <View style={s.checkInStat}>
          <Text style={[s.checkInNum, { color: Colors.gold }]}>{total - checkedIn}</Text>
          <Text style={s.checkInLabel}>Not Yet In</Text>
        </View>
        <View style={s.checkInDivider} />
        <View style={s.checkInStat}>
          <Text style={s.checkInNum}>{total}</Text>
          <Text style={s.checkInLabel}>Total</Text>
        </View>
        <View style={s.checkInDivider} />
        <View style={s.checkInStat}>
          <Text style={[s.checkInNum, { color: Colors.info }]}>{pct}%</Text>
          <Text style={s.checkInLabel}>Rate</Text>
        </View>
      </View>
      {/* Progress bar */}
      {total > 0 && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${pct}%` as any }]} />
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AttendeesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const {
    summary,
    tickets,
    loading,
    loadingMore,
    hasMore,
    error,
    load,
    loadMore,
  } = useTicketDashboard(eventId ?? '');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (eventId) load();
  }, [eventId, load]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.centered}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={s.centeredTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={s.backLink}>
            <Text style={s.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!user) { router.replace('/auth' as any); return null; }

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Apply search + filter
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = !search.trim() ||
      t.attendee_name.toLowerCase().includes(search.toLowerCase()) ||
      t.ticket_type_name.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'in' && !!t.checked_in_at) ||
      (filter === 'out' && !t.checked_in_at);

    return matchesSearch && matchesFilter;
  });

  const checkedInCount = summary?.checked_in ?? 0;
  const totalCount = summary?.total_tickets ?? 0;

  const FILTER_OPTIONS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'in', label: 'Checked In' },
    { key: 'out', label: 'Not Yet In' },
  ];

  return (
    <View style={s.container}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Attendees</Text>
            <Text style={s.headerSub}>Ticket holders and check-in status</Text>
          </View>
          {/* Scanner shortcut */}
          <Pressable
            onPress={() => router.push(`/ticketing/scanner/${eventId}` as any)}
            style={({ pressed }) => [s.scannerBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="qr-code-scanner" size={18} color={Colors.textOnGold} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading && !refreshing ? (
        <View style={s.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} />
          }
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* Error */}
          {error ? (
            <View style={s.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Check-in summary ────────────────────────────────────── */}
          {totalCount > 0 && (
            <CheckInBar total={totalCount} checkedIn={checkedInCount} />
          )}

          {/* ── Filter chips ─────────────────────────────────────────── */}
          <View style={s.filterRow}>
            {FILTER_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => setFilter(opt.key)}
                style={({ pressed }) => [
                  s.filterChip,
                  filter === opt.key && s.filterChipActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[s.filterChipText, filter === opt.key && s.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Search ───────────────────────────────────────────────── */}
          <View style={s.searchWrap}>
            <MaterialIcons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or ticket tier…"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
              accessibilityLabel="Search attendees"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Privacy notice */}
          <View style={s.privacyNote}>
            <MaterialIcons name="privacy-tip" size={12} color={Colors.textMuted} />
            <Text style={s.privacyText}>
              Customer account identifiers are masked. QR credentials are never shown.
            </Text>
          </View>

          {/* ── Attendee list ─────────────────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              {filteredTickets.length} attendee{filteredTickets.length !== 1 ? 's' : ''}
              {hasMore && !search.trim() && filter === 'all' ? '+' : ''}
              {search.trim() ? ' found' : ''}
            </Text>

            {filteredTickets.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialIcons name="people-outline" size={32} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>
                  {search.trim()
                    ? 'No attendees match your search'
                    : filter === 'in'
                    ? 'No one has checked in yet'
                    : filter === 'out'
                    ? 'Everyone has checked in'
                    : 'No tickets sold yet'}
                </Text>
                <Text style={s.emptySub}>
                  {search.trim()
                    ? 'Try a different name or ticket tier.'
                    : filter !== 'all'
                    ? 'Try the "All" filter to see all attendees.'
                    : 'Tickets sold through Vybz Hub will appear here.'}
                </Text>
              </View>
            ) : (
              <View style={s.listCard}>
                {filteredTickets.map((ticket, i) => (
                  <React.Fragment key={ticket.id}>
                    <AttendeeRow ticket={ticket} />
                    {i < filteredTickets.length - 1 && <View style={s.divider} />}
                  </React.Fragment>
                ))}
              </View>
            )}

            {hasMore && !search.trim() && filter === 'all' && (
              <Pressable
                onPress={loadMore}
                disabled={loadingMore}
                style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.75 }]}
              >
                {loadingMore ? (
                  <ActivityIndicator color={Colors.gold} size="small" />
                ) : (
                  <Text style={s.loadMoreText}>Load More Attendees</Text>
                )}
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.base, backgroundColor: Colors.background,
  },
  centeredTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },

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
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  scannerBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },

  scrollContent: { padding: Spacing.base, gap: Spacing.lg },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  // Check-in bar
  checkInBar: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    padding: Spacing.base, gap: Spacing.md,
  },
  checkInBarStats: { flexDirection: 'row', alignItems: 'center' },
  checkInStat: { flex: 1, alignItems: 'center', gap: 3 },
  checkInNum: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  checkInLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  checkInDivider: { width: 1, height: 36, backgroundColor: Colors.surfaceBorder },
  progressBar: {
    height: 6, backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.greenLight, borderRadius: Radius.full },

  // Filter chips
  filterRow: {
    flexDirection: 'row', gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  filterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterChipText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  filterChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  // Privacy
  privacyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
  },
  privacyText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  // Section
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Attendee list
  listCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  attendeeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 14, paddingHorizontal: Spacing.base,
    minHeight: 60,
  },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder, marginHorizontal: Spacing.base },
  checkinDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  attendeeInfo: { flex: 1, gap: 2 },
  attendeeName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  attendeeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attendeeMetaText: { fontSize: Typography.xs, color: Colors.textMuted },
  statusBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, flexShrink: 0,
  },
  statusText: { fontSize: 10, fontWeight: Typography.bold, textTransform: 'uppercase' },

  // Empty
  emptyCard: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    fontSize: Typography.base, fontWeight: Typography.semibold,
    color: Colors.textSecondary, textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.xs, color: Colors.textMuted,
    textAlign: 'center', maxWidth: 260, lineHeight: 18,
  },

  // Load more
  loadMoreBtn: {
    paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  loadMoreText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold },
});
