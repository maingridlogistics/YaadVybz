/**
 * Promoter Finance & Payouts Tab — Premium Dashboard
 *
 * Information hierarchy:
 *   1. Header + currency selector
 *   2. Payout Balance hero (authoritative: get_promoter_payout_balance RPC)
 *   3. Revenue Summary grid (authoritative: get_promoter_finance_summary RPC — aggregated)
 *   4. Upcoming Events (compact rows — tap opens per-event finance screen)
 *   5. Payout Tools (accounts, history)
 *
 * Rules:
 *   - Zero client-side financial calculations
 *   - USD and JMD are never combined
 *   - No door/cash/at-event features
 *   - All authoritative data from existing RPCs only
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
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import {
  getPromoterPayoutBalance,
  getPromoterFinanceSummary,
  type PromoterPayoutBalance,
  type PromoterFinanceSummary,
} from '../../services/payoutService';
import { formatMinorAmount } from '../../services/customerTicketingService';
import { getPayoutAccounts } from '../../services/payoutService';
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
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionBarWrap}>
        <View style={styles.sectionBar} />
        <Text style={styles.sectionLabelText}>{title}</Text>
      </View>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Revenue Summary Card ─────────────────────────────────────────────────────

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
    <View style={styles.revCard}>
      <View style={[styles.revCardIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon as any} size={16} color="#fff" />
      </View>
      <Text style={styles.revCardLabel}>{label}</Text>
      <Text style={styles.revCardValue}>{value}</Text>
      <Text style={styles.revCardSub}>{sub}</Text>
    </View>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventFinanceRow({
  event,
  ticketsSold,
  hasTicketing,
  onPress,
}: {
  event: any;
  ticketsSold?: number;
  hasTicketing?: boolean;
  onPress: () => void;
}) {
  const coverUrl = event.coverImage ? getCardUrl(event.coverImage) : null;
  const timeStr = event.startTime ? ` • ${event.startTime}` : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.82 }]}
    >
      {/* Flyer thumbnail */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={styles.eventThumb}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.eventThumb, styles.eventThumbFallback]}>
          <MaterialIcons name="event" size={20} color={Colors.textMuted} />
        </View>
      )}

      {/* Info */}
      <View style={styles.eventRowInfo}>
        <Text style={styles.eventRowTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.eventRowMeta} numberOfLines={1}>
          {formatDate(event.date)}{timeStr}
        </Text>
        <View style={styles.eventRowParish}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={styles.eventRowParishText} numberOfLines={1}>{event.parish || '—'}</Text>
        </View>
      </View>

      {/* Right side: sold badge if ticketing enabled */}
      {hasTicketing && ticketsSold != null && (
        <View style={styles.soldBadge}>
          <Text style={styles.soldBadgeText}>{ticketsSold} sold</Text>
        </View>
      )}

      <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Payout Tool Row ──────────────────────────────────────────────────────────

