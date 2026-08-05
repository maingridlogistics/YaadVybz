// Boost Performance Screen — live analytics for a promoter's boosted event.
// Data comes directly from Supabase (events table + user_rsvps aggregate).
// No client-side activation: this screen is read-only.

import React, { useState, useEffect, useCallback } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatDate, formatCount } from '../../../constants/data';
import { canPurchaseDigitalFeatures } from '../../../constants/purchaseGate';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BoostStats {
  id: string;
  title: string;
  coverImage: string;
  parish: string;
  date: string;
  venue: string;
  ticketPrice: string;
  viewCount: number;
  goingCount: number;
  interestedCount: number;
  boostImpressions: number;
  boosted: boolean;
  boostType: string | null;
  boostStatus: string | null;
  boostStartedAt: string | null;
  boostExpiresAt: string | null;
  boostAmount: number;
}

const BOOST_TYPE_LABELS: Record<string, string> = {
  three_day:       '3-Day Boost',
  seven_day:       '7-Day Boost',
  until_event_end: 'Until Event Ends',
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, color, sub,
}: {
  icon: string; label: string; value: string; color: string; sub?: string;
}) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub ? <Text style={[statStyles.sub, { color }]}>{sub}</Text> : null}
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.sm,
    minWidth: 0,
  },
  iconBg: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 20, fontWeight: Typography.black, color: Colors.textPrimary },
  label: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  sub: { fontSize: 10, fontWeight: Typography.semibold, textAlign: 'center' },
});

