/**
 * Promoter Dashboard — Premium Business Workspace
 *
 * A dedicated screen for promoters to manage their events, ticketing,
 * marketing, and finances. Accessible from Profile tab via view switch.
 * Routes back to attendee tabs via "Switch to Attendee View".
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
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useEvents } from '../hooks/useEvents';
import { usePromoterMode } from '../hooks/usePromoterMode';
import { getPromoterPayoutBalance } from '../services/payoutService';
import { formatMinorAmount } from '../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { formatDate, isEventPassed } from '../constants/data';
import { supabase } from '../lib/supabase';

// ─── Mini Event Card ──────────────────────────────────────────────────────────
function UpcomingEventCard({
  event,
  onPress,
}: {
  event: any;
  onPress: () => void;
}) {
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
        <Image
          source={{ uri: event.coverImage }}
          style={evtCard.img}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={StyleSheet.absoluteFillObject}
        />
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
  statusText: { fontSize: 9, fontWeight: Typography.bold, color: '#fff' },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10, color: Colors.textMuted, flex: 1 },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ticketText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },
  actions: { paddingRight: Spacing.md },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
});

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
    minWidth: 80,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  value: { fontSize: Typography.lg, fontWeight: Typography.black },
  label: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 15 },
  sub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});

// ─── Section Row ──────────────────────────────────────────────────────────────
function DashSection({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.wrap}>
      <View style={sectionStyles.header}>
        <View style={sectionStyles.iconBg}>
          <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
        </View>
        <Text style={sectionStyles.title}>{title}</Text>
      </View>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBg: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  body: { gap: Spacing.xs },
});

// ─── Action Row Item ──────────────────────────────────────────────────────────
function ActionItem({
  icon,
  label,
  sub,
  color,
  onPress,
  badge,
  disabled,
}: {
  icon: string;
  label: string;
  sub?: string;
  color: string;
  onPress: () => void;
  badge?: string | number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [actionStyles.row, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
    >
      <View style={[actionStyles.iconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={actionStyles.text}>
        <Text style={actionStyles.label}>{label}</Text>
        {sub ? <Text style={actionStyles.sub}>{sub}</Text> : null}
      </View>
      {badge !== undefined ? (
        <View style={[actionStyles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
          <Text style={[actionStyles.badgeText, { color }]}>{badge}</Text>
        </View>
      ) : null}
      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
    </Pressable>
  );
}

const actionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  iconBg: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  text: { flex: 1 },
  label: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, flexShrink: 0,
  },
  badgeText: { fontSize: Typography.xs, fontWeight: Typography.bold },
});

// ─── Quick Action Button (Grid) ───────────────────────────────────────────────
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
    fontSize: 10, fontWeight: Typography.semibold,
    color: Colors.textSecondary, textAlign: 'center', lineHeight: 13,
  },
});

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function PromoterDashboardScreen() {
  const { user, verifiedPromoter, remainingBoosts, subscriptionStatus } = useAuth();
  const { allEvents } = useEvents();
  const { switchToAttendee } = usePromoterMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [payoutBalance, setPayoutBalance] = useState<{ eligible_minor?: number; has_financial_hold?: boolean } | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isPromoter = user?.roles.includes('promoter') ?? false;
  const subscriptionTier = user?.subscriptionTier ?? 'free';

  // Guard: if not a promoter, bounce back to attendee view
  useEffect(() => {
    if (user && !isPromoter) {
      switchToAttendee();
      router.replace('/(tabs)' as any);
    }
  }, [user, isPromoter, switchToAttendee, router]);

  // Promoter's events
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

  // Load follower count
  const loadFollowers = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('promoter_id', user.id);
    setFollowerCount(count ?? 0);
  }, [user?.id]);

  // Load payout balance (USD default)
  const loadPayout = useCallback(async () => {
    if (!user?.id) return;
    setPayoutLoading(true);
    try {
      const result = await getPromoterPayoutBalance(user.id, 'USD');
      if (result.ok) {
        setPayoutBalance({ eligible_minor: result.eligible_minor, has_financial_hold: result.has_financial_hold });
      }
    } catch {}
    setPayoutLoading(false);
  }, [user?.id]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadFollowers(), loadPayout()]);
  }, [loadFollowers, loadPayout]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleSwitchToAttendee = () => {
    switchToAttendee();
    router.replace('/(tabs)' as any);
  };

  if (!user || !isPromoter) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  const eligibleMinor = payoutBalance?.eligible_minor ?? 0;
  const hasHold = payoutBalance?.has_financial_hold ?? false;
  const eligibleStr = eligibleMinor > 0
    ? formatMinorAmount(eligibleMinor, 'USD')
    : '$0.00';

  const tierConfig = {
    free:  { color: '#607D8B', label: 'Free', icon: 'person' },
    pro:   { color: Colors.gold, label: 'Pro', icon: 'campaign' },
    elite: { color: '#E91E63', label: 'Elite', icon: 'star' },
  } as const;
  const tc = tierConfig[subscriptionTier as keyof typeof tierConfig] ?? tierConfig.free;

  return (
    <View style={styles.container}>
      {/* ── Premium Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#050F08' }}>
        <LinearGradient
          colors={['#050F08', '#081A0D', '#0B2414']}
          style={styles.headerGrad}
        >
          {/* Top row: brand + switch */}
          <View style={styles.headerTopRow}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brandText}>PROMOTER DASHBOARD</Text>
            </View>
            <Pressable
              onPress={handleSwitchToAttendee}
              style={({ pressed }) => [styles.switchBtn, pressed && { opacity: 0.8 }]}
              hitSlop={8}
            >
              <MaterialIcons name="people" size={14} color={Colors.textMuted} />
              <Text style={styles.switchBtnText}>Attendee View</Text>
            </Pressable>
          </View>

          {/* Identity row */}
          <View style={styles.identityRow}>
            {/* Avatar */}
            <Pressable
              onPress={() => router.push(`/promoter/${user.id}` as any)}
              style={styles.avatarWrap}
            >
              {user.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarLetterBg]}>
                  <Text style={styles.avatarLetter}>
                    {(user.name[0] ?? 'P').toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={[styles.planBadge, { backgroundColor: `${tc.color}CC` }]}>
                <MaterialIcons name={tc.icon as any} size={9} color="#fff" />
              </View>
            </Pressable>

            {/* Name & stats */}
            <View style={styles.identityInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>{user.name}</Text>
                {verifiedPromoter && (
                  <MaterialIcons name="verified" size={16} color={Colors.gold} />
                )}
              </View>
              <View style={styles.subBadgeRow}>
                <View style={[styles.tierBadge, { backgroundColor: `${tc.color}22`, borderColor: `${tc.color}55` }]}>
                  <MaterialIcons name={tc.icon as any} size={10} color={tc.color} />
                  <Text style={[styles.tierText, { color: tc.color }]}>{tc.label}</Text>
                </View>
                {subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? (
                  <View style={styles.activeBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Active</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.statsMinRow}>
                <View style={styles.statMin}>
                  <Text style={styles.statMinVal}>{followerCount ?? '—'}</Text>
                  <Text style={styles.statMinLabel}>followers</Text>
                </View>
                <View style={styles.statMinDivider} />
                <View style={styles.statMin}>
                  <Text style={styles.statMinVal}>{liveEvents.length}</Text>
                  <Text style={styles.statMinLabel}>live events</Text>
                </View>
                <View style={styles.statMinDivider} />
                <View style={styles.statMin}>
                  <Text style={styles.statMinVal}>{totalTicketsSold}</Text>
                  <Text style={styles.statMinLabel}>tickets sold</Text>
                </View>
              </View>
            </View>

            {/* View public profile */}
            <Pressable
              onPress={() => router.push(`/promoter/${user.id}` as any)}
              style={({ pressed }) => [styles.profileViewBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <MaterialIcons name="open-in-new" size={14} color={Colors.gold} />
            </Pressable>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* ── Body ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Pending approval banner */}
        {pendingEvents.length > 0 && (
          <Pressable
            onPress={() => router.push('/my-events' as any)}
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
        <DashSection icon="dashboard" title="Overview">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatCard
              icon="event"
              label="Upcoming"
              value={String(upcomingEvents.length)}
              color={Colors.greenLight}
              onPress={() => router.push('/my-events' as any)}
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
              onPress={() => router.push('/my-events' as any)}
            />
            <StatCard
              icon="account-balance-wallet"
              label="Eligible Payout"
              value={payoutLoading ? '…' : eligibleStr}
              sub={hasHold ? 'Hold active' : undefined}
              color={hasHold ? '#FF9800' : Colors.greenLight}
              onPress={() => router.push('/my-events' as any)}
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
        </DashSection>

        {/* ── Quick Actions ── */}
        <DashSection icon="bolt" title="Quick Actions">
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
              onPress={() => router.push('/my-events' as any)}
            />
            <QuickAction
              icon="confirmation-number"
              label="Ticketing"
              color={Colors.greenLight}
              onPress={() => router.push('/my-events' as any)}
            />
            <QuickAction
              icon="qr-code-scanner"
              label="Scan Tickets"
              color="#CE93D8"
              onPress={() => {
                if (liveEvents.length === 0) {
                  Alert.alert('No Live Events', 'You need a live event to scan tickets.');
                  return;
                }
                if (liveEvents.length === 1) {
                  router.push(`/ticketing/scanner/${liveEvents[0].id}` as any);
                } else {
                  router.push('/my-events' as any);
                }
              }}
            />
            <QuickAction
              icon="point-of-sale"
              label="Door Sales"
              color="#FF9800"
              onPress={() => {
                if (liveEvents.length === 0) {
                  Alert.alert('No Live Events', 'Door sales require a live event.');
                  return;
                }
                if (liveEvents.length === 1) {
                  router.push(`/ticketing/door/${liveEvents[0].id}` as any);
                } else {
                  router.push('/my-events' as any);
                }
              }}
            />
            <QuickAction
              icon="rocket-launch"
              label="Boost Event"
              color="#E91E63"
              onPress={() => {
                if (liveEvents.length === 0) {
                  Alert.alert('No Live Events', 'You need a live event to boost.');
                  return;
                }
                if (liveEvents.length === 1) {
                  router.push(`/monetization/boost/${liveEvents[0].id}` as any);
                } else {
                  router.push('/my-events' as any);
                }
              }}
            />
            <QuickAction
              icon="account-balance-wallet"
              label="Payouts"
              color="#26C6DA"
              onPress={() => router.push('/my-events' as any)}
            />
            <QuickAction
              icon="people"
              label="My Profile"
              color="#7E57C2"
              onPress={() => router.push(`/promoter/${user.id}` as any)}
            />
          </View>
        </DashSection>

        {/* ── Upcoming Events ── */}
        {upcomingEvents.length > 0 && (
          <DashSection icon="event" title={`Upcoming Events (${upcomingEvents.length})`}>
            {upcomingEvents.slice(0, 5).map((evt) => (
              <UpcomingEventCard
                key={evt.id}
                event={evt}
                onPress={() => router.push(`/event/${evt.id}` as any)}
              />
            ))}
            {upcomingEvents.length > 5 && (
              <Pressable
                onPress={() => router.push('/my-events' as any)}
                style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.seeAllText}>See all {upcomingEvents.length} events</Text>
                <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
              </Pressable>
            )}
          </DashSection>
        )}

        {upcomingEvents.length === 0 && (
          <DashSection icon="event" title="Events">
            <Pressable
              onPress={() => router.push('/(tabs)/post' as any)}
              style={({ pressed }) => [styles.emptyEventsCard, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.goldSurface, Colors.surface]} style={StyleSheet.absoluteFillObject} />
              <MaterialIcons name="add-circle-outline" size={32} color={Colors.gold} />
              <Text style={styles.emptyEventsTitle}>No upcoming events</Text>
              <Text style={styles.emptyEventsSub}>Tap to create your first event</Text>
            </Pressable>
          </DashSection>
        )}

        {/* ── Events Section ── */}
        <DashSection icon="event-note" title="Events">
          <ActionItem
            icon="add-circle"
            label="Create New Event"
            sub="Post a new event to Vybz Hub"
            color={Colors.gold}
            onPress={() => router.push('/(tabs)/post' as any)}
          />
          <ActionItem
            icon="list-alt"
            label="My Events"
            sub="Manage all your listings"
            color="#42A5F5"
            badge={myEvents.length}
            onPress={() => router.push('/my-events' as any)}
          />
        </DashSection>

        {/* ── Ticketing Section ── */}
        <DashSection icon="confirmation-number" title="Ticketing">
          <ActionItem
            icon="settings"
            label="Ticket Setup"
            sub="Configure tiers and pricing"
            color={Colors.greenLight}
            onPress={() => {
              if (liveEvents.length === 0) {
                Alert.alert('Select an Event', 'Open My Events and choose an event to set up ticketing.');
                router.push('/my-events' as any);
                return;
              }
              if (liveEvents.length === 1) {
                router.push(`/ticketing/setup/${liveEvents[0].id}` as any);
              } else {
                router.push('/my-events' as any);
              }
            }}
          />
          <ActionItem
            icon="dashboard"
            label="Ticket Dashboard"
            sub="Sales, attendees, check-ins"
            color={Colors.greenLight}
            onPress={() => router.push('/my-events' as any)}
          />
          <ActionItem
            icon="group"
            label="Manage Staff"
            sub="Scanners, door staff, managers"
            color="#42A5F5"
            onPress={() => router.push('/my-events' as any)}
          />
          <ActionItem
            icon="qr-code-scanner"
            label="Scanner"
            sub="Scan attendee tickets at the door"
            color="#CE93D8"
            onPress={() => {
              if (liveEvents.length === 0) {
                Alert.alert('No Live Events', 'You need a live event to scan tickets.');
                return;
              }
              if (liveEvents.length === 1) {
                router.push(`/ticketing/scanner/${liveEvents[0].id}` as any);
              } else {
                router.push('/my-events' as any);
              }
            }}
          />
          <ActionItem
            icon="point-of-sale"
            label="Door Sales"
            sub="Sell cash or card tickets at the door"
            color="#FF9800"
            onPress={() => {
              if (liveEvents.length === 0) {
                Alert.alert('No Live Events', 'Door sales require a live event.');
                return;
              }
              if (liveEvents.length === 1) {
                router.push(`/ticketing/door/${liveEvents[0].id}` as any);
              } else {
                router.push('/my-events' as any);
              }
            }}
          />
        </DashSection>

        {/* ── Marketing Section ── */}
        <DashSection icon="campaign" title="Marketing">
          <ActionItem
            icon="rocket-launch"
            label="Boost an Event"
            sub="Increase visibility across the island"
            color="#E91E63"
            onPress={() => {
              if (liveEvents.length === 0) {
                Alert.alert('No Live Events', 'You need a live event to boost.');
                return;
              }
              if (liveEvents.length === 1) {
                router.push(`/monetization/boost/${liveEvents[0].id}` as any);
              } else {
                router.push('/my-events' as any);
              }
            }}
            badge={remainingBoosts != null && remainingBoosts > 0 ? `${remainingBoosts} free` : undefined}
          />
          <ActionItem
            icon="bar-chart"
            label="Boost Performance"
            sub="View impressions and engagement"
            color="#CE93D8"
            onPress={() => router.push('/my-events' as any)}
          />
          <ActionItem
            icon="people"
            label="My Followers"
            sub={followerCount !== null ? `${followerCount} followers` : 'View your audience'}
            color="#42A5F5"
            onPress={() => router.push(`/promoter/${user.id}` as any)}
          />
          <ActionItem
            icon="upgrade"
            label="Upgrade Plan"
            sub={subscriptionTier === 'free' ? 'Unlock Pro or Elite benefits' : `Current: ${tc.label}`}
            color={tc.color}
            onPress={() => router.push('/monetization/upgrade' as any)}
          />
        </DashSection>

        {/* ── Finance Section ── */}
        <DashSection icon="account-balance-wallet" title="Finance & Payouts">
          <ActionItem
            icon="account-balance-wallet"
            label="Payout Balance"
            sub={`Eligible: ${payoutLoading ? '…' : eligibleStr}${hasHold ? ' · Hold active' : ''}`}
            color={hasHold ? '#FF9800' : Colors.greenLight}
            onPress={() => router.push('/my-events' as any)}
          />
          <ActionItem
            icon="receipt"
            label="Sales & Finance"
            sub="Revenue, fees, and ledger per event"
            color="#26C6DA"
            onPress={() => router.push('/my-events' as any)}
          />
          <ActionItem
            icon="cancel"
            label="Cancellation Requests"
            sub="Submit or track event cancellations"
            color="#FF5722"
            onPress={() => router.push('/my-events' as any)}
          />
        </DashSection>

        {/* ── Account Section ── */}
        <DashSection icon="manage-accounts" title="Account">
          <ActionItem
            icon="open-in-new"
            label="View Public Profile"
            sub="See your promoter page as fans do"
            color="#7E57C2"
            onPress={() => router.push(`/promoter/${user.id}` as any)}
          />
          <ActionItem
            icon="notifications"
            label="Notification Settings"
            sub="Manage email and push preferences"
            color="#42A5F5"
            onPress={() => router.push('/notification-settings' as any)}
          />
          <ActionItem
            icon="gavel"
            label="Legal & Policies"
            sub="Terms, promoter policy, ticket terms"
            color={Colors.textMuted}
            onPress={() => Linking.openURL('https://vybzhub.com/promoter-policy')}
          />
          <ActionItem
            icon="people-alt"
            label="Switch to Attendee View"
            sub="Browse events as a regular attendee"
            color="#607D8B"
            onPress={handleSwitchToAttendee}
          />
        </DashSection>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  // Header gradient
  headerGrad: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,215,0,0.12)',
    gap: Spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  brandText: {
    fontSize: 11, fontWeight: Typography.black, color: Colors.gold,
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  switchBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },

  // Identity row
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: `${Colors.gold}88` },
  avatarLetterBg: { backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 26, fontWeight: Typography.black, color: Colors.gold },
  planBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.background,
  },
  identityInfo: { flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { fontSize: Typography.lg, fontWeight: Typography.black, color: '#fff', flex: 1 },
  subBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
  },
  tierText: { fontSize: 10, fontWeight: Typography.bold },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${Colors.greenLight}18`, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.greenLight}44`,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.greenLight },
  activeText: { fontSize: 10, color: Colors.greenLight, fontWeight: Typography.semibold },
  statsMinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statMin: { alignItems: 'center', gap: 1 },
  statMinVal: { fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.gold },
  statMinLabel: { fontSize: 9, color: Colors.textMuted },
  statMinDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  profileViewBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,215,0,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0,
  },

  // Body
  body: { padding: Spacing.base, gap: Spacing.xl },

  // Pending banner
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  pendingBannerText: { flex: 1, fontSize: Typography.sm, color: '#FF9800', fontWeight: Typography.medium },

  // Stats scroll
  statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },

  // Quick actions grid
  qaGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    justifyContent: 'space-around',
    rowGap: Spacing.sm,
  },

  // Empty events card
  emptyEventsCard: {
    borderRadius: Radius.xl, padding: Spacing.xxl,
    alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1.5, borderColor: `${Colors.gold}33`,
    overflow: 'hidden', position: 'relative',
  },
  emptyEventsTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptyEventsSub: { fontSize: Typography.sm, color: Colors.textMuted },

  // See all button
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, marginTop: Spacing.xs,
  },
  seeAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
