
/**
 * Promoter Dashboard — Group Index
 * Premium overview: identity header, stat cards, quick actions, upcoming events.
 * This file IS the index of app/(promoter)/ so routing to /(promoter) resolves here.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { usePromoterMode } from '../../hooks/usePromoterMode';
import { getPromoterPayoutBalance } from '../../services/payoutService';
import { formatMinorAmount } from '../../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, isEventPassed } from '../../constants/data';
import { supabase } from '../../lib/supabase';

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [statStyles.card, onPress && pressed && { opacity: 0.85 }]}
      disabled={!onPress}
    >
      <View style={[statStyles.iconWrap, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub ? <Text style={statStyles.sub}>{sub}</Text> : null}
    </Pressable>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 5,
    minWidth: 88,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  value: { fontSize: Typography.lg, fontWeight: Typography.black as any },
  label: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 15 },
  sub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});

// ─── Quick Action Button ──────────────────────────────────────────────────────
function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [qaStyles.btn, pressed && { opacity: 0.8 }]}
    >
      <View style={[qaStyles.iconWrap, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={qaStyles.label} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const qaStyles = StyleSheet.create({
  btn: {
    width: '22%',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    fontSize: 10, fontWeight: Typography.semibold as any,
    color: Colors.textSecondary, textAlign: 'center', lineHeight: 13,
  },
});

// ─── Upcoming Event Card ──────────────────────────────────────────────────────
function UpcomingEventCard({ event, onPress }: { event: any; onPress: () => void }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    live:     { color: Colors.greenLight, label: 'Live' },
    pending:  { color: '#FF9800',         label: 'Pending' },
    flagged:  { color: '#FF5722',         label: 'Flagged' },
    rejected: { color: Colors.error,      label: 'Rejected' },
  };
  const sc = statusConfig[event.status] ?? statusConfig.live;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [evtCard.card, pressed && { opacity: 0.88 }]}
    >
      <View style={evtCard.imgWrap}>
        <Image source={{ uri: event.coverImage }} style={evtCard.img} contentFit="cover" transition={200} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFillObject} />
        <View style={[evtCard.statusBadge, { backgroundColor: `${sc.color}CC` }]}>
          <Text style={evtCard.statusText}>{sc.label}</Text>
        </View>
      </View>
      <View style={evtCard.body}>
        <Text style={evtCard.title} numberOfLines={2}>{event.title}</Text>
        <View style={evtCard.metaRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={evtCard.meta}>{formatDate(event.date)}</Text>
        </View>
        <View style={evtCard.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={evtCard.meta} numberOfLines={1}>{event.parish}</Text>
        </View>
        {event.sellingTicketsInApp && (
          <View style={evtCard.ticketRow}>
            <MaterialIcons name="confirmation-number" size={10} color={Colors.gold} />
            <Text style={evtCard.ticketText}>{event.ticketsSold ?? 0} sold</Text>
          </View>
        )}
      </View>
      <View style={evtCard.actions}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [evtCard.actionBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <MaterialIcons name="open-in-new" size={14} color={Colors.gold} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const evtCard = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.sm,
  },
  imgWrap: { width: 72, height: 72, flexShrink: 0, position: 'relative' },
  img: { width: '100%', height: '100%' },
  statusBadge: {
    position: 'absolute', top: 5, left: 5,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full,
  },
  statusText: { fontSize: 9, fontWeight: Typography.bold as any, color: '#fff' },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10, color: Colors.textMuted, flex: 1 },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ticketText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold as any },
  actions: { paddingRight: Spacing.md },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
});

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function PromoterDashboardTab() {
  const { user, isLoading: authLoading, verifiedPromoter, remainingBoosts, subscriptionStatus } = useAuth();
  const { allEvents } = useEvents();
  const { switchToAttendee } = usePromoterMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [payoutBalance, setPayoutBalance] = useState<{ eligible_minor?: number; has_financial_hold?: boolean; currency?: string } | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isPromoter = user?.roles.includes('promoter') ?? false;
  const subscriptionTier = user?.subscriptionTier ?? 'free';

  const myEvents = useMemo(
    () => (user ? allEvents.filter((e) => e.promoterId === user.id) : []),
    [allEvents, user]
  );

  const upcomingEvents = useMemo(
    () => myEvents.filter((e) => !isEventPassed(e.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [myEvents]
  );

  const liveEvents = useMemo(
    () => upcomingEvents.filter((e) => e.status === 'live'),
    [upcomingEvents]
  );

  const pendingEvents = useMemo(
    () => upcomingEvents.filter((e) => e.status === 'pending'),
    [upcomingEvents]
  );

  const totalTicketsSold = useMemo(
    () => myEvents.reduce((sum, e) => sum + (e.ticketsSold ?? 0), 0),
    [myEvents]
  );

  const loadFollowers = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('promoter_id', user.id);
    setFollowerCount(count ?? 0);
  }, [user?.id]);

  // Fetch payout balance. Try to determine currency from ticket settings for this
  // promoter's most recent live event. Fall back to USD if not determinable.
  const loadPayout = useCallback(async () => {
    if (!user?.id) return;
    setPayoutLoading(true);
    try {
      // Look up the currency from the promoter's most recently live event ticket settings
      let currency = 'USD';
      const { data: evtCurr } = await supabase
        .from('event_ticket_settings')
        .select('currency, event_id, events!inner(promoter_id, status)')
        .eq('events.promoter_id', user.id)
        .eq('events.status', 'live')
        .eq('enabled', true)
        .order('created_at', { ascending: false })
        .limit(1);
      if (evtCurr && evtCurr.length > 0 && evtCurr[0].currency) {
        currency = evtCurr[0].currency;
      }
      const result = await getPromoterPayoutBalance(user.id, currency);
      if (result.ok) {
        setPayoutBalance({ eligible_minor: result.eligible_minor, has_financial_hold: result.has_financial_hold, currency });
      }
    } catch {}
    setPayoutLoading(false);
  }, [user?.id]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadFollowers(), loadPayout()]);
  }, [loadFollowers, loadPayout]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleSwitchToAttendee = () => {
    switchToAttendee();
    router.replace('/(tabs)' as any);
  };

  // Show spinner while auth is resolving — prevents flash of redirect
  if (authLoading || !user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  // User loaded but not a promoter — layout guard will redirect; show spinner
  if (!isPromoter) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  const eligibleMinor = payoutBalance?.eligible_minor ?? 0;
  const hasHold = payoutBalance?.has_financial_hold ?? false;
  const payoutCurrency = payoutBalance?.currency ?? 'USD';
  const eligibleStr = eligibleMinor > 0 ? formatMinorAmount(eligibleMinor, payoutCurrency) : '$0.00';

  const tierConfig = {
    free:  { color: '#607D8B', label: 'Free',  icon: 'person' },
    pro:   { color: Colors.gold, label: 'Pro', icon: 'campaign' },
    elite: { color: '#E91E63', label: 'Elite', icon: 'star' },
  } as const;
  const tc = tierConfig[subscriptionTier as keyof typeof tierConfig] ?? tierConfig.free;

  return (
    <View style={styles.container}>
      {/* ── Premium Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#030B06' }}>
        <LinearGradient
          colors={['#030B06', '#061208', '#08180B', '#0A1E0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGrad}
        >
          {/* ── ROW 1: Dashboard title + Attendee View ── */}
          <View style={styles.headerTopRow}>
            <View style={styles.brandRow}>
              <View style={styles.crownWrap}>
                <MaterialIcons name="workspace-premium" size={16} color={Colors.gold} />
              </View>
              <View style={styles.brandDivider} />
              <View>
                <Text style={styles.brandTextTop}>PROMOTER</Text>
                <Text style={styles.brandTextBottom}>DASHBOARD</Text>
              </View>
            </View>
            <Pressable
              onPress={handleSwitchToAttendee}
              style={({ pressed }) => [styles.switchBtn, pressed && { opacity: 0.8 }]}
              hitSlop={8}
            >
              <MaterialIcons name="people" size={14} color={Colors.textSecondary} />
              <Text style={styles.switchBtnText}>Attendee View</Text>
              <MaterialIcons name="keyboard-arrow-down" size={14} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* ── ROW 2: Profile row ── */}
          <View style={styles.profileRow}>
            {/* Avatar */}
            <Pressable
              onPress={() => router.push(`/promoter/${user.id}` as any)}
              style={styles.avatarWrap}
            >
              {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.avatar, styles.avatarLetterBg]}>
                  <Text style={styles.avatarLetter}>{(user.name[0] ?? 'P').toUpperCase()}</Text>
                </View>
              )}
              {/* Tier badge on avatar */}
              <View style={[styles.planBadge, { backgroundColor: `${tc.color}EE` }]}>
                <MaterialIcons name={tc.icon as any} size={9} color={tc.color === Colors.gold ? '#0A0A0A' : '#fff'} />
              </View>
            </Pressable>

            {/* Name + badges */}
            <View style={styles.identityInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>{user.name}</Text>
                {verifiedPromoter && (
                  <MaterialIcons name="verified" size={15} color={Colors.gold} />
                )}
              </View>
              <View style={styles.subBadgeRow}>
                {subscriptionTier !== 'free' && (
                  <View style={[styles.tierBadge, { backgroundColor: `${tc.color}18`, borderColor: `${tc.color}66` }]}>
                    <MaterialIcons name={tc.icon as any} size={10} color={tc.color} />
                    <Text style={[styles.tierText, { color: tc.color }]}>{tc.label}</Text>
                  </View>
                )}
                {(subscriptionStatus === 'active' || subscriptionStatus === 'trialing') && (
                  <View style={styles.activeBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Active</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Edit Profile */}
            <Pressable
              onPress={() => router.push('/(tabs)/profile' as any)}
              style={({ pressed }) => [styles.editProfileBtn, pressed && { opacity: 0.8 }]}
              hitSlop={4}
            >
              <MaterialIcons name="edit" size={12} color={Colors.gold} />
              <Text style={styles.editProfileText}>Edit Profile</Text>
            </Pressable>
          </View>

          {/* ── ROW 3: Stats card ── */}
          <View style={styles.statsCard}>
            {/* Followers */}
            <View style={styles.statCol}>
              <MaterialIcons name="people" size={18} color={Colors.gold} />
              <Text style={styles.statCardVal}>
                {followerCount !== null ? String(followerCount) : '—'}
              </Text>
              <Text style={styles.statCardLabel}>FOLLOWERS</Text>
            </View>
            <View style={styles.statCardDivider} />
            {/* Live Events */}
            <View style={styles.statCol}>
              <MaterialIcons name="fiber-manual-record" size={16} color={Colors.gold} />
              <Text style={styles.statCardVal}>{liveEvents.length}</Text>
              <Text style={styles.statCardLabel}>LIVE EVENTS</Text>
            </View>
            <View style={styles.statCardDivider} />
            {/* Tickets Sold */}
            <View style={styles.statCol}>
              <MaterialIcons name="confirmation-number" size={16} color={Colors.gold} />
              <Text style={styles.statCardVal}>{totalTicketsSold}</Text>
              <Text style={styles.statCardLabel}>TICKETS SOLD</Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* ── Body ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Pending banner */}
        {pendingEvents.length > 0 && (
          <Pressable
            onPress={() => router.push('/(promoter)/events' as any)}
            style={({ pressed }) => [styles.pendingBanner, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="pending-actions" size={16} color="#FF9800" />
            <Text style={styles.pendingBannerText}>
              {pendingEvents.length} event{pendingEvents.length !== 1 ? 's' : ''} pending admin approval
            </Text>
            <MaterialIcons name="arrow-forward-ios" size={13} color="#FF9800" />
          </Pressable>
        )}

        {/* ── Overview Stats ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconBg}>
              <MaterialIcons name="dashboard" size={14} color={Colors.gold} />
            </View>
            <Text style={styles.sectionTitle}>Overview</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatCard
              icon="event"
              label="Upcoming"
              value={String(upcomingEvents.length)}
              color={Colors.greenLight}
              onPress={() => router.push('/(promoter)/events' as any)}
            />
            <StatCard
              icon="people"
              label="Followers"
              value={followerCount !== null ? String(followerCount) : '—'}
              color="#42A5F5"
            />
            <StatCard
              icon="confirmation-number"
              label="Tickets Sold"
              value={String(totalTicketsSold)}
              color={Colors.gold}
            />
            <StatCard
              icon="account-balance-wallet"
              label="Eligible Payout"
              value={payoutLoading ? '…' : eligibleStr}
              sub={hasHold ? 'Hold active' : undefined}
              color={hasHold ? '#FF9800' : Colors.greenLight}
              onPress={() => router.push('/(promoter)/finance' as any)}
            />
            {remainingBoosts != null && remainingBoosts > 0 && (
              <StatCard
                icon="rocket-launch"
                label="Boost Credits"
                value={String(remainingBoosts)}
                color="#CE93D8"
              />
            )}
          </ScrollView>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconBg}>
              <MaterialIcons name="bolt" size={14} color={Colors.gold} />
            </View>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.qaGrid}>
            <QuickAction
              icon="add-circle"
              label="Create Event"
              color={Colors.gold}
              onPress={() => router.push('/(tabs)/post' as any)}
            />
            <QuickAction
              icon="list-alt"
              label="My Events"
              color="#42A5F5"
              onPress={() => router.push('/(promoter)/events' as any)}
            />
            <QuickAction
              icon="confirmation-number"
              label="Ticketing"
              color={Colors.greenLight}
              onPress={() => router.push('/(promoter)/ticketing' as any)}
            />
            <QuickAction
              icon="qr-code-scanner"
              label="Scan"
              color="#CE93D8"
              onPress={() => {
                if (liveEvents.length === 0) {
                  Alert.alert('No Live Events', 'You need a live event to scan tickets.');
                  return;
                }
                if (liveEvents.length === 1) {
                  router.push(`/ticketing/scanner/${liveEvents[0].id}` as any);
                } else {
                  router.push('/(promoter)/ticketing' as any);
                }
              }}
            />
            <QuickAction
              icon="people"
              label="Attendees"
              color="#7E57C2"
              onPress={() => {
                if (liveEvents.length === 0) {
                  Alert.alert('No Live Events', 'You need a live event to view attendees.');
                  return;
                }
                if (liveEvents.length === 1) {
                  router.push(`/ticketing/dashboard/${liveEvents[0].id}` as any);
                } else {
                  router.push('/(promoter)/ticketing' as any);
                }
              }}
            />
            <QuickAction
              icon="rocket-launch"
              label="Boost"
              color="#E91E63"
              onPress={() => {
                if (liveEvents.length === 0) {
                  Alert.alert('No Live Events', 'You need a live event to boost.');
                  return;
                }
                if (liveEvents.length === 1) {
                  router.push(`/monetization/boost/${liveEvents[0].id}` as any);
                } else {
                  router.push('/(promoter)/events' as any);
                }
              }}
            />
            <QuickAction
              icon="account-balance-wallet"
              label="Finance"
              color="#26C6DA"
              onPress={() => router.push('/(promoter)/finance' as any)}
            />
            <QuickAction
              icon="apps"
              label="More Tools"
              color="#7E57C2"
              onPress={() => router.push('/(promoter)/more' as any)}
            />
          </View>
        </View>

        {/* ── Switch to Attendee ── */}
        <Pressable
          onPress={handleSwitchToAttendee}
          style={({ pressed }) => [styles.switchAttendeeCard, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={['rgba(66,165,245,0.06)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.switchAttendeeIcon}>
            <MaterialIcons name="people" size={20} color="#42A5F5" />
          </View>
          <View style={styles.switchAttendeeText}>
            <Text style={styles.switchAttendeeLabel}>Switch to Attendee View</Text>
            <Text style={styles.switchAttendeeSub}>Browse events as a regular attendee</Text>
          </View>
          <MaterialIcons name="arrow-forward-ios" size={14} color="#42A5F5" />
        </Pressable>

        {/* ── Upcoming Events ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconBg}>
              <MaterialIcons name="event" size={14} color={Colors.gold} />
            </View>
            <Text style={styles.sectionTitle}>
              Upcoming Events ({upcomingEvents.length})
            </Text>
            {upcomingEvents.length > 0 && (
              <Pressable
                onPress={() => router.push('/(promoter)/events' as any)}
                style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            )}
          </View>

          {upcomingEvents.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(tabs)/post' as any)}
              style={({ pressed }) => [styles.emptyEventsCard, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.goldSurface, Colors.surface]}
                style={StyleSheet.absoluteFillObject}
              />
              <MaterialIcons name="add-circle-outline" size={32} color={Colors.gold} />
              <Text style={styles.emptyEventsTitle}>No upcoming events</Text>
              <Text style={styles.emptyEventsSub}>Tap to create your first event</Text>
            </Pressable>
          ) : (
            <>
              {upcomingEvents.slice(0, 4).map((evt) => (
                <UpcomingEventCard
                  key={evt.id}
                  event={evt}
                  onPress={() => router.push(`/event/${evt.id}` as any)}
                />
              ))}
              {upcomingEvents.length > 4 && (
                <Pressable
                  onPress={() => router.push('/(promoter)/events' as any)}
                  style={({ pressed }) => [styles.moreEventsBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.moreEventsBtnText}>
                    +{upcomingEvents.length - 4} more events
                  </Text>
                  <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  headerGrad: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,215,0,0.14)',
    gap: Spacing.lg,
  },

  // ── ROW 1: Brand title row ──
  headerTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, minWidth: 0 },
  crownWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,215,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
    flexShrink: 0,
  },
  brandDivider: {
    width: 1.5, height: 28, backgroundColor: 'rgba(255,215,0,0.35)',
    marginHorizontal: 2, flexShrink: 0,
  },
  brandTextTop: {
    fontSize: 13, fontWeight: Typography.black as any, color: Colors.gold,
    letterSpacing: 2.5, textTransform: 'uppercase', lineHeight: 15,
  },
  brandTextBottom: {
    fontSize: 13, fontWeight: Typography.black as any, color: '#fff',
    letterSpacing: 2.5, textTransform: 'uppercase', lineHeight: 15,
  },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    flexShrink: 0,
  },
  switchBtnText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold as any },

  // ── ROW 2: Profile row ──
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2.5, borderColor: Colors.gold,
    // Gold glow via shadow
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  avatarLetterBg: { backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 26, fontWeight: Typography.black as any, color: Colors.gold },
  planBadge: {
    position: 'absolute', bottom: 1, right: 1,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#030B06',
  },
  identityInfo: { flex: 1, gap: Spacing.xs, alignItems: 'flex-start', minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', width: '100%' },
  displayName: {
    fontSize: Typography.md, fontWeight: Typography.black as any, color: '#fff',
    flexShrink: 1, maxWidth: '80%', lineHeight: 22,
  },
  subBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  tierText: { fontSize: 10, fontWeight: Typography.bold as any },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,168,70,0.14)',
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(0,168,70,0.45)',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.greenLight },
  activeText: { fontSize: 10, color: Colors.greenLight, fontWeight: Typography.semibold as any },
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.sm + 2, paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.45)',
    flexShrink: 0,
    // Subtle gold glow
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 2,
  },
  editProfileText: { fontSize: Typography.xs, color: '#fff', fontWeight: Typography.semibold as any },

  // ── ROW 3: Stats card ──
  statsCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: Radius.lg + 4,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.22)',
    paddingVertical: Spacing.base,
    overflow: 'hidden',
  },
  statCol: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  statCardVal: {
    fontSize: Typography.xl, fontWeight: Typography.black as any, color: Colors.gold,
    lineHeight: 26,
  },
  statCardLabel: {
    fontSize: 9, fontWeight: Typography.bold as any,
    color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, textAlign: 'center',
  },
  statCardDivider: {
    width: 1, height: 44, backgroundColor: 'rgba(255,215,0,0.22)',
    flexShrink: 0,
  },

  body: { padding: Spacing.base, gap: Spacing.lg },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  pendingBannerText: { flex: 1, fontSize: Typography.sm, color: '#FF9800', fontWeight: Typography.medium as any },

  sectionWrap: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIconBg: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary, flex: 1 },
  seeAllBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  seeAllText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs, paddingRight: Spacing.base },

  qaGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    justifyContent: 'space-around',
    rowGap: Spacing.sm,
  },

  emptyEventsCard: {
    borderRadius: Radius.xl, padding: Spacing.xxl,
    alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1.5, borderColor: `${Colors.gold}33`,
    overflow: 'hidden', position: 'relative',
  },
  emptyEventsTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptyEventsSub: { fontSize: Typography.sm, color: Colors.textMuted },

  moreEventsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  moreEventsBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },

  switchAttendeeCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: 'rgba(66,165,245,0.28)',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    overflow: 'hidden', position: 'relative',
  },
  switchAttendeeIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(66,165,245,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(66,165,245,0.3)', flexShrink: 0,
  },
  switchAttendeeText: { flex: 1 },
  switchAttendeeLabel: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: '#42A5F5' },
  switchAttendeeSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
});
