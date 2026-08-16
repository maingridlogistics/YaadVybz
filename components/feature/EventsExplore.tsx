// ─── EventsExplore ────────────────────────────────────────────────────────────
// Unified Events discovery experience inside the Explore tab.
// Internal view states match BusinessExplore:
//   discover    – parish image rail + category rail + trending
//   allParishes – full 14-parish 2-column grid
//   results     – filtered event list with compact filter chips
//
// All existing filter capabilities (parish, category, date, upcoming/past,
// search) are preserved — only the presentation is restructured.

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  memo,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { getParishImage } from '../../constants/parishImages';
import { useEvents } from '../../hooks/useEvents';
import { useCategories } from '../../hooks/useCategories';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { EventCard } from './EventCard';
import { isToday, isEventPassed, isThisWeekend } from '../../constants/data';
import { compareBrowse } from '../../constants/rankingUtils';
import { PlacementAd } from '../ui/PlacementAd';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ViewState = 'discover' | 'allParishes' | 'results';
type TimeScope = 'upcoming' | 'past';
type DateFilter = 'all' | 'today' | 'weekend';
const ALL = '__all__';

interface EventsExploreProps {
  initialParish?: string;
  initialType?: string;
  initialDateFilter?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function matchesTimeScope(dateStr: string, scope: TimeScope) {
  const passed = isEventPassed(dateStr);
  return scope === 'upcoming' ? !passed : passed;
}

// ─── Shared Section Header ────────────────────────────────────────────────────
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
        <Pressable onPress={onAction} hitSlop={6}>
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
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  action: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
});

