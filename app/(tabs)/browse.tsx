import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  Modal,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { EventCard } from '../../components/feature/EventCard';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { SkeletonCard } from '../../components/ui/LoadingState';
import { LegacyColors as Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useCategories } from '../../hooks/useCategories';
import { isToday, isEventPassed, isThisWeekend } from '../../constants/data';
import { compareBrowse } from '../../constants/rankingUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type BrowseMode = 'discover' | 'search';
type DateFilter = 'all' | 'today' | 'weekend';
type TimeScope = 'upcoming' | 'past';

const ALL = '__all__';

const PARISH_IMAGES: Record<string, any> = {
  'Kingston':        require('../../assets/images/parishes/kingston.jpg'),
  'Saint Andrew':    require('../../assets/images/parishes/saint_andrew.jpg'),
  'Saint Thomas':    require('../../assets/images/parishes/saint_thomas.jpg'),
  'Portland':        require('../../assets/images/parishes/portland.jpg'),
  'Saint Mary':      require('../../assets/images/parishes/saint_mary.jpg'),
  'Saint Ann':       require('../../assets/images/parishes/saint_ann.jpg'),
  'Trelawny':        require('../../assets/images/parishes/trelawny.jpg'),
  'Saint James':     require('../../assets/images/parishes/saint_james.jpg'),
  'Hanover':         require('../../assets/images/parishes/hanover.jpg'),
  'Westmoreland':    require('../../assets/images/parishes/westmoreland.jpg'),
  'Saint Elizabeth': require('../../assets/images/parishes/saint_elizabeth.jpg'),
  'Manchester':      require('../../assets/images/parishes/manchester.jpg'),
  'Clarendon':       require('../../assets/images/parishes/clarendon.jpg'),
  'Saint Catherine': require('../../assets/images/parishes/saint_catherine.jpg'),
};

function matchesTimeScope(dateStr: string, scope: TimeScope): boolean {
  return scope === 'upcoming' ? !isEventPassed(dateStr) : isEventPassed(dateStr);
}

