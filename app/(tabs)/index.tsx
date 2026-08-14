import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../hooks/useLanguage';
import { EventCardFeatured } from '../../components/feature/EventCardFeatured';
import { EventCard } from '../../components/feature/EventCard';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { SkeletonCard, SkeletonRow } from '../../components/ui/LoadingState';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';
import { EVENT_TYPES, PARISHES, formatCount, isEventPassed, Event, TYPE_COLORS } from '../../constants/data';
import { compareTrending } from '../../constants/rankingUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  subtitle,
  onSeeAll,
  icon,
  iconColor,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  iconColor?: string;
}) {
  return (
    <View style={sh.row}>
      <View style={sh.left}>
        {icon ? (
          <MaterialIcons name={icon} size={20} color={iconColor ?? Colors.textPrimary} />
        ) : (
          <View style={sh.accent} />
        )}
        <View>
          <Text style={sh.title}>{title}</Text>
          {subtitle ? <Text style={sh.sub}>{subtitle}</Text> : null}
        </View>
      </View>
      {onSeeAll ? (
        <Pressable
          onPress={onSeeAll}
          style={({ pressed }) => [sh.seeAll, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Text style={sh.seeAllText}>See all</Text>
          <MaterialIcons name="arrow-forward" size={14} color={Colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const sh = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  accent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: Typography.semibold,
  },
});

// ─── Search Bar ───────────────────────────────────────────────────────────────
function SearchBar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [srch.bar, pressed && { opacity: 0.88 }]}
      accessibilityRole="search"
      accessibilityLabel="Search events, venues, promoters"
    >
      <View style={srch.iconWrap}>
        <MaterialIcons name="search" size={20} color={Colors.textMuted} />
      </View>
      <Text style={srch.placeholder}>Search events, venues, promoters…</Text>
      <View style={srch.filterBtn}>
        <MaterialIcons name="tune" size={16} color={Colors.primary} />
      </View>
    </Pressable>
  );
}

const srch = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    height: 52,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    ...Shadows.card,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textMuted,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
});

// ─── Quick Date Chips ─────────────────────────────────────────────────────────
function QuickChips({ onToday, onWeekend, onAll }: { onToday: () => void; onWeekend: () => void; onAll: () => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={qc.row}
      style={qc.scroll}
    >
      <Pressable onPress={onToday} style={({ pressed }) => [qc.chip, qc.chipPink, pressed && { opacity: 0.8 }]}>
        <MaterialIcons name="today" size={14} color={Colors.primary} />
        <Text style={qc.chipTextPink}>Today</Text>
      </Pressable>
      <Pressable onPress={onWeekend} style={({ pressed }) => [qc.chip, qc.chipPink, pressed && { opacity: 0.8 }]}>
        <MaterialIcons name="weekend" size={14} color={Colors.primary} />
        <Text style={qc.chipTextPink}>This Weekend</Text>
      </Pressable>
      <Pressable onPress={onAll} style={({ pressed }) => [qc.chip, pressed && { opacity: 0.8 }]}>
        <MaterialIcons name="apps" size={14} color={Colors.textSecondary} />
        <Text style={qc.chipText}>All Events</Text>
      </Pressable>
      <Pressable
        onPress={onAll}
        style={({ pressed }) => [qc.chip, pressed && { opacity: 0.8 }]}
      >
        <MaterialIcons name="map" size={14} color={Colors.textSecondary} />
        <Text style={qc.chipText}>Map View</Text>
      </Pressable>
    </ScrollView>
  );
}

const qc = StyleSheet.create({
  scroll: { marginBottom: Spacing.lg },
  row: { paddingHorizontal: Spacing.base, gap: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    height: 38,
    ...Shadows.card,
  },
  chipPink: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primaryBorder,
  },
  chipText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  chipTextPink: { fontSize: Typography.sm, color: Colors.primary, fontWeight: Typography.semibold },
});