// ─── Boost Timeline ───────────────────────────────────────────────────────────
function BoostTimeline({
  startedAt, expiresAt, boostType, eventDate,
}: {
  startedAt: string | null;
  expiresAt: string | null;
  boostType: string | null;
  eventDate: string;
}) {
  if (!startedAt) {
    return (
      <View style={tlStyles.empty}>
        <MaterialIcons name="schedule" size={20} color={Colors.textMuted} />
        <Text style={tlStyles.emptyText}>Boost not yet activated</Text>
      </View>
    );
  }

  const start = new Date(startedAt);
  const now   = new Date();

  let end: Date;
  let endLabel: string;
  if (boostType === 'until_event_end') {
    const [y, m, d] = eventDate.split('-').map(Number);
    end = new Date(y, m - 1, d + 1);
    endLabel = 'Event ends';
  } else if (expiresAt) {
    end = new Date(expiresAt);
    endLabel = 'Boost ends';
  } else {
    end = start;
    endLabel = 'Ended';
  }

  const total   = Math.max(end.getTime() - start.getTime(), 1);
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
  const progress = elapsed / total;
  const isExpired = now >= end;

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });

  const daysRemaining = () => {
    if (isExpired) return 'Boost expired';
    const diffMs   = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86_400_000);
    if (diffDays <= 0) return 'Expires today';
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} remaining`;
  };

  return (
    <View style={tlStyles.card}>
      {/* Status */}
      <View style={tlStyles.statusRow}>
        <Text style={tlStyles.cardTitle}>Boost Period</Text>
        <View style={[
          tlStyles.pill,
          { backgroundColor: isExpired ? 'rgba(255,107,107,0.15)' : `${Colors.greenLight}18` },
        ]}>
          <View style={[tlStyles.dot, { backgroundColor: isExpired ? '#FF6B6B' : Colors.greenLight }]} />
          <Text style={[tlStyles.pillText, { color: isExpired ? '#FF6B6B' : Colors.greenLight }]}>
            {daysRemaining()}
          </Text>
        </View>
      </View>

      {/* Progress track */}
      <View style={tlStyles.trackWrap}>
        <View style={tlStyles.track}>
          <LinearGradient
            colors={[Colors.gold, Colors.goldDim]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[tlStyles.fill, { width: `${Math.round(progress * 100)}%` }]}
          />
        </View>
        {/* Current-position dot */}
        <View style={[tlStyles.progressDot, { left: `${Math.min(progress * 100, 96)}%` as any }]} />
      </View>

      {/* Date labels */}
      <View style={tlStyles.dateRow}>
        <View style={tlStyles.dateSide}>
          <MaterialIcons name="rocket-launch" size={12} color={Colors.gold} />
          <Text style={tlStyles.dateVal}>{fmt(start)}</Text>
          <Text style={tlStyles.dateSub}>Boost started</Text>
        </View>
        <View style={[tlStyles.dateSide, { alignItems: 'flex-end' }]}>
          <MaterialIcons name={boostType === 'until_event_end' ? 'event' : 'timer-off'} size={12} color={Colors.textMuted} />
          <Text style={tlStyles.dateVal}>{fmt(end)}</Text>
          <Text style={tlStyles.dateSub}>{endLabel}</Text>
        </View>
      </View>
    </View>
  );
}
const tlStyles = StyleSheet.create({
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base,
  },
  emptyText: { fontSize: Typography.sm, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.md,
  },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  trackWrap: { position: 'relative', height: 14, justifyContent: 'center' },
  track: {
    height: 8, borderRadius: 4, backgroundColor: Colors.surfaceElevated, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  progressDot: {
    position: 'absolute',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.gold,
    borderWidth: 2.5, borderColor: Colors.background,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5,
    elevation: 4,
    marginLeft: -7,
  },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dateSide: { gap: 2 },
  dateVal: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textPrimary },
  dateSub: { fontSize: 10, color: Colors.textMuted },
});

// ─── Breakdown Bar ────────────────────────────────────────────────────────────
function BreakdownBar({
  label, value, total, color, icon,
}: {
  label: string; value: number; total: number; color: string; icon: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={bbStyles.row}>
      <View style={bbStyles.labelRow}>
        <MaterialIcons name={icon as any} size={12} color={color} />
        <Text style={bbStyles.label}>{label}</Text>
        <Text style={[bbStyles.pct, { color }]}>{pct}%</Text>
        <Text style={bbStyles.count}>{formatCount(value)}</Text>
      </View>
      <View style={bbStyles.track}>
        <View style={[bbStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}
const bbStyles = StyleSheet.create({
  row: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  pct: { fontSize: Typography.xs, fontWeight: Typography.bold },
  count: { fontSize: Typography.xs, color: Colors.textMuted, minWidth: 26, textAlign: 'right' },
  track: { height: 7, borderRadius: 4, backgroundColor: Colors.surfaceElevated, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BoostPerformanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [stats,      setStats]      = useState<BoostStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fetchStats = useCallback(async (showSpinner = true) => {
    if (!id) return;
    if (showSpinner) setLoading(true);
    setError(null);

    try {
      const { data, error: dbErr } = await supabase
        .from('events')
        .select([
          'id', 'title', 'cover_image', 'parish', 'date', 'venue', 'ticket_price',
          'view_count', 'going_count', 'interested_count', 'boost_impressions',
          'boosted', 'boost_type', 'boost_status',
          'boost_started_at', 'boost_expires_at', 'boost_amount',
        ].join(', '))
        .eq('id', id)
        .single();

      if (dbErr || !data) {
        setError('Could not load boost analytics. Please try again.');
        return;
      }

      setStats({
        id:              data.id,
        title:           data.title,
        coverImage:      data.cover_image ?? '',
        parish:          data.parish ?? '',
        date:            data.date ?? '',
        venue:           data.venue ?? '',
        ticketPrice:     data.ticket_price ?? 'Free',
        viewCount:       data.view_count       ?? 0,
        goingCount:      data.going_count      ?? 0,
        interestedCount: data.interested_count ?? 0,
        boostImpressions: data.boost_impressions ?? 0,
        boosted:         data.boosted           ?? false,
        boostType:       data.boost_type,
        boostStatus:     data.boost_status,
        boostStartedAt:  data.boost_started_at,
        boostExpiresAt:  data.boost_expires_at,
        boostAmount:     data.boost_amount      ?? 0,
      });
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleRefresh = () => { setRefreshing(true); fetchStats(false); };

  // ── Computed metrics ────────────────────────────────────────────────────────
  const totalRSVPs    = stats ? stats.goingCount + stats.interestedCount : 0;
  const hasImpressions = (stats?.boostImpressions ?? 0) > 0;
  const ctrRaw        = hasImpressions ? (totalRSVPs / stats!.boostImpressions) * 100 : 0;
  const ctrDisplay    = hasImpressions ? `${ctrRaw.toFixed(1)}%` : '—';
  const ctrQuality    = ctrRaw >= 5 ? 'Excellent' : ctrRaw >= 2 ? 'Good' : ctrRaw > 0 ? 'Building' : undefined;
  const ctrColor      = ctrRaw >= 5 ? Colors.greenLight : ctrRaw >= 2 ? Colors.gold : Colors.textMuted;

  const isActiveBoosted = stats?.boosted &&
    (stats.boostStatus ?? 'active') === 'active' &&
    (stats.boostType === 'until_event_end' || !stats.boostExpiresAt || new Date(stats.boostExpiresAt) > new Date());

  const spendLabel = stats && stats.boostAmount > 0
    ? `$${(stats.boostAmount / 100).toFixed(2)}`
    : 'Complimentary';

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <SafeAreaView edges={['top']} />
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.centerSub}>Loading analytics…</Text>
      </View>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error || !stats) {
    return (
      <View style={styles.center}>
        <SafeAreaView edges={['top']} />
        <View style={styles.errorIcon}>
          <MaterialIcons name="error-outline" size={36} color={Colors.textMuted} />
        </View>
        <Text style={styles.centerSub}>{error ?? 'Event not found.'}</Text>
        <Pressable onPress={() => fetchStats()} style={styles.retryBtn}>
          <MaterialIcons name="refresh" size={16} color={Colors.gold} />
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Boost Performance</Text>
            <Text style={styles.topBarSub} numberOfLines={1}>{stats.title}</Text>
          </View>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            {refreshing
              ? <ActivityIndicator size="small" color={Colors.gold} />
              : <MaterialIcons name="refresh" size={20} color={Colors.gold} />
            }
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Event hero card ── */}
        <View style={styles.heroCard}>
          <Image
            source={{ uri: stats.coverImage }}
            placeholder={require('../../../assets/images/icon.png')}
            style={styles.heroImage}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Boost status badge */}
          <View style={[styles.heroBadge, !isActiveBoosted && styles.heroBadgeInactive]}>
            <MaterialIcons
              name="rocket-launch"
              size={12}
              color={isActiveBoosted ? Colors.textOnGold : Colors.textMuted}
            />
            <Text style={[styles.heroBadgeText, !isActiveBoosted && { color: Colors.textMuted }]}>
              {isActiveBoosted
                ? (BOOST_TYPE_LABELS[stats.boostType ?? ''] ?? 'Boosted')
                : 'Boost Inactive'}
            </Text>
          </View>
          {/* Event info overlay */}
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle} numberOfLines={2}>{stats.title}</Text>
            <View style={styles.heroMeta}>
              <MaterialIcons name="place" size={12} color={Colors.gold} />
              <Text style={styles.heroMetaText}>{stats.parish}</Text>
              <View style={styles.heroDot} />
              <MaterialIcons name="event" size={12} color={Colors.textMuted} />
              <Text style={styles.heroMetaText}>{formatDate(stats.date)}</Text>
            </View>
          </View>
        </View>

        {/* ── Boost meta strip ── */}
        <View style={styles.metaStrip}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={styles.metaValue}>{BOOST_TYPE_LABELS[stats.boostType ?? ''] ?? '—'}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Spend</Text>
            <Text style={[styles.metaValue, { color: Colors.gold }]}>{spendLabel}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={[styles.metaValue, { color: isActiveBoosted ? Colors.greenLight : Colors.textMuted }]}>
              {isActiveBoosted ? 'Active' : (stats.boostStatus ?? '—')}
            </Text>
          </View>
        </View>

        {/* ── Section: Reach ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.goldBar} />
          <Text style={styles.sectionTitle}>Reach</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            icon="visibility"
            label="Page Views"
            value={formatCount(stats.viewCount)}
            color="#00BCD4"
            sub={stats.viewCount === 0 ? 'Not yet tracked' : undefined}
          />
          <StatCard
            icon="bolt"
            label="Impressions"
            value={formatCount(stats.boostImpressions)}
            color={Colors.gold}
            sub={stats.boostImpressions > 0 ? 'From boost' : 'Updating…'}
          />
          <StatCard
            icon="trending-up"
            label="CTR"
            value={ctrDisplay}
            color={ctrColor}
            sub={ctrQuality}
          />
        </View>

        {/* ── Section: Engagement ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.goldBar} />
          <Text style={styles.sectionTitle}>Engagement</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            icon="check-circle"
            label="Going"
            value={formatCount(stats.goingCount)}
            color={Colors.greenLight}
          />
          <StatCard
            icon="star"
            label="Interested"
            value={formatCount(stats.interestedCount)}
            color={Colors.gold}
          />
          <StatCard
            icon="people"
            label="Total RSVPs"
            value={formatCount(totalRSVPs)}
            color="#9C27B0"
          />
        </View>

        {/* RSVP breakdown bars */}
        {totalRSVPs > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>RSVP Breakdown</Text>
            <BreakdownBar
              label="Going"
              value={stats.goingCount}
              total={totalRSVPs}
              color={Colors.greenLight}
              icon="check-circle"
            />
            <BreakdownBar
              label="Interested"
              value={stats.interestedCount}
              total={totalRSVPs}
              color={Colors.gold}
              icon="star"
            />
          </View>
        )}

        {/* CTR context card (if we have impressions) */}
        {hasImpressions && (
          <View style={[styles.ctrCard, { borderColor: `${ctrColor}44` }]}>
            <LinearGradient
              colors={[`${ctrColor}12`, `${ctrColor}06`]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.ctrIconWrap, { backgroundColor: `${ctrColor}20` }]}>
              <MaterialIcons name="trending-up" size={22} color={ctrColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ctrValue, { color: ctrColor }]}>{ctrDisplay} CTR</Text>
              <Text style={styles.ctrDesc}>
                {totalRSVPs} RSVP{totalRSVPs !== 1 ? 's' : ''} from {formatCount(stats.boostImpressions)} impressions
                {ctrQuality ? ` · ${ctrQuality}` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* ── Timeline ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.goldBar} />
          <Text style={styles.sectionTitle}>Boost Timeline</Text>
        </View>
        <BoostTimeline
          startedAt={stats.boostStartedAt}
          expiresAt={stats.boostExpiresAt}
          boostType={stats.boostType}
          eventDate={stats.date}
        />

        {/* ── Tips ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.goldBar} />
          <Text style={styles.sectionTitle}>Performance Tips</Text>
        </View>
        <View style={styles.tipsCard}>
          {[
            { icon: 'image',       tip: 'Use a sharp, vibrant flyer — high-quality images increase clicks by 40%' },
            { icon: 'description', tip: 'A detailed event description builds trust and drives RSVPs' },
            ...(!stats.ticketPrice.includes('Free')
              ? [{ icon: 'local-activity', tip: 'Link your ticket page so boosted impressions convert to direct sales' }]
              : []),
            { icon: 'share', tip: 'Share your event link on social media to amplify your boost beyond the app' },
            { icon: 'schedule',    tip: 'Post and boost at least 7 days before your event for maximum reach' },
          ].map(({ icon, tip }, idx) => (
            <View key={idx} style={styles.tipRow}>
              <View style={styles.tipIcon}>
                <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
              </View>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        {/* ── CTAs ── */}
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => router.push(`/event/${id}` as any)}
            style={({ pressed }) => [styles.ctaSecondary, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="open-in-new" size={16} color={Colors.textSecondary} />
            <Text style={styles.ctaSecondaryText}>View Event</Text>
          </Pressable>
          {canPurchaseDigitalFeatures ? (
            <Pressable
              onPress={() => router.push(`/monetization/boost/${id}` as any)}
              style={({ pressed }) => [styles.ctaPrimary, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.ctaPrimaryInner}>
                <MaterialIcons name="rocket-launch" size={16} color={Colors.textOnGold} />
                <Text style={styles.ctaPrimaryText}>
                  {isActiveBoosted ? 'Upgrade Boost' : 'Boost Again'}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>

        <View style={{ height: insets.bottom + Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  center: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl,
  },
  errorIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  centerSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  retryText: { fontSize: Typography.base, color: Colors.gold, fontWeight: Typography.semibold },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  content: { padding: Spacing.base, gap: Spacing.md },

  // Hero
  heroCard: {
    height: 168, borderRadius: Radius.xl, overflow: 'hidden',
    position: 'relative', borderWidth: 1.5, borderColor: `${Colors.gold}33`,
  },
  heroImage: { width: '100%', height: '100%' },
  heroBadge: {
    position: 'absolute', top: Spacing.md, right: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  heroBadgeInactive: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroBadgeText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.textOnGold },
  heroOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.base, gap: Spacing.xs,
  },
  heroTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: '#fff', lineHeight: 22 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  heroDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)' },

  // Meta strip
  metaStrip: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  metaItem: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: Spacing.md },
  metaDivider: { width: 1, backgroundColor: Colors.surfaceBorder },
  metaLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },

  // Sections
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  // Stats grid
  statsRow: { flexDirection: 'row', gap: Spacing.sm },

  // RSVP breakdown
  breakdownCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.md,
  },
  breakdownTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },

  // CTR context
  ctrCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.base, overflow: 'hidden',
    position: 'relative',
  },
  ctrIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ctrValue: { fontSize: Typography.lg, fontWeight: Typography.black },
  ctrDesc: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },

  // Tips
  tipsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.md,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tipIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0,
  },
  tipText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  ctaSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.base, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  ctaSecondaryText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  ctaPrimary: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  ctaPrimaryInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  ctaPrimaryText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
});
