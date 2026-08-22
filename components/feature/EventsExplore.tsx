
// ─── EventsExplore ────────────────────────────────────────────────────────────
// Discovery-first events experience. Search bar lives in browse.tsx shell.
// Internal views:
//   discover    – parish rail + category rail + happening soon / trending
//   allParishes – full 14-parish 2-col grid
//   results     – filtered list with compact filter chips
//
// All filter capabilities (parish, category, date, upcoming/past) are preserved
// but moved into results mode so the default screen stays discovery-oriented.

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

import { getParishImage } from '../../constants/parishImages';
import { useEvents } from '../../hooks/useEvents';
import { useCategories } from '../../hooks/useCategories';
import { EventCard } from './EventCard';
import { isToday, isEventPassed, isThisWeekend } from '../../constants/data';
import { compareBrowse } from '../../constants/rankingUtils';
import { PlacementAd } from '../ui/PlacementAd';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ViewState = 'discover' | 'allParishes' | 'results';
type TimeScope = 'upcoming' | 'past';
type DateFilter = 'all' | 'today' | 'weekend';
const ALL = '__all__';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Show ~2.5 cards so the next one peeks at the edge
const PARISH_CARD_WIDTH = Math.round((SCREEN_WIDTH - Spacing.base * 2 - Spacing.sm * 2) / 2.5);
// Category cards: 96–110px, 2 pixels wider than business cards for label room
const CAT_CARD_WIDTH = 100;

interface EventsExploreProps {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  initialParish?: string;
  initialType?: string;
  initialDateFilter?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function matchesTimeScope(dateStr: string, scope: TimeScope) {
  const passed = isEventPassed(dateStr);
  return scope === 'upcoming' ? !passed : passed;
}

// ─── Display label shortener ──────────────────────────────────────────────────
const EVT_DISPLAY_LABELS: Record<string, string> = {
  'Parties & Festivals': 'Parties',
  'Concerts & Live Music': 'Concerts',
  'Food & Drink': 'Food & Drink',
  'Sports & Fitness': 'Sports',
  'Community & Culture': 'Community',
  'Arts & Entertainment': 'Arts',
  'Business & Networking': 'Networking',
  'Health & Wellness': 'Wellness',
  'Family & Kids': 'Family',
};

function shortLabel(label: string): string {
  return EVT_DISPLAY_LABELS[label] ?? label;
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={sh.action}>{actionLabel}</Text>
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
    marginBottom: 10,
  },
  title: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.1,
  },
  action: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Parish Rail Card ─────────────────────────────────────────────────────────
