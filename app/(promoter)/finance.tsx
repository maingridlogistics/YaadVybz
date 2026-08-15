/**
 * Promoter Finance Screen — Revenue Overview
 *
 * Answers: "How much money am I making?"
 *
 * Contains:
 *   1. Revenue Summary (gross sales, tickets sold, fees, net revenue)
 *   2. Event Revenue List (each event with sales figures → tap for detail)
 *
 * Does NOT contain:
 *   - Payout balance / withdraw button  → use Payouts screen
 *   - Payout history                    → use Payouts screen
 *   - Payout accounts                   → use Payouts screen
 *   - Request payout                    → use Payouts screen
 *
 * All financial figures are from SECURITY DEFINER RPCs only.
 * Zero client-side financial calculations.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import {
  getPromoterFinanceSummary,
  type PromoterFinanceSummary,
} from '../../services/payoutService';
import { formatMinorAmount } from '../../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, isEventPassed } from '../../constants/data';
import { getCardUrl } from '../../lib/storage';

// ─── Supported currencies ─────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'JMD'] as const;
type Currency = typeof CURRENCIES[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(minor: number | undefined, currency: string): string {
  if (minor == null) return `${currency} —`;
  return formatMinorAmount(minor, currency);
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionLabel({ title, action, onAction }: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionLabelRow}>
      <View style={s.sectionBarWrap}>
        <View style={s.sectionBar} />
        <Text style={s.sectionLabelText}>{title}</Text>
      </View>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Revenue Stat Card ────────────────────────────────────────────────────────

function RevCard({
  icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <View style={s.revCard}>
      <View style={[s.revCardIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon as any} size={16} color="#fff" />
      </View>
      <Text style={s.revCardLabel}>{label}</Text>
      <Text style={s.revCardValue}>{value}</Text>
      <Text style={s.revCardSub}>{sub}</Text>
    </View>
  );
}

// ─── Event Revenue Row ────────────────────────────────────────────────────────

function EventRevenueRow({
  event,
  onPress,
}: {
  event: any;
  onPress: () => void;
}) {
  const coverUrl = event.coverImage ? getCardUrl(event.coverImage) : null;
  const timeStr = event.startTime ? ` · ${event.startTime}` : '';
  const statusColors: Record<string, string> = {
    live: Colors.greenLight,
    pending: '#FFD54F',
    flagged: '#FF9800',
    rejected: '#FF5252',
  };
  const statusColor = statusColors[event.status] ?? Colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.eventRow, pressed && { opacity: 0.82 }]}
    >
      {/* Thumbnail */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={s.eventThumb}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[s.eventThumb, s.eventThumbFallback]}>
          <MaterialIcons name="event" size={20} color={Colors.textMuted} />
        </View>
      )}

      {/* Info */}
      <View style={s.eventRowInfo}>
        <Text style={s.eventRowTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={s.eventRowMeta}>
          {formatDate(event.date)}{timeStr}
        </Text>
        <View style={s.eventRowMeta2}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={s.eventRowMetaText} numberOfLines={1}>{event.parish || '—'}</Text>
        </View>
      </View>

      {/* Right side */}
      <View style={s.eventRowRight}>
        {event.sellingTicketsInApp && event.ticketsSold != null && event.ticketsSold > 0 && (
          <View style={s.soldBadge}>
            <Text style={s.soldBadgeText}>{event.ticketsSold} sold</Text>
          </View>
        )}
        <View style={[s.statusDot, { backgroundColor: statusColor }]} />
        <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

// ─── Currency Picker Modal ────────────────────────────────────────────────────

function CurrencyPickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: Currency;
  onSelect: (c: Currency) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cp.overlay} onPress={onClose}>
        <View style={[cp.sheet, { marginBottom: insets.bottom + 24 }]}>
          <Text style={cp.title}>Select Currency</Text>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => { onSelect(c); onClose(); }}
              style={({ pressed }) => [cp.row, c === current && cp.rowSelected, pressed && { opacity: 0.8 }]}
            >
              <Text style={[cp.rowText, c === current && { color: Colors.gold }]}>{c}</Text>
              {c === current && <MaterialIcons name="check" size={16} color={Colors.gold} />}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const cp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.xs,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.base, borderRadius: Radius.md, paddingHorizontal: Spacing.sm },
  rowSelected: { backgroundColor: Colors.goldSurface },
  rowText: { fontSize: Typography.md, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PromoterFinanceScreen() {
  const { user } = useAuth();
  const { allEvents } = useEvents();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [currency, setCurrency] = useState<Currency>('USD');
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Revenue summary for anchor event (most recent live ticketed event)
  const [revSummary, setRevSummary] = useState<PromoterFinanceSummary | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);

  const myEvents = useMemo(
    () => (user ? allEvents.filter((e) => e.promoterId === user.id) : []),
    [allEvents, user]
  );

  // All events sorted: upcoming first, then past
  const sortedEvents = useMemo(() => {
    const upcoming = myEvents
      .filter((e) => !isEventPassed(e.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const past = myEvents
      .filter((e) => isEventPassed(e.date))
      .sort((a, b) => b.date.localeCompare(a.date));
    return [...upcoming, ...past];
  }, [myEvents]);

  // Anchor event for revenue summary: first live upcoming ticketed event,
  // then any live event, then any event
  const anchorEvent = useMemo(() => {
    return (
      sortedEvents.find((e) => e.status === 'live' && !isEventPassed(e.date) && e.sellingTicketsInApp) ??
      sortedEvents.find((e) => e.status === 'live' && !isEventPassed(e.date)) ??
      sortedEvents[0] ??
      null
    );
  }, [sortedEvents]);

  const EVENTS_PREVIEW = 6;
  const shownEvents = sortedEvents.slice(0, EVENTS_PREVIEW);
  const hasMoreEvents = sortedEvents.length > EVENTS_PREVIEW;

  // ── Load revenue summary ─────────────────────────────────────────────────

  const loadRevSummary = useCallback(async () => {
    if (!anchorEvent?.id) return;
    setRevLoading(true);
    setRevError(null);
    try {
      const result = await getPromoterFinanceSummary(anchorEvent.id);
      if (result.ok) setRevSummary(result);
      else setRevError(result.error ?? 'Failed to load revenue data.');
    } catch {
      setRevError('Failed to load revenue data.');
    }
    setRevLoading(false);
  }, [anchorEvent?.id]);

  useEffect(() => { loadRevSummary(); }, [loadRevSummary]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRevSummary();
    setRefreshing(false);
  }, [loadRevSummary]);

  const openEventFinance = (eventId: string) =>
    router.push(`/ticketing/finance/${eventId}` as any);

  // Revenue metrics from authoritative RPC
  const grossStr = revLoading ? '…' : fmt(revSummary?.platform_gross_minor, currency);
  const feesStr  = revLoading ? '…' : fmt(revSummary?.platform_promoter_fees_minor, currency);
  const netStr   = revLoading ? '…' : fmt(revSummary?.promoter_proceeds_minor, currency);
  const totalTicketsSold = useMemo(
    () => myEvents.reduce((sum, e) => sum + (e.ticketsSold ?? 0), 0),
    [myEvents]
  );

  if (!user) return null;

  const noEvents = myEvents.length === 0;

  return (
    <View style={s.container}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable
            onPress={() => navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)/profile' as any)}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>

          <View style={s.headerIconWrap}>
            <MaterialIcons name="bar-chart" size={18} color={Colors.gold} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Finance</Text>
            <Text style={s.headerSub}>Revenue and sales overview</Text>
          </View>

          {/* Currency selector */}
          <Pressable
            onPress={() => setCurrencyPickerVisible(true)}
            style={({ pressed }) => [s.currencyBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={s.currencyBtnText}>{currency}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={16} color={Colors.gold} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.body,
          { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />
        }
      >
        {/* ── Empty state ──────────────────────────────────────────────── */}
        {noEvents ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <MaterialIcons name="bar-chart" size={36} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>No events yet</Text>
            <Text style={s.emptySub}>
              Revenue data appears once you create events with online ticket sales.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/post' as any)}
              style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.emptyBtnInner}>
                <MaterialIcons name="add" size={16} color={Colors.textOnGold} />
                <Text style={s.emptyBtnText}>Create Event</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── Revenue Summary ──────────────────────────────────────── */}
            <View style={s.section}>
              <SectionLabel title="REVENUE SUMMARY" />

              {revError ? (
                <View style={s.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={s.errorText}>{revError}</Text>
                </View>
              ) : null}

              {revLoading && !revSummary ? (
                <View style={s.loadingWrap}>
                  <ActivityIndicator color={Colors.gold} />
                </View>
              ) : (
                <View style={s.revGrid}>
                  <RevCard
                    icon="bar-chart"
                    iconBg="#1B5E20"
                    label="Total Sales"
                    value={grossStr}
                    sub={currency}
                  />
                  <RevCard
                    icon="confirmation-number"
                    iconBg="#0D47A1"
                    label="Tickets Sold"
                    value={String(totalTicketsSold)}
                    sub="All Events"
                  />
                  <RevCard
                    icon="percent"
                    iconBg="#4A148C"
                    label="Platform Fees"
                    value={feesStr}
                    sub={currency}
                  />
                  <RevCard
                    icon="account-balance"
                    iconBg="#4E342E"
                    label="Net Revenue"
                    value={netStr}
                    sub={currency}
                  />
                </View>
              )}

              {/* Context note */}
              {!revLoading && anchorEvent ? (
                <View style={s.contextNote}>
                  <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                  <Text style={s.contextNoteText}>
                    Figures shown for <Text style={{ color: Colors.textSecondary }}>{anchorEvent.title}</Text>. Tap any event below for its detailed breakdown.
                  </Text>
                </View>
              ) : null}

              {/* Shortcut to Payouts */}
              <Pressable
                onPress={() => router.push('/(promoter)/payouts' as any)}
                style={({ pressed }) => [s.payoutsShortcut, pressed && { opacity: 0.82 }]}
              >
                <View style={s.payoutsShortcutIcon}>
                  <MaterialIcons name="savings" size={16} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.payoutsShortcutTitle}>Ready to withdraw?</Text>
                  <Text style={s.payoutsShortcutSub}>Go to Payouts to request a payout or manage your payout account.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={Colors.gold} />
              </Pressable>
            </View>

            {/* ── Event Revenue List ───────────────────────────────────── */}
            <View style={s.section}>
              <SectionLabel
                title="EVENT REVENUE"
                action={hasMoreEvents ? `View all ${sortedEvents.length}` : undefined}
                onAction={() => router.push('/(promoter)/events' as any)}
              />

              <View style={s.eventsCard}>
                {shownEvents.map((evt, i) => (
                  <React.Fragment key={evt.id}>
                    <EventRevenueRow
                      event={evt}
                      onPress={() => openEventFinance(evt.id)}
                    />
                    {i < shownEvents.length - 1 && <View style={s.eventsDivider} />}
                  </React.Fragment>
                ))}
              </View>

              {hasMoreEvents && (
                <Pressable
                  onPress={() => router.push('/(promoter)/events' as any)}
                  style={({ pressed }) => [s.viewAllBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={s.viewAllText}>View all {sortedEvents.length} events</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
                </Pressable>
              )}

              <View style={s.financeNote}>
                <MaterialIcons name="touch-app" size={12} color={Colors.textMuted} />
                <Text style={s.financeNoteText}>
                  Tap any event for a full revenue breakdown including refunds, disputes, and settlement details.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Currency Picker ────────────────────────────────────────────── */}
      <CurrencyPickerModal
        visible={currencyPickerVisible}
        current={currency}
        onSelect={(c) => { setCurrency(c); setRevSummary(null); }}
        onClose={() => setCurrencyPickerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  currencyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  currencyBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.gold },

  // Body
  body: { padding: Spacing.base, gap: Spacing.xl },

  // Section
  section: { gap: Spacing.md },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionBarWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionLabelText: {
    fontSize: 11, fontWeight: Typography.bold as any,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2,
  },
  sectionAction: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any },

  // Error / loading
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },
  loadingWrap: { paddingVertical: Spacing.xl, alignItems: 'center' },

  // Revenue grid
  revGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  revCard: {
    flex: 1, minWidth: '46%',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: 5,
  },
  revCardIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  revCardLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  revCardValue: { fontSize: Typography.xl, fontWeight: Typography.black as any, color: Colors.textPrimary },
  revCardSub: { fontSize: Typography.xs, color: Colors.textMuted },

  // Context note
  contextNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
  },
  contextNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  // Payouts shortcut
  payoutsShortcut: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
    padding: Spacing.base,
  },
  payoutsShortcutIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: `${Colors.gold}22`, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  payoutsShortcutTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.gold },
  payoutsShortcutSub: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

  // Event list
  eventsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  eventsDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginHorizontal: Spacing.base },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    minHeight: 68,
  },
  eventThumb: { width: 52, height: 52, borderRadius: Radius.md, flexShrink: 0 },
  eventThumbFallback: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  eventRowInfo: { flex: 1, gap: 3 },
  eventRowTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  eventRowMeta: { fontSize: Typography.xs, color: Colors.textSecondary },
  eventRowMeta2: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eventRowMetaText: { fontSize: Typography.xs, color: Colors.textMuted },
  eventRowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexShrink: 0 },
  soldBadge: {
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  soldBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold as any },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },

  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
    paddingVertical: Spacing.md,
  },
  viewAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },

  financeNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
  },
  financeNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: Spacing.xxl * 2, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  emptySub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  emptyBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  emptyBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.xl,
  },
  emptyBtnText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },
});
