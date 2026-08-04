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
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../hooks/useLanguage';
import { EventCardFeatured } from '../../components/feature/EventCardFeatured';
import { EventCard } from '../../components/feature/EventCard';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { EVENT_TYPES, PARISHES, formatCount, isEventPassed } from '../../constants/data';

const { width } = Dimensions.get('window');

// ─── Trending Card (compact horizontal) ──────────────────────────────────────
import { Image } from 'expo-image';
import { Event, TYPE_COLORS } from '../../constants/data';

function TrendingCard({
  event,
  rank,
  onPress,
}: {
  event: Event;
  rank: number;
  onPress: () => void;
}) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const heat = event.goingCount + event.interestedCount;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trendStyles.card, pressed && { opacity: 0.85 }]}
    >
      {/* Cover */}
      <View style={trendStyles.imgWrap}>
        <Image
          source={{ uri: event.coverImage }}
          style={trendStyles.img}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFillObject} />
        <View style={trendStyles.rankBadge}>
          <Text style={trendStyles.rankText}>#{rank}</Text>
        </View>
      </View>
      {/* Info */}
      <View style={trendStyles.info}>
        <View style={[trendStyles.typeDot, { backgroundColor: typeColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={trendStyles.title} numberOfLines={1}>{event.title}</Text>
          <Text style={trendStyles.meta} numberOfLines={1}>
            {event.parish} · {event.venue}
          </Text>
        </View>
        <View style={trendStyles.heatRow}>
          <MaterialIcons name="local-fire-department" size={13} color={Colors.gold} />
          <Text style={trendStyles.heatText}>{formatCount(heat)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const trendStyles = StyleSheet.create({
  card: {
    width: width * 0.72,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  imgWrap: { height: 130, position: 'relative' },
  img: { width: '100%', height: '100%' },
  rankBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  rankText: { fontSize: 11, fontWeight: Typography.black, color: Colors.textOnGold },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  typeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  meta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  heatText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
});

// ─── Main Home Screen ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const { events, getFeaturedEvents, userGoingIds, userInterestedIds, toggleGoing, toggleInterested, refreshEvents } = useEvents();
  const { unreadCount } = useNotifications();
  const { t, language } = useLanguage();
  const router = useRouter();

  const featured = useMemo(() => getFeaturedEvents(), [events]);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  // Events within the next 7 days in Jamaica time, not yet passed
  const thisWeekEvents = useMemo(() => {
    // Jamaica = UTC-5
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
        ? events.filter((e) => e.parish === user.homeParish).slice(0, 4)
        : [],
    [events, user]
  );

  // Trending = top 6 by combined going + interested
  const trendingEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => (b.goingCount + b.interestedCount) - (a.goingCount + a.interestedCount))
        .slice(0, 6),
    [events]
  );

  const greeting = () => {
    if (language === 'patois') return t.greeting;
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const goToBrowseWithFilter = (params: { parish?: string; type?: string }) => {
    // Navigate to browse tab; pass filter via URL params is unreliable across tabs,
    // so we push a browse modal-like route or just push to browse
    router.push({ pathname: '/(tabs)/browse', params });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.logoRow}>
              <View style={styles.logoDot} />
              <Text style={styles.logo}>VYBZ HUB</Text>
            </View>
            {user ? (
              <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="tail">{greeting()}, {user.name.split(' ')[0]}</Text>
            ) : (
              <Text style={styles.greeting}>Discover events across Jamaica</Text>
            )}
          </View>
          <View style={styles.topBtnRow}>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="notifications" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/browse' as any)}
              style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="search" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />
        }
      >

        {/* ── Quick Date Shortcuts ── */}
        <View style={styles.quickRow}>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="today" size={15} color={Colors.gold} />
            <Text style={styles.quickChipText}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="weekend" size={15} color={Colors.gold} />
            <Text style={styles.quickChipText}>This Weekend</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.quickChip, styles.quickChipOutline, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="tune" size={15} color={Colors.textSecondary} />
            <Text style={[styles.quickChipText, { color: Colors.textSecondary }]}>All Filters</Text>
          </Pressable>
        </View>

        {/* ── Featured Events ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.goldBar} />
            <Text style={styles.sectionTitle}>{t.featuredEvents}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/browse' as any)}>
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredList}
          style={styles.featuredScroll}
        >
          {featured.map((event) => (
            <EventCardFeatured key={event.id} event={event} />
          ))}
        </ScrollView>

        {/* ── Home Feed Ad ── */}
        <PlacementAd placementName="Home Feed" style={styles.homeFeedAd} />

        {/* ── Trending Now ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.goldBar, { backgroundColor: '#FF6B35' }]} />
            <MaterialIcons name="local-fire-department" size={18} color="#FF6B35" />
            <Text style={styles.sectionTitle}>{t.trendingNow}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/browse' as any)}>
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingList}
          style={styles.trendingScroll}
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

        {/* ── Browse by Category ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.goldBar} />
            <Text style={styles.sectionTitle}>{t.browseByCategory}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/browse' as any)}>
            <Text style={styles.seeAll}>All</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeRow}
        >
          {EVENT_TYPES.map((type) => (
            <Pressable
              key={type.id}
              onPress={() => router.push({ pathname: '/(tabs)/browse', params: { type: type.id } } as any)}
              style={({ pressed }) => [
                styles.typeChip,
                { borderColor: `${type.color}55` },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.typeIconBg, { backgroundColor: `${type.color}22` }]}>
                <MaterialIcons name={type.icon as any} size={18} color={type.color} />
              </View>
              <Text style={[styles.typeLabel, { color: type.color }]} numberOfLines={1}>{type.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Browse by Parish ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.goldBar} />
            <Text style={styles.sectionTitle}>{t.browseByParish}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/browse' as any)}>
            <Text style={styles.seeAll}>Map</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.parishRow}
        >
          {PARISHES.slice(0, 8).map((parish) => (
            <Pressable
              key={parish}
              onPress={() => router.push({ pathname: '/(tabs)/browse', params: { parish } } as any)}
              style={({ pressed }) => [styles.parishChip, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="place" size={13} color={Colors.gold} />
              <Text style={styles.parishChipText}>{parish}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.parishChip, styles.parishChipMore, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.parishChipMoreText}>+6 more</Text>
            <MaterialIcons name="arrow-forward" size={12} color={Colors.textSecondary} />
          </Pressable>
        </ScrollView>

        {/* ── Near You ── */}
        {nearYouEvents.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.goldBar} />
                <Text style={styles.sectionTitle}>Near You · {user?.homeParish}</Text>
              </View>
              <Pressable onPress={() => router.push({ pathname: '/(tabs)/browse', params: { parish: user?.homeParish } } as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </Pressable>
            </View>
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
          </>
        )}

        {/* ── This Week ── */}
        {thisWeekEvents.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.goldBar} />
                <Text style={styles.sectionTitle}>{t.thisWeek}</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/browse' as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </Pressable>
            </View>
            {thisWeekEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isGoing={userGoingIds.includes(event.id)}
                isInterested={userInterestedIds.includes(event.id)}
                onToggleGoing={() => toggleGoing(event.id)}
                onToggleInterested={() => toggleInterested(event.id)}
              />
            ))}
          </>
        )}

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  logo: { fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.gold, letterSpacing: 3 },
  greeting: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  topBtnRow: { flexDirection: 'row', gap: Spacing.sm },
  bellBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  // Quick shortcuts
  quickRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldSurface,
    borderWidth: 1.5,
    borderColor: `${Colors.gold}44`,
  },
  quickChipOutline: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceBorder,
  },
  quickChipText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.bold,
  },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  seeAll: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },

  featuredScroll: { marginHorizontal: -Spacing.base },
  featuredList: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.lg },

  homeFeedAd: { marginBottom: Spacing.md },

  trendingScroll: { marginHorizontal: -Spacing.base, marginBottom: Spacing.lg },
  trendingList: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },

  // Category chips
  typeRow: { gap: Spacing.sm, paddingBottom: Spacing.lg },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  typeIconBg: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, maxWidth: 110 },

  // Parish chips
  parishRow: { gap: Spacing.sm, paddingBottom: Spacing.lg },
  parishChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  parishChipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  parishChipMore: { borderColor: Colors.surfaceBorder, gap: 4 },
  parishChipMoreText: { fontSize: Typography.xs, color: Colors.textMuted },
});
