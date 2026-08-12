
// app/ticketing/dashboard/[eventId].tsx
// Phase 2 + Phase 5 — Promoter: Ticket sales dashboard, door sales summary, and attendee list.
// Uses sanitized RPCs only (get_event_ticket_summary + get_event_tickets_for_promoter).
// secure_token is never present in any data returned from these RPCs.
// owner_user_id / purchaser_user_id displayed as masked identifiers only.
// Phase 5: get_door_sales_summary RPC adds cash/card/online breakdown and staff activity.
// CRITICAL: Cash collected directly is visually separated from platform-held pending payout.

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
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTicketDashboard } from '../../../hooks/useTicketing';
import { useDoorSalesSummary } from '../../../hooks/useDoorSales';
import { formatMinorAmount } from '../../../services/doorSalesService';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import type { PromoterTicketRow } from '../../../services/ticketingService';

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AttendeeRow({ ticket }: { ticket: PromoterTicketRow }) {
  const checkedIn = !!ticket.checked_in_at;
  return (
    <View style={styles.attendeeRow}>
      <View style={[styles.checkinDot, { backgroundColor: checkedIn ? Colors.greenLight : Colors.surfaceBorder }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.attendeeName}>
          {ticket.attendee_name || 'No name set'}
        </Text>
        <Text style={styles.attendeeTier}>{ticket.ticket_type_name}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <View style={[
          styles.attendeeStatusBadge,
          { backgroundColor: ticket.status === 'valid' ? 'rgba(0,168,70,0.12)' : Colors.surfaceElevated },
        ]}>
          <Text style={[
            styles.attendeeStatusText,
            { color: ticket.status === 'valid' ? Colors.greenLight : Colors.textMuted },
          ]}>
            {ticket.status}
          </Text>
        </View>
        {checkedIn && (
          <Text style={styles.checkinTime}>
            {new Date(ticket.checked_in_at!).toLocaleTimeString('en-JM', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function TicketDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
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

  const doorSummary = useDoorSalesSummary(eventId ?? '');
  // Destructure load so the useEffect only depends on the stable function reference,
  // not the doorSummary object (which is a new reference on every render).
  const { load: loadDoorSummary } = doorSummary;

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (eventId) {
      load();
      loadDoorSummary();
    }
  }, [eventId, load, loadDoorSummary]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadDoorSummary()]);
    setRefreshing(false);
  };

  // Filter attendees by search (name or tier)
  const filteredTickets = search.trim()
    ? tickets.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.attendee_name.toLowerCase().includes(q) ||
          t.ticket_type_name.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q)
        );
      })
    : tickets;

  const checkinPct = summary && summary.total_tickets > 0
    ? Math.round((summary.checked_in / summary.total_tickets) * 100)
    : 0;

  const ds = doorSummary.summary;

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
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Sales Dashboard</Text>
            <Text style={styles.headerSub}>Ticket overview and door sales</Text>
          </View>
          <Pressable
            onPress={() => router.push(`/ticketing/setup/${eventId}` as any)}
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="settings" size={20} color={Colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => router.push(`/ticketing/scanner/${eventId}?title=${encodeURIComponent('Scan Tickets')}` as any)}
            style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="qr-code-scanner" size={18} color={Colors.textOnGold} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.gold}
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* Error */}
          {error ? (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Sell at Door CTA ──────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push(`/ticketing/door/${eventId}` as any)}
            style={({ pressed }) => [styles.doorSaleBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={['#00A846', '#007a32']} style={styles.doorSaleBtnInner}>
              <MaterialIcons name="point-of-sale" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.doorSaleBtnTitle}>Sell at Door</Text>
                <Text style={styles.doorSaleBtnSub}>Cash or card walk-up sales</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>

          {/* ── Phase 5: Door Sales Summary ───────────────────────────── */}
          {ds && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sales Breakdown</Text>

              {/* CRITICAL: Cash accounting — clearly separated from pending payout */}
              <View style={styles.cashAccountingCard}>
                <View style={styles.cashAccountingHeader}>
                  <MaterialIcons name="account-balance-wallet" size={16} color={Colors.gold} />
                  <Text style={styles.cashAccountingTitle}>Cash Accounting</Text>
                  <View style={styles.cashAccountingBadge}>
                    <Text style={styles.cashAccountingBadgeText}>0% Fee</Text>
                  </View>
                </View>
                <View style={styles.cashRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cashRowLabel}>Cash Collected Directly</Text>
                    <Text style={styles.cashRowNote}>You hold this — no platform fee on cash sales</Text>
                  </View>
                  <Text style={[styles.cashRowValue, { color: Colors.greenLight }]}>
                    {formatMinorAmount(ds.cash_collected_directly_minor, ds.door_cash_orders > 0 ? 'USD' : 'USD')}
                  </Text>
                </View>
                <View style={[styles.cashRow, styles.cashRowDivider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cashRowLabel}>Platform-Held (online + door card)</Text>
                    <Text style={styles.cashRowNote}>Held by Vybz Hub for future payout</Text>
                  </View>
                  <Text style={[styles.cashRowValue, { color: Colors.info }]}>
                    {formatMinorAmount(ds.platform_held_minor, 'USD')}
                  </Text>
                </View>
              </View>

              {/* Channel breakdown */}
              <View style={styles.card}>
                {[
                  {
                    label: 'Online Sales',
                    tickets: ds.online_tickets_sold,
                    orders: ds.online_orders,
                    icon: 'shopping-cart',
                    color: Colors.info,
                  },
                  {
                    label: 'Door — Cash',
                    tickets: ds.door_cash_tickets_sold,
                    orders: ds.door_cash_orders,
                    icon: 'payments',
                    color: Colors.greenLight,
                  },
                  {
                    label: 'Door — Card',
                    tickets: ds.door_card_tickets_sold,
                    orders: ds.door_card_orders,
                    icon: 'credit-card',
                    color: Colors.gold,
                  },
                ].map((ch, i) => (
                  <View
                    key={ch.label}
                    style={[styles.channelRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder }]}
                  >
                    <View style={[styles.channelIcon, { backgroundColor: `${ch.color}20` }]}>
                      <MaterialIcons name={ch.icon as any} size={16} color={ch.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.channelLabel}>{ch.label}</Text>
                      <Text style={styles.channelSub}>{ch.orders} order{ch.orders !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={[styles.channelTickets, { color: ch.color }]}>
                      {ch.tickets} ticket{ch.tickets !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Staff activity */}
              {ds.staff_activity && ds.staff_activity.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: Spacing.sm }]}>Staff Activity</Text>
                  <View style={styles.card}>
                    {ds.staff_activity.map((s, i) => (
                      <View
                        key={s.sold_by}
                        style={[
                          styles.staffActivityRow,
                          i > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
                        ]}
                      >
                        <View style={styles.staffActivityAvatar}>
                          <Text style={styles.staffActivityLetter}>
                            {(s.display_name || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.staffActivityName}>{s.display_name}</Text>
                          <Text style={styles.staffActivitySub}>
                            {s.cash_orders} cash · {s.card_orders} card · {s.total_tickets} tickets
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={[styles.cashRowValue, { color: Colors.greenLight, fontSize: Typography.sm }]}>
                            {formatMinorAmount(s.cash_collected_minor, 'USD')}
                          </Text>
                          <Text style={styles.staffActivitySub}>cash collected</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Check-in + ticket stats ───────────────────────────────── */}
          {summary ? (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  icon="confirmation-number"
                  value={ds?.total_tickets_sold ?? summary.total_tickets}
                  label="Total Sold"
                  color={Colors.textPrimary}
                />
                <StatCard
                  icon="check-circle"
                  value={ds?.total_checked_in ?? summary.checked_in}
                  label="Checked In"
                  color={Colors.greenLight}
                />
                <StatCard
                  icon="pending"
                  value={summary.not_checked_in}
                  label="Not Yet In"
                  color={Colors.gold}
                />
                <StatCard
                  icon="percent"
                  value={`${checkinPct}%`}
                  label="Check-in Rate"
                  color={Colors.info}
                />
              </View>

              {/* Check-in progress bar */}
              {summary.total_tickets > 0 && (
                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Check-in Progress</Text>
                    <Text style={styles.progressPct}>{checkinPct}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${checkinPct}%` as any }]} />
                  </View>
                </View>
              )}

              {/* By-tier breakdown */}
              {summary.by_type && summary.by_type.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>By Ticket Tier</Text>
                  <View style={styles.card}>
                    {summary.by_type.map((tier, i) => {
                      const tierPct = tier.total > 0
                        ? Math.round((tier.checked_in / tier.total) * 100)
                        : 0;
                      return (
                        <View
                          key={tier.ticket_type_id}
                          style={[
                            styles.tierRow,
                            i < summary.by_type.length - 1 && styles.tierRowBorder,
                          ]}
                        >
                          <View style={{ flex: 1, gap: Spacing.xs }}>
                            <Text style={styles.tierRowName}>{tier.ticket_type_name}</Text>
                            <View style={styles.tierMiniBar}>
                              <View
                                style={[styles.tierMiniFill, { width: `${tierPct}%` as any }]}
                              />
                            </View>
                          </View>
                          <View style={styles.tierRowStats}>
                            <Text style={styles.tierRowCheckin}>
                              {tier.checked_in}/{tier.total}
                            </Text>
                            <Text style={styles.tierRowPct}>{tierPct}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Status breakdown */}
              {summary.total_tickets > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Status Breakdown</Text>
                  <View style={styles.statusGrid}>
                    {[
                      { label: 'Valid', value: summary.valid, color: Colors.greenLight },
                      { label: 'Transferred', value: summary.transferred_out, color: Colors.gold },
                      { label: 'Voided', value: summary.voided, color: Colors.textMuted },
                      { label: 'Refunded', value: summary.refunded, color: Colors.error },
                    ].map(({ label, value, color }) => (
                      <View key={label} style={styles.statusChip}>
                        <Text style={[styles.statusChipValue, { color }]}>{value}</Text>
                        <Text style={styles.statusChipLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          ) : null}

          {/* Attendee list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Attendees ({filteredTickets.length}{hasMore ? '+' : ''})
            </Text>

            {/* Search */}
            <View style={styles.searchWrap}>
              <MaterialIcons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or tier…"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Privacy note */}
            <View style={styles.privacyNote}>
              <MaterialIcons name="privacy-tip" size={13} color={Colors.textMuted} />
              <Text style={styles.privacyNoteText}>
                Customer account identifiers are masked. QR credentials are never shown here.
              </Text>
            </View>

            {filteredTickets.length === 0 && !loading ? (
              <View style={styles.emptyAttendees}>
                <MaterialIcons name="people-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyAttendeesText}>
                  {search.trim()
                    ? 'No attendees match your search.'
                    : 'No tickets sold yet. Use Sell at Door or the online checkout to issue tickets.'}
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                {filteredTickets.map((ticket, i) => (
                  <React.Fragment key={ticket.id}>
                    <AttendeeRow ticket={ticket} />
                    {i < filteredTickets.length - 1 && <View style={styles.attendeeDivider} />}
                  </React.Fragment>
                ))}
              </View>
            )}

            {/* Load more */}
            {hasMore && !search.trim() && (
              <Pressable
                onPress={loadMore}
                disabled={loadingMore}
                style={({ pressed }) => [styles.loadMoreBtn, pressed && { opacity: 0.75 }]}
              >
                {loadingMore ? (
                  <ActivityIndicator color={Colors.gold} size="small" />
                ) : (
                  <Text style={styles.loadMoreText}>Load More</Text>
                )}
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
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
  settingsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, height: 40,
  },

  scrollContent: { padding: Spacing.base, gap: Spacing.xl },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  // ── Door Sale CTA ─────────────────────────────────────────────────────────
  doorSaleBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  doorSaleBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.base,
  },
  doorSaleBtnTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },
  doorSaleBtnSub: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.75)' },

  // ── Cash Accounting ───────────────────────────────────────────────────────
  cashAccountingCard: {
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
    padding: Spacing.base, gap: Spacing.md,
  },
  cashAccountingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  cashAccountingTitle: {
    flex: 1, fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gold,
  },
  cashAccountingBadge: {
    backgroundColor: `${Colors.gold}22`, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  cashAccountingBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold },
  cashRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  cashRowDivider: { paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: `${Colors.gold}33`, marginTop: Spacing.sm },
  cashRowLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cashRowNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginTop: 2 },
  cashRowValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, flexShrink: 0 },

  // ── Channel breakdown ─────────────────────────────────────────────────────
  channelRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  channelIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  channelLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  channelSub: { fontSize: Typography.xs, color: Colors.textMuted },
  channelTickets: { fontSize: Typography.sm, fontWeight: Typography.bold },

  // ── Staff activity ────────────────────────────────────────────────────────
  staffActivityRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  staffActivityAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  staffActivityLetter: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  staffActivityName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  staffActivitySub: { fontSize: Typography.xs, color: Colors.textMuted },

  // ── Stats ─────────────────────────────────────────────────────────────────
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, alignItems: 'center', gap: Spacing.xs,
  },
  statValue: { fontSize: Typography.xl, fontWeight: Typography.black },
  statLabel: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  progressSection: { gap: Spacing.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  progressPct: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  progressBar: {
    height: 8, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.greenLight, borderRadius: Radius.full },

  section: { gap: Spacing.md },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },

  tierRow: { padding: Spacing.base, gap: Spacing.sm },
  tierRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tierRowName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  tierMiniBar: { height: 4, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, overflow: 'hidden' },
  tierMiniFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: Radius.full },
  tierRowStats: { alignItems: 'flex-end', gap: 2 },
  tierRowCheckin: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  tierRowPct: { fontSize: Typography.xs, color: Colors.textMuted },

  statusGrid: { flexDirection: 'row', gap: Spacing.sm },
  statusChip: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, alignItems: 'center', gap: 4,
  },
  statusChipValue: { fontSize: Typography.md, fontWeight: Typography.black },
  statusChipLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  privacyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  privacyNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  emptyAttendees: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyAttendeesText: {
    fontSize: Typography.sm, color: Colors.textMuted,
    textAlign: 'center', maxWidth: 280, lineHeight: 20,
  },

  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },

  attendeeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  attendeeDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginHorizontal: Spacing.base },
  checkinDot: { width: 10, height: 10, borderRadius: 5 },
  attendeeName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  attendeeTier: { fontSize: Typography.xs, color: Colors.textMuted },
  attendeeStatusBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: Radius.full,
  },
  attendeeStatusText: { fontSize: 10, fontWeight: Typography.bold },
  checkinTime: { fontSize: Typography.xs, color: Colors.textMuted },

  loadMoreBtn: {
    paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  loadMoreText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold },
});
