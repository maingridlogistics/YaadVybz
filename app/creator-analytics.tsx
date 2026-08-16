/**
 * Creator Analytics Screen v2
 *
 * Pro:   Overview + Events + Businesses — All-Time metrics.
 * Elite: Same + date range filter for period-eligible metrics + CSV export.
 * Free:  Locked / upgrade CTA.
 *
 * METRIC LABELING RULES:
 *   ALL-TIME metrics: clearly labeled "All-Time" — these are lifetime counters
 *     from events/businesses tables and cannot be date-filtered.
 *   PERIOD metrics: labeled with the selected period (e.g., "Last 30 Days") —
 *     these come from timestamped source tables (ticket_orders.paid_at,
 *     user_rsvps.created_at, business_favorites.created_at, etc.)
 *
 * Security: All data from SECURITY DEFINER RPCs enforcing auth.uid().
 * No cross-user data exposure. No mock data. No fabricated zeros.
 */

import React, {
  useState, useCallback, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import {
  fetchAnalyticsOverview,
  fetchEventAnalytics,
  fetchBusinessAnalytics,
  fetchAnalyticsExport,
  formatRevenueSingle,
  safeCtr,
  periodLabel,
  buildCsvString,
  AnalyticsOverview,
  EventAnalyticsRow,
  BusinessAnalyticsRow,
  TopEventItem,
  TopBusinessItem,
  RevenueByCurrency,
} from '../services/analyticsService';

// ─── Tab type ─────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'events' | 'businesses';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview',   label: 'Overview',   icon: 'dashboard' },
  { id: 'events',     label: 'Events',     icon: 'event' },
  { id: 'businesses', label: 'Businesses', icon: 'storefront' },
];

// ─── Date range options (Elite only) ─────────────────────────────────────────
// Only values 7, 30, 90, null are accepted by the server.
const DATE_RANGES = [
  { label: '7 Days',   days: 7 as number | null },
  { label: '30 Days',  days: 30 as number | null },
  { label: '90 Days',  days: 90 as number | null },
  { label: 'All Time', days: null as number | null },
] as const;
type DateRange = typeof DATE_RANGES[number];

// ─── Mini bar chart ───────────────────────────────────────────────────────────
function MiniBar({ values, color, labels, height = 60 }: {
  values: number[];
  color: string;
  labels?: string[];
  height?: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <View style={{ width: '100%', height: Math.max(3, (v / max) * (height - 18)), backgroundColor: color, borderRadius: 3, opacity: 0.85 }} />
          {labels?.[i] ? (
            <Text style={{ fontSize: 9, color: Colors.textMuted }} numberOfLines={1}>{labels[i]}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon, iconColor, label, value, sub, allTime = false,
}: {
  icon: string; iconColor: string; label: string;
  value: string | number; sub?: string; allTime?: boolean;
}) {
  return (
    <View style={sc.card}>
      <View style={[sc.iconWrap, { backgroundColor: `${iconColor}18` }]}>
        <MaterialIcons name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={sc.labelRow}>
        <Text style={sc.label} numberOfLines={1}>{label}</Text>
        {allTime && <Text style={sc.allTimeTag}>ALL-TIME</Text>}
      </View>
      <Text style={sc.value} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={sc.sub} numberOfLines={2}>{sub}</Text> : null}
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: '46%',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: 4,
  },
  iconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  allTimeTag: { fontSize: 8, color: Colors.textMuted, backgroundColor: Colors.surfaceElevated, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 1, borderColor: Colors.surfaceBorder, fontWeight: Typography.bold as any },
  value: { fontSize: Typography.xl, fontWeight: Typography.black as any, color: Colors.textPrimary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
});

// ─── Period stat card (period-filtered metrics) ───────────────────────────────
function PeriodStatCard({
  icon, iconColor, label, value, sub, periodDays,
}: {
  icon: string; iconColor: string; label: string;
  value: string | number; sub?: string; periodDays: number | null;
}) {
  const pl = periodDays ? `LAST ${periodDays}D` : 'ALL TIME';
  return (
    <View style={[sc.card, { borderColor: `${iconColor}22` }]}>
      <View style={[sc.iconWrap, { backgroundColor: `${iconColor}18` }]}>
        <MaterialIcons name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={sc.labelRow}>
        <Text style={sc.label} numberOfLines={1}>{label}</Text>
        <Text style={[sc.allTimeTag, periodDays ? { color: iconColor, borderColor: `${iconColor}44`, backgroundColor: `${iconColor}11` } : {}]}>{pl}</Text>
      </View>
      <Text style={sc.value} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={sc.sub} numberOfLines={2}>{sub}</Text> : null}
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 2, marginBottom: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold }} />
        <Text style={{ fontSize: 11, fontWeight: Typography.bold as any, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          {title}
        </Text>
      </View>
      {sub ? <Text style={{ fontSize: Typography.xs, color: Colors.textMuted, paddingLeft: Spacing.base + 3, lineHeight: 16 }}>{sub}</Text> : null}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder }}>
        <MaterialIcons name={icon as any} size={32} color={Colors.textMuted} />
      </View>
      <Text style={{ fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textSecondary, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 }}>{sub}</Text>
    </View>
  );
}

