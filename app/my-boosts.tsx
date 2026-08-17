// ─── Unified My Boosts ────────────────────────────────────────────────────────
// Single management surface for all Event and Business Boosts.
// Shows: active, completed/expired boosts.
// Boost Credit vs Paid Purchase distinction where available.
// Does NOT include Search Priority or Elite Homepage Placement.
// One active Boost per target is enforced server-side.
//
// Route: /my-boosts

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseClient } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

interface BoostRecord {
  id: string;
  target_type: 'event' | 'business';
  target_id: string;
  target_name: string;
  boost_type: string;       // three_day | seven_day | until_event_end
  boost_status: string;     // active | expired | completed
  starts_at: string | null;
  ends_at: string | null;
  payment_provider: string | null;
  is_credit: boolean;       // derived: was this from included boost credits?
  impressions: number;
  created_at: string;
}

const BOOST_TYPE_LABELS: Record<string, string> = {
  three_day: '3-Day Boost',
  seven_day: '7-Day Boost',
  until_event_end: 'Until Event Ends',
};

const BOOST_TYPE_ICONS: Record<string, string> = {
  three_day: 'rocket-launch',
  seven_day: 'rocket-launch',
  until_event_end: 'flag',
};

function formatBoostDate(iso: string | null): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isBoostActive(boost: BoostRecord): boolean {
  if (boost.boost_status !== 'active') return false;
  if (boost.ends_at && new Date(boost.ends_at) <= new Date()) return false;
  return true;
}

// ─── Boost Card ───────────────────────────────────────────────────────────────
function BoostCard({ boost, onPress }: { boost: BoostRecord; onPress: () => void }) {
  const active = isBoostActive(boost);
  const accentColor = boost.target_type === 'event' ? Colors.gold : '#4CAF50';
  const label = BOOST_TYPE_LABELS[boost.boost_type] ?? boost.boost_type;
  const icon = BOOST_TYPE_ICONS[boost.boost_type] ?? 'rocket-launch';
  const targetIcon = boost.target_type === 'event' ? 'event' : 'storefront';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bc.card, active && { borderColor: `${accentColor}44` }, pressed && { opacity: 0.85 }]}
    >
      {active && <LinearGradient colors={[`${accentColor}08`, 'transparent']} style={StyleSheet.absoluteFillObject} />}

      <View style={bc.header}>
        <View style={[bc.iconWrap, { backgroundColor: `${accentColor}18` }]}>
          <MaterialIcons name={icon as any} size={18} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={bc.nameLine}>
            <Text style={bc.label}>{label}</Text>
            {boost.is_credit && (
              <View style={bc.creditBadge}>
                <MaterialIcons name="stars" size={9} color={Colors.gold} />
                <Text style={bc.creditBadgeText}>Credit</Text>
              </View>
            )}
          </View>
          <View style={bc.targetRow}>
            <MaterialIcons name={targetIcon as any} size={11} color={Colors.textMuted} />
            <Text style={bc.targetText} numberOfLines={1}>{boost.target_name}</Text>
          </View>
        </View>
        <View style={[bc.statusBadge, active ? bc.statusActive : bc.statusExpired]}>
          <View style={[bc.statusDot, { backgroundColor: active ? Colors.greenLight : Colors.textMuted }]} />
          <Text style={[bc.statusText, { color: active ? Colors.greenLight : Colors.textMuted }]}>
            {active ? 'Active' : 'Expired'}
          </Text>
        </View>
      </View>

      <View style={bc.details}>
        {boost.starts_at ? (
          <View style={bc.detailRow}>
            <MaterialIcons name="play-arrow" size={12} color={Colors.textMuted} />
            <Text style={bc.detailText}>Started {formatBoostDate(boost.starts_at)}</Text>
          </View>
        ) : null}
        {boost.ends_at ? (
          <View style={bc.detailRow}>
            <MaterialIcons name={active ? 'timer' : 'stop'} size={12} color={Colors.textMuted} />
            <Text style={bc.detailText}>
              {active ? `Ends ${formatBoostDate(boost.ends_at)}` : `Ended ${formatBoostDate(boost.ends_at)}`}
            </Text>
          </View>
        ) : boost.boost_type === 'until_event_end' ? (
          <View style={bc.detailRow}>
            <MaterialIcons name="flag" size={12} color={Colors.textMuted} />
            <Text style={bc.detailText}>Runs until event ends</Text>
          </View>
        ) : null}
        {boost.impressions > 0 ? (
          <View style={bc.detailRow}>
            <MaterialIcons name="visibility" size={12} color={accentColor} />
            <Text style={[bc.detailText, { color: accentColor }]}>{boost.impressions.toLocaleString()} impressions</Text>
          </View>
        ) : null}
      </View>

      {active && boost.target_type === 'event' && (
        <View style={bc.actionRow}>
          <MaterialIcons name="bar-chart" size={13} color={accentColor} />
          <Text style={[bc.actionText, { color: accentColor }]}>View performance</Text>
          <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
        </View>
      )}
    </Pressable>
  );
}