// ─── Category Pill ────────────────────────────────────────────────────────────
function CategoryPill({
  id, label, icon, color, onPress
}: { id: string; label: string; icon: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cat.pill, { borderColor: `${color}40` }, pressed && { opacity: 0.8 }]}
    >
      <View style={[cat.iconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={17} color={color} />
      </View>
      <Text style={[cat.label, { color: Colors.textPrimary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const cat = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: 6,
    paddingRight: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    ...Shadows.card,
    minHeight: 42,
  },
  iconBg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
});

// ─── Trending Card ─────────────────────────────────────────────────────────────
function TrendingCard({ event, rank, onPress }: { event: Event; rank: number; onPress: () => void }) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.primary;
  const heat = event.goingCount + event.interestedCount;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trend.card, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`#${rank} ${event.title}`}
    >
      {/* Image */}
      <View style={trend.imgWrap}>
        <Image
          source={{ uri: event.coverImage }}
          style={trend.img}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,6,4,0.7)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Rank badge — top left */}
        <View style={trend.rankBadge}>
          <Text style={trend.rankText}>#{rank}</Text>
        </View>
        {/* Price — bottom right */}
        <View style={[trend.pricePill, isFree && trend.pricePillFree]}>
          <Text style={[trend.priceText, isFree && trend.priceTextFree]}>{isFree ? 'Free' : event.ticketPrice}</Text>
        </View>
      </View>
      {/* Info */}
      <View style={trend.info}>
        <Text style={trend.title} numberOfLines={2}>{event.title}</Text>
        <View style={trend.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={trend.meta} numberOfLines={1}>{event.parish}</Text>
        </View>
        <View style={trend.footer}>
          <View style={[trend.typeDot, { backgroundColor: typeColor }]} />
          <Text style={[trend.typeText, { color: typeColor }]}>{event.typeLabel}</Text>
          <View style={trend.heatRow}>
            <MaterialIcons name="local-fire-department" size={11} color="#FF6B35" />
            <Text style={trend.heatText}>{formatCount(heat)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const trend = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH * 0.58,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    ...Shadows.card,
  },
  imgWrap: { height: 140, position: 'relative' },
  img: { width: '100%', height: '100%' },
  rankBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  rankText: { fontSize: 11, fontWeight: Typography.black, color: '#fff' },
  pricePill: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pricePillFree: { backgroundColor: Colors.success },
  priceText: { fontSize: 10, fontWeight: Typography.bold, color: '#fff' },
  priceTextFree: { color: '#fff' },
  info: {
    padding: Spacing.md,
    gap: 4,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typeDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  typeText: { fontSize: 10, fontWeight: Typography.semibold, flex: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heatText: { fontSize: 10, color: '#FF6B35', fontWeight: Typography.bold },
});

// ─── Parish Chip ──────────────────────────────────────────────────────────────
function ParishChip({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [par.chip, pressed && { opacity: 0.8 }]}
    >
      <MaterialIcons name="place" size={12} color={Colors.primary} />
      <Text style={par.text}>{name}</Text>
    </Pressable>
  );
}

const par = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.card,
  },
  text: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
});

