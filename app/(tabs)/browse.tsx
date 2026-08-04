
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
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useCategories } from '../../hooks/useCategories';
import { isToday, isEventPassed, isThisWeekend } from '../../constants/data';

// ─── Types ────────────────────────────────────────────────────────────────────
type BrowseMode = 'search' | 'parish' | 'type';
type DateFilter = 'all' | 'today' | 'weekend';
type TimeScope = 'upcoming' | 'past';

const ALL = '__all__';

// St. Andrew uses a local generated asset; all others use Unsplash URIs
const ST_ANDREW_IMG = require('../../assets/images/parish_st_andrew.jpg');

type ParishImageSource = string | number; // number = local require(), string = URI

const PARISH_IMAGES: Record<string, ParishImageSource> = {
  'Kingston':      'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400&q=70',
  'St. Andrew':    ST_ANDREW_IMG,
  'St. Catherine': 'https://images.unsplash.com/photo-1571019613914-85f342c6a11e?w=400&q=70',
  'Clarendon':     'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=70',
  'Manchester':    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=70',
  'St. Elizabeth': 'https://images.unsplash.com/photo-1552550049-db097c9480d1?w=400&q=70',
  'Westmoreland':  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=70',
  'Hanover':       'https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=400&q=70',
  'St. James':     'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=70',
  'Trelawny':      'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&q=70',
  'St. Ann':       'https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=400&q=70',
  'St. Mary':      'https://images.unsplash.com/photo-1500622944204-b135684e99fd?w=400&q=70',
  'Portland':      'https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=400&q=70',
  'St. Thomas':    'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=400&q=70',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// isToday imported from constants/data — single source of truth
function matchesTimeScope(dateStr: string, scope: TimeScope): boolean {
  const passed = isEventPassed(dateStr);
  return scope === 'upcoming' ? !passed : passed;
}

// ─── Boosted Event Card ───────────────────────────────────────────────────────
function BoostedCard({ event, onPress }: { event: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [boostedStyles.card, pressed && { opacity: 0.88 }]}
    >
      <LinearGradient colors={['#1A0E00', Colors.surface]} style={StyleSheet.absoluteFillObject} />
      <Image source={{ uri: event.coverImage }} style={boostedStyles.img} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFillObject} />
      <View style={boostedStyles.boostBadge}>
        <MaterialIcons name="rocket-launch" size={10} color={Colors.textOnGold} />
        <Text style={boostedStyles.boostBadgeText}>Boosted</Text>
      </View>
      <View style={boostedStyles.content}>
        <Text style={boostedStyles.title} numberOfLines={2}>{event.title}</Text>
        <View style={boostedStyles.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.gold} />
          <Text style={boostedStyles.meta}>{event.parish}</Text>
          <View style={boostedStyles.dot} />
          <Text style={boostedStyles.meta}>{event.ticketPrice}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const boostedStyles = StyleSheet.create({
  card: {
    width: 200, height: 130, borderRadius: Radius.lg,
    overflow: 'hidden', position: 'relative',
    borderWidth: 1.5, borderColor: `${Colors.gold}55`,
  },
  img: { ...StyleSheet.absoluteFillObject },
  boostBadge: {
    position: 'absolute', top: 8, left: 8, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.gold, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  boostBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.textOnGold },
  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: '700', color: '#fff', lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)' },
});