// ─── Revenue display ──────────────────────────────────────────────────────────
function RevenueDisplay({ revenues }: { revenues: RevenueByCurrency[] }) {
  if (!revenues || revenues.length === 0) return null;
  return (
    <View style={{ gap: 2 }}>
      {revenues.map((r) => (
        <View key={r.currency} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MaterialIcons name="payments" size={11} color={Colors.greenLight} />
          <Text style={{ fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.semibold as any }}>
            {formatRevenueSingle(r.amount_minor, r.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Event analytics row ──────────────────────────────────────────────────────
function EventRow({ ev, periodDays }: { ev: EventAnalyticsRow; periodDays: number | null }) {
  const statusColor: Record<string, string> = {
    live: Colors.greenLight, pending: '#FFD54F', flagged: '#FF9800', rejected: '#FF5252',
  };
  const col = statusColor[ev.status] ?? Colors.textMuted;
  const hasRevenue = ev.revenue_by_currency?.length > 0;
  const isFiltered = periodDays !== null;

  return (
    <View style={er.wrap}>
      <View style={er.topRow}>
        <View style={[er.dot, { backgroundColor: col }]} />
        <Text style={er.title} numberOfLines={1}>{ev.title}</Text>
        {ev.boosted && (
          <View style={er.boostBadge}>
            <MaterialIcons name="rocket-launch" size={10} color={Colors.gold} />
            <Text style={er.boostText}>Boosted</Text>
          </View>
        )}
      </View>
      <Text style={er.date}>{ev.date} · {ev.parish}</Text>

      {/* ALL-TIME counters */}
      <View style={er.metricsSection}>
        <Text style={er.metricsSectionLabel}>All-Time</Text>
        <View style={er.metrics}>
          <View style={er.metric}>
            <MaterialIcons name="visibility" size={11} color={Colors.textMuted} />
            <Text style={er.metricVal}>{ev.view_count} views</Text>
          </View>
          <View style={er.metric}>
            <MaterialIcons name="check-circle-outline" size={11} color={Colors.textMuted} />
            <Text style={er.metricVal}>{ev.going_count_alltime} going</Text>
          </View>
          <View style={er.metric}>
            <MaterialIcons name="star-border" size={11} color={Colors.textMuted} />
            <Text style={er.metricVal}>{ev.interested_count_alltime} interested</Text>
          </View>
          {ev.tickets_sold_alltime > 0 && (
            <View style={er.metric}>
              <MaterialIcons name="confirmation-number" size={11} color={Colors.textMuted} />
              <Text style={er.metricVal}>{ev.tickets_sold_alltime} tickets</Text>
            </View>
          )}
          {ev.boost_impressions_alltime > 0 && (
            <View style={er.metric}>
              <MaterialIcons name="trending-up" size={11} color={Colors.gold} />
              <Text style={[er.metricVal, { color: Colors.gold }]}>{ev.boost_impressions_alltime} impr.</Text>
            </View>
          )}
        </View>
      </View>

      {/* PERIOD metrics (RSVPs + revenue — timestamped) */}
      {(ev.period_rsvp_going > 0 || ev.period_rsvp_interested > 0 || hasRevenue || ev.period_order_count > 0) && (
        <View style={er.metricsSection}>
          <Text style={er.metricsSectionLabel}>{isFiltered ? `Last ${periodDays} Days` : 'All Time'}</Text>
          <View style={er.metrics}>
            {ev.period_rsvp_going > 0 && (
              <View style={er.metric}>
                <MaterialIcons name="how-to-reg" size={11} color="#66BB6A" />
                <Text style={[er.metricVal, { color: '#66BB6A' }]}>{ev.period_rsvp_going} RSVPs (going)</Text>
              </View>
            )}
            {ev.period_rsvp_interested > 0 && (
              <View style={er.metric}>
                <MaterialIcons name="star" size={11} color="#FFD54F" />
                <Text style={[er.metricVal, { color: '#FFD54F' }]}>{ev.period_rsvp_interested} interested</Text>
              </View>
            )}
            {ev.period_order_count > 0 && (
              <View style={er.metric}>
                <MaterialIcons name="receipt-long" size={11} color="#00BCD4" />
                <Text style={[er.metricVal, { color: '#00BCD4' }]}>{ev.period_order_count} orders</Text>
              </View>
            )}
          </View>
          {hasRevenue && <RevenueDisplay revenues={ev.revenue_by_currency} />}
        </View>
      )}
    </View>
  );
}
const er = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.xs,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  title: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  boostBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.goldSurface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33` },
  boostText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold as any },
  date: { fontSize: Typography.xs, color: Colors.textMuted },
  metricsSection: { gap: 3, marginTop: 2 },
  metricsSectionLabel: { fontSize: 9, fontWeight: Typography.bold as any, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricVal: { fontSize: Typography.xs, color: Colors.textSecondary },
});

// ─── Business analytics row ───────────────────────────────────────────────────
function BusinessRow({ biz, periodDays }: { biz: BusinessAnalyticsRow; periodDays: number | null }) {
  const statusColor: Record<string, string> = {
    live: Colors.greenLight, pending: '#FFD54F', rejected: '#FF5252',
  };
  const col = statusColor[biz.status] ?? Colors.textMuted;
  const ctr = safeCtr(biz.boost_clicks_alltime, biz.boost_impressions_alltime); // All-Time CTR: same eligible population
  // Period CTR NOT shown — impressions are all-time aggregates, not timestamped
  const isFiltered = periodDays !== null;

  return (
    <View style={er.wrap}>
      <View style={er.topRow}>
        <View style={[er.dot, { backgroundColor: col }]} />
        <Text style={er.title} numberOfLines={1}>{biz.name}</Text>
        {biz.verified && <MaterialIcons name="verified" size={14} color="#42A5F5" />}
        {biz.boost_status === 'active' && (
          <View style={er.boostBadge}>
            <MaterialIcons name="rocket-launch" size={10} color={Colors.gold} />
            <Text style={er.boostText}>Boosted</Text>
          </View>
        )}
      </View>

      {/* ALL-TIME counters */}
      <View style={er.metricsSection}>
        <Text style={er.metricsSectionLabel}>All-Time</Text>
        <View style={er.metrics}>
          <View style={er.metric}>
            <MaterialIcons name="visibility" size={11} color={Colors.textMuted} />
            <Text style={er.metricVal}>{biz.view_count} views</Text>
          </View>
          {biz.review_count_alltime > 0 && (
            <View style={er.metric}>
              <MaterialIcons name="star" size={11} color="#FFD54F" />
              <Text style={er.metricVal}>
                {biz.avg_rating != null ? biz.avg_rating.toFixed(1) : '—'} ({biz.review_count_alltime} reviews)
              </Text>
            </View>
          )}
          {biz.boost_impressions_alltime > 0 && (
            <View style={er.metric}>
              <MaterialIcons name="trending-up" size={11} color={Colors.gold} />
              <Text style={[er.metricVal, { color: Colors.gold }]}>
                {biz.boost_impressions_alltime} impr.{biz.boost_clicks_alltime > 0 ? ` · ${biz.boost_clicks_alltime} clicks` : ''}{ctr !== '—' ? ` · ${ctr} CTR` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* PERIOD metrics */}
      {(biz.period_favorites > 0 || biz.period_review_count > 0 || biz.period_boost_clicks > 0) && (
        <View style={er.metricsSection}>
          <Text style={er.metricsSectionLabel}>{isFiltered ? `Last ${periodDays} Days` : 'All Time'}</Text>
          <View style={er.metrics}>
            {biz.period_favorites > 0 && (
              <View style={er.metric}>
                <MaterialIcons name="favorite" size={11} color="#E91E63" />
                <Text style={[er.metricVal, { color: '#E91E63' }]}>{biz.period_favorites} favorites</Text>
              </View>
            )}
            {biz.period_review_count > 0 && (
              <View style={er.metric}>
                <MaterialIcons name="rate-review" size={11} color="#FFD54F" />
                <Text style={er.metricVal}>{biz.period_review_count} reviews</Text>
              </View>
            )}
            {biz.period_boost_clicks > 0 && (
              <View style={er.metric}>
                <MaterialIcons name="touch-app" size={11} color={Colors.gold} />
                <Text style={[er.metricVal, { color: Colors.gold }]}>
                  {biz.period_boost_clicks} clicks
                  {/* Period CTR NOT shown: period clicks / all-time impressions is not valid CTR */}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CreatorAnalyticsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const tier = (user?.subscriptionTier ?? 'free') as string;
  const isPro   = tier === 'pro' || tier === 'elite';
  const isElite = tier === 'elite';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [dateRange, setDateRange] = useState<DateRange>(DATE_RANGES[3]); // All Time default

  // Data state
  const [overview, setOverview]     = useState<AnalyticsOverview | null>(null);
  const [events, setEvents]         = useState<EventAnalyticsRow[]>([]);
  const [businesses, setBusinesses] = useState<BusinessAnalyticsRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [exporting, setExporting]   = useState(false);

  // Load all analytics in parallel
  const loadAll = useCallback(async (days: number | null) => {
    if (!isPro) return;
    setError(null);
    const [ovResult, evResult, bizResult] = await Promise.all([
      fetchAnalyticsOverview(days),
      fetchEventAnalytics(days),
      fetchBusinessAnalytics(days),
    ]);
    if (!ovResult.ok) { setError(ovResult.error); return; }
    setOverview(ovResult);
    if (evResult.ok)  setEvents(evResult.events ?? []);
    if (bizResult.ok) setBusinesses(bizResult.businesses ?? []);
  }, [isPro]);

  useEffect(() => {
    if (!isPro) return;
    setLoading(true);
    loadAll(dateRange.days).finally(() => setLoading(false));
  }, [isPro, loadAll, dateRange]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll(dateRange.days);
    setRefreshing(false);
  }, [loadAll, dateRange]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!isElite) {
      Alert.alert('Elite Only', 'Analytics exports require an Elite subscription.');
      return;
    }
    setExporting(true);
    try {
      const result = await fetchAnalyticsExport();
      if (!result.ok) {
        Alert.alert(
          result.code === 'UPGRADE_REQUIRED' ? 'Elite Required' : 'Export Failed',
          result.error,
        );
        return;
      }
      const csv = buildCsvString(result.events, result.businesses);
      const filename = `vybzhub-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      const file = new File(Paths.document, filename);
      await file.write(csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export Analytics CSV' });
      } else {
        Alert.alert('Exported', `Analytics saved to: ${filename}`);
      }
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? 'Could not export analytics. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [isElite]);

  // ── Server-authoritative top content ─────────────────────────────────────────
  // Provided by the server RPC querying ALL creator content (not the paginated subset).
  // Correct even if the creator owns 100+ events/businesses — pagination does not affect ranking.
  const topEventsByViews: TopEventItem[] = overview?.top_events ?? [];
  const topBizByViews: TopBusinessItem[] = overview?.top_businesses ?? [];

  // ── Back navigation ────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/(tabs)/profile' as any);
  }, [navigation, router]);

  // ── Upgrade wall ───────────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={s.header}>
            <Pressable onPress={goBack} style={s.backBtn}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>Creator Analytics</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
        <ScrollView contentContainerStyle={s.upgradeContent}>
          <View style={s.upgradeIcon}>
            <MaterialIcons name="bar-chart" size={44} color={Colors.gold} />
          </View>
          <Text style={s.upgradeTitle}>Creator Analytics</Text>
          <Text style={s.upgradeSub}>
            Track your Event and Business performance with real-time analytics. Understand your audience, measure Boost ROI, and grow your reach across Jamaica.
          </Text>
          {[
            { icon: 'visibility', label: 'All-Time Event and Business views' },
            { icon: 'how-to-reg', label: 'RSVP and ticket sales tracking' },
            { icon: 'favorite', label: 'Business favorites and reviews' },
            { icon: 'rocket-launch', label: 'Boost impressions and click-through rates' },
            { icon: 'download', label: 'Elite: export full analytics to CSV' },
          ].map(({ icon, label }) => (
            <View key={label} style={s.upgradeFeatureRow}>
              <View style={s.upgradeFeatureIcon}>
                <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
              </View>
              <Text style={s.upgradeFeatureText}>{label}</Text>
            </View>
          ))}
          <Pressable
            onPress={() => router.push('/monetization/upgrade' as any)}
            style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.upgradeBtnInner}>
              <MaterialIcons name="rocket-launch" size={18} color={Colors.textOnGold} />
              <Text style={s.upgradeBtnText}>Upgrade to Pro</Text>
            </LinearGradient>
          </Pressable>
          {Platform.OS !== 'ios' && (
            <Text style={s.upgradePrice}>Starting at $4.99/month</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading && !overview) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={s.header}>
            <Pressable onPress={goBack} style={s.backBtn}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>Creator Analytics</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={s.loadingText}>Loading your analytics...</Text>
        </View>
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error && !overview) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={s.header}>
            <Pressable onPress={goBack} style={s.backBtn}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>Creator Analytics</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
        <View style={s.center}>
          <MaterialIcons name="error-outline" size={40} color={Colors.error} />
          <Text style={s.errorTitle}>Could not load analytics</Text>
          <Text style={s.errorSub}>{error}</Text>
          <Pressable
            onPress={() => { setLoading(true); loadAll(dateRange.days).finally(() => setLoading(false)); }}
            style={s.retryBtn}
          >
            <Text style={s.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pDays = overview?.period_days ?? null;
  const pl    = periodLabel(pDays);

  return (
    <View style={s.container}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={goBack} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Creator Analytics</Text>
            <View style={s.tierBadgeRow}>
              <View style={[s.tierBadge, { backgroundColor: isElite ? '#E91E6322' : Colors.goldSurface, borderColor: isElite ? '#E91E6344' : `${Colors.gold}44` }]}>
                <MaterialIcons name={isElite ? 'star' : 'verified'} size={10} color={isElite ? '#E91E63' : Colors.gold} />
                <Text style={[s.tierBadgeText, { color: isElite ? '#E91E63' : Colors.gold }]}>
                  {isElite ? 'Elite Analytics' : 'Pro Analytics'}
                </Text>
              </View>
            </View>
          </View>
          {isElite && (
            <Pressable
              onPress={handleExport}
              disabled={exporting}
              style={({ pressed }) => [s.exportBtn, pressed && { opacity: 0.8 }]}
            >
              {exporting
                ? <ActivityIndicator size="small" color={Colors.gold} />
                : <MaterialIcons name="download" size={18} color={Colors.gold} />}
            </Pressable>
          )}
        </View>

        {/* ── Elite date range ────────────────────────────────────────── */}
        {isElite && (
          <View>
            <View style={s.dateRangeBar}>
              {DATE_RANGES.map((dr) => (
                <Pressable
                  key={dr.label}
                  onPress={() => setDateRange(dr)}
                  style={({ pressed }) => [
                    s.dateRangeChip,
                    dateRange.label === dr.label && s.dateRangeChipActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[s.dateRangeChipText, dateRange.label === dr.label && s.dateRangeChipTextActive]}>
                    {dr.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {pDays && (
              <Text style={s.dateRangeNote}>
                Period metrics show activity in the last {pDays} days. All-Time metrics show lifetime totals.
              </Text>
            )}
          </View>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <View style={s.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[s.tab, activeTab === tab.id && s.tabActive]}
            >
              <MaterialIcons name={tab.icon as any} size={15} color={activeTab === tab.id ? Colors.gold : Colors.textMuted} />
              <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* ── OVERVIEW TAB ──────────────────────────────────────────── */}
        {activeTab === 'overview' && overview && (
          <>
            {/* ALL-TIME Event metrics */}
            <View style={s.section}>
              <SectionTitle title="Events" sub="All-Time lifetime counters" />
              <View style={s.statsGrid}>
                <StatCard icon="event" iconColor="#42A5F5" label="Total Events" value={overview.total_events} allTime />
                <StatCard icon="visibility" iconColor="#66BB6A" label="Event Views" value={overview.total_event_views.toLocaleString()} allTime />
                <StatCard icon="check-circle" iconColor={Colors.greenLight} label="Going" value={overview.total_going_alltime.toLocaleString()} allTime />
                <StatCard icon="star-border" iconColor="#FFD54F" label="Interested" value={overview.total_interested_alltime.toLocaleString()} allTime />
                {overview.total_tickets_sold_alltime > 0 && (
                  <StatCard icon="confirmation-number" iconColor="#00BCD4" label="Tickets Sold" value={overview.total_tickets_sold_alltime.toLocaleString()} allTime />
                )}
                {(overview.boost_event_impressions ?? 0) > 0 && (
                  <StatCard icon="rocket-launch" iconColor={Colors.gold} label="Event Boost Impr." value={overview.boost_event_impressions.toLocaleString()} allTime />
                )}
              </View>
            </View>

            {/* PERIOD Event metrics (ticket revenue — from paid_at timestamps) */}
            {overview.ticket_revenue_by_currency.length > 0 && (
              <View style={s.section}>
                <SectionTitle title="Ticket Revenue" sub={`Ticket proceeds · ${pl}`} />
                <View style={s.revenueCard}>
                  {overview.ticket_revenue_by_currency.map((r) => (
                    <View key={r.currency} style={s.revenueRow}>
                      <MaterialIcons name="payments" size={16} color={Colors.greenLight} />
                      <Text style={s.revenueAmount}>{formatRevenueSingle(r.amount_minor, r.currency)}</Text>
                      <Text style={s.revenueCurrency}>{r.currency}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* PERIOD RSVPs (from user_rsvps.created_at) */}
            {(overview.period_rsvp_going > 0 || overview.period_rsvp_interested > 0) && (
              <View style={s.section}>
                <SectionTitle title="RSVPs" sub={`From RSVP records · ${pl}`} />
                <View style={s.statsGrid}>
                  <PeriodStatCard icon="how-to-reg" iconColor={Colors.greenLight} label="Going" value={overview.period_rsvp_going.toLocaleString()} periodDays={pDays} />
                  <PeriodStatCard icon="star" iconColor="#FFD54F" label="Interested" value={overview.period_rsvp_interested.toLocaleString()} periodDays={pDays} />
                </View>
              </View>
            )}

            {/* ALL-TIME Business metrics */}
            <View style={s.section}>
              <SectionTitle title="Businesses" sub="All-Time lifetime counters" />
              <View style={s.statsGrid}>
                <StatCard icon="storefront" iconColor="#FF6B35" label="Total Businesses" value={overview.total_businesses} allTime />
                <StatCard icon="visibility" iconColor="#9C27B0" label="Business Views" value={overview.total_biz_views.toLocaleString()} allTime />
                <StatCard icon="rate-review" iconColor="#FFD54F" label="Total Reviews" value={overview.total_biz_reviews_alltime.toLocaleString()} allTime />
                {overview.weighted_avg_rating != null && (
                  <StatCard icon="star" iconColor="#FFD54F" label="Weighted Avg Rating" value={`${overview.weighted_avg_rating.toFixed(1)} ★`} allTime />
                )}
                {overview.biz_boost_impressions_alltime > 0 && (
                  <StatCard icon="trending-up" iconColor={Colors.gold} label="Biz Boost Impr." value={overview.biz_boost_impressions_alltime.toLocaleString()} allTime />
                )}
                {overview.biz_boost_clicks_alltime > 0 && (
                  <StatCard
                    icon="touch-app"
                    iconColor={Colors.gold}
                    label="Biz Boost Clicks"
                    value={overview.biz_boost_clicks_alltime.toLocaleString()}
                    sub={overview.biz_boost_impressions_alltime > 0 ? `All-Time CTR: ${safeCtr(overview.biz_boost_clicks_alltime, overview.biz_boost_impressions_alltime)}` : undefined}
                    allTime
                  />
                )}
              </View>
            </View>

            {/* PERIOD Business metrics */}
            {(overview.period_biz_favorites > 0 || overview.period_biz_reviews > 0 || overview.period_biz_boost_clicks > 0) && (
              <View style={s.section}>
                <SectionTitle title="Business Activity" sub={`From timestamped records · ${pl}`} />
                <View style={s.statsGrid}>
                  {overview.period_biz_favorites > 0 && (
                    <PeriodStatCard icon="favorite" iconColor="#E91E63" label="Favorites" value={overview.period_biz_favorites.toLocaleString()} periodDays={pDays} />
                  )}
                  {overview.period_biz_reviews > 0 && (
                    <PeriodStatCard icon="rate-review" iconColor="#FFD54F" label="New Reviews" value={overview.period_biz_reviews.toLocaleString()} periodDays={pDays} />
                  )}
                  {overview.period_biz_boost_clicks > 0 && (
                    <PeriodStatCard
                      icon="touch-app"
                      iconColor={Colors.gold}
                      label="Boost Clicks"
                      value={overview.period_biz_boost_clicks.toLocaleString()}
                      sub={/* Period CTR NOT shown: period clicks / all-time impressions is not valid */
                        overview.biz_boost_clicks_alltime > 0 && overview.biz_boost_impressions_alltime > 0
                          ? `All-Time CTR: ${safeCtr(overview.biz_boost_clicks_alltime, overview.biz_boost_impressions_alltime)} (period clicks shown; CTR uses all-time data)`
                          : undefined
                      }
                      periodDays={pDays}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Top Events — ranked list + chart */}
            {topEventsByViews.length > 0 && (
              <View style={s.section}>
                <SectionTitle title="Top Events by Views" sub="Ranked by all-time view count" />
                <View style={s.rankCard}>
                  {topEventsByViews.map((ev, i) => (
                    <View key={ev.id} style={[s.rankRow, i === topEventsByViews.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={s.rankNum}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rankName} numberOfLines={1}>{ev.title}</Text>
                        <Text style={s.rankSub}>{ev.date} · {ev.parish}</Text>
                      </View>
                      <View style={s.rankMetric}>
                        <MaterialIcons name="visibility" size={11} color={Colors.textMuted} />
                        <Text style={s.rankMetricVal}>{ev.view_count.toLocaleString()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={[s.chartCard, { marginTop: Spacing.sm }]}>
                  <MiniBar
                    values={topEventsByViews.map((e) => e.view_count)}
                    color={Colors.gold}
                    labels={topEventsByViews.map((e) => e.title.length > 8 ? e.title.substring(0, 7) + '…' : e.title)}
                    height={72}
                  />
                </View>
              </View>
            )}

            {/* Top Businesses — ranked list + chart */}
            {topBizByViews.length > 0 && (
              <View style={s.section}>
                <SectionTitle title="Top Businesses by Views" sub="Ranked by all-time view count" />
                <View style={s.rankCard}>
                  {topBizByViews.map((biz, i) => (
                    <View key={biz.id} style={[s.rankRow, i === topBizByViews.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={s.rankNum}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rankName} numberOfLines={1}>{biz.name}</Text>
                        {biz.avg_rating != null && (
                          <Text style={s.rankSub}>{biz.avg_rating.toFixed(1)} ★ · {biz.review_count_alltime} reviews</Text>
                        )}
                      </View>
                      <View style={s.rankMetric}>
                        <MaterialIcons name="visibility" size={11} color={Colors.textMuted} />
                        <Text style={s.rankMetricVal}>{biz.view_count.toLocaleString()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={[s.chartCard, { marginTop: Spacing.sm }]}>
                  <MiniBar
                    values={topBizByViews.map((b) => b.view_count)}
                    color="#FF6B35"
                    labels={topBizByViews.map((b) => b.name.length > 8 ? b.name.substring(0, 7) + '…' : b.name)}
                    height={72}
                  />
                </View>
              </View>
            )}

            {/* Empty state */}
            {overview.total_events === 0 && overview.total_businesses === 0 && (
              <EmptyState
                icon="bar-chart"
                title="No analytics yet"
                sub="Your Event and Business performance will appear here once people start interacting with your content."
              />
            )}

            {/* Elite export CTA (Pro users) */}
            {!isElite && (
              <Pressable
                onPress={() => router.push('/monetization/upgrade' as any)}
                style={({ pressed }) => [s.eliteCta, pressed && { opacity: 0.85 }]}
              >
                <MaterialIcons name="star" size={16} color="#E91E63" />
                <View style={{ flex: 1 }}>
                  <Text style={s.eliteCtaTitle}>Unlock Elite Analytics</Text>
                  <Text style={s.eliteCtaSub}>Date range filters, advanced metrics, and CSV export</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color="#E91E63" />
              </Pressable>
            )}
          </>
        )}

        {/* ── EVENTS TAB ────────────────────────────────────────────── */}
        {activeTab === 'events' && (
          events.length === 0 ? (
            <EmptyState
              icon="event"
              title="No events yet"
              sub="Your Event analytics will appear here after people start interacting with your Events."
            />
          ) : (
            <View style={s.section}>
              <SectionTitle
                title={`${events.length} Event${events.length !== 1 ? 's' : ''}`}
                sub={pDays ? `All-Time totals + Last ${pDays} Days period activity` : 'All-Time totals'}
              />
              <View style={{ gap: Spacing.sm }}>
                {events.map((ev) => <EventRow key={ev.id} ev={ev} periodDays={pDays} />)}
              </View>
            </View>
          )
        )}

        {/* ── BUSINESSES TAB ────────────────────────────────────────── */}
        {activeTab === 'businesses' && (
          businesses.length === 0 ? (
            <EmptyState
              icon="storefront"
              title="No businesses yet"
              sub="Your Business analytics will appear here after people start viewing and saving your Businesses."
            />
          ) : (
            <View style={s.section}>
              <SectionTitle
                title={`${businesses.length} Business${businesses.length !== 1 ? 'es' : ''}`}
                sub={pDays ? `All-Time totals + Last ${pDays} Days period activity` : 'All-Time totals'}
              />
              <View style={{ gap: Spacing.sm }}>
                {businesses.map((biz) => <BusinessRow key={biz.id} biz={biz} periodDays={pDays} />)}
              </View>
            </View>
          )
        )}

        {/* Inline loading (refresh) */}
        {loading && overview && (
          <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={Colors.gold} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  errorTitle: { fontSize: Typography.lg, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  errorSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { backgroundColor: Colors.gold, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  retryText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  tierBadgeRow: { flexDirection: 'row', marginTop: 2 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  tierBadgeText: { fontSize: 10, fontWeight: Typography.bold as any },
  exportBtn: {
    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },

  // Date range
  dateRangeBar: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  dateRangeChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  dateRangeChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  dateRangeChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  dateRangeChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
  dateRangeNote: {
    fontSize: 10, color: Colors.textMuted, paddingHorizontal: Spacing.base, paddingVertical: 5,
    backgroundColor: Colors.surfaceElevated, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    lineHeight: 15,
  },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, backgroundColor: Colors.background },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  tabTextActive: { color: Colors.gold, fontWeight: Typography.bold as any },

  body: { padding: Spacing.base, gap: Spacing.xl },
  section: { gap: Spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chartCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.surfaceBorder, padding: Spacing.base,
  },

  // Revenue
  revenueCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: `${Colors.greenLight}33`, padding: Spacing.base, gap: Spacing.sm,
  },
  revenueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  revenueAmount: { fontSize: Typography.xl, fontWeight: Typography.black as any, color: Colors.greenLight },
  revenueCurrency: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium as any },

  // Upgrade wall
  upgradeContent: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.lg, paddingTop: Spacing.xxl },
  upgradeIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${Colors.gold}44` },
  upgradeTitle: { fontSize: 26, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  upgradeSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  upgradeFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, alignSelf: 'stretch' },
  upgradeFeatureIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0 },
  upgradeFeatureText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  upgradeBtn: { borderRadius: Radius.lg, overflow: 'hidden', alignSelf: 'stretch', marginTop: Spacing.sm },
  upgradeBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  upgradeBtnText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },
  upgradePrice: { fontSize: Typography.xs, color: Colors.textMuted },

  // Rank lists
  rankCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  rankNum: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.gold, width: 18, textAlign: 'center' },
  rankName: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  rankSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  rankMetric: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  rankMetricVal: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textSecondary },

  // Elite upsell CTA
  eliteCta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: '#E91E6310', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#E91E6333', padding: Spacing.base,
  },
  eliteCtaTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: '#E91E63' },
  eliteCtaSub: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 2 },
});