// ─── Parish Card ───────────────────────────────────────────────────────────────
function ParishCard({ parish, count, onPress }: { parish: string; count: number; onPress: () => void }) {
  const imageSource = PARISH_IMAGES[parish] ?? PARISH_IMAGES['Kingston'];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pcS.card, pressed && { opacity: 0.88 }]}>
      <Image source={imageSource} style={pcS.img} contentFit="cover" transition={200} cachePolicy="memory-disk" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={StyleSheet.absoluteFillObject} />
      <View style={pcS.content}>
        <Text style={pcS.name}>{parish}</Text>
        <View style={pcS.countRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={pcS.count}>{count} event{count !== 1 ? 's' : ''}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const pcS = StyleSheet.create({
  card: {
    flex: 1, height: 110, borderRadius: Radius.lg,
    overflow: 'hidden', position: 'relative',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  img: { width: '100%', height: '100%' },
  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, gap: 2 },
  name: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Category Tile ─────────────────────────────────────────────────────────────
function CategoryTile({
  label, icon, color, count, onPress,
}: { label: string; icon: string; color: string; count: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ctS.tile, { borderColor: `${color}35` }, pressed && { opacity: 0.85 }]}>
      <View style={[ctS.iconBg, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={24} color={color} />
      </View>
      <Text style={ctS.label} numberOfLines={2}>{label}</Text>
      <View style={[ctS.countPill, { backgroundColor: `${color}18` }]}>
        <Text style={[ctS.countText, { color }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

const ctS = StyleSheet.create({
  tile: {
    width: (SCREEN_WIDTH - Spacing.base * 2 - Spacing.sm * 2) / 3,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    minHeight: 112,
    justifyContent: 'center',
  },
  iconBg: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'center', lineHeight: 16 },
  countPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  countText: { fontSize: 10, fontWeight: Typography.bold },
});

// ─── Boosted Card ──────────────────────────────────────────────────────────────
function BoostedCard({ event, onPress }: { event: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bS.card, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel={`Boosted: ${event.title}`}
    >
      <Image source={{ uri: event.coverImage }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={StyleSheet.absoluteFillObject} />
      <View style={bS.boostBadge}>
        <MaterialIcons name="rocket-launch" size={9} color={Colors.textOnGold} />
        <Text style={bS.boostText}>Boosted</Text>
      </View>
      <View style={bS.content}>
        <Text style={bS.title} numberOfLines={2}>{event.title}</Text>
        <View style={bS.metaRow}>
          <MaterialIcons name="place" size={10} color={Colors.gold} />
          <Text style={bS.meta}>{event.parish}</Text>
          <View style={bS.dot} />
          <Text style={bS.meta}>{event.ticketPrice}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const bS = StyleSheet.create({
  card: {
    width: 180, height: 130, borderRadius: Radius.lg,
    overflow: 'hidden', position: 'relative',
    borderWidth: 1.5, borderColor: `${Colors.gold}44`,
  },
  boostBadge: {
    position: 'absolute', top: Spacing.sm, left: Spacing.sm, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.gold, paddingHorizontal: 7, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  boostText: { fontSize: 9, fontWeight: Typography.black, color: Colors.textOnGold, letterSpacing: 0.3 },
  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff', lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' },
});

// ─── Filter Chip ───────────────────────────────────────────────────────────────
function FilterChip({
  label, icon, active, onPress, color,
}: { label: string; icon?: React.ComponentProps<typeof MaterialIcons>['name']; active: boolean; onPress: () => void; color?: string }) {
  const activeColor = color ?? Colors.gold;
  return (
    <Pressable
      onPress={onPress}
      style={[
        fc.chip,
        active && { backgroundColor: activeColor, borderColor: activeColor },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon ? (
        <MaterialIcons name={icon} size={13} color={active ? Colors.textOnGold : Colors.textSecondary} />
      ) : null}
      <Text style={[fc.text, active && { color: Colors.textOnGold, fontWeight: Typography.bold }]}>{label}</Text>
    </Pressable>
  );
}

const fc = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  text: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
});

// ─── Main Explore Screen ───────────────────────────────────────────────────────
export default function BrowseScreen() {
  const params = useLocalSearchParams<{ parish?: string; type?: string; dateFilter?: string }>();
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested, getBoostedEvents, refreshEvents, error, clearError } = useEvents();
  const { unreadCount } = useNotifications();
  const { parishes, eventTypes } = useCategories();

  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  const [mode, setMode] = useState<BrowseMode>(() =>
    params.parish || params.type || params.dateFilter ? 'search' : 'discover',
  );
  const [timeScope, setTimeScope] = useState<TimeScope>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedParish, setSelectedParish] = useState<string>(params.parish ?? ALL);
  const [selectedType, setSelectedType] = useState<string>(params.type ?? ALL);
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    if (params.dateFilter === 'today') return 'today';
    if (params.dateFilter === 'weekend') return 'weekend';
    return 'all';
  });

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
      (e.eventTypes ?? [e.type]).forEach((tid) => { if (counts[tid] !== undefined) counts[tid]++; });
    });
    return counts;
  }, [events, timeScope, eventTypes]);

  const boostedEvents = useMemo(
    () => getBoostedEvents().filter((e) => matchesTimeScope(e.date, timeScope)),
    [getBoostedEvents, timeScope],
  );

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

  const sortedFiltered = useMemo(() => [...filtered].sort(compareBrowse), [filtered]);

  const activeFilterCount =
    (selectedParish !== ALL ? 1 : 0) +
    (selectedType !== ALL ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0);

  const clearFilters = () => { setSelectedParish(ALL); setSelectedType(ALL); setDateFilter('all'); setSearch(''); };

  const renderResultItem = useCallback(
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
        {(index + 1) % 5 === 0 && index < sortedFiltered.length - 1 && (
          <PlacementAd placementName="Browse Results" style={{ marginHorizontal: 0, marginVertical: Spacing.sm }} />
        )}
      </>
    ),
    [userGoingIds, userInterestedIds, toggleGoing, toggleInterested, sortedFiltered.length],
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.titleBar}>
          <View>
            <Text style={styles.screenTitle}>Explore</Text>
            <Text style={styles.screenSub}>Find your next vybz</Text>
          </View>
          <View style={styles.titleActions}>
            {mode === 'search' && activeFilterCount > 0 && (
              <Pressable onPress={clearFilters} style={styles.clearBtn}>
                <MaterialIcons name="filter-list-off" size={14} color={Colors.gold} />
                <Text style={styles.clearBtnText}>Clear {activeFilterCount}</Text>
              </Pressable>
            )}
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
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={20} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search events, venues, promoters…"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={(v) => { setSearch(v); if (v.trim()) setMode('search'); }}
              onFocus={() => setMode('search')}
              accessibilityLabel="Search events"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Mode tabs */}
        <View style={styles.modeTabs}>
          {([
            { key: 'discover', icon: 'explore' as const, label: 'Discover' },
            { key: 'search',   icon: 'tune'    as const, label: 'Filter & Search' },
          ]).map(({ key, icon, label }) => (
            <Pressable
              key={key}
              onPress={() => setMode(key as BrowseMode)}
              style={[styles.modeTab, mode === key && styles.modeTabActive]}
            >
              <MaterialIcons name={icon} size={14} color={mode === key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.modeTabText, mode === key && styles.modeTabTextActive]}>{label}</Text>
              {key === 'search' && activeFilterCount > 0 && mode !== 'search' && (
                <View style={styles.modeBadge}>
                  <Text style={styles.modeBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Upcoming / Past scope */}
        <View style={styles.scopeRow}>
          {([
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'past',     label: 'Past Events' },
          ] as const).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => { setTimeScope(key); setDateFilter('all'); }}
              style={[styles.scopeBtn, timeScope === key && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeBtnText, timeScope === key && styles.scopeBtnTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {/* Error banner */}
      {error ? (
        <Pressable
          onPress={() => { clearError(); refreshEvents(); }}
          style={styles.errorBanner}
        >
          <MaterialIcons name="wifi-off" size={15} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}

      {/* DISCOVER MODE */}
      {mode === 'discover' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.discoverContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
        >
          {boostedEvents.length > 0 && (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <MaterialIcons name="rocket-launch" size={15} color={Colors.gold} />
                <Text style={styles.blockTitle}>Boosted Events</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boostedRail}>
                {boostedEvents.map((ev) => (
                  <BoostedCard key={ev.id} event={ev} onPress={() => router.push(`/event/${ev.id}` as any)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Parish grid */}
          <View style={styles.block}>
            <View style={styles.blockHeader}>
              <MaterialIcons name="place" size={15} color={Colors.gold} />
              <Text style={styles.blockTitle}>Browse by Parish</Text>
              <Text style={styles.blockMeta}>{parishes.length} parishes</Text>
            </View>
            {(() => {
              const rows: string[][] = [];
              for (let i = 0; i < parishes.length; i += 2) rows.push(parishes.slice(i, i + 2));
              return rows.map((row, ri) => (
                <View key={ri} style={styles.parishRow}>
                  {row.map((parish) => (
                    <ParishCard
                      key={parish}
                      parish={parish}
                      count={parishCounts[parish] ?? 0}
                      onPress={() => { setSelectedParish(parish); setMode('search'); }}
                    />
                  ))}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              ));
            })()}
          </View>

          {/* Category grid */}
          <View style={styles.block}>
            <View style={styles.blockHeader}>
              <MaterialIcons name="category" size={15} color={Colors.gold} />
              <Text style={styles.blockTitle}>Browse by Category</Text>
              <Text style={styles.blockMeta}>{eventTypes.length} categories</Text>
            </View>
            <View style={styles.categoryGrid}>
              {eventTypes.map((type) => (
                <CategoryTile
                  key={type.id}
                  label={type.label}
                  icon={type.icon}
                  color={type.color}
                  count={typeCounts[type.id] ?? 0}
                  onPress={() => { setSelectedType(type.id); setMode('search'); }}
                />
              ))}
            </View>
          </View>

          <View style={{ height: Spacing.xxl * 2 }} />
        </ScrollView>
      )}

      {/* SEARCH / FILTER MODE */}
      {mode === 'search' && (
        <View style={{ flex: 1 }}>
          {timeScope === 'upcoming' && (
            <View style={styles.filterStrip}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripRow}>
                <FilterChip label="All Dates" icon="date-range" active={dateFilter === 'all'} onPress={() => setDateFilter('all')} />
                <FilterChip label="Today" icon="today" active={dateFilter === 'today'} onPress={() => setDateFilter('today')} />
                <FilterChip label="Weekend" icon="weekend" active={dateFilter === 'weekend'} onPress={() => setDateFilter('weekend')} />
              </ScrollView>
            </View>
          )}

          <View style={styles.filterStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripRow}>
              <FilterChip label="All Parishes" active={selectedParish === ALL} onPress={() => setSelectedParish(ALL)} />
              {parishes.map((p) => (
                <FilterChip
                  key={p}
                  label={p}
                  active={selectedParish === p}
                  onPress={() => setSelectedParish(selectedParish === p ? ALL : p)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={[styles.filterStrip, styles.filterStripLast]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripRow}>
              <FilterChip label="All Types" icon="apps" active={selectedType === ALL} onPress={() => setSelectedType(ALL)} />
              {eventTypes.map((type) => (
                <FilterChip
                  key={type.id}
                  label={type.label}
                  icon={type.icon as any}
                  active={selectedType === type.id}
                  onPress={() => setSelectedType(selectedType === type.id ? ALL : type.id)}
                  color={type.color}
                />
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={sortedFiltered}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
            renderItem={renderResultItem}
            contentContainerStyle={styles.resultsList}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {boostedEvents.length > 0 && (
                  <View style={styles.boostedBlock}>
                    <View style={styles.blockHeader}>
                      <MaterialIcons name="rocket-launch" size={13} color={Colors.gold} />
                      <Text style={styles.boostedBlockTitle}>Boosted</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boostedRail}>
                      {boostedEvents.map((ev) => (
                        <BoostedCard key={ev.id} event={ev} onPress={() => router.push(`/event/${ev.id}` as any)} />
                      ))}
                    </ScrollView>
                  </View>
                )}
                <View style={styles.resultsHeaderRow}>
                  <Text style={styles.resultsCount}>
                    <Text style={{ color: Colors.gold, fontWeight: Typography.bold }}>{sortedFiltered.length}</Text>
                    {' '}{timeScope === 'past' ? 'past ' : ''}event{sortedFiltered.length !== 1 ? 's' : ''} found
                  </Text>
                  {activeFilterCount > 0 && (
                    <Pressable onPress={clearFilters} style={styles.clearSmall}>
                      <Text style={styles.clearSmallText}>Clear filters</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrap}>
                  <MaterialIcons name={timeScope === 'past' ? 'history' : 'search-off'} size={34} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>
                  {timeScope === 'past' ? 'No past events found' : 'No events found'}
                </Text>
                <Text style={styles.emptySub}>
                  {timeScope === 'past'
                    ? 'Past events will appear here once events have taken place.'
                    : 'Try adjusting your filters or search term.'}
                </Text>
                {activeFilterCount > 0 && (
                  <Pressable onPress={clearFilters} style={styles.clearAllBtn}>
                    <MaterialIcons name="filter-list-off" size={15} color={Colors.gold} />
                    <Text style={styles.clearAllBtnText}>Clear All Filters</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        </View>
      )}

      {/* Auth Prompt Modal */}
      <Modal visible={showAuthPrompt} transparent animationType="slide" onRequestClose={() => setShowAuthPrompt(false)}>
        <Pressable style={auth.overlay} onPress={() => setShowAuthPrompt(false)}>
          <Pressable style={auth.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={auth.handle} />
            <MaterialIcons name="how-to-reg" size={28} color={Colors.gold} />
            <Text style={auth.title}>Sign In to RSVP</Text>
            <Text style={auth.body}>
              Create a free account or sign in to mark Going or Interested, save events, and sync reminders across your devices.
            </Text>
            <Pressable
              onPress={() => { setShowAuthPrompt(false); router.push('/auth' as any); }}
              style={({ pressed }) => [auth.primaryBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={auth.primaryBtnInner}>
                <MaterialIcons name="login" size={16} color={Colors.textOnGold} />
                <Text style={auth.primaryBtnText}>Sign In / Register</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setShowAuthPrompt(false)} style={auth.dismissBtn} hitSlop={8}>
              <Text style={auth.dismissText}>Not Now</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  titleBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  screenTitle: { fontSize: Typography.xxl, fontWeight: Typography.black, color: Colors.textPrimary },
  screenSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
    borderRadius: Radius.full, backgroundColor: Colors.goldSurface,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  clearBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
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
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 2, borderColor: Colors.surface,
  },
  notifBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  searchWrap: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md,
    gap: Spacing.sm, borderWidth: 1.5, borderColor: Colors.surfaceBorder, height: 46,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, paddingVertical: 0 },

  modeTabs: {
    flexDirection: 'row', paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1, borderColor: Colors.surfaceBorder, position: 'relative',
  },
  modeTabActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  modeTabText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  modeTabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  modeBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 15, height: 15, borderRadius: 7.5,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.surface,
  },
  modeBadgeText: { fontSize: 9, color: Colors.textOnGold, fontWeight: Typography.black },

  scopeRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  scopeBtn: {
    flex: 1, height: 30, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  scopeBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  scopeBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  scopeBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.errorSoft, borderRadius: Radius.md,
    margin: Spacing.base, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.errorBorder,
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.error },
  retryText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  discoverContent: { paddingTop: Spacing.base, paddingBottom: Spacing.xxl * 2 },
  block: { paddingHorizontal: Spacing.base, marginBottom: Spacing.xl },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.base },
  blockTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  blockMeta: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  parishRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  boostedRail: { gap: Spacing.sm, paddingBottom: Spacing.xs },

  filterStrip: {
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, backgroundColor: Colors.surface,
  },
  filterStripLast: { marginBottom: 0 },
  stripRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs,
  },

  resultsList: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl * 2 },
  resultsHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, marginBottom: Spacing.xs,
  },
  resultsCount: { fontSize: Typography.sm, color: Colors.textSecondary },
  clearSmall: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  clearSmallText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  boostedBlock: { marginBottom: Spacing.base, paddingTop: Spacing.xs },
  boostedBlockTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },

  emptyWrap: { alignItems: 'center', paddingTop: Spacing.xxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.md },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: Spacing.sm,
  },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  clearAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`, marginTop: Spacing.xs,
  },
  clearAllBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});

const auth = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlayStrong, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.xxl,
    alignItems: 'center', gap: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, marginBottom: Spacing.xs },
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
