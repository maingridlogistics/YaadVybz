/**
 * Admin Portal — Dashboard Tab
 * Platform overview: key metrics, recent activity, pending items.
 * Admin-only. No attendee or promoter functionality.
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate } from '../../constants/data';
import { TICKETING_ENABLED } from '../../constants/featureFlags';

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  icon,
  label,
  value,
  sub,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [mc.card, onPress && pressed && { opacity: 0.85 }]}
    >
      <View style={[mc.iconWrap, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[mc.value, { color }]}>{value}</Text>
      <Text style={mc.label}>{label}</Text>
      {sub ? <Text style={mc.sub}>{sub}</Text> : null}
    </Pressable>
  );
}

const mc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 80,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, alignItems: 'center', gap: 5,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: Typography.xl, fontWeight: Typography.black as any },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  sub: { fontSize: 10, color: Colors.gold, textAlign: 'center' },
});

// ─── Alert Row ────────────────────────────────────────────────────────────────
function AlertRow({ icon, color, message, onPress }: { icon: string; color: string; message: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [al.row, pressed && { opacity: 0.85 }]}
    >
      <View style={[al.dot, { backgroundColor: color }]} />
      <MaterialIcons name={icon as any} size={15} color={color} />
      <Text style={[al.text, { color }]}>{message}</Text>
      {onPress ? <MaterialIcons name="arrow-forward-ios" size={11} color={color} style={{ marginLeft: 'auto' }} /> : null}
    </Pressable>
  );
}

const al = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  text: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.medium as any, lineHeight: 18 },
});

// ─── Recent Event Row ─────────────────────────────────────────────────────────
function RecentEventRow({ event, onPress }: { event: any; onPress: () => void }) {
  const statusColors: Record<string, string> = {
    live: Colors.greenLight, pending: '#FF9800', flagged: '#FF5722', rejected: '#F44336',
  };
  const isCancelled = event.cancellation_status === 'cancellation_approved';
  const sc = isCancelled ? '#9E9E9E' : (statusColors[event.status] ?? Colors.textMuted);
  const sl = isCancelled ? 'Cancelled' : event.status;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [re.row, pressed && { opacity: 0.88 }]}>
      <View style={re.body}>
        <Text style={re.title} numberOfLines={1}>{event.title}</Text>
        <Text style={re.meta}>{event.promoterName} · {formatDate(event.date)}</Text>
      </View>
      <View style={[re.badge, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
        <Text style={[re.badgeText, { color: sc }]}>{sl}</Text>
      </View>
    </Pressable>
  );
}

const re = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base, marginBottom: Spacing.xs,
  },
  body: { flex: 1 },
  title: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  meta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontWeight: Typography.bold as any },
});

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, action, onAction }: {
  icon: string; title: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionBar} />
      <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminDashboardTab() {
  const { user, signOut } = useAuth();
  const { allEvents, events, getPendingEvents, getFlaggedEvents, getBoostedEvents, isLoading } = useEvents();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const [platformStats, setPlatformStats] = useState<{
    totalUsers: number;
    totalPromoters: number;
    activeSubscriptions: number;
    proSubscriptions: number;
    eliteSubscriptions: number;
    ticketsSold: number;
    openDisputes: number;
    pendingPayouts: number;
    pendingDeletions: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const pendingEvents = getPendingEvents();
  const flaggedEvents = getFlaggedEvents();
  const activeBoosted = getBoostedEvents();
  const liveEvents = events.filter((e) => e.status === 'live');

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [
        usersRes,
        promotersRes,
        subsRes,
        ticketsRes,
        disputesRes,
        payoutsRes,
        deletionsRes,
      ] = await Promise.all([
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).contains('roles', ['promoter']),
        supabase.from('subscriptions').select('plan, status'),
        TICKETING_ENABLED
          ? supabase.from('ticket_orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid')
          : Promise.resolve({ count: 0 }),
        supabase.from('payment_disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'needs_response']),
        supabase.from('promoter_payouts').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
        supabase.from('account_deletion_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      const activeSubs = (subsRes.data ?? []).filter((s) => s.status === 'active' || s.status === 'trialing');

      setPlatformStats({
        totalUsers: usersRes.count ?? 0,
        totalPromoters: promotersRes.count ?? 0,
        activeSubscriptions: activeSubs.length,
        proSubscriptions: activeSubs.filter((s) => s.plan === 'pro').length,
        eliteSubscriptions: activeSubs.filter((s) => s.plan === 'elite').length,
        ticketsSold: (ticketsRes as any).count ?? 0,
        openDisputes: (disputesRes as any).count ?? 0,
        pendingPayouts: payoutsRes.count ?? 0,
        pendingDeletions: deletionsRes.count ?? 0,
      });
    } catch {}
    setStatsLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const recentEvents = useMemo(() => {
    // Use allEvents (admin view) if available; fall back to public events only when
    // the context has not yet fetched all events (isLoading). An empty allEvents
    // legitimately means no events exist on the platform.
    const source = allEvents.length > 0 ? allEvents : (isLoading ? events : allEvents);
    return [...source]
      .sort((a, b) => (b as any).createdAt?.localeCompare((a as any).createdAt ?? '') ?? 0)
      .slice(0, 8);
  }, [allEvents, events, isLoading]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => {});
          router.replace('/onboarding' as any);
        },
      },
    ]);
  };

  const hasAlerts = (pendingEvents.length + flaggedEvents.length + (platformStats?.openDisputes ?? 0) + (platformStats?.pendingPayouts ?? 0) + (platformStats?.pendingDeletions ?? 0)) > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#050A12' }}>
        <LinearGradient
          colors={['#050A12', '#080F1A', '#0A1220']}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View style={styles.brandRow}>
              <View style={styles.adminIcon}>
                <MaterialIcons name="admin-panel-settings" size={18} color={Colors.gold} />
              </View>
              <View>
                <Text style={styles.brandTop}>VYBZ HUB</Text>
                <Text style={styles.brandBottom}>ADMIN PORTAL</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.roleBadge}>
                <MaterialIcons name="verified-user" size={11} color={Colors.gold} />
                <Text style={styles.roleBadgeText}>ADMIN</Text>
              </View>
              <Pressable onPress={handleSignOut} hitSlop={8}>
                <MaterialIcons name="logout" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.welcomeText}>
            Welcome, {user?.name ?? 'Administrator'}
          </Text>
        </LinearGradient>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* ── Platform Stats ── */}
        <SectionHeader icon="bar-chart" title="Platform Overview" action="Refresh" onAction={loadStats} />

        {statsLoading && !platformStats ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.gold} />
            <Text style={styles.loadingText}>Loading platform stats...</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
              <MetricCard icon="people" label="Total Users" value={platformStats?.totalUsers ?? '—'} color="#42A5F5" />
              <MetricCard icon="campaign" label="Promoters" value={platformStats?.totalPromoters ?? '—'} color={Colors.gold} />
              <MetricCard icon="fiber-manual-record" label="Live Events" value={liveEvents.length} color={Colors.greenLight} />
              <MetricCard icon="workspace-premium" label="Active Subs" value={platformStats?.activeSubscriptions ?? '—'} color="#E91E63" sub={platformStats ? `${platformStats.proSubscriptions} Pro · ${platformStats.eliteSubscriptions} Elite` : undefined} />
              {TICKETING_ENABLED && (
                <MetricCard icon="confirmation-number" label="Tickets Sold" value={platformStats?.ticketsSold ?? '—'} color="#CE93D8" />
              )}
              <MetricCard icon="rocket-launch" label="Active Boosts" value={activeBoosted.length} color="#FF9800" />
            </ScrollView>
          </>
        )}

        {/* ── Active Alerts ── */}
        {hasAlerts && (
          <>
            <SectionHeader icon="notification-important" title="Needs Attention" />
            {pendingEvents.length > 0 && (
              <AlertRow
                icon="pending-actions"
                color="#FF9800"
                message={`${pendingEvents.length} event${pendingEvents.length !== 1 ? 's' : ''} pending review in the queue`}
                onPress={() => router.push('/admin/events' as any)}
              />
            )}
            {flaggedEvents.length > 0 && (
              <AlertRow
                icon="flag"
                color="#FF5722"
                message={`${flaggedEvents.length} flagged event${flaggedEvents.length !== 1 ? 's' : ''} require attention`}
                onPress={() => router.push('/admin/events' as any)}
              />
            )}
            {(platformStats?.openDisputes ?? 0) > 0 && (
              <AlertRow
                icon="gavel"
                color="#F44336"
                message={`${platformStats!.openDisputes} open payment dispute${platformStats!.openDisputes !== 1 ? 's' : ''} — respond before deadline`}
                onPress={() => router.push('/admin/finance' as any)}
              />
            )}
            {(platformStats?.pendingPayouts ?? 0) > 0 && (
              <AlertRow
                icon="account-balance-wallet"
                color={Colors.gold}
                message={`${platformStats!.pendingPayouts} payout request${platformStats!.pendingPayouts !== 1 ? 's' : ''} awaiting processing`}
                onPress={() => router.push('/admin/finance' as any)}
              />
            )}
            {(platformStats?.pendingDeletions ?? 0) > 0 && (
              <AlertRow
                icon="delete-forever"
                color="#EF5350"
                message={`${platformStats!.pendingDeletions} account deletion request${platformStats!.pendingDeletions !== 1 ? 's' : ''} pending review`}
                onPress={() => router.push('/admin/users' as any)}
              />
            )}
          </>
        )}

        {/* ── Quick Actions ── */}
        <SectionHeader icon="bolt" title="Quick Actions" />
        <View style={styles.quickGrid}>
          {[
            { icon: 'pending-actions', label: 'Review Queue', color: '#FF9800', badge: pendingEvents.length, dest: '/admin/events' },
            { icon: 'people', label: 'Manage Users', color: '#42A5F5', dest: '/admin/users' },
            { icon: 'account-balance-wallet', label: 'Finance', color: Colors.greenLight, dest: '/admin/finance' },
            { icon: 'settings', label: 'Settings', color: Colors.textMuted, dest: '/admin/more' },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.dest as any)}
              style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.8 }]}
            >
              <View style={[styles.quickIcon, { backgroundColor: `${item.color}20` }]}>
                <MaterialIcons name={item.icon as any} size={24} color={item.color} />
                {(item.badge ?? 0) > 0 && (
                  <View style={styles.quickBadge}>
                    <Text style={styles.quickBadgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Recent Events ── */}
        <SectionHeader icon="event" title={`Recent Events (${recentEvents.length})`} action="All Events" onAction={() => router.push('/admin/events' as any)} />
        {recentEvents.map((e) => (
          <RecentEventRow key={e.id} event={e} onPress={() => router.push(`/event/${e.id}` as any)} />
        ))}
        {recentEvents.length === 0 && (
          <Text style={styles.emptyText}>No events yet.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: `${Colors.gold}22`, gap: Spacing.md,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  adminIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,215,0,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  brandTop: { fontSize: 12, fontWeight: Typography.black as any, color: Colors.gold, letterSpacing: 2 },
  brandBottom: { fontSize: 12, fontWeight: Typography.black as any, color: '#fff', letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  roleBadgeText: { fontSize: 10, fontWeight: Typography.bold as any, color: Colors.gold, letterSpacing: 0.5 },
  welcomeText: { fontSize: Typography.sm, color: Colors.textMuted },
  body: { padding: Spacing.base, gap: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  sectionAction: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any },
  metricsRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, justifyContent: 'space-around',
  },
  quickBtn: { alignItems: 'center', gap: Spacing.xs, width: '22%' },
  quickIcon: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  quickBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  quickBadgeText: { fontSize: 9, fontWeight: Typography.bold as any, color: '#fff' },
  quickLabel: { fontSize: 10, fontWeight: Typography.semibold as any, color: Colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
});