export const ParishRailCard = memo(function ParishRailCard({
  parish,
  count,
  countLabel,
  countIcon,
  onPress,
}: {
  parish: string;
  count: number;
  countLabel: string; // 'event' | 'business'
  countIcon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [prc.card, { width: PARISH_CARD_WIDTH }, pressed && { opacity: 0.82 }]}
    >
      <Image
        source={getParishImage(parish)}
        style={prc.img}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.80)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={prc.content}>
        <Text style={prc.name} numberOfLines={1}>{parish}</Text>
        {count > 0 ? (
          <View style={prc.countRow}>
            <MaterialIcons name={countIcon as any} size={10} color={Colors.gold} />
            <Text style={prc.count}>
              {count} {countLabel}{count !== 1 ? 's' : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const prc = StyleSheet.create({
  card: {
    height: 100,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
    flexShrink: 0,
  },
  img: { ...StyleSheet.absoluteFillObject },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    gap: 2,
  },
  name: {
    fontSize: 13,
    fontWeight: Typography.bold,
    color: '#fff',
    lineHeight: 17,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Parish Grid Card (all-parishes view) ────────────────────────────────────
export const ParishGridCard = memo(function ParishGridCard({
  parish,
  count,
  countLabel,
  selected,
  onPress,
}: {
  parish: string;
  count: number;
  countLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pgc.card, selected && pgc.cardSelected, pressed && { opacity: 0.82 }]}
    >
      <Image
        source={getParishImage(parish)}
        style={pgc.img}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.80)']}
        style={StyleSheet.absoluteFillObject}
      />
      {selected && (
        <View style={pgc.checkOverlay}>
          <MaterialIcons name="check-circle" size={18} color={Colors.gold} />
        </View>
      )}
      <View style={pgc.content}>
        <Text style={pgc.name} numberOfLines={1}>{parish}</Text>
        {count > 0 ? (
          <Text style={pgc.count}>{count} {countLabel}{count !== 1 ? 's' : ''}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const pgc = StyleSheet.create({
  card: {
    flex: 1,
    height: 90,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  cardSelected: { borderColor: Colors.gold, borderWidth: 2 },
  img: { ...StyleSheet.absoluteFillObject },
  checkOverlay: { position: 'absolute', top: 7, right: 7, zIndex: 2 },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    gap: 1,
  },
  name: { fontSize: 12, fontWeight: Typography.bold, color: '#fff' },
  count: { fontSize: 10, color: `${Colors.gold}CC`, fontWeight: Typography.medium },
});

// ─── Category Rail Card (shared between Events + Businesses) ──────────────────
export const ExploreCategoryCard = memo(function ExploreCategoryCard({
  icon,
  color,
  label,
  selected,
  onPress,
}: {
  icon: string;
  color: string;
  label: string; // already shortened by caller
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        crc.card,
        { width: CAT_CARD_WIDTH, borderColor: selected ? color : `${color}33` },
        selected && { backgroundColor: `${color}18` },
        pressed && { opacity: 0.82 },
      ]}
    >
      <View style={[crc.iconRing, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon as any} size={26} color={color} />
      </View>
      <Text
        style={[crc.label, { color: selected ? color : Colors.textSecondary }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {selected && <View style={[crc.activeDot, { backgroundColor: color }]} />}
    </Pressable>
  );
});

const crc = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    minHeight: 98,
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  iconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: Typography.semibold,
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: 2,
  },
  activeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});

// ─── Boosted Event Card ───────────────────────────────────────────────────────
const BoostedCard = memo(function BoostedCard({
  event,
  onPress,
}: {
  event: any;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bst.card, pressed && { opacity: 0.88 }]}
    >
      <Image source={{ uri: event.coverImage }} style={bst.img} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.68)']} style={StyleSheet.absoluteFillObject} />
      <View style={bst.pill}>
        <MaterialIcons name="rocket-launch" size={9} color={Colors.textOnGold} />
        <Text style={bst.pillText}>Boosted</Text>
      </View>
      <View style={bst.content}>
        <Text style={bst.title} numberOfLines={2}>{event.title}</Text>
        <View style={bst.meta}>
          <MaterialIcons name="place" size={10} color={Colors.gold} />
          <Text style={bst.metaTxt}>{event.parish}</Text>
          <Text style={bst.dot}>·</Text>
          <Text style={bst.metaTxt}>{event.ticketPrice}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const bst = StyleSheet.create({
  card: {
    width: 210,
    height: 135,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: `${Colors.gold}55`,
    flexShrink: 0,
  },
  img: { ...StyleSheet.absoluteFillObject },
  pill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pillText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textOnGold },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    gap: 3,
  },
  title: { fontSize: 13, fontWeight: Typography.bold, color: '#fff', lineHeight: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  dot: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main EventsExplore
// ─────────────────────────────────────────────────────────────────────────────
export default function EventsExplore({
  searchQuery,
  onSearchChange,
  initialParish,
  initialType,
  initialDateFilter,
}: EventsExploreProps) {
  const router = useRouter();
  const {
    events,
    userGoingIds,
    userInterestedIds,
    toggleGoing,
    toggleInterested,
    getBoostedEvents,
    refreshEvents,
    error,
    clearError,
  } = useEvents();
  const { parishes, eventTypes } = useCategories();

  // ── View state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>(() => {
    if (initialParish || initialType || initialDateFilter) return 'results';
    return 'discover';
  });

  // ── Filter state ────────────────────────────────────────────────────────────
  const [timeScope, setTimeScope] = useState<TimeScope>('upcoming');
  const [selectedParish, setSelectedParish] = useState<string>(initialParish ?? ALL);
  const [selectedType, setSelectedType] = useState<string>(initialType ?? ALL);
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    if (initialDateFilter === 'today') return 'today';
    if (initialDateFilter === 'weekend') return 'weekend';
    return 'all';
  });

  const [refreshing, setRefreshing] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  // Drive results view from parent search changes
  useEffect(() => {
    if (searchQuery.trim()) {
      if (view !== 'results') setView('results');
    } else if (!searchQuery.trim() && selectedParish === ALL && selectedType === ALL) {
      if (view === 'results' && dateFilter === 'all' && timeScope === 'upcoming') {
        setView('discover');
      }
    }
  }, [searchQuery, selectedParish, selectedType, dateFilter, timeScope, view]); // Corrected dependencies

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishes.forEach((p) => { counts[p] = 0; });
    events.filter((e) => matchesTimeScope(e.date, 'upcoming')).forEach((e) => {
      if (counts[e.parish] !== undefined) counts[e.parish]++;
    });
    return counts;
  }, [events, parishes]);

  // ── Filtered + sorted results ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (!matchesTimeScope(e.date, timeScope)) return false;
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matches =
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          e.address.toLowerCase().includes(q) ||
          e.promoterName.toLowerCase().includes(q) ||
          e.parish.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedParish !== ALL && e.parish !== selectedParish) return false;
      if (selectedType !== ALL) {
        const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
        if (!types.includes(selectedType)) return false;
      }
      if (timeScope === 'upcoming' && dateFilter !== 'all') {
        if (dateFilter === 'today' && !isToday(e.date)) return false;
        if (dateFilter === 'weekend' && !isThisWeekend(e.date)) return false;
      }
      return true;
    });
  }, [events, searchQuery, selectedParish, selectedType, dateFilter, timeScope]);

  const sorted = useMemo(() => [...filtered].sort(compareBrowse), [filtered]);

  const boostedEvents = useMemo(
    () => getBoostedEvents().filter((e) => matchesTimeScope(e.date, 'upcoming')),
    [getBoostedEvents]
  );

  const trendingEvents = useMemo(() => {
    return events
      .filter((e) => matchesTimeScope(e.date, 'upcoming'))
      .sort(compareBrowse)
      .slice(0, 8);
  }, [events]);

  const activeFilterCount =
    (selectedParish !== ALL ? 1 : 0) +
    (selectedType !== ALL ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (timeScope === 'past' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    setSelectedParish(ALL);
    setSelectedType(ALL);
    setDateFilter('all');
    setTimeScope('upcoming');
    onSearchChange('');
    setView('discover');
  }, [onSearchChange]);

  const handleParishSelect = useCallback((parish: string) => {
    // Navigate to dedicated Event Parish discovery page
    router.push({ pathname: '/explore/event-parish', params: { parish } } as any);
  }, [router]);

  const handleTypeSelect = useCallback((typeId: string) => {
    // Navigate to dedicated Event Category discovery page
    const type = eventTypes.find((t) => t.id === typeId);
    if (type) {
      router.push({
        pathname: '/explore/event-category',
        params: { typeId, typeLabel: type.label, typeIcon: type.icon, typeColor: type.color },
      } as any);
    } else {
      setSelectedType((prev) => (prev === typeId ? ALL : typeId));
      if (view !== 'results') setView('results');
    }
  }, [router, eventTypes, view]);

  const clearAllFilters = useCallback(() => {
    setSelectedParish(ALL);
    setSelectedType(ALL);
    setDateFilter('all');
    setTimeScope('upcoming');
    onSearchChange('');
    setView('discover');
  }, [onSearchChange]);

  const renderResult = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <>
        <EventCard
          event={item}
          variant="row"
          isGoing={userGoingIds.includes(item.id)}
          isInterested={userInterestedIds.includes(item.id)}
          onToggleGoing={() => { if (!toggleGoing(item.id)) setShowAuthPrompt(true); }}
          onToggleInterested={() => { if (!toggleInterested(item.id)) setShowAuthPrompt(true); }}
        />
        {/* Small ad every 8 results — below discovery content, never at top */}
        {(index + 1) % 8 === 0 && index < sorted.length - 1 && (
          <PlacementAd
            placementName="Browse Results"
            style={{ marginHorizontal: Spacing.base, marginVertical: Spacing.sm }}
          />
        )}
      </>
    ),
    [userGoingIds, userInterestedIds, toggleGoing, toggleInterested, sorted.length]
  );

  const errorBanner = error ? (
    <View style={s.errorBanner}>
      <MaterialIcons name="wifi-off" size={14} color="#FF4444" />
      <Text style={s.errorText} numberOfLines={1}>{error}</Text>
      <Pressable onPress={() => { clearError(); refreshEvents(); }} hitSlop={8}>
        <Text style={s.retryText}>Retry</Text>
      </Pressable>
    </View>
  ) : null;

  // ─── VIEW: DISCOVER ──────────────────────────────────────────────────────────
  if (view === 'discover') {
    return (
      <View style={s.flex}>
        {errorBanner}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.discoverContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.gold}
              colors={[Colors.gold]}
            />
          }
        >
          <Text style={s.discoverHeading}>Discover Events</Text>

          {/* Browse by Parish */}
          <View style={s.section}>
            <SectionHeader
              title="Browse by Parish"
              actionLabel="View all"
              onAction={() => router.push('/explore/event-parishes' as any)}
            />
            <View style={s.railOuterWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                contentContainerStyle={s.railContent}
              >
                {parishes.slice(0, 8).map((parish) => (
                  <ParishRailCard
                    key={parish}
                    parish={parish}
                    count={parishCounts[parish] ?? 0}
                    countLabel="event"
                    countIcon="event"
                    onPress={() => handleParishSelect(parish)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Browse by Category */}
          <View style={s.section}>
            <SectionHeader
              title="Browse by Category"
              actionLabel="View all"
              onAction={() => router.push('/explore/event-categories' as any)}
            />
            <View style={s.railOuterWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                contentContainerStyle={s.catRailContent}
              >
                {eventTypes.map((type) => (
                  <ExploreCategoryCard
                    key={type.id}
                    icon={type.icon}
                    color={type.color}
                    label={shortLabel(type.label)}
                    selected={false}
                    onPress={() => handleTypeSelect(type.id)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Boosted Events */}
          {boostedEvents.length > 0 && (
            <View style={s.section}>
              <SectionHeader title="🚀 Boosted Events" />
              <View style={s.railOuterWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.boostedRailContent}
                >
                  {boostedEvents.map((event) => (
                    <BoostedCard
                      key={event.id}
                      event={event}
                      onPress={() => router.push(`/event/${event.id}` as any)}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Happening Soon */}
          {trendingEvents.length > 0 ? (
            <View style={s.section}>
              {/* AdMob banner — between Boosted Events / Parish+Category rails and Happening Soon list */}
              <SectionHeader
                title="Happening Soon"
                actionLabel={
                  events.filter((e) => matchesTimeScope(e.date, 'upcoming')).length > 8
                    ? 'See all'
                    : undefined
                }
                onAction={() => { setView('results'); }}
              />
              <View style={s.eventList}>
                {trendingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="row"
                    isGoing={userGoingIds.includes(event.id)}
                    isInterested={userInterestedIds.includes(event.id)}
                    onToggleGoing={() => {
                      if (!toggleGoing(event.id)) setShowAuthPrompt(true);
                    }}
                    onToggleInterested={() => {
                      if (!toggleInterested(event.id)) setShowAuthPrompt(true);
                    }}
                  />
                ))}
              </View>
              {events.filter((e) => matchesTimeScope(e.date, 'upcoming')).length > 8 && (
                <Pressable style={s.seeAllBtn} onPress={() => setView('results')}>
                  <Text style={s.seeAllText}>See All Events</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
                </Pressable>
              )}
              {/* Ad placement — after discovery content, not before */}
              <PlacementAd
                placementName="Browse Events"
                style={{ marginTop: Spacing.base, borderRadius: Radius.lg }}
              />
            </View>
          ) : (
            <View style={s.emptyDiscover}>
              <MaterialIcons name="event" size={36} color={Colors.textMuted} />
              <Text style={s.emptyDiscoverTitle}>No upcoming events yet</Text>
              <Text style={s.emptyDiscoverSub}>Check back soon for new events across Jamaica.</Text>
            </View>
          )}

          <View style={{ height: Spacing.xxl * 3 }} />
        </ScrollView>

        {authPromptModal(showAuthPrompt, () => setShowAuthPrompt(false), router)}
      </View>
    );
  }

  // ─── VIEW: ALL PARISHES ──────────────────────────────────────────────────────
  if (view === 'allParishes') {
    return (
      <View style={s.flex}>
        <View style={s.innerHeader}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.innerTitle}>Browse by Parish</Text>
          <View style={{ width: 36 }} />
        </View>
        <FlatList
          data={parishes as unknown as string[]}
          keyExtractor={(p) => p}
          numColumns={2}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.allParishesContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={s.gridSubLabel}>
              {parishes.length} parishes · {events.filter((e) => matchesTimeScope(e.date, 'upcoming')).length} upcoming events
            </Text>
          }
          renderItem={({ item: parish }) => (
            <ParishGridCard
              parish={parish}
              count={parishCounts[parish] ?? 0}
              countLabel="event"
              selected={selectedParish === parish}
              onPress={() => handleParishSelect(parish)}
            />
          )}
          ListFooterComponent={<View style={{ height: Spacing.xxl * 3 }} />}
        />
      </View>
    );
  }

  // ─── VIEW: RESULTS ────────────────────────────────────────────────────────────
  const activeType = selectedType !== ALL ? eventTypes.find((t) => t.id === selectedType) : null;

  const resultTitle = (() => {
    if (activeType && selectedParish !== ALL) return `${activeType.label} in ${selectedParish}`;
    if (activeType) return activeType.label;
    if (selectedParish !== ALL) return selectedParish;
    if (searchQuery.trim()) return `"${searchQuery.trim()}"`;
    return timeScope === 'past' ? 'Past Events' : 'All Events';
  })();

  return (
    <View style={s.flex}>
      {/* Inner header */}
      <View style={s.innerHeader}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={s.innerTitleWrap}>
          <Text style={s.innerTitle} numberOfLines={1}>{resultTitle}</Text>
          <Text style={s.innerSubtitle}>
            {sorted.length} event{sorted.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {errorBanner}

      {/* Category filter strip */}
      <View style={s.stripOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.stripContent}
        >
          <Pressable
            onPress={() => setSelectedType(ALL)}
            style={[s.filterChip, selectedType === ALL && s.filterChipAll]}
          >
            <MaterialIcons name="apps" size={12} color={selectedType === ALL ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.filterChipText, selectedType === ALL && s.filterChipTextActive]}>All</Text>
          </Pressable>
          {eventTypes.map((type) => {
            const active = selectedType === type.id;
            return (
              <Pressable
                key={type.id}
                onPress={() => setSelectedType(active ? ALL : type.id)}
                style={[s.filterChip, active && { backgroundColor: type.color, borderColor: type.color }]}
              >
                <MaterialIcons name={type.icon as any} size={12} color={active ? '#fff' : type.color} />
                <Text style={[s.filterChipText, active && { color: '#fff', fontWeight: Typography.bold }]}>
                  {shortLabel(type.label)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Scope + date strip */}
      <View style={s.stripOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stripContent}>
          {([
            { key: 'upcoming', label: 'Upcoming', icon: 'upcoming' },
            { key: 'past', label: 'Past', icon: 'history' },
          ] as const).map(({ key, label, icon }) => (
            <Pressable
              key={key}
              onPress={() => setTimeScope(key)}
              style={[s.filterChip, timeScope === key && s.filterChipAll]}
            >
              <MaterialIcons name={icon as any} size={12} color={timeScope === key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[s.filterChipText, timeScope === key && s.filterChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
          <View style={s.chipDivider} />
          {timeScope === 'upcoming' &&
            ([
              { key: 'all', label: 'Any Date', icon: 'date-range' },
              { key: 'today', label: 'Today', icon: 'today' },
              { key: 'weekend', label: 'Weekend', icon: 'weekend' },
            ] as const).map(({ key, label, icon }) => (
              <Pressable
                key={key}
                onPress={() => setDateFilter(key)}
                style={[s.filterChip, dateFilter === key && s.filterChipAll]}
              >
                <MaterialIcons name={icon as any} size={12} color={dateFilter === key ? Colors.textOnGold : Colors.textMuted} />
                <Text style={[s.filterChipText, dateFilter === key && s.filterChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          {selectedParish !== ALL && (
            <Pressable onPress={() => setSelectedParish(ALL)} style={[s.filterChip, s.filterChipParish]}>
              <MaterialIcons name="place" size={12} color={Colors.gold} />
              <Text style={[s.filterChipText, { color: Colors.gold }]}>{selectedParish}</Text>
              <MaterialIcons name="close" size={10} color={Colors.gold} />
            </Pressable>
          )}
        </ScrollView>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderResult}
        contentContainerStyle={s.resultsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
          />
        }
        ListHeaderComponent={
          <View>
            {boostedEvents.length > 0 && selectedParish !== ALL && (
              <View style={s.boostedSection}>
                <View style={s.boostedSectionHeader}>
                  <MaterialIcons name="rocket-launch" size={13} color={Colors.gold} />
                  <Text style={s.boostedSectionTitle}>Boosted</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.boostedRailContent}>
                  {boostedEvents
                    .filter((e) => selectedParish === ALL || e.parish === selectedParish)
                    .map((event) => (
                      <BoostedCard key={event.id} event={event} onPress={() => router.push(`/event/${event.id}` as any)} />
                    ))}
                </ScrollView>
              </View>
            )}
            <View style={s.resultsHeader}>
              <Text style={s.resultsCount}>
                {sorted.length} {timeScope === 'past' ? 'past ' : ''}event{sorted.length !== 1 ? 's' : ''}
              </Text>
              {activeFilterCount > 0 && (
                <Pressable onPress={clearAllFilters} style={s.clearBtn}>
                  <MaterialIcons name="filter-list-off" size={13} color={Colors.gold} />
                  <Text style={s.clearBtnText}>Clear ({activeFilterCount})</Text>
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <MaterialIcons name={timeScope === 'past' ? 'history' : 'search-off'} size={36} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>
              {timeScope === 'past' ? 'No past events found' : 'No events found'}
            </Text>
            <Text style={s.emptySub}>
              {timeScope === 'past'
                ? 'Past events will appear here once events have occurred.'
                : 'Try adjusting your search or filters.'}
            </Text>
            {activeFilterCount > 0 && (
              <Pressable onPress={clearAllFilters} style={s.emptyActionBtn}>
                <Text style={s.emptyActionText}>Clear All Filters</Text>
              </Pressable>
            )}
          </View>
        }
        ListFooterComponent={<View style={{ height: Spacing.xxl * 3 }} />}
      />

      {authPromptModal(showAuthPrompt, () => setShowAuthPrompt(false), router)}
    </View>
  );
}

// ─── Auth Prompt Modal ────────────────────────────────────────────────────────
function authPromptModal(
  visible: boolean,
  onDismiss: () => void,
  router: ReturnType<typeof useRouter>
) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={auth.overlay} onPress={onDismiss}>
        <Pressable style={auth.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={auth.handle} />
          <View style={auth.iconWrap}>
            <MaterialIcons name="how-to-reg" size={32} color={Colors.gold} />
          </View>
          <Text style={auth.title}>Sign In to RSVP</Text>
          <Text style={auth.body}>
            Create a free account or sign in to mark Going or Interested, save events, and sync across devices.
          </Text>
          <Pressable
            onPress={() => { onDismiss(); router.push('/auth' as any); }}
            style={({ pressed }) => [auth.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={auth.primaryBtnInner}
            >
              <MaterialIcons name="login" size={16} color={Colors.textOnGold} />
              <Text style={auth.primaryBtnText}>Sign In / Register</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onDismiss} style={auth.dismissBtn}>
            <Text style={auth.dismissText}>Not Now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const auth = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, marginBottom: Spacing.xs },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: `${Colors.gold}44`,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  body: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  primaryBtn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden' },
  primaryBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  primaryBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  dismissBtn: { paddingVertical: Spacing.sm },
  dismissText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    marginBottom: 0,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.22)',
  },
  errorText: { flex: 1, fontSize: 11, color: '#FF7777' },
  retryText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },

  // ── Discover ──
  discoverContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  discoverHeading: {
    fontSize: 22,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  section: { marginBottom: 22 },

  // Rail: pull to full bleed so next card peeks
  railOuterWrap: { marginHorizontal: -Spacing.base },
  railContent: {
    paddingHorizontal: Spacing.base,
    gap: 10,
    paddingBottom: 2,
    paddingRight: Spacing.base + PARISH_CARD_WIDTH * 0.4, // ensures last card fully visible
  },
  catRailContent: {
    paddingHorizontal: Spacing.base,
    gap: 10,
    paddingBottom: 2,
  },
  boostedRailContent: {
    gap: 10,
    paddingBottom: 2,
  },

  eventList: { gap: 0 },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    backgroundColor: Colors.goldSurface,
  },
  seeAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  emptyDiscover: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyDiscoverTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptyDiscoverSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // ── All parishes ──
  innerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  innerTitleWrap: { flex: 1, alignItems: 'center' },
  innerTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  innerSubtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  allParishesContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  gridRow: { gap: Spacing.sm },
  gridSubLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },

  // ── Results ──
  stripOuter: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  stripContent: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm + 2,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipAll: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterChipParish: {
    borderColor: `${Colors.gold}55`,
    backgroundColor: Colors.goldSurface,
  },
  filterChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  filterChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  chipDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: 2,
  },

  resultsList: { paddingTop: Spacing.xs, paddingBottom: Spacing.xxl * 3 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  resultsCount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  clearBtnText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },

  boostedSection: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  boostedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  boostedSectionTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.gold,
  },

  empty: {
    alignItems: 'center',
    paddingTop: Spacing.xxl * 2,
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyActionBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    marginTop: Spacing.xs,
  },
  emptyActionText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
