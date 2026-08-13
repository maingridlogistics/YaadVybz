/**
 * Promoter Finance Tab
 * Routes to authoritative finance data per event.
 * Does NOT calculate money client-side.
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { getPromoterPayoutBalance } from '../../services/payoutService';
import { formatMinorAmount } from '../../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, isEventPassed } from '../../constants/data';

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconBg}>
        <MaterialIcons name={icon as any} size={13} color={Colors.gold} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  color,
  onPress,
  value,
}: {
  icon: string;
  label: string;
  sub?: string;
  color: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.actionIconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionLabel}>{label}</Text>
        {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[styles.valueText, { color }]}>{value}</Text> : null}
      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
    </Pressable>
  );
}

function EventFinanceRow({ event, onPress }: { event: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.eventRowLeft}>
        <View style={[styles.eventStatusDot, {
          backgroundColor: event.status === 'live' ? Colors.greenLight
            : event.status === 'pending' ? '#FF9800'
            : Colors.textMuted,
        }]} />
        <View style={styles.eventRowText}>
          <Text style={styles.eventRowTitle} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.eventRowDate}>{formatDate(event.date)} · {event.parish}</Text>
        </View>
      </View>
      {event.sellingTicketsInApp && (
        <View style={styles.ticketBadge}>
          <MaterialIcons name="confirmation-number" size={10} color={Colors.gold} />
          <Text style={styles.ticketBadgeText}>{event.ticketsSold ?? 0} sold</Text>
        </View>
      )}
      <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function PromoterFinanceTab() {
  const { user } = useAuth();
  const { allEvents } = useEvents();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [payoutBalance, setPayoutBalance] = useState<{
    eligible_minor?: number;
    has_financial_hold?: boolean;
    ok?: boolean;
  } | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const myEvents = useMemo(
    () => (user ? allEvents.filter((e) => e.promoterId === user.id) : []),
    [allEvents, user]
  );

  const upcomingEvents = useMemo(
    () => myEvents.filter((e) => !isEventPassed(e.date)),
    [myEvents]
  );

  const pastEvents = useMemo(
    () => myEvents.filter((e) => isEventPassed(e.date)).slice(0, 10),
    [myEvents]
  );

  const loadPayout = useCallback(async () => {
    if (!user?.id) return;
    setPayoutLoading(true);
    try {
      const result = await getPromoterPayoutBalance(user.id, 'USD');
      if (result.ok) setPayoutBalance(result);
    } catch {}
    setPayoutLoading(false);
  }, [user?.id]);

  useEffect(() => { loadPayout(); }, [loadPayout]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPayout();
    setRefreshing(false);
  }, [loadPayout]);

  const eligibleMinor = payoutBalance?.eligible_minor ?? 0;
  const hasHold = payoutBalance?.has_financial_hold ?? false;
  const eligibleStr = payoutLoading ? '…' : (eligibleMinor > 0 ? formatMinorAmount(eligibleMinor, 'USD') : '$0.00');

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="account-balance-wallet" size={18} color={Colors.gold} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Finance & Payouts</Text>
            <Text style={styles.headerSub}>{myEvents.length} total events</Text>
          </View>
          {payoutLoading && <ActivityIndicator size="small" color={Colors.gold} style={{ marginLeft: 'auto' }} />}
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Payout Summary Card */}
        <View style={styles.payoutCard}>
          <View style={styles.payoutCardHeader}>
            <View style={styles.payoutIconWrap}>
              <MaterialIcons name="account-balance-wallet" size={20} color={Colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payoutCardTitle}>USD Payout Balance</Text>
              <Text style={styles.payoutCardSub}>Eligible for withdrawal</Text>
            </View>
          </View>
          <Text style={[styles.payoutAmount, { color: hasHold ? '#FF9800' : Colors.greenLight }]}>
            {eligibleStr}
          </Text>
          {hasHold && (
            <View style={styles.holdBanner}>
              <MaterialIcons name="warning" size={13} color="#FF9800" />
              <Text style={styles.holdBannerText}>Financial hold active — contact support</Text>
            </View>
          )}
          <Text style={styles.payoutNote}>
            Processed in USD. All ticket revenue is from online Vybz Hub sales only.
          </Text>
        </View>

        {/* Finance Per Event — Upcoming */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader icon="event" title="Upcoming Events" />
            {upcomingEvents.map((evt) => (
              <EventFinanceRow
                key={evt.id}
                event={evt}
                onPress={() => router.push(`/ticketing/finance/${evt.id}` as any)}
              />
            ))}
          </View>
        )}

        {/* Finance Per Event — Past */}
        {pastEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader icon="history" title="Past Events" />
            {pastEvents.map((evt) => (
              <EventFinanceRow
                key={evt.id}
                event={evt}
                onPress={() => router.push(`/ticketing/finance/${evt.id}` as any)}
              />
            ))}
          </View>
        )}

        {/* Payout Tools */}
        <View style={styles.section}>
          <SectionHeader icon="payments" title="Payout Tools" />
          <ActionRow
            icon="account-balance"
            label="Payout Accounts"
            sub="Manage bank accounts for payouts"
            color="#26C6DA"
            onPress={() => {
              const target = upcomingEvents[0] ?? pastEvents[0] ?? myEvents[0];
              if (target) router.push(`/ticketing/finance/${target.id}` as any);
            }}
          />
          <ActionRow
            icon="receipt-long"
            label="Payout History"
            sub="View past payout requests"
            color={Colors.greenLight}
            onPress={() => {
              const target = upcomingEvents[0] ?? pastEvents[0] ?? myEvents[0];
              if (target) router.push(`/ticketing/finance/${target.id}` as any);
            }}
          />
        </View>

        {/* Risk & Holds */}
        <View style={styles.section}>
          <SectionHeader icon="shield" title="Risk & Compliance" />
          <ActionRow
            icon="cancel"
            label="Cancellation Requests"
            sub="Submit or track event cancellation"
            color="#FF5722"
            onPress={() => {
              const target = upcomingEvents[0] ?? pastEvents[0] ?? myEvents[0];
              if (target) router.push(`/ticketing/cancel/${target.id}` as any);
            }}
          />
          <ActionRow
            icon="lock"
            label="Financial Holds"
            sub="View active holds on your account"
            color={hasHold ? '#FF9800' : Colors.textMuted}
            onPress={() => {
              const target = upcomingEvents[0] ?? pastEvents[0] ?? myEvents[0];
              if (target) router.push(`/ticketing/finance/${target.id}` as any);
            }}
            value={hasHold ? 'Active' : undefined}
          />
        </View>

        {myEvents.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="account-balance-wallet" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptySub}>Finance data appears once you create and publish events.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  body: { padding: Spacing.base, gap: Spacing.lg },

  payoutCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: `${Colors.gold}33`,
    padding: Spacing.base, gap: Spacing.sm,
  },
  payoutCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  payoutIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  payoutCardTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  payoutCardSub: { fontSize: Typography.xs, color: Colors.textMuted },
  payoutAmount: { fontSize: 32, fontWeight: Typography.black as any, marginLeft: Spacing.xs },
  holdBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  holdBannerText: { fontSize: Typography.xs, color: '#FF9800', fontWeight: Typography.medium as any },
  payoutNote: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIconBg: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  actionIconBg: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionText: { flex: 1 },
  actionLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  actionSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  valueText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, marginRight: Spacing.xs },

  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  eventRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eventStatusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  eventRowText: { flex: 1 },
  eventRowTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  eventRowDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  ticketBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  ticketBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold as any },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