// ─── Main Home Screen ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const {
    events,
    getFeaturedEvents,
    userGoingIds,
    userInterestedIds,
    toggleGoing,
    toggleInterested,
    refreshEvents,
    isLoading,
    error,
    clearError,
  } = useEvents();
  const { unreadCount } = useNotifications();
  const { t, language } = useLanguage();
  const router = useRouter();

  const featured = useMemo(() => getFeaturedEvents(), [getFeaturedEvents]);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  // Events within the next 7 days in Jamaica time
  const thisWeekEvents = useMemo(() => {
    const nowJamMs = Date.now() - 5 * 60 * 60 * 1000;
    const nowJam = new Date(nowJamMs);
    const todayUtc = Date.UTC(nowJam.getUTCFullYear(), nowJam.getUTCMonth(), nowJam.getUTCDate(), 5, 0, 0);
    const nextWeekUtc = todayUtc + 7 * 86_400_000;
    return events
      .filter((e) => {
        if (!e.date || e.featured) return false;
        if (isEventPassed(e.date)) return false;
        const [ey, em, ed] = e.date.split('-').map(Number);
        const evtUtc = Date.UTC(ey, em - 1, ed, 5, 0, 0);
        return evtUtc <= nextWeekUtc;
      })
      .slice(0, 6);
  }, [events]);

  const nearYouEvents = useMemo(
    () =>
      user?.homeParish
        ? events.filter((e) => e.parish === user.homeParish && !isEventPassed(e.date)).slice(0, 4)
        : [],
    [events, user],
  );

  const trendingEvents = useMemo(
    () =>
      [...events]
        .filter((e) => !isEventPassed(e.date))
        .sort(compareTrending)
        .slice(0, 6),
    [events],
  );

  const greeting = () => {
    if (language === 'patois') return t.greeting;
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <View style={styles.root}>
      {/* ── Top Safe Area header ── */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          {/* Brand + greeting */}
          <View style={styles.headerLeft}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brandName}>VYBZ HUB</Text>
            </View>
            <Text style={styles.greeting} numberOfLines={1}>
              {user ? `${greeting()}, ${firstName}` : 'Discover Jamaica events'}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
            >
              <MaterialIcons name="notifications-none" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/browse' as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Search events"
              accessibilityRole="button"
            >
              <MaterialIcons name="search" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Scrollable content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Search bar */}
        <View style={{ paddingTop: Spacing.base }}>
          <SearchBar onPress={() => router.push('/(tabs)/browse' as any)} />
        </View>

        {/* Quick date chips */}
        <QuickChips
          onToday={() => router.push({ pathname: '/(tabs)/browse', params: { dateFilter: 'today' } } as any)}
          onWeekend={() => router.push({ pathname: '/(tabs)/browse', params: { dateFilter: 'weekend' } } as any)}
          onAll={() => router.push('/(tabs)/browse' as any)}
        />

        {/* ── Error banner ── */}
        {error ? (
          <Pressable
            onPress={() => { clearError(); refreshEvents(); }}
            style={styles.errorBanner}
          >
            <MaterialIcons name="wifi-off" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <View style={styles.retryChip}>
              <MaterialIcons name="refresh" size={13} color={Colors.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </View>
          </Pressable>
        ) : null}

        {/* ── Featured Events ── */}
        <View style={styles.section}>
          <SectionHeader
            title={t.featuredEvents ?? 'Featured Events'}
            subtitle="Handpicked highlights"
            onSeeAll={() => router.push('/featured-events' as any)}
          />
          {isLoading && featured.length === 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              <SkeletonCard style={{ width: 300 }} />
              <SkeletonCard style={{ width: 300 }} />
            </ScrollView>
          ) : featured.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRail}
              style={styles.negMargin}
            >
              {featured.map((event) => (
                <EventCardFeatured key={event.id} event={event} />
              ))}
            </ScrollView>
          ) : !isLoading ? (
            <View style={styles.emptyRail}>
              <MaterialIcons name="event-available" size={28} color={Colors.textMuted} />
              <Text style={styles.emptyRailText}>No featured events right now</Text>
            </View>
          ) : null}
        </View>

        {/* ── Ad ── */}
        <PlacementAd placementName="Home Feed" style={styles.adSpace} />

        {/* ── Trending Now ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending Now"
            icon="local-fire-department"
            iconColor="#FF6B35"
            onSeeAll={() => router.push('/(tabs)/browse' as any)}
          />
          {isLoading && trendingEvents.length === 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              <SkeletonCard style={{ width: SCREEN_WIDTH * 0.58 }} />
              <SkeletonCard style={{ width: SCREEN_WIDTH * 0.58 }} />
            </ScrollView>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRail}
              style={styles.negMargin}
            >
              {trendingEvents.map((event, idx) => (
                <TrendingCard
                  key={event.id}
                  event={event}
                  rank={idx + 1}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Browse by Category ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Explore Categories"
            onSeeAll={() => router.push('/(tabs)/browse' as any)}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRail}
            style={styles.negMargin}
          >
            {EVENT_TYPES.map((type) => (
              <CategoryPill
                key={type.id}
                id={type.id}
                label={type.label}
                icon={type.icon}
                color={type.color}
                onPress={() => router.push({ pathname: '/(tabs)/browse', params: { type: type.id } } as any)}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Near You ── */}
        {nearYouEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={`Near You · ${user?.homeParish}`}
              icon="place"
              iconColor={Colors.primary}
              onSeeAll={() =>
                router.push({ pathname: '/(tabs)/browse', params: { parish: user?.homeParish } } as any)
              }
            />
            {nearYouEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isGoing={userGoingIds.includes(event.id)}
                isInterested={userInterestedIds.includes(event.id)}
                onToggleGoing={() => toggleGoing(event.id)}
                onToggleInterested={() => toggleInterested(event.id)}
              />
            ))}
          </View>
        )}

        {/* ── Browse by Parish ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Browse by Parish"
            onSeeAll={() => router.push('/(tabs)/map' as any)}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.parishRail}
            style={styles.negMargin}
          >
            {PARISHES.slice(0, 8).map((parish) => (
              <ParishChip
                key={parish}
                name={parish}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/browse', params: { parish } } as any)
                }
              />
            ))}
            <Pressable
              onPress={() => router.push('/(tabs)/browse' as any)}
              style={({ pressed }) => [par.chip, { borderColor: Colors.primaryBorder, backgroundColor: Colors.primarySoft }, pressed && { opacity: 0.8 }]}
            >
              <Text style={{ fontSize: Typography.xs, color: Colors.primary, fontWeight: Typography.semibold }}>+6 more</Text>
              <MaterialIcons name="arrow-forward" size={12} color={Colors.primary} />
            </Pressable>
          </ScrollView>
        </View>

        {/* ── This Week ── */}
        {thisWeekEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Coming Up This Week"
              subtitle={`${thisWeekEvents.length} events`}
              onSeeAll={() => router.push('/(tabs)/browse' as any)}
            />
            {isLoading && thisWeekEvents.length === 0 ? (
              <>
                <SkeletonRow hasAvatar style={{ marginBottom: Spacing.sm }} />
                <SkeletonRow hasAvatar style={{ marginBottom: Spacing.sm }} />
                <SkeletonRow hasAvatar />
              </>
            ) : (
              thisWeekEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isGoing={userGoingIds.includes(event.id)}
                  isInterested={userInterestedIds.includes(event.id)}
                  onToggleGoing={() => toggleGoing(event.id)}
                  onToggleInterested={() => toggleInterested(event.id)}
                />
              ))
            )}
          </View>
        )}

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  safeTop: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    ...Shadows.header,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 60,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  brandName: {
    fontSize: Typography.sm,
    fontWeight: Typography.black,
    color: Colors.primary,
    letterSpacing: 2.5,
  },
  greeting: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  notifBadgeText: { fontSize: 8, fontWeight: Typography.black, color: '#fff' },

  // Scroll
  scroll: { paddingBottom: Spacing.xxl },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorSoft,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.error, lineHeight: 18 },
  retryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  retryText: { fontSize: 11, color: Colors.primary, fontWeight: Typography.bold },

  // Sections
  section: {
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.xl,
  },
  negMargin: {
    marginHorizontal: -Spacing.base,
  },
  hRail: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  categoryRail: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  parishRail: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },

  adSpace: { marginHorizontal: Spacing.base, marginBottom: Spacing.xl },

  // Empty states
  emptyRail: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  emptyRailText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
});