// ─── Parish Rail Card (same style as BusinessExplore) ─────────────────────────
const ParishRailCard = memo(function ParishRailCard({
  parish,
  count,
  onPress,
}: {
  parish: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [prc.card, pressed && { opacity: 0.82 }]}
    >
      <Image
        source={getParishImage(parish)}
        style={prc.img}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.78)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={prc.content}>
        <Text style={prc.name}>{parish}</Text>
        {count > 0 ? (
          <View style={prc.countRow}>
            <MaterialIcons name="event" size={10} color={Colors.gold} />
            <Text style={prc.count}>
              {count} event{count !== 1 ? 's' : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
const prc = StyleSheet.create({
  card: {
    width: 130,
    height: 96,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
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
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#fff',
    lineHeight: 16,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { fontSize: 10, color: Colors.gold, fontWeight: Typography.medium },
});

// ─── Parish Grid Card (all-parishes view) ─────────────────────────────────────
const ParishGridCard = memo(function ParishGridCard({
  parish,
  count,
  selected,
  onPress,
}: {
  parish: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        pgc.card,
        selected && pgc.cardSelected,
        pressed && { opacity: 0.82 },
      ]}
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
        <View style={pgc.selectedOverlay}>
          <MaterialIcons name="check-circle" size={18} color={Colors.gold} />
        </View>
      )}
      <View style={pgc.content}>
        <Text style={pgc.name} numberOfLines={1}>{parish}</Text>
        {count > 0 ? (
          <Text style={pgc.count}>{count} event{count !== 1 ? 's' : ''}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});
const pgc = StyleSheet.create({
  card: {
    flex: 1,
    height: 88,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  cardSelected: { borderColor: Colors.gold, borderWidth: 2 },
  img: { ...StyleSheet.absoluteFillObject },
  selectedOverlay: { position: 'absolute', top: 7, right: 7, zIndex: 2 },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    gap: 1,
  },
  name: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
  count: { fontSize: 10, color: `${Colors.gold}CC`, fontWeight: Typography.medium },
});

// ─── Category Rail Card ───────────────────────────────────────────────────────
// Display label shortener — keeps UI tidy without touching DB slugs
const DISPLAY_LABELS: Record<string, string> = {
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
  return DISPLAY_LABELS[label] ?? label;
}

const CategoryRailCard = memo(function CategoryRailCard({
  icon,
  color,
  label,
  selected,
  onPress,
}: {
  icon: string;
  color: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const display = shortLabel(label);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        crc.card,
        { borderColor: selected ? color : `${color}35` },
        selected && { backgroundColor: `${color}1A` },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[crc.iconBg, { backgroundColor: `${color}1F` }]}>
        <MaterialIcons name={icon as any} size={24} color={color} />
      </View>
      <Text
        style={[crc.label, { color: selected ? color : Colors.textSecondary }]}
        numberOfLines={2}
      >
        {display}
      </Text>
      {selected && (
        <View style={[crc.dot, { backgroundColor: color }]} />
      )}
    </Pressable>
  );
});
const crc = StyleSheet.create({
  card: {
    width: 88,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    minHeight: 92,
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: Typography.semibold,
    textAlign: 'center',
    lineHeight: 13,
  },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});

// ─── Boosted Event Card ───────────────────────────────────────────────────────
function BoostedCard({ event, onPress }: { event: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bc.card, pressed && { opacity: 0.88 }]}
    >
      <Image source={{ uri: event.coverImage }} style={bc.img} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
      <View style={bc.badge}>
        <MaterialIcons name="rocket-launch" size={9} color={Colors.textOnGold} />
        <Text style={bc.badgeText}>Boosted</Text>
      </View>
      <View style={bc.content}>
        <Text style={bc.title} numberOfLines={2}>{event.title}</Text>
        <View style={bc.meta}>
          <MaterialIcons name="place" size={10} color={Colors.gold} />
          <Text style={bc.metaText}>{event.parish}</Text>
          <Text style={bc.dot}>·</Text>
          <Text style={bc.metaText}>{event.ticketPrice}</Text>
        </View>
      </View>
    </Pressable>
  );
}
const bc = StyleSheet.create({
  card: {
    width: 200,
    height: 130,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: `${Colors.gold}55`,
  },
  img: { ...StyleSheet.absoluteFillObject },
  badge: {
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
  badgeText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textOnGold },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    gap: 3,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff', lineHeight: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  dot: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main EventsExplore
// ─────────────────────────────────────────────────────────────────────────────

export default function EventsExplore({
  initialParish,
  initialType,
  initialDateFilter,
}: EventsExploreProps) {
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested, getBoostedEvents, refreshEvents, error, clearError } = useEvents();
  const { parishes, eventTypes } = useCategories();
  const { user } = useAuth();

  // ── View state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>(() => {
    if (initialParish || initialType || initialDateFilter) return 'results';
    return 'discover';
  });

  // ── Filter state ────────────────────────────────────────────────────────────
  const [timeScope, setTimeScope] = useState<TimeScope>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedParish, setSelectedParish] = useState<string>(initialParish ?? ALL);
  const [selectedType, setSelectedType] = useState<string>(initialType ?? ALL);
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    if (initialDateFilter === 'today') return 'today';
    if (initialDateFilter === 'weekend') return 'weekend';
    return 'all';
  });

  const [refreshing, setRefreshing] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishes.forEach((p) => { counts[p] = 0; });
    events.filter((e) => matchesTimeScope(e.date, timeScope)).forEach((e) => {
      if (counts[e.parish] !== undefined) counts[e.parish]++;
    });
    return counts;
  }, [events, timeScope, parishes]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    eventTypes.forEach((t) => { counts[t.id] = 0; });
    events.filter((e) => matchesTimeScope(e.date, timeScope)).forEach((e) => {
      (e.eventTypes ?? [e.type]).forEach((tid: string) => { if (counts[tid] !== undefined) counts[tid]++; });
    });
    return counts;
  }, [events, timeScope, eventTypes]);

  // ── Filtered + sorted results ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (!matchesTimeScope(e.date, timeScope)) return false;
      const q = search.trim().toLowerCase();
      const matchSearch = q === '' || e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q) || e.address.toLowerCase().includes(q) || e.promoterName.toLowerCase().includes(q) || e.parish.toLowerCase().includes(q);
      const matchParish = selectedParish === ALL || e.parish === selectedParish;
      const matchType = selectedType === ALL || e.type === selectedType || (Array.isArray(e.eventTypes) && e.eventTypes.includes(selectedType));
      const matchDate = timeScope === 'past' ? true : (dateFilter === 'all' || (dateFilter === 'today' && isToday(e.date)) || (dateFilter === 'weekend' && isThisWeekend(e.date)));
      return matchSearch && matchParish && matchType && matchDate;
    });
  }, [events, search, selectedParish, selectedType, dateFilter, timeScope]);

  const sorted = useMemo(() => [...filtered].sort(compareBrowse), [filtered]);

  const boostedEvents = useMemo(
    () => getBoostedEvents().filter((e) => matchesTimeScope(e.date, timeScope)),
    [getBoostedEvents, timeScope]
  );

  // ── Trending events for discover view ──────────────────────────────────────
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
    (timeScope === 'past' ? 1 : 0);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const goBack = useCallback(() => setView('discover'), []);

  const handleParishSelect = useCallback((parish: string) => {
    setSelectedParish(parish);
    setSelectedType(ALL);
    setDateFilter('all');
    setView('results');
  }, []);

  const handleTypeSelect = useCallback((typeId: string) => {
    setSelectedType((prev) => prev === typeId ? ALL : typeId);
    if (view !== 'results') setView('results');
  }, [view]);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (text.trim() && view !== 'results') setView('results');
    else if (!text.trim() && selectedParish === ALL && selectedType === ALL) setView('discover');
  }, [view, selectedParish, selectedType]);

  const clearFilters = useCallback(() => {
    setSelectedParish(ALL);
    setSelectedType(ALL);
    setDateFilter('all');
    setSearch('');
    setTimeScope('upcoming');
    setView('discover');
  }, []);

  const renderResult = useCallback(({ item, index }: { item: any; index: number }) => (
    <>
      <EventCard
        event={item}
        variant="row"
        isGoing={userGoingIds.includes(item.id)}
        isInterested={userInterestedIds.includes(item.id)}
        onToggleGoing={() => { if (!toggleGoing(item.id)) setShowAuthPrompt(true); }}
        onToggleInterested={() => { if (!toggleInterested(item.id)) setShowAuthPrompt(true); }}
      />
      {(index + 1) % 6 === 0 && index < sorted.length - 1 && (
        <PlacementAd placementName="Browse Results" style={{ marginHorizontal: Spacing.base, marginVertical: Spacing.sm }} />
      )}
    </>
  ), [userGoingIds, userInterestedIds, toggleGoing, toggleInterested, sorted.length]);

  // ── Shared search bar ───────────────────────────────────────────────────────
  const searchBar = (
    <View style={s.searchBar}>
      <MaterialIcons name="search" size={20} color={Colors.textMuted} />
      <TextInput
        style={s.searchInput}
        placeholder="Search events, venues, promoters..."
        placeholderTextColor={Colors.textMuted}
        value={search}
        onChangeText={handleSearchChange}
        returnKeyType="search"
        accessibilityLabel="Search events"
      />
      {search.length > 0 && (
        <Pressable onPress={() => handleSearchChange('')} hitSlop={8}>
          <MaterialIcons name="close" size={17} color={Colors.textMuted} />
        </Pressable>
      )}
    </View>
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
        <View style={s.searchPad}>{searchBar}</View>
        {errorBanner}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.discoverContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
        >
          <Text style={s.discoverHeading}>Discover Events</Text>

          {/* Browse by Parish */}
          <View style={s.section}>
            <SectionHeader
              title="Browse by Parish"
              actionLabel="View all"
              onAction={() => setView('allParishes')}
            />
            <View style={s.railWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.rail}
              >
                {parishes.slice(0, 8).map((parish) => (
                  <ParishRailCard
                    key={parish}
                    parish={parish}
                    count={parishCounts[parish] ?? 0}
                    onPress={() => handleParishSelect(parish)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Browse by Category */}
          <View style={s.section}>
            <SectionHeader title="Browse by Category" />
            <View style={s.railWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.categoryRail}
              >
                {eventTypes.map((type) => (
                  <CategoryRailCard
                    key={type.id}
                    icon={type.icon}
                    color={type.color}
                    label={type.label}
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
              <SectionHeader title="Boosted Events" />
              <View style={s.railWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.boostedRail}
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

          {/* Trending / Happening Soon */}
          {trendingEvents.length > 0 && (
            <View style={s.section}>
              <SectionHeader
                title="Happening Soon"
                actionLabel={events.length > 8 ? 'See all' : undefined}
                onAction={() => setView('results')}
              />
              <View style={s.eventList}>
                {trendingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="row"
                    isGoing={userGoingIds.includes(event.id)}
                    isInterested={userInterestedIds.includes(event.id)}
                    onToggleGoing={() => { if (!toggleGoing(event.id)) setShowAuthPrompt(true); }}
                    onToggleInterested={() => { if (!toggleInterested(event.id)) setShowAuthPrompt(true); }}
                  />
                ))}
              </View>
              {events.filter(e => matchesTimeScope(e.date, 'upcoming')).length > 8 && (
                <Pressable style={s.seeAllBtn} onPress={() => setView('results')}>
                  <Text style={s.seeAllText}>See All Events</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
                </Pressable>
              )}
            </View>
          )}

          {trendingEvents.length === 0 && (
            <View style={s.emptyDiscover}>
              <MaterialIcons name="event" size={36} color={Colors.textMuted} />
              <Text style={s.emptyDiscoverTitle}>No upcoming events yet</Text>
              <Text style={s.emptyDiscoverSub}>Check back soon for new events.</Text>
            </View>
          )}

          <View style={{ height: Spacing.xxl * 3 }} />
        </ScrollView>

        {/* Auth prompt */}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
          ListHeaderComponent={
            <Text style={s.gridSubLabel}>
              {parishes.length} parishes · {events.filter(e => matchesTimeScope(e.date, timeScope)).length} {timeScope} events
            </Text>
          }
          renderItem={({ item: parish }) => (
            <ParishGridCard
              parish={parish}
              count={parishCounts[parish] ?? 0}
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
  const activeType = selectedType !== ALL ? eventTypes.find(t => t.id === selectedType) : null;

  const resultTitle = (() => {
    if (activeType && selectedParish !== ALL) return `${activeType.label} in ${selectedParish}`;
    if (activeType) return activeType.label;
    if (selectedParish !== ALL) return selectedParish;
    if (search.trim()) return `"${search.trim()}"`;
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
          <Text style={s.innerSubtitle}>{sorted.length} event{sorted.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {searchBar}
      {errorBanner}

      {/* Category filter strip */}
      <View style={s.catStripOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catStrip}>
          <Pressable
            onPress={() => setSelectedType(ALL)}
            style={[s.catChip, selectedType === ALL && s.catChipAllActive]}
          >
            <MaterialIcons name="apps" size={12} color={selectedType === ALL ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.catChipText, selectedType === ALL && s.catChipTextActive]}>All</Text>
          </Pressable>
          {eventTypes.map((type) => {
            const isActive = selectedType === type.id;
            return (
              <Pressable
                key={type.id}
                onPress={() => setSelectedType(isActive ? ALL : type.id)}
                style={[s.catChip, isActive && { backgroundColor: type.color, borderColor: type.color }]}
              >
                <MaterialIcons name={type.icon as any} size={12} color={isActive ? '#fff' : type.color} />
                <Text style={[s.catChipText, isActive && { color: '#fff', fontWeight: Typography.bold }]}>
                  {shortLabel(type.label)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Scope + date compact strip */}
      <View style={s.scopeStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scopeContent}>
          {/* Upcoming / Past */}
          {([
            { key: 'upcoming', label: 'Upcoming', icon: 'upcoming' },
            { key: 'past', label: 'Past', icon: 'history' },
          ] as const).map(({ key, label, icon }) => (
            <Pressable
              key={key}
              onPress={() => setTimeScope(key)}
              style={[s.scopeChip, timeScope === key && s.scopeChipActive]}
            >
              <MaterialIcons name={icon as any} size={12} color={timeScope === key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[s.scopeChipText, timeScope === key && s.scopeChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
          <View style={s.scopeDivider} />
          {/* Date filters — upcoming only */}
          {timeScope === 'upcoming' && ([
            { key: 'all', label: 'Any Date', icon: 'date-range' },
            { key: 'today', label: 'Today', icon: 'today' },
            { key: 'weekend', label: 'Weekend', icon: 'weekend' },
          ] as const).map(({ key, label, icon }) => (
            <Pressable
              key={key}
              onPress={() => setDateFilter(key)}
              style={[s.scopeChip, dateFilter === key && timeScope === 'upcoming' && s.scopeChipActive]}
            >
              <MaterialIcons name={icon as any} size={12} color={dateFilter === key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[s.scopeChipText, dateFilter === key && s.scopeChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
          {/* Parish chip */}
          {selectedParish !== ALL && (
            <Pressable onPress={() => setSelectedParish(ALL)} style={[s.scopeChip, s.scopeChipParish]}>
              <MaterialIcons name="place" size={12} color={Colors.gold} />
              <Text style={[s.scopeChipText, { color: Colors.gold }]}>{selectedParish}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
        ListHeaderComponent={
          <View>
            {boostedEvents.length > 0 && (
              <View style={s.boostedSection}>
                <View style={s.boostedHeader}>
                  <MaterialIcons name="rocket-launch" size={13} color={Colors.gold} />
                  <Text style={s.boostedTitle}>Boosted Events</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.boostedRail}>
                  {boostedEvents.map((event) => (
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
                <Pressable onPress={clearFilters} style={s.clearAllBtn}>
                  <MaterialIcons name="filter-list-off" size={13} color={Colors.gold} />
                  <Text style={s.clearAllText}>Clear ({activeFilterCount})</Text>
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <MaterialIcons name={timeScope === 'past' ? 'history' : 'search-off'} size={38} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{timeScope === 'past' ? 'No past events found' : 'No events found'}</Text>
            <Text style={s.emptySub}>
              {timeScope === 'past'
                ? 'Past events will appear here once events have occurred.'
                : 'Try adjusting your filters or search term.'}
            </Text>
            {activeFilterCount > 0 && (
              <Pressable onPress={clearFilters} style={s.clearBtn}>
                <Text style={s.clearBtnText}>Clear All Filters</Text>
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
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.xxl,
    alignItems: 'center', gap: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, marginBottom: Spacing.xs },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: `${Colors.gold}44`,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  body: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  primaryBtn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden' },
  primaryBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  primaryBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  dismissBtn: { paddingVertical: Spacing.sm },
  dismissText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  searchPad: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, height: 48,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    marginHorizontal: Spacing.base, marginBottom: Spacing.xs,
    borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.22)',
  },
  errorText: { flex: 1, fontSize: 11, color: '#FF7777' },
  retryText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },

  // Discover
  discoverContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  discoverHeading: {
    fontSize: Typography.xl, fontWeight: Typography.black,
    color: Colors.textPrimary, marginBottom: Spacing.lg,
  },
  section: { marginBottom: Spacing.lg },
  railWrap: { marginHorizontal: -Spacing.base },
  rail: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: 2 },
  categoryRail: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: 2 },
  boostedRail: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  eventList: { gap: 0 },

  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: `${Colors.gold}33`,
    backgroundColor: Colors.goldSurface,
  },
  seeAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  emptyDiscover: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyDiscoverTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptyDiscoverSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },

  // All parishes
  innerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  innerTitleWrap: { flex: 1, alignItems: 'center' },
  innerTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  innerSubtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  allParishesContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.sm },
  gridRow: { gap: Spacing.sm },
  gridSubLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.xs },

  // Results
  catStripOuter: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  catStrip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs, flexDirection: 'row', alignItems: 'center' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm + 2, height: 32, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  catChipAllActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  catChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  catChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  scopeStrip: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  scopeContent: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs, flexDirection: 'row', alignItems: 'center' },
  scopeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, height: 28, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  scopeChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  scopeChipParish: { borderColor: `${Colors.gold}55`, backgroundColor: Colors.goldSurface },
  scopeChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  scopeChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  scopeDivider: { width: 1, height: 20, backgroundColor: Colors.surfaceBorder, marginHorizontal: 2 },

  resultsList: { paddingTop: Spacing.xs, paddingHorizontal: 0, paddingBottom: Spacing.xxl * 3 },
  resultsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  resultsCount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  clearAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  clearAllText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },

  boostedSection: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  boostedHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  boostedTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl * 2, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  clearBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs,
  },
  clearBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