// ─── Parish Card ──────────────────────────────────────────────────────────────
function ParishCard({ parish, count, onPress }: { parish: string; count: number; onPress: () => void }) {
  const imgSource = PARISH_IMAGES[parish] ?? PARISH_IMAGES['Kingston'];
  const imageSource = typeof imgSource === 'number' ? imgSource : { uri: imgSource as string };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pcStyles.card, pressed && { opacity: 0.85 }]}>
      <Image source={imageSource} style={pcStyles.img} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFillObject} />
      <View style={pcStyles.content}>
        <Text style={pcStyles.name}>{parish}</Text>
        <View style={pcStyles.countRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={pcStyles.count}>{count} event{count !== 1 ? 's' : ''}</Text>
        </View>
      </View>
    </Pressable>
  );
}
const pcStyles = StyleSheet.create({
  card: { width: '47.5%', height: 110, borderRadius: Radius.lg, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: Colors.surfaceBorder },
  img: { width: '100%', height: '100%' },
  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, gap: 2 },
  name: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Type Tile ────────────────────────────────────────────────────────────────
function TypeTile({ id, label, icon, color, count, onPress }: { id: string; label: string; icon: string; color: string; count: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ttStyles.tile, { borderColor: `${color}44` }, pressed && { opacity: 0.85 }]}>
      <LinearGradient colors={[`${color}20`, `${color}08`]} style={StyleSheet.absoluteFillObject} />
      <View style={[ttStyles.iconBg, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={26} color={color} />
      </View>
      <Text style={[ttStyles.label, { color: Colors.textPrimary }]} numberOfLines={2}>{label}</Text>
      <Text style={[ttStyles.count, { color }]}>{count}</Text>
    </Pressable>
  );
}
const ttStyles = StyleSheet.create({
  tile: { width: '30.5%', borderRadius: Radius.lg, overflow: 'hidden', padding: Spacing.md, alignItems: 'center', gap: Spacing.xs, borderWidth: 1.5, backgroundColor: Colors.surface, minHeight: 110, justifyContent: 'center', position: 'relative' },
  iconBg: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  count: { fontSize: 10, fontWeight: '700' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BrowseScreen() {
  const params = useLocalSearchParams<{ parish?: string; type?: string }>();
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested, getBoostedEvents, refreshEvents, isLoading, error, clearError } = useEvents();
  const { unreadCount } = useNotifications();

  const { parishes, eventTypes } = useCategories();

  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  const [mode, setMode] = useState<BrowseMode>(() => {
    if (params.parish || params.type) return 'search';
    return 'parish';
  });
  const [timeScope, setTimeScope] = useState<TimeScope>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedParish, setSelectedParish] = useState<string>(params.parish ?? ALL);
  const [selectedType, setSelectedType] = useState<string>(params.type ?? ALL);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishes.forEach((p) => { counts[p] = 0; });
    events.filter((e) => matchesTimeScope(e.date, timeScope)).forEach((e) => {
      if (counts[e.parish] !== undefined) counts[e.parish]++;
    });
    return counts;
  }, [events, timeScope, parishes]); // Added parishes to dependency array for completeness.

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    eventTypes.forEach((t) => { counts[t.id] = 0; });
    events.filter((e) => matchesTimeScope(e.date, timeScope)).forEach((e) => {
      (e.eventTypes ?? [e.type]).forEach((tid) => { if (counts[tid] !== undefined) counts[tid]++; });
    });
    return counts;
  }, [events, timeScope, eventTypes]); // Added eventTypes to dependency array for completeness.

  const boostedEvents = useMemo(
    () => getBoostedEvents().filter((e) => matchesTimeScope(e.date, timeScope)),
    [getBoostedEvents, timeScope], // Changed dependency from `events` to `getBoostedEvents` as it's a function call.
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

  // Boosted first, then non-boosted
  const sortedFiltered = useMemo(() => {
    const boosted = filtered.filter((e) => e.boosted);
    const rest = filtered.filter((e) => !e.boosted);
    return [...boosted, ...rest];
  }, [filtered]);

  const activeFilterCount = (selectedParish !== ALL ? 1 : 0) + (selectedType !== ALL ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);

  const clearFilters = () => { setSelectedParish(ALL); setSelectedType(ALL); setDateFilter('all'); setSearch(''); };
  const handleParishSelect = (parish: string) => { setSelectedParish(parish); setMode('search'); };
  const handleTypeSelect = (typeId: string) => { setSelectedType(typeId); setMode('search'); };

  const scopedCount = events.filter((e) => matchesTimeScope(e.date, timeScope)).length;

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
          <PlacementAd placementName="Browse Results" style={styles.bannerInList} />
        )}
      </>
    ),
    [userGoingIds, userInterestedIds, toggleGoing, toggleInterested, sortedFiltered.length],
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Browse</Text>
            <View style={styles.titleActions}>
              {mode === 'search' && activeFilterCount > 0 && (
                <Pressable onPress={clearFilters} style={styles.clearBtn}>
                  <MaterialIcons name="filter-list-off" size={15} color={Colors.gold} />
                  <Text style={styles.clearBtnText}>Clear ({activeFilterCount})</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/notifications' as any)}
                style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="notifications" size={22} color={Colors.textPrimary} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={20} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search events, venues, promoters..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={(v) => { setSearch(v); if (v.trim()) setMode('search'); }}
              accessibilityLabel="Search events"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
          <View style={styles.modeRow}>
            {([
              { key: 'parish', icon: 'place', label: 'Parish' },
              { key: 'type', icon: 'category', label: 'Category' },
              { key: 'search', icon: 'tune', label: 'Filter' },
            ] as const).map(({ key, icon, label }) => (
              <Pressable key={key} onPress={() => setMode(key)} style={[styles.modeBtn, mode === key && styles.modeBtnActive]}>
                <MaterialIcons name={icon as any} size={15} color={mode === key ? Colors.textOnGold : Colors.textSecondary} />
                <Text style={[styles.modeBtnText, mode === key && styles.modeBtnTextActive]}>{label}</Text>
                {key === 'search' && activeFilterCount > 0 && mode !== 'search' && (
                  <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>
                )}
              </Pressable>
            ))}
          </View>
          {/* Upcoming / Past toggle */}
          <View style={styles.timeScopeRow}>
            {([
              { key: 'upcoming', icon: 'upcoming', label: 'Upcoming' },
              { key: 'past', icon: 'history', label: 'Past Events' },
            ] as const).map(({ key, icon, label }) => (
              <Pressable
                key={key}
                onPress={() => { setTimeScope(key); setDateFilter('all'); }}
                style={[styles.timeScopeBtn, timeScope === key && styles.timeScopeBtnActive]}
              >
                <MaterialIcons name={icon as any} size={14} color={timeScope === key ? Colors.textOnGold : Colors.textMuted} />
                <Text style={[styles.timeScopeBtnText, timeScope === key && styles.timeScopeBtnTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>

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
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── PARISH GRID ── */}
      {mode === 'parish' && (
        <FlatList
          data={parishes}
          keyExtractor={(p) => p}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
          ListHeaderComponent={
            <>
              <Text style={styles.gridLabel}>
                {parishes.length} Parishes · {scopedCount} {timeScope} events
              </Text>
              <PlacementAd placementName="Browse Results" style={styles.bannerInGrid} />
            </>
          }
          renderItem={({ item: parish }) => (
            <ParishCard parish={parish} count={parishCounts[parish] ?? 0} onPress={() => handleParishSelect(parish)} />
          )}
        />
      )}

      {/* ── TYPE GRID ── */}
      {mode === 'type' && (
        <FlatList
          data={eventTypes}
          keyExtractor={(t) => t.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
          ListHeaderComponent={
            <>
              <Text style={styles.gridLabel}>
                {eventTypes.length} Categories · {timeScope === 'past' ? 'Past' : 'Upcoming'}
              </Text>
              <PlacementAd placementName="Browse Results" style={styles.bannerInGrid} />
            </>
          }
          renderItem={({ item: type }) => (
            <TypeTile id={type.id} label={type.label} icon={type.icon} color={type.color} count={typeCounts[type.id] ?? 0} onPress={() => handleTypeSelect(type.id)} />
          )}
        />
      )}

      {/* ── FILTER + RESULTS ── */}
      {mode === 'search' && (
        <View style={{ flex: 1 }}>
          {/* Collapsible filter toggle bar */}
          <Pressable onPress={() => setFiltersExpanded(!filtersExpanded)} style={styles.filterToggleRow}>
            <MaterialIcons name="tune" size={15} color={Colors.gold} />
            <Text style={styles.filterToggleText}>Filters</Text>
            {activeFilterCount > 0 && (
              <View style={styles.filterToggleBadge}>
                <Text style={styles.filterToggleBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
            {!filtersExpanded && activeFilterCount > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                {selectedParish !== ALL && (
                  <View style={styles.activeFilterChip}>
                    <MaterialIcons name="place" size={11} color={Colors.gold} />
                    <Text style={styles.activeFilterChipText} numberOfLines={1}>{selectedParish}</Text>
                  </View>
                )}
                {selectedType !== ALL && (() => {
                  const t = eventTypes.find((x) => x.id === selectedType);
                  return t ? (
                    <View style={[styles.activeFilterChip, { borderColor: `${t.color}55`, backgroundColor: `${t.color}15` }]}>
                      <MaterialIcons name={t.icon as any} size={11} color={t.color} />
                      <Text style={[styles.activeFilterChipText, { color: t.color }]} numberOfLines={1}>{t.label}</Text>
                    </View>
                  ) : null;
                })()}
                {dateFilter !== 'all' && (
                  <View style={styles.activeFilterChip}>
                    <MaterialIcons name="today" size={11} color={Colors.gold} />
                    <Text style={styles.activeFilterChipText}>{dateFilter === 'today' ? 'Today' : 'This Weekend'}</Text>
                  </View>
                )}
              </ScrollView>
            ) : <View style={{ flex: 1 }} />}
            <MaterialIcons name={filtersExpanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
          </Pressable>

          {/* Expanded filter strips */}
          {filtersExpanded && (
            <>
              {/* Quick date filters — only relevant for upcoming */}
              {timeScope === 'upcoming' && (
                <View style={styles.stripWrap}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                    {([
                      { key: 'all', label: 'All Dates', icon: 'date-range' },
                      { key: 'today', label: 'Today', icon: 'today' },
                      { key: 'weekend', label: 'This Weekend', icon: 'weekend' },
                    ] as const).map(({ key, label, icon }) => (
                      <Pressable key={key} onPress={() => setDateFilter(key)} style={[styles.quickChip, dateFilter === key && styles.quickChipActive]}>
                        <MaterialIcons name={icon as any} size={13} color={dateFilter === key ? Colors.textOnGold : Colors.textSecondary} />
                        <Text style={[styles.quickChipText, dateFilter === key && styles.quickChipTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                    {selectedParish !== ALL && (
                      <Pressable onPress={() => setSelectedParish(ALL)} style={[styles.quickChip, styles.quickChipParish]}>
                        <MaterialIcons name="place" size={13} color={Colors.gold} />
                        <Text style={[styles.quickChipText, { color: Colors.gold }]}>{selectedParish}</Text>
                        <MaterialIcons name="close" size={12} color={Colors.gold} />
                      </Pressable>
                    )}
                    {selectedType !== ALL && (() => {
                      const t = eventTypes.find((x) => x.id === selectedType);
                      return t ? (
                        <Pressable onPress={() => setSelectedType(ALL)} style={[styles.quickChip, { borderColor: `${t.color}55`, backgroundColor: `${t.color}15` }]}>
                          <MaterialIcons name={t.icon as any} size={13} color={t.color} />
                          <Text style={[styles.quickChipText, { color: t.color }]}>{t.label}</Text>
                          <MaterialIcons name="close" size={12} color={t.color} />
                        </Pressable>
                      ) : null;
                    })()}
                  </ScrollView>
                </View>
              )}

              {/* Parish strip */}
              <View style={styles.stripWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  <Pressable onPress={() => setSelectedParish(ALL)} style={[styles.stripChip, selectedParish === ALL && styles.stripChipActive]}>
                    <Text style={[styles.stripText, selectedParish === ALL && styles.stripTextActive]}>All Parishes</Text>
                  </Pressable>
                  {parishes.map((p) => (
                    <Pressable key={p} onPress={() => setSelectedParish(selectedParish === p ? ALL : p)} style={[styles.stripChip, selectedParish === p && styles.stripChipActive]}>
                      <Text style={[styles.stripText, selectedParish === p && styles.stripTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Type strip */}
              <View style={styles.stripWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  <Pressable onPress={() => setSelectedType(ALL)} style={[styles.typeStripChip, selectedType === ALL && styles.typeStripAllActive]}>
                    <MaterialIcons name="apps" size={13} color={selectedType === ALL ? Colors.textOnGold : Colors.textMuted} />
                    <Text style={[styles.typeStripText, selectedType === ALL && { color: Colors.textOnGold, fontWeight: Typography.bold }]}>All</Text>
                  </Pressable>
                  {eventTypes.map((type) => {
                    const isActive = selectedType === type.id;
                    return (
                      <Pressable key={type.id} onPress={() => setSelectedType(selectedType === type.id ? ALL : type.id)} style={[styles.typeStripChip, isActive && { backgroundColor: type.color, borderColor: type.color }]}>
                        <MaterialIcons name={type.icon as any} size={13} color={isActive ? '#fff' : type.color} />
                        <Text style={[styles.typeStripText, isActive && { color: '#fff', fontWeight: Typography.bold }]}>{type.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          )}

          {/* Results list */}
          <FlatList
            data={sortedFiltered}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
            renderItem={renderResultItem}
            contentContainerStyle={styles.resultsList}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {/* Boosted events horizontal rail */}
                {boostedEvents.length > 0 && (
                  <View style={styles.boostedSection}>
                    <View style={styles.boostedHeader}>
                      <MaterialIcons name="rocket-launch" size={14} color={Colors.gold} />
                      <Text style={styles.boostedTitle}>Boosted Events</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boostedRail}>
                      {boostedEvents.map((event) => (
                        <BoostedCard
                          key={event.id}
                          event={event}
                          onPress={() => router.push(`/event/${event.id}` as any)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}
                <View style={styles.resultsHeader}>
                  <Text style={styles.resultsCount}>
                    {sortedFiltered.length} {timeScope === 'past' ? 'past ' : ''}event{sortedFiltered.length !== 1 ? 's' : ''} found
                  </Text>
                  {sortedFiltered.length > 0 && boostedEvents.length > 0 && (
                    <Text style={styles.resultsSub}>Boosted events shown first</Text>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <MaterialIcons name={timeScope === 'past' ? 'history' : 'search-off'} size={40} color={Colors.textMuted} />
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
                    <Text style={styles.clearAllBtnText}>Clear All Filters</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        </View>
      )}

      {/* ── Auth Prompt Modal (guest RSVP attempt) ── */}
      <Modal visible={showAuthPrompt} transparent animationType="slide" onRequestClose={() => setShowAuthPrompt(false)}>
        <Pressable style={authStyles.overlay} onPress={() => setShowAuthPrompt(false)}>
          <Pressable style={authStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={authStyles.handle} />
            <View style={authStyles.iconWrap}>
              <MaterialIcons name="how-to-reg" size={32} color={Colors.gold} />
            </View>
            <Text style={authStyles.title}>Sign In to RSVP</Text>
            <Text style={authStyles.body}>
              Create a free account or sign in to mark Going or Interested, save events, and sync reminders across your devices.
            </Text>
            <Pressable
              onPress={() => { setShowAuthPrompt(false); router.push('/auth' as any); }}
              style={({ pressed }) => [authStyles.primaryBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={authStyles.primaryBtnInner}>
                <MaterialIcons name="login" size={16} color={Colors.textOnGold} />
                <Text style={authStyles.primaryBtnText}>Sign In / Register</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setShowAuthPrompt(false)} style={authStyles.dismissBtn}>
              <Text style={authStyles.dismissText}>Not Now</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  clearBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, height: 46,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  modeRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 3, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.sm, position: 'relative' },
  modeBtnActive: { backgroundColor: Colors.gold },
  modeBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  modeBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  filterBadge: { position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 8, color: Colors.textOnGold, fontWeight: Typography.bold },

  // Upcoming / Past toggle
  timeScopeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 3,
  },
  timeScopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  timeScopeBtnActive: { backgroundColor: Colors.gold },
  timeScopeBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  timeScopeBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  gridContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.xxl * 2, gap: Spacing.sm },
  gridRow: { gap: Spacing.sm },
  gridLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.xs, fontWeight: Typography.medium },
  bannerInGrid: { marginHorizontal: 0, marginBottom: Spacing.md },

  stripWrap: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  strip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs, flexDirection: 'row', alignItems: 'center' },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, height: 34, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  quickChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  quickChipParish: { borderColor: `${Colors.gold}55`, backgroundColor: Colors.goldSurface },
  quickChipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold },
  quickChipTextActive: { color: Colors.textOnGold },
  stripChip: {
    paddingHorizontal: Spacing.md, height: 34, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  stripChipActive: { backgroundColor: Colors.goldSurface, borderColor: Colors.gold },
  stripText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  stripTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  typeStripChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, height: 34, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  typeStripAllActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  typeStripText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },

  resultsList: { paddingHorizontal: Spacing.base, paddingTop: Spacing.xs, paddingBottom: Spacing.xxl * 2 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  resultsCount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  resultsSub: { fontSize: Typography.xs, color: Colors.textMuted },

  boostedSection: { marginBottom: Spacing.md },
  boostedHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  boostedTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  boostedRail: { gap: Spacing.sm, paddingBottom: Spacing.xs },

  bannerInList: { marginHorizontal: 0, marginVertical: Spacing.sm },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl * 2, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  clearAllBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs },
  clearAllBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  // Error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.lg,
    margin: Spacing.base, marginTop: 0, padding: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: '#FF7777', lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  retryBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  filterToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface, minHeight: 44,
  },
  filterToggleText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold },
  filterToggleBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterToggleBadgeText: { fontSize: 9, fontWeight: Typography.black, color: Colors.textOnGold },
  activeFilterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, height: 22, borderRadius: Radius.full,
    backgroundColor: Colors.goldSurface, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  activeFilterChipText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.medium },
});

const authStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
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