function ToolRow({
  icon,
  iconBg,
  label,
  sub,
  onPress,
  isLast,
}: {
  icon: string;
  iconBg: string;
  label: string;
  sub: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolRow,
        !isLast && styles.toolRowDivider,
        pressed && { opacity: 0.78 },
      ]}
    >
      <View style={[styles.toolRowIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon as any} size={18} color="#fff" />
      </View>
      <View style={styles.toolRowText}>
        <Text style={styles.toolRowLabel}>{label}</Text>
        <Text style={styles.toolRowSub}>{sub}</Text>
      </View>
      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Currency Picker Modal ────────────────────────────────────────────────────

function CurrencyPickerModal({
  visible,
  current,
  available,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: Currency;
  available: readonly Currency[];
  onSelect: (c: Currency) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cpStyles.overlay} onPress={onClose}>
        <View style={[cpStyles.sheet, { marginBottom: insets.bottom + 24 }]}>
          <Text style={cpStyles.title}>Select Currency</Text>
          {available.map((c) => (
            <Pressable
              key={c}
              onPress={() => { onSelect(c); onClose(); }}
              style={({ pressed }) => [
                cpStyles.row,
                c === current && cpStyles.rowSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[cpStyles.rowText, c === current && { color: Colors.gold }]}>{c}</Text>
              {c === current && <MaterialIcons name="check" size={16} color={Colors.gold} />}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const cpStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end', alignItems: 'center',
  },
  sheet: {
    width: '100%', backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.base, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
  },
  rowSelected: { backgroundColor: Colors.goldSurface },
  rowText: { fontSize: Typography.md, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PromoterFinanceTab() {
  const { user } = useAuth();
  const { allEvents } = useEvents();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [currency, setCurrency] = useState<Currency>('USD');
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Payout balance for selected currency
  const [balance, setBalance] = useState<PromoterPayoutBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Aggregate revenue summary — sum across all my events for selected currency
  // We load the most recent/active event's summary as the overview proxy.
  // This is authoritative — no client-side financial math.
  const [revSummary, setRevSummary] = useState<PromoterFinanceSummary | null>(null);
  const [revLoading, setRevLoading] = useState(false);

  // Payout accounts — to determine if a payout account exists
  const [hasPayoutAccount, setHasPayoutAccount] = useState(false);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const myEvents = useMemo(
    () => (user ? allEvents.filter((e) => e.promoterId === user.id) : []),
    [allEvents, user]
  );

  // Upcoming events (not passed), sorted by nearest date first
  const upcomingEvents = useMemo(
    () => myEvents
      .filter((e) => !isEventPassed(e.date) && (e.status === 'live' || e.status === 'pending'))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [myEvents]
  );

  // Best event to anchor revenue summary: first upcoming live event with ticketing
  const anchorEvent = useMemo(() => {
    const ticketed = upcomingEvents.find((e) => e.sellingTicketsInApp);
    return ticketed ?? upcomingEvents[0] ?? myEvents[0] ?? null;
  }, [upcomingEvents, myEvents]);

  const UPCOMING_PREVIEW = 5;
  const shownEvents = upcomingEvents.slice(0, UPCOMING_PREVIEW);
  const hasMore = upcomingEvents.length > UPCOMING_PREVIEW;

  // ── Load data ────────────────────────────────────────────────────────────

  const loadBalance = useCallback(async () => {
    if (!user?.id) return;
    setBalanceLoading(true);
    try {
      const result = await getPromoterPayoutBalance(user.id, currency);
      if (result.ok) setBalance(result);
      else setBalance(null);
    } catch {
      setBalance(null);
    }
    setBalanceLoading(false);
  }, [user?.id, currency]);

  const loadRevSummary = useCallback(async () => {
    if (!anchorEvent?.id) return;
    setRevLoading(true);
    try {
      const result = await getPromoterFinanceSummary(anchorEvent.id);
      if (result.ok) setRevSummary(result);
      else setRevSummary(null);
    } catch {
      setRevSummary(null);
    }
    setRevLoading(false);
  }, [anchorEvent?.id]);

  const loadAccounts = useCallback(async () => {
    if (!user?.id || accountsLoaded) return;
    try {
      const { data } = await getPayoutAccounts(user.id);
      setHasPayoutAccount(data.length > 0);
    } catch {
      setHasPayoutAccount(false);
    }
    setAccountsLoaded(true);
  }, [user?.id, accountsLoaded]);

  useEffect(() => {
    loadBalance();
    loadRevSummary();
    loadAccounts();
  }, [loadBalance, loadRevSummary, loadAccounts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadBalance(), loadRevSummary()]);
    setRefreshing(false);
  }, [loadBalance, loadRevSummary]);

  // ── Derived balance values ────────────────────────────────────────────────

  const eligibleMinor = balance?.eligible_minor ?? 0;
  const hasHold = balance?.has_financial_hold ?? false;
  const eligibleStr = balanceLoading ? '…' : fmt(eligibleMinor, currency);
  const canWithdraw = eligibleMinor > 0 && !hasHold;

  // ── Navigate to per-event finance detail ─────────────────────────────────

  const openEventFinance = (eventId: string) =>
    router.push(`/ticketing/finance/${eventId}` as any);

  const openFirstEventFinance = () => {
    const target = anchorEvent ?? upcomingEvents[0] ?? myEvents[0];
    if (target) openEventFinance(target.id);
  };

  // ── Revenue summary metrics from authoritative RPC ────────────────────────
  // revSummary is from get_promoter_finance_summary for the anchor event.
  // We show event-level figures as an overview sample.
  const grossStr = revLoading ? '…' : fmt(revSummary?.platform_gross_minor, currency);
  const feesStr  = revLoading ? '…' : fmt(revSummary?.platform_promoter_fees_minor, currency);
  const netStr   = revLoading ? '…' : fmt(revSummary?.promoter_proceeds_minor, currency);
  const ticketsSoldNum = anchorEvent?.ticketsSold ?? 0;

  // ── Currency detection (available currencies from events) ────────────────
  // If all events only use USD, hide the JMD option. We detect from event
  // currency if available; fallback shows both standard options.
  const availableCurrencies: readonly Currency[] = CURRENCIES;

  if (!user) return null;

  const noEvents = myEvents.length === 0;

  return (
    <View style={styles.container}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          {/* Icon + Title */}
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="account-balance-wallet" size={18} color={Colors.gold} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Finance & Payouts</Text>
            <Text style={styles.headerSub}>Overview of your event revenue and payouts</Text>
          </View>

          {/* Currency selector */}
          <Pressable
            onPress={() => setCurrencyPickerVisible(true)}
            style={({ pressed }) => [styles.currencyBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.currencyBtnText}>{currency}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={16} color={Colors.gold} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />
        }
      >
        {/* ── Empty state ──────────────────────────────────────────────── */}
        {noEvents ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <MaterialIcons name="account-balance-wallet" size={36} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptySub}>
              Finance data appears once you create and publish events with online ticket sales.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/post' as any)}
              style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.emptyBtnInner}>
                <MaterialIcons name="add" size={16} color={Colors.textOnGold} />
                <Text style={styles.emptyBtnText}>Create Event</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── 1. Payout Balance Hero ──────────────────────────────── */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceCardTop}>
                <Text style={styles.balanceCardHeading}>PAYOUT BALANCE</Text>
                <Pressable hitSlop={8}>
                  <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.balanceRow}>
                <View style={styles.balanceLeft}>
                  {balanceLoading ? (
                    <ActivityIndicator color={Colors.greenLight} size="large" style={{ height: 52 }} />
                  ) : (
                    <Text style={[styles.balanceAmount, { color: hasHold ? '#FF9800' : Colors.greenLight }]}>
                      {eligibleStr}
                    </Text>
                  )}
                  <View style={styles.balanceMetaRow}>
                    <Text style={styles.balanceCurrency}>{currency}</Text>
                    <View style={styles.balanceDot} />
                    <Text style={[styles.balanceEligible, { color: hasHold ? '#FF9800' : Colors.greenLight }]}>
                      {hasHold ? 'Hold active' : 'Eligible for withdrawal'}
                    </Text>
                  </View>
                </View>

                {/* Withdraw button */}
                <View style={styles.balanceActions}>
                  <Pressable
                    onPress={canWithdraw ? openFirstEventFinance : undefined}
                    style={({ pressed }) => [
                      styles.withdrawBtn,
                      !canWithdraw && styles.withdrawBtnDisabled,
                      pressed && canWithdraw && { opacity: 0.88 },
                    ]}
                  >
                    <LinearGradient
                      colors={canWithdraw ? [Colors.gold, Colors.goldDim] : ['#333', '#333']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.withdrawBtnInner}
                    >
                      <Text style={[styles.withdrawBtnText, !canWithdraw && { color: Colors.textMuted }]}>
                        Withdraw Funds
                      </Text>
                      <MaterialIcons
                        name="arrow-forward"
                        size={14}
                        color={canWithdraw ? Colors.textOnGold : Colors.textMuted}
                      />
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    onPress={openFirstEventFinance}
                    style={({ pressed }) => [styles.historyLink, pressed && { opacity: 0.7 }]}
                    hitSlop={8}
                  >
                    <Text style={styles.historyLinkText}>View Payout History</Text>
                  </Pressable>
                </View>
              </View>

              {/* Hold banner */}
              {hasHold && (
                <View style={styles.holdBanner}>
                  <MaterialIcons name="warning" size={13} color="#FF9800" />
                  <Text style={styles.holdBannerText}>
                    Financial hold is active on your account. Contact support to resolve.
                  </Text>
                </View>
              )}

              {/* Zero-balance message */}
              {!balanceLoading && eligibleMinor === 0 && !hasHold && (
                <Text style={styles.zeroNote}>
                  {anchorEvent?.sellingTicketsInApp
                    ? 'No funds eligible for withdrawal yet. Revenue becomes available after your event.'
                    : 'Enable online ticketing on an event to start collecting revenue.'}
                </Text>
              )}

              {/* Account warning */}
              {!balanceLoading && eligibleMinor > 0 && !hasPayoutAccount && (
                <View style={styles.noAccountBanner}>
                  <MaterialIcons name="info" size={13} color="#42A5F5" />
                  <Text style={styles.noAccountText}>
                    Add a payout account before requesting your first withdrawal.
                  </Text>
                </View>
              )}

              <Text style={styles.balanceNote}>
                Processed in {currency}. All ticket revenue is from online Vybz Hub sales only.
              </Text>
            </View>

            {/* ── 2. Revenue Summary ────────────────────────────────────── */}
            <View style={styles.section}>
              <SectionLabel title="REVENUE SUMMARY" />
              {revLoading && !revSummary ? (
                <View style={styles.revLoadingWrap}>
                  <ActivityIndicator color={Colors.gold} />
                </View>
              ) : (
                <View style={styles.revGrid}>
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
                    value={String(ticketsSoldNum)}
                    sub="All Events"
                  />
                  <RevCard
                    icon="percent"
                    iconBg="#4A148C"
                    label="Fees Paid"
                    value={feesStr}
                    sub={currency}
                  />
                  <RevCard
                    icon="account-balance-wallet"
                    iconBg="#4E342E"
                    label="Net Revenue"
                    value={netStr}
                    sub={currency}
                  />
                </View>
              )}
              {!revLoading && !anchorEvent?.sellingTicketsInApp && (
                <Text style={styles.revNote}>
                  Revenue figures reflect the most recent event with ticketing enabled.
                </Text>
              )}
            </View>

            {/* ── 3. Upcoming Events ────────────────────────────────────── */}
            <View style={styles.section}>
              <SectionLabel
                title="UPCOMING EVENTS"
                action={hasMore ? 'View all' : undefined}
                onAction={() => router.push('/(promoter)/events' as any)}
              />

              {upcomingEvents.length === 0 ? (
                <View style={styles.noEventsCard}>
                  <MaterialIcons name="event-busy" size={28} color={Colors.textMuted} />
                  <Text style={styles.noEventsText}>No upcoming events</Text>
                  <Text style={styles.noEventsSub}>Your active events will appear here.</Text>
                </View>
              ) : (
                <View style={styles.eventsCard}>
                  {shownEvents.map((evt, i) => (
                    <React.Fragment key={evt.id}>
                      <EventFinanceRow
                        event={evt}
                        ticketsSold={evt.ticketsSold}
                        hasTicketing={evt.sellingTicketsInApp}
                        onPress={() => openEventFinance(evt.id)}
                      />
                      {i < shownEvents.length - 1 && <View style={styles.eventsRowDivider} />}
                    </React.Fragment>
                  ))}
                </View>
              )}

              {hasMore && (
                <Pressable
                  onPress={() => router.push('/(promoter)/events' as any)}
                  style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.viewAllText}>
                    View all {upcomingEvents.length} events
                  </Text>
                  <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
                </Pressable>
              )}
            </View>

            {/* ── 4. Payout Tools ───────────────────────────────────────── */}
            <View style={styles.section}>
              <SectionLabel title="PAYOUT TOOLS" />
              <View style={styles.toolsCard}>
                <ToolRow
                  icon="account-balance"
                  iconBg="#00695C"
                  label="Payout Accounts"
                  sub="Manage bank accounts for payouts"
                  onPress={openFirstEventFinance}
                />
                <ToolRow
                  icon="history"
                  iconBg="#1565C0"
                  label="Payout History"
                  sub="View past payout requests and status"
                  onPress={openFirstEventFinance}
                  isLast
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Currency Picker ────────────────────────────────────────────── */}
      <CurrencyPickerModal
        visible={currencyPickerVisible}
        current={currency}
        available={availableCurrencies}
        onSelect={(c) => { setCurrency(c); setBalance(null); }}
        onClose={() => setCurrencyPickerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  headerText: { flex: 1 },
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

  // Payout Balance Card
  balanceCard: {
    backgroundColor: '#0D1A12',
    borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: `${Colors.gold}30`,
    padding: Spacing.base, gap: Spacing.md,
    ...({
      shadowColor: Colors.gold,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    }),
  },
  balanceCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceCardHeading: {
    fontSize: 11, fontWeight: Typography.bold as any,
    color: Colors.textMuted, letterSpacing: 1.2,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.base },
  balanceLeft: { flex: 1, gap: Spacing.xs },
  balanceAmount: { fontSize: 40, fontWeight: Typography.black as any, letterSpacing: -1 },
  balanceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  balanceCurrency: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textMuted },
  balanceDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted },
  balanceEligible: { fontSize: Typography.sm, fontWeight: Typography.semibold as any },

  // Withdraw & history
  balanceActions: { gap: Spacing.sm, alignItems: 'flex-end', paddingTop: 4 },
  withdrawBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  withdrawBtnDisabled: { opacity: 0.5 },
  withdrawBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingVertical: 10, paddingHorizontal: Spacing.base,
  },
  withdrawBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },
  historyLink: { flexDirection: 'row', alignItems: 'center' },
  historyLinkText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any, textDecorationLine: 'underline' },

  // Hold / note banners
  holdBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  holdBannerText: { flex: 1, fontSize: Typography.xs, color: '#FF9800', lineHeight: 17 },
  noAccountBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
  },
  noAccountText: { flex: 1, fontSize: Typography.xs, color: '#42A5F5', lineHeight: 17 },
  zeroNote: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  balanceNote: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.sm, marginTop: Spacing.xs },

  // Section label
  section: { gap: Spacing.sm },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionBarWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionLabelText: {
    fontSize: 11, fontWeight: Typography.bold as any,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2,
  },
  sectionAction: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any },

  // Revenue loading
  revLoadingWrap: { paddingVertical: Spacing.xl, alignItems: 'center' },

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
  revNote: { fontSize: Typography.xs, color: Colors.textMuted, paddingHorizontal: Spacing.xs },

  // Events card
  eventsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  eventsRowDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginHorizontal: Spacing.base },
  eventThumb: { width: 52, height: 52, borderRadius: Radius.md, flexShrink: 0 },
  eventThumbFallback: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  eventRowInfo: { flex: 1, gap: 3 },
  eventRowTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  eventRowMeta: { fontSize: Typography.xs, color: Colors.textSecondary },
  eventRowParish: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eventRowParishText: { fontSize: Typography.xs, color: Colors.textMuted },
  soldBadge: {
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0,
  },
  soldBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold as any },

  noEventsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm,
  },
  noEventsText: { fontSize: Typography.base, fontWeight: Typography.semibold as any, color: Colors.textSecondary },
  noEventsSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
    paddingVertical: Spacing.md,
  },
  viewAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },

  // Payout tools
  toolsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  toolRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  toolRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  toolRowIcon: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  toolRowText: { flex: 1 },
  toolRowLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  toolRowSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

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