const bc = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden', marginBottom: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  label: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  creditBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.goldSurface, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  creditBadgeText: { fontSize: 9, color: Colors.gold, fontWeight: Typography.bold },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  targetText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, flexShrink: 0 },
  statusActive: { backgroundColor: `${Colors.greenLight}18`, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  statusExpired: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  details: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: 4, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  detailText: { fontSize: Typography.xs, color: Colors.textMuted },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  actionText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MyBoostsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeBoosts, setActiveBoosts] = useState<BoostRecord[]>([]);
  const [expiredBoosts, setExpiredBoosts] = useState<BoostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  const loadBoosts = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();

    try {
      // ── 1. Paid event boosts via boost_purchases ──────────────────────────
      const { data: eventBoosts } = await supabase
        .from('boost_purchases')
        .select(`
          id, event_id, boost_type, status, created_at,
          apple_transaction_id, payment_provider,
          events!inner(id, title, boosted, boost_expires_at, boost_impressions, boost_started_at, boost_status)
        `)
        .eq('promoter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100) as any;

      // ── 2. Credit-based event boosts (no purchase row — written directly to events) ──
      // These are boosts activated via included plan credits (use-boost-credit edge function).
      // They do NOT appear in boost_purchases; detect by events.boosted + boost_status.
      const { data: creditEventBoosts } = await supabase
        .from('events')
        .select('id, title, boosted, boost_type, boost_status, boost_expires_at, boost_impressions, boost_started_at, boost_amount, created_at')
        .eq('promoter_id', user.id)
        .not('boost_status', 'is', null)
        .order('boost_started_at', { ascending: false })
        .limit(100) as any;

      // ── 3. Business promotions ─────────────────────────────────────────────
      const { data: bizBoosts } = await supabase
        .from('business_promotions')
        .select(`
          id, business_id, placement, duration_days, status, starts_at, ends_at, created_at,
          payment_provider, payment_status,
          businesses!inner(id, name)
        `)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100) as any;

      const allBoosts: BoostRecord[] = [];

      // Track event IDs already added from paid purchases to avoid duplicates
      const paidBoostEventIds = new Set<string>();

      // Map paid event boosts
      if (eventBoosts) {
        for (const b of eventBoosts) {
          const ev = b.events;
          const boostType = ev?.boost_type ?? b.boost_type ?? 'three_day';
          const endsAt = ev?.boost_expires_at ?? null;
          const active = ev?.boosted && ev?.boost_status === 'active' &&
            (!endsAt || new Date(endsAt) > new Date());
          paidBoostEventIds.add(b.event_id);
          allBoosts.push({
            id: b.id,
            target_type: 'event',
            target_id: b.event_id,
            target_name: ev?.title ?? 'Unknown Event',
            boost_type: boostType,
            boost_status: active ? 'active' : 'expired',
            starts_at: ev?.boost_started_at ?? b.created_at,
            ends_at: boostType === 'until_event_end' ? null : endsAt,
            payment_provider: b.payment_provider,
            is_credit: false,
            impressions: ev?.boost_impressions ?? 0,
            created_at: b.created_at,
          });
        }
      }

      // Map credit-based event boosts (deduplicate against paid purchases)
      if (creditEventBoosts) {
        for (const ev of creditEventBoosts) {
          if (paidBoostEventIds.has(ev.id)) continue; // already covered by paid row
          if (!ev.boost_status) continue;
          const boostType = ev.boost_type ?? 'three_day';
          const endsAt = ev.boost_expires_at ?? null;
          const active = ev.boosted && ev.boost_status === 'active' &&
            (!endsAt || new Date(endsAt) > new Date());
          allBoosts.push({
            id: `credit_${ev.id}`,
            target_type: 'event',
            target_id: ev.id,
            target_name: ev.title ?? 'Unknown Event',
            boost_type: boostType,
            boost_status: active ? 'active' : 'expired',
            starts_at: ev.boost_started_at ?? ev.created_at,
            ends_at: boostType === 'until_event_end' ? null : endsAt,
            payment_provider: 'credit',
            is_credit: true,
            impressions: ev.boost_impressions ?? 0,
            created_at: ev.boost_started_at ?? ev.created_at,
          });
        }
      }

      // Map business boosts (all placements — don't filter by placement name
      // since values depend on the admin configuration and may include 'featured', etc.)
      if (bizBoosts) {
        for (const b of bizBoosts) {
          // Skip payment-pending records (user hasn't paid yet)
          if (b.payment_status === 'unpaid' && b.status === 'pending_payment') continue;
          const now = new Date();
          const endsAt = b.ends_at;
          const active = b.status === 'active' && (!endsAt || new Date(endsAt) > now);
          // duration_days → boost_type approximation
          const boostType = !b.duration_days ? 'seven_day'
            : b.duration_days <= 3 ? 'three_day'
            : b.duration_days <= 7 ? 'seven_day'
            : 'until_event_end';
          allBoosts.push({
            id: b.id,
            target_type: 'business',
            target_id: b.business_id,
            target_name: b.businesses?.name ?? 'Unknown Business',
            boost_type: boostType,
            boost_status: active ? 'active' : 'expired',
            starts_at: b.starts_at,
            ends_at: endsAt,
            payment_provider: b.payment_provider,
            is_credit: !b.payment_provider || b.payment_provider === 'credit',
            impressions: 0,
            created_at: b.created_at,
          });
        }
      }

      // Sort: active first, then by created_at desc
      allBoosts.sort((a, b) => {
        if (isBoostActive(a) && !isBoostActive(b)) return -1;
        if (!isBoostActive(a) && isBoostActive(b)) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setActiveBoosts(allBoosts.filter(isBoostActive));
      setExpiredBoosts(allBoosts.filter((b) => !isBoostActive(b)));
    } catch {
      // Fail silently — empty state handles it
    }
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    loadBoosts().finally(() => setLoading(false));
  }, [loadBoosts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBoosts();
    setRefreshing(false);
  }, [loadBoosts]);

  const handleBoostPress = useCallback((boost: BoostRecord) => {
    if (boost.target_type === 'event' && isBoostActive(boost)) {
      router.push(`/monetization/boost-performance/${boost.target_id}` as any);
    } else if (boost.target_type === 'event') {
      router.push(`/event/${boost.target_id}` as any);
    } else {
      router.push(`/business/${boost.target_id}` as any);
    }
  }, [router]);

  const displayedBoosts = tab === 'active' ? activeBoosts : expiredBoosts;
  const remainingBoosts = user?.remainingBoosts ?? 0;
  const totalAllowance = user?.monthlyBoostAllowance ?? 0;

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>My Boosts</Text>
            <Text style={s.headerSub}>Event and Business Boosts</Text>
          </View>
          <Pressable
            onPress={() => router.push('/my-events' as any)}
            style={({ pressed }) => [s.newBoostBtn, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="add" size={16} color={Colors.textOnGold} />
            <Text style={s.newBoostBtnText}>Boost</Text>
          </Pressable>
        </View>

        {/* Boost credits summary (Pro/Elite only) */}
        {totalAllowance > 0 && (
          <View style={s.creditsBar}>
            <MaterialIcons name="stars" size={14} color={Colors.gold} />
            <Text style={s.creditsText}>
              {remainingBoosts} of {totalAllowance} included boost credits remaining this cycle
            </Text>
            <View style={s.creditsTrack}>
              <View style={[s.creditsUsed, { width: `${Math.min(100, ((totalAllowance - remainingBoosts) / totalAllowance) * 100)}%` }]} />
            </View>
          </View>
        )}

        {/* Tab strip */}
        <View style={s.tabStrip}>
          <Pressable
            onPress={() => setTab('active')}
            style={[s.tabBtn, tab === 'active' && s.tabBtnActive]}
          >
            <MaterialIcons name="rocket-launch" size={13} color={tab === 'active' ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.tabBtnText, tab === 'active' && s.tabBtnTextActive]}>
              Active ({activeBoosts.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('history')}
            style={[s.tabBtn, tab === 'history' && s.tabBtnActive]}
          >
            <MaterialIcons name="history" size={13} color={tab === 'history' ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.tabBtnText, tab === 'history' && s.tabBtnTextActive]}>
              History ({expiredBoosts.length})
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} />}
      >
        {loading ? (
          <View style={s.loadingState}>
            <ActivityIndicator size="large" color={Colors.gold} />
            <Text style={s.loadingText}>Loading boosts…</Text>
          </View>
        ) : displayedBoosts.length > 0 ? (
          <>
            <View style={s.contextNote}>
              <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
              <Text style={s.contextNoteText}>
                {tab === 'active'
                  ? 'Active boosts increase visibility in search and discovery results.'
                  : 'Completed boost history — archived for reference.'}
              </Text>
            </View>
            {displayedBoosts.map((boost) => (
              <BoostCard key={boost.id} boost={boost} onPress={() => handleBoostPress(boost)} />
            ))}
          </>
        ) : (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <MaterialIcons name={tab === 'active' ? 'rocket-launch' : 'history'} size={36} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>
              {tab === 'active' ? 'No active boosts' : 'No boost history'}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'active'
                ? 'Boost an event or business to increase its visibility in search results and discovery feeds.'
                : 'Your completed and expired boosts will appear here.'}
            </Text>
            {tab === 'active' && (
              <Pressable
                onPress={() => router.push('/my-events' as any)}
                style={({ pressed }) => [s.boostCta, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.boostCtaInner}>
                  <MaterialIcons name="rocket-launch" size={16} color={Colors.textOnGold} />
                  <Text style={s.boostCtaText}>Boost an Event</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        )}

        {/* Note: Search Priority and Elite Homepage Placement are separate features */}
        <View style={s.separateNote}>
          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
          <Text style={s.separateNoteText}>
            Search Priority (Pro/Elite) and Elite Homepage Placement are separate plan benefits — not shown here.
          </Text>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  newBoostBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.gold, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full },
  newBoostBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  creditsBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, backgroundColor: Colors.goldSurface, borderBottomWidth: 1, borderBottomColor: `${Colors.gold}22` },
  creditsText: { flex: 1, fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.medium },
  creditsTrack: { width: 60, height: 4, borderRadius: 2, backgroundColor: `${Colors.gold}33`, overflow: 'hidden' },
  creditsUsed: { height: '100%', backgroundColor: Colors.gold, borderRadius: 2 },

  tabStrip: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  content: { padding: Spacing.base },
  contextNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginBottom: Spacing.md },
  contextNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  loadingState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  boostCta: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  boostCtaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  boostCtaText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  separateNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginTop: Spacing.base, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  separateNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
});
