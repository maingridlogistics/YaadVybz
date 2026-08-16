import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
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
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatCount, isEventPassed, Event, TYPE_COLORS } from '../../constants/data';
import { compareTrending } from '../../constants/rankingUtils';
import {
  searchBusinesses,
  fetchBusinessCategories,
  BusinessSearchResult,
  BusinessCategory,
} from '../../services/businessService';

const { width } = Dimensions.get('window');

// ─── Home Business card (compact horizontal rail) ─────────────────────────────
// Roughly 160×200px — visual, quick to scan, clearly distinct from Event cards.
// contextParish: when set and serves_parish is true, shows "Serves {contextParish}"
// so the label reflects WHY this business appears in the current section, not its
// absolute primary location.
const HomeBizCard = memo(function HomeBizCard({
  biz,
  onPress,
  contextParish,
}: {
  biz: BusinessSearchResult;
  onPress: () => void;
  contextParish?: string;
}) {
  const locationStr = biz.serves_parish
    ? `Serves ${contextParish ?? biz.primary_parish}`
    : biz.town
    ? `${biz.town}`
    : biz.primary_parish;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [hbc.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${biz.name}, ${biz.category_label}`}
    >
      {/* Cover / logo image */}
      <View style={hbc.imgWrap}>
        {biz.cover_url ?? biz.logo_url ? (
          <Image
            source={{ uri: (biz.cover_url ?? biz.logo_url)! }}
            style={hbc.img}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[hbc.img, hbc.imgPlaceholder]}>
            <MaterialIcons name={biz.category_icon as any} size={32} color={biz.category_color} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Category dot badge */}
        <View style={[hbc.catBadge, { backgroundColor: biz.category_color }]}>
          <MaterialIcons name={biz.category_icon as any} size={9} color="#fff" />
        </View>
        {/* Verified badge */}
        {biz.verified ? (
          <View style={hbc.verifiedBadge}>
            <MaterialIcons name="verified" size={11} color={Colors.gold} />
          </View>
        ) : null}
      </View>

      {/* Info */}
      <View style={hbc.info}>
        <Text style={hbc.name} numberOfLines={1}>{biz.name}</Text>
        <Text style={[hbc.catLabel, { color: biz.category_color }]} numberOfLines={1}>
          {biz.category_label}
        </Text>
        <View style={hbc.locationRow}>
          <MaterialIcons
            name={biz.serves_parish ? 'near-me' : 'place'}
            size={10}
            color={biz.serves_parish ? Colors.info : Colors.textMuted}
          />
          <Text
            style={[hbc.location, biz.serves_parish && { color: Colors.info }]}
            numberOfLines={1}
          >
            {locationStr}
          </Text>
        </View>
        {biz.avg_rating != null && biz.avg_rating > 0 ? (
          <View style={hbc.ratingRow}>
            <MaterialIcons name="star" size={10} color={Colors.gold} />
            <Text style={hbc.rating}>{biz.avg_rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const hbc = StyleSheet.create({
  card: {
    width: 152,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    flexShrink: 0,
  },
  imgWrap: { height: 108, position: 'relative' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  catBadge: {
    position: 'absolute', top: Spacing.sm, left: Spacing.sm,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute', top: Spacing.sm, right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  info: { padding: Spacing.sm, gap: 3 },
  name: { fontSize: 13, fontWeight: Typography.bold, color: Colors.textPrimary },
  catLabel: { fontSize: 10, fontWeight: Typography.semibold },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  location: { fontSize: 10, color: Colors.textMuted, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  rating: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold },
});

// ─── Trending Card (compact horizontal — unchanged) ───────────────────────────
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
    position: 'absolute', top: Spacing.sm, left: Spacing.sm,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: Radius.full,
  },
  rankText: { fontSize: 11, fontWeight: Typography.black, color: Colors.textOnGold },
  info: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  typeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  meta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  heatText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
});

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  icon,
  iconColor,
  barColor,
  seeAllLabel = 'See All',
  onSeeAll,
}: {
  title: string;
  icon?: string;
  iconColor?: string;
  barColor?: string;
  seeAllLabel?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={sth.row}>
      <View style={sth.titleRow}>
        <View style={[sth.bar, { backgroundColor: barColor ?? Colors.gold }]} />
        {icon ? (
          <MaterialIcons name={icon as any} size={18} color={iconColor ?? Colors.gold} />
        ) : null}
        <Text style={sth.title}>{title}</Text>
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={sth.seeAll}>{seeAllLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const sth = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bar: { width: 3, height: 18, borderRadius: 2 },
  title: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  seeAll: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },
});

// ─── Business Category Shortcut pill ─────────────────────────────────────────
const BizCatPill = memo(function BizCatPill({
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
      style={({ pressed }) => [bcp.pill, { borderColor: `${color}40` }, pressed && { opacity: 0.8 }]}
    >
      <View style={[bcp.iconBg, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[bcp.label, { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
});
const bcp = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1.5, minHeight: 44,
  },
  iconBg: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: Typography.xs, fontWeight: Typography.semibold, maxWidth: 90 },
});

// ─── Popular business ranking ─────────────────────────────────────────────────
// Score = featured_priority*4 + view_count*0.01 + avg_rating*20 + review_count*2
// Ensures featured/highly-viewed businesses surface; rating is secondary signal.
function rankBusinesses(businesses: BusinessSearchResult[]): BusinessSearchResult[] {
  return [...businesses].sort((a, b) => {
    const scoreA =
      (a.view_count ?? 0) * 0.01 +
      (a.avg_rating ?? 0) * 20 +
      (a.review_count ?? 0) * 2;
    const scoreB =
      (b.view_count ?? 0) * 0.01 +
      (b.avg_rating ?? 0) * 20 +
      (b.review_count ?? 0) * 2;
    return scoreB - scoreA;
  });
}

// ─── CATEGORY SHORTCUTS config ────────────────────────────────────────────────
// 5 high-value shortcuts for Home; "More" navigates to full directory.
// These slugs are stable — they match business_categories.slug in DB.
const CAT_SHORTCUTS = [
  { slug: 'barber',        icon: 'content-cut',   color: '#FFD700', label: 'Barbers'      },
  { slug: 'restaurant',   icon: 'restaurant',    color: '#FF6B35', label: 'Restaurants'  },
  { slug: 'beauty-hair',  icon: 'face',           color: '#E91E63', label: 'Beauty'       },
  { slug: 'automotive',   icon: 'directions-car', color: '#607D8B', label: 'Automotive'   },
  { slug: 'bar-nightlife',icon: 'local-bar',      color: '#9C27B0', label: 'Bars'         },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Home Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const { events, getFeaturedEvents, userGoingIds, userInterestedIds, toggleGoing, toggleInterested, refreshEvents, isLoading, error, clearError } = useEvents();
  const { unreadCount } = useNotifications();
  const { t, language } = useLanguage();
  const router = useRouter();

  const featured = useMemo(() => getFeaturedEvents(), [getFeaturedEvents]);
  const [refreshing, setRefreshing] = useState(false);

  // ── Business state ──────────────────────────────────────────────────────────
  const [popularBusinesses, setPopularBusinesses] = useState<BusinessSearchResult[]>([]);
  const [parishBusinesses, setParishBusinesses] = useState<BusinessSearchResult[]>([]);
  const [bizCategories, setBizCategories] = useState<BusinessCategory[]>([]);
  const [bizLoading, setBizLoading] = useState(true);
  const [parishBizLoading, setParishBizLoading] = useState(true);
  const [bizError, setBizError] = useState(false);

  const homeParish = user?.homeParish ?? null;

  // ── Load business data ─────────────────────────────────────────────────────
  const loadBusinessData = useCallback(async () => {
    setBizLoading(true);
    setBizError(false);
    try {
      const [catsResult, popularResult] = await Promise.all([
        fetchBusinessCategories(),
        searchBusinesses({ limit: 12, offset: 0 }),
      ]);
      setBizCategories(catsResult);
      setPopularBusinesses(rankBusinesses(popularResult.results).slice(0, 8));
    } catch {
      setBizError(true);
    } finally {
      setBizLoading(false);
    }
  }, []);

  const loadParishBusinesses = useCallback(async (parish: string) => {
    setParishBizLoading(true);
    try {
      const { results } = await searchBusinesses({ parish, limit: 6, offset: 0 });
      setParishBusinesses(results);
    } catch {
      setParishBusinesses([]);
    } finally {
      setParishBizLoading(false);
    }
  }, []);

  useEffect(() => { loadBusinessData(); }, [loadBusinessData]);

  useEffect(() => {
    if (homeParish) {
      loadParishBusinesses(homeParish);
    } else {
      setParishBizLoading(false);
    }
  }, [homeParish, loadParishBusinesses]);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshEvents(),
      loadBusinessData(),
      homeParish ? loadParishBusinesses(homeParish) : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  // ── Event computations ─────────────────────────────────────────────────────
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
      homeParish
        ? events.filter((e) => e.parish === homeParish && !isEventPassed(e.date)).slice(0, 4)
        : [],
    [events, homeParish]
  );

  const trendingEvents = useMemo(
    () => [...events].filter((e) => !isEventPassed(e.date)).sort(compareTrending).slice(0, 6),
    [events]
  );

  // ── Category shortcut navigation ──────────────────────────────────────────
  const handleCatShortcut = useCallback((slug: string) => {
    const cat = bizCategories.find((c) => c.slug === slug);
    if (cat) {
      router.push({
        pathname: '/explore/business-category',
        params: { categoryId: cat.id, categoryLabel: cat.label, categoryIcon: cat.icon, categoryColor: cat.color },
      } as any);
    } else {
      router.push('/explore/business-categories' as any);
    }
  }, [bizCategories, router]);

  // ── Greeting ───────────────────────────────────────────────────────────────
  const greeting = () => {
    if (language === 'patois') return t.greeting;
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
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
              <Text style={styles.greeting}>Discover events & businesses across Jamaica</Text>
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
        {/* ── Network Error Banner ── */}
        {error ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="wifi-off" size={16} color="#FF4444" />
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            <Pressable
              onPress={() => { clearError(); refreshEvents(); }}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="refresh" size={14} color={Colors.gold} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Quick Date Shortcuts ── */}
        <View style={styles.quickRow}>
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/browse', params: { dateFilter: 'today' } } as any)}
            style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="today" size={15} color={Colors.gold} />
            <Text style={styles.quickChipText}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/browse', params: { dateFilter: 'weekend' } } as any)}
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

        {/* ── 1. Featured Events ── */}
        <View style={styles.section}>
          <SectionHeader
            title={t.featuredEvents}
            onSeeAll={() => router.push('/featured-events' as any)}
          />
          {isLoading && featured.length === 0 ? (
            <View style={styles.skeletonFeatured}>
              <ActivityIndicator size="small" color={Colors.gold} />
            </View>
          ) : featured.length > 0 ? (
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
          ) : !isLoading ? (
            <View style={styles.skeletonFeatured}>
              <MaterialIcons name="event-available" size={32} color={Colors.textMuted} />
              <Text style={styles.skeletonText}>No featured events right now</Text>
            </View>
          ) : null}
        </View>

        {/* ── Home Feed Ad ── */}
        <PlacementAd placementName="Home Feed" style={styles.homeFeedAd} />

        {/* ── 2. Trending Now ── */}
        <View style={styles.section}>
          <SectionHeader
            title={t.trendingNow}
            icon="local-fire-department"
            iconColor="#FF6B35"
            barColor="#FF6B35"
            onSeeAll={() => router.push('/(tabs)/browse' as any)}
          />
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
        </View>

        {/* ── 3. Popular Businesses ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Popular Businesses"
            icon="storefront"
            iconColor={Colors.gold}
            onSeeAll={() => router.push('/explore/business-parishes' as any)}
          />
          {bizLoading ? (
            <View style={styles.bizRailLoader}>
              <ActivityIndicator size="small" color={Colors.gold} />
            </View>
          ) : bizError || popularBusinesses.length === 0 ? (
            <View style={styles.bizEmptySmall}>
              <Text style={styles.bizEmptyText}>
                {bizError ? 'Could not load businesses.' : 'No businesses listed yet.'}
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/browse' as any)}
                style={styles.discoverLink}
              >
                <Text style={styles.discoverLinkText}>Explore Businesses →</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              style={styles.bizRailScroll}
              contentContainerStyle={styles.bizRailContent}
            >
              {popularBusinesses.map((biz) => (
                <HomeBizCard
                  key={biz.id}
                  biz={biz}
                  onPress={() => router.push(`/business/${biz.id}` as any)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── 4. Near You · [Home Parish] (Events) ── */}
        {nearYouEvents.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title={`Near You · ${homeParish}`}
              onSeeAll={() => router.push({
                pathname: '/explore/event-parish',
                params: { parish: homeParish },
              } as any)}
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
        ) : null}

        {/* ── 5. Find a Business (category shortcut rail) ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Find a Business"
            icon="category"
            iconColor={Colors.gold}
            seeAllLabel="More"
            onSeeAll={() => router.push('/explore/business-categories' as any)}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catShortcutRow}
          >
            {CAT_SHORTCUTS.map((cat) => (
              <BizCatPill
                key={cat.slug}
                icon={cat.icon}
                label={cat.label}
                color={cat.color}
                onPress={() => handleCatShortcut(cat.slug)}
              />
            ))}
            <BizCatPill
              key="__more__"
              icon="apps"
              label="More"
              color={Colors.textSecondary}
              onPress={() => router.push('/explore/business-categories' as any)}
            />
          </ScrollView>
        </View>

        {/* ── 6. Happening This Week (Events) ── */}
        {thisWeekEvents.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Happening This Week"
              icon="event"
              iconColor={Colors.gold}
              onSeeAll={() => router.push('/(tabs)/browse' as any)}
            />
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
          </View>
        ) : null}

        {/* ── 7. Businesses in Home Parish (or Discover CTA) ── */}
        {homeParish ? (
          <View style={styles.section}>
            <SectionHeader
              title={`Businesses in ${homeParish}`}
              icon="place"
              iconColor={Colors.gold}
              onSeeAll={() => router.push({ pathname: '/explore/business-parish', params: { parish: homeParish } } as any)}
            />
            {parishBizLoading ? (
              <View style={styles.bizRailLoader}>
                <ActivityIndicator size="small" color={Colors.gold} />
              </View>
            ) : parishBusinesses.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                style={styles.bizRailScroll}
                contentContainerStyle={styles.bizRailContent}
              >
                {parishBusinesses.map((biz) => (
                  // contextParish ensures service-area businesses show "Serves Manchester"
                  // rather than "Serves Clarendon" (their actual primary parish).
                  <HomeBizCard
                    key={biz.id}
                    biz={biz}
                    contextParish={homeParish}
                    onPress={() => router.push(`/business/${biz.id}` as any)}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.bizEmptySmall}>
                <Text style={styles.bizEmptyText}>No businesses listed in {homeParish} yet.</Text>
                <Pressable
                  onPress={() => router.push({ pathname: '/explore/business-parish', params: { parish: homeParish } } as any)}
                  style={styles.discoverLink}
                >
                  <Text style={styles.discoverLinkText}>Be the first to list →</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          // No home parish — show Jamaica-wide discovery CTA
          !bizLoading && popularBusinesses.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Discover Businesses"
                icon="explore"
                iconColor={Colors.gold}
                onSeeAll={() => router.push('/(tabs)/browse' as any)}
              />
              <Pressable
                onPress={() => router.push('/(tabs)/browse' as any)}
                style={({ pressed }) => [styles.discoverBizCta, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[Colors.goldSurface, Colors.surface]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.discoverBizCtaInner}
                >
                  <MaterialIcons name="storefront" size={22} color={Colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.discoverBizCtaTitle}>Explore Local Businesses</Text>
                    <Text style={styles.discoverBizCtaSub}>Find barbers, restaurants, beauty and more across Jamaica</Text>
                  </View>
                  <MaterialIcons name="arrow-forward" size={18} color={Colors.gold} />
                </LinearGradient>
              </Pressable>
            </View>
          ) : null
        )}

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  logo: { fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.gold, letterSpacing: 3 },
  greeting: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, position: 'relative',
  },
  topBtnRow: { flexDirection: 'row', gap: Spacing.sm },
  bellBadge: {
    position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  section: { marginBottom: Spacing.lg + Spacing.sm },

  // Quick shortcuts
  quickRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg + Spacing.sm, flexWrap: 'nowrap' },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full, backgroundColor: Colors.goldSurface,
    borderWidth: 1.5, borderColor: `${Colors.gold}44`, minHeight: 44,
  },
  quickChipOutline: { backgroundColor: Colors.surface, borderColor: Colors.surfaceBorder },
  quickChipText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  // Featured events
  featuredScroll: { marginHorizontal: -Spacing.base },
  featuredList: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  skeletonFeatured: {
    height: 200, alignItems: 'center', justifyContent: 'center',
    marginHorizontal: -Spacing.base, backgroundColor: Colors.surface,
    marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  skeletonText: { fontSize: Typography.xs, color: Colors.textMuted },

  // Ad
  homeFeedAd: { marginBottom: Spacing.md },

  // Trending
  trendingScroll: { marginHorizontal: -Spacing.base },
  trendingList: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.md },

  // Business rail
  bizRailScroll: { marginHorizontal: -Spacing.base },
  bizRailContent: {
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm,
    gap: Spacing.md, flexDirection: 'row',
  },
  bizRailLoader: { height: 168, alignItems: 'center', justifyContent: 'center' },
  bizEmptySmall: { paddingVertical: Spacing.md, gap: Spacing.sm },
  bizEmptyText: { fontSize: Typography.xs, color: Colors.textMuted },
  discoverLink: { alignSelf: 'flex-start' },
  discoverLinkText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  // Find a Business shortcuts
  catShortcutRow: { gap: Spacing.sm, paddingBottom: Spacing.xs, flexDirection: 'row' },

  // Discover Businesses CTA (no-parish fallback)
  discoverBizCta: { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${Colors.gold}22` },
  discoverBizCtaInner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  discoverBizCtaTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  discoverBizCtaSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
    marginBottom: Spacing.sm,
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: '#FF7777', lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  retryText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
});
