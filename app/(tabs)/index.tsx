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
import { LegacyColors as Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { EVENT_TYPES, PARISHES, formatCount, isEventPassed, Event, TYPE_COLORS } from '../../constants/data';
import { compareTrending } from '../../constants/rankingUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Section Header ────────────────────────────────────────────────────────────
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
          <MaterialIcons name={icon} size={18} color={iconColor ?? Colors.gold} />
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
          <MaterialIcons name="arrow-forward" size={13} color={Colors.gold} />
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
  accent: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  title: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 4 },
  seeAllText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Category Pill ─────────────────────────────────────────────────────────────
function CategoryPill({
  label, icon, color, onPress,
}: { label: string; icon: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cat.pill, pressed && { opacity: 0.8 }]}
    >
      <View style={[cat.iconBg, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={cat.label} numberOfLines={1}>{label}</Text>
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
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    minHeight: 40,
  },
  iconBg: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
});

// ─── Parish Chip ───────────────────────────────────────────────────────────────
function ParishChip({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [par.chip, pressed && { opacity: 0.8 }]}
    >
      <MaterialIcons name="place" size={11} color={Colors.gold} />
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
  },
  text: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
});

// ─── Trending Card ─────────────────────────────────────────────────────────────
function TrendingCard({ event, rank, onPress }: { event: Event; rank: number; onPress: () => void }) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const heat = event.goingCount + event.interestedCount;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trend.card, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel={`#${rank} ${event.title}`}
    >
      <View style={trend.imgWrap}>
        <Image source={{ uri: event.coverImage }} style={trend.img} contentFit="cover" transition={200} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={StyleSheet.absoluteFillObject} />
        <View style={trend.rankBadge}>
          <Text style={trend.rankText}>#{rank}</Text>
        </View>
        <View style={[trend.pricePill, isFree && trend.pricePillFree]}>
          <Text style={trend.priceText}>{isFree ? 'Free' : event.ticketPrice}</Text>
        </View>
      </View>
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
    width: SCREEN_WIDTH * 0.56,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  imgWrap: { height: 130, position: 'relative' },
  img: { width: '100%', height: '100%' },
  rankBadge: {
    position: 'absolute', top: Spacing.sm, left: Spacing.sm,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm,
    paddingVertical: 3, borderRadius: Radius.full,
  },
  rankText: { fontSize: 10, fontWeight: Typography.black, color: Colors.textOnGold },
  pricePill: {
    position: 'absolute', bottom: Spacing.sm, right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pricePillFree: { backgroundColor: Colors.green },
  priceText: { fontSize: 10, fontWeight: Typography.bold, color: '#fff' },
  info: { padding: Spacing.md, gap: 4 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typeDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  typeText: { fontSize: 10, fontWeight: Typography.semibold, flex: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heatText: { fontSize: 10, color: '#FF6B35', fontWeight: Typography.bold },
});

// ─── Main Home Screen ──────────────────────────────────────────────────────────
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
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brandName}>VYBZ HUB</Text>
            </View>
            {user ? (
              <Text style={styles.greeting} numberOfLines={1}>
                {greeting()}, {firstName}
              </Text>
            ) : (
              <Text style={styles.greeting}>Discover Jamaica events</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Notifications"
            >
              <MaterialIcons name="notifications-none" size={22} color={Colors.textSecondary} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/browse' as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Search"
            >
              <MaterialIcons name="search" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Scrollable content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
          />
        }
      >
        {/* Error banner */}
        {error ? (
          <Pressable
            onPress={() => { clearError(); refreshEvents(); }}
            style={styles.errorBanner}
          >
            <MaterialIcons name="wifi-off" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}

        {/* Featured Events */}
        <View style={styles.section}>
          <SectionHeader
            title={t.featuredEvents ?? 'Featured Events'}
            subtitle="Handpicked highlights"
            onSeeAll={() => router.push('/featured-events' as any)}
          />
          {isLoading && featured.length === 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              <SkeletonCard style={{ width: 280 }} />
              <SkeletonCard style={{ width: 280 }} />
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

        {/* Ad */}
        <PlacementAd placementName="Home Feed" style={styles.adSpace} />

        {/* Trending Now */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending Now"
            icon="local-fire-department"
            iconColor="#FF6B35"
            onSeeAll={() => router.push('/(tabs)/browse' as any)}
          />
          {isLoading && trendingEvents.length === 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              <SkeletonCard style={{ width: SCREEN_WIDTH * 0.56 }} />
              <SkeletonCard style={{ width: SCREEN_WIDTH * 0.56 }} />
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

        {/* Explore Categories */}
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
                label={type.label}
                icon={type.icon}
                color={type.color}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/browse', params: { type: type.id } } as any)
                }
              />
            ))}
          </ScrollView>
        </View>

        {/* Near You */}
        {nearYouEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={`Near You · ${user?.homeParish}`}
              icon="place"
              iconColor={Colors.gold}
              onSeeAll={() =>
                router.push({
                  pathname: '/(tabs)/browse',
                  params: { parish: user?.homeParish },
                } as any)
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

        {/* Browse by Parish */}
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
          </ScrollView>
        </View>

        {/* This Week */}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  safeTop: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.gold },
  brandName: {
    fontSize: Typography.xs,
    fontWeight: Typography.black,
    color: Colors.gold,
    letterSpacing: 2.5,
  },
  greeting: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: -1, right: -1,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2, borderColor: Colors.surface,
  },
  notifBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  scroll: { paddingBottom: Spacing.xxl },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    margin: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.error },
  retryText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.xl },
  negMargin: { marginHorizontal: -Spacing.base },
  hRail: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.md },
  categoryRail: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.sm },
  parishRail: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.sm, flexDirection: 'row', alignItems: 'center' },

  adSpace: { marginHorizontal: Spacing.base, marginBottom: Spacing.xl },

  emptyRail: {
    height: 130,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  emptyRailText: { fontSize: Typography.sm, color: Colors.textMuted },
});
