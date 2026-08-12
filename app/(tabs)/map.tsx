
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  RefreshControl,
} from 'react-native';
import Animated, { useSharedValue, withRepeat, withSequence, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { JamaicaMap } from '../../components/feature/JamaicaMap';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { PARISHES, EVENT_TYPES, TYPE_COLORS, formatDate, formatCount, Event, isEventPassed, isToday, isThisWeekend } from '../../constants/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Event Preview Card ────────────────────────────────────────────────────────
function EventPreviewCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const typeInfo  = EVENT_TYPES.find((t) => t.id === event.type);
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [previewStyles.card, pressed && { opacity: 0.88 }]}
    >
      <View style={previewStyles.imgWrap}>
        <Image source={{ uri: event.coverImage }} placeholder={require('../../assets/images/icon.png')} placeholderContentFit="cover" style={previewStyles.img} contentFit="cover" transition={200} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFillObject} />
        <View style={[previewStyles.typeBadge, { backgroundColor: `${typeColor}CC` }]}>
          <MaterialIcons name={typeInfo?.icon as any} size={10} color="#fff" />
        </View>
      </View>
      <View style={previewStyles.info}>
        <Text style={previewStyles.title} numberOfLines={2}>{event.title}</Text>
        <View style={previewStyles.metaRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={previewStyles.meta}>{formatDate(event.date)}</Text>
        </View>
        <View style={previewStyles.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={previewStyles.meta} numberOfLines={1}>{event.venue}</Text>
        </View>
        <View style={previewStyles.bottomRow}>
          <Text style={[previewStyles.price, isFree && previewStyles.priceFree]}>
            {isFree ? 'Free' : event.ticketPrice}
          </Text>
          <View style={previewStyles.heatRow}>
            <MaterialIcons name="people" size={10} color={Colors.textMuted} />
            <Text style={previewStyles.heatText}>{formatCount(event.goingCount + event.interestedCount)}</Text>
          </View>
        </View>
      </View>
      <View style={previewStyles.arrow}>
        <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.gold} />
      </View>
    </Pressable>
  );
}

const previewStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden', marginBottom: Spacing.sm,
  },
  imgWrap: { width: 80, height: 80, position: 'relative', flexShrink: 0 },
  img: { width: '100%', height: '100%' },
  typeBadge: {
    position: 'absolute', top: 5, left: 5,
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  price: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },
  priceFree: { color: Colors.greenLight },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heatText: { fontSize: 10, color: Colors.textMuted },
  arrow: { paddingRight: Spacing.md },
});

// ─── Skeleton row shown while the first fetch is in progress ──────────────────
function SkeletonParishRow() {
  const opacity = useSharedValue(0.4);
  // Reanimated shared values are stable refs — safe to add to deps; won't cause re-runs
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.4, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, [opacity]);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.parishRow, shimmerStyle]}>
      <View style={[styles.parishThumb, { backgroundColor: Colors.surfaceElevated }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 12, borderRadius: 6, backgroundColor: Colors.surfaceElevated, width: '55%' }} />
        <View style={{ height: 10, borderRadius: 5, backgroundColor: Colors.surfaceElevated, width: '35%' }} />
      </View>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceElevated }} />
    </Animated.View>
  );
}

// ─── Main Map Screen ───────────────────────────────────────────────────────────
export default function MapScreen() {
  const router = useRouter();
  const { events, isLoading, error, clearError, refreshEvents, allEvents } = useEvents();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;
  const [selectedParish, setSelectedParish] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'weekend'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [adminStatusOverlay, setAdminStatusOverlay] = useState(false);

  // Pulsing dot — signals the Supabase real-time channel is active
  const pulseOpacity = useSharedValue(1);
  // Reanimated shared values are stable refs — safe to add to deps; won't cause re-runs
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 950 }),
        withTiming(1, { duration: 950 }),
      ),
      -1,
      false,
    );
  }, [pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  // Admin status breakdown — only computed when admin overlay is active
  const adminStatusCounts = useMemo(() => {
    if (!isAdmin || !adminStatusOverlay) return null;
    const source = allEvents.length > 0 ? allEvents : events;
    const counts = { live: 0, pending: 0, flagged: 0 };
    source.forEach((e: any) => {
      if (e.status === 'flagged') counts.flagged++;
      else if (e.status === 'pending') counts.pending++;
      else counts.live++;
    });
    return counts;
  }, [isAdmin, adminStatusOverlay, allEvents, events]);

  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PARISHES.forEach((p) => { counts[p] = 0; });
    events.filter((e) => {
      if (isEventPassed(e.date)) return false;
      if (dateFilter === 'today') return isToday(e.date);
      if (dateFilter === 'weekend') return isThisWeekend(e.date);
      return true;
    }).forEach((e) => { if (counts[e.parish] !== undefined) counts[e.parish]++; });
    return counts;
  }, [events, dateFilter]);

  const selectedEvents = useMemo(() => {
    if (!selectedParish) return [];
    return events.filter((e) => {
      if (e.parish !== selectedParish || isEventPassed(e.date)) return false;
      if (dateFilter === 'today') return isToday(e.date);
      if (dateFilter === 'weekend') return isThisWeekend(e.date);
      return true;
    });
  }, [events, selectedParish, dateFilter]);

  const activeParishes = useMemo(
    () => PARISHES.filter((p) => parishCounts[p] > 0),
    [parishCounts]
  );

  const filteredTotal = useMemo(
    () => Object.values(parishCounts).reduce((s, c) => s + c, 0),
    [parishCounts]
  );
  const totalEvents = events.length;
  const activeCount = activeParishes.length;

  const handleParishPress = (parish: string) => {
    setSelectedParish((prev) => (prev === parish ? null : parish));
  };

  const resetMap = () => setSelectedParish(null);

  return (
    <View style={styles.container}>

      {/* ── STICKY TOP: header + date filter chips — these never scroll ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Events Map</Text>
            <View style={styles.subtitleRow}>
              <Animated.View style={[styles.liveDot, pulseStyle]} />
              <Text style={styles.subtitle}>
                {isLoading
                  ? 'Loading events…'
                  : dateFilter !== 'all'
                    ? `${dateFilter === 'today' ? 'Today' : 'This weekend'} · ${filteredTotal} events · ${activeCount} parishes`
                    : `${activeCount} active parishes · ${totalEvents} events island-wide`}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {isAdmin ? (
              <Pressable
                onPress={() => setAdminStatusOverlay((v) => !v)}
                style={({ pressed }) => [
                  styles.adminToggleBtn,
                  adminStatusOverlay && styles.adminToggleBtnActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <MaterialIcons
                  name="admin-panel-settings"
                  size={15}
                  color={adminStatusOverlay ? Colors.textOnGold : Colors.gold}
                />
                <Text style={[styles.adminToggleText, adminStatusOverlay && styles.adminToggleTextActive]}>
                  {adminStatusOverlay ? 'Status On' : 'Status'}
                </Text>
              </Pressable>
            ) : null}
            {selectedParish ? (
              <Pressable
                onPress={resetMap}
                style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
              >
                <MaterialIcons name="filter-list-off" size={15} color={Colors.gold} />
                <Text style={styles.clearBtnText}>Clear</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="notifications" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* Date filter chips — sticky together with header */}
        <View style={styles.dateFilterWrap}>
          {([
            { key: 'all', label: 'All Dates', icon: 'date-range' },
            { key: 'today', label: 'Today', icon: 'today' },
            { key: 'weekend', label: 'This Weekend', icon: 'weekend' },
          ] as const).map(({ key, label, icon }) => (
            <Pressable
              key={key}
              onPress={() => { setDateFilter(key); setSelectedParish(null); }}
              style={({ pressed }) => [
                styles.dateFilterChip,
                dateFilter === key && styles.dateFilterChipActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <MaterialIcons
                name={icon as any}
                size={13}
                color={dateFilter === key ? Colors.textOnGold : Colors.textSecondary}
              />
              <Text style={[styles.dateFilterChipText, dateFilter === key && styles.dateFilterChipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {/* ── SCROLLABLE: error banner + map + chip strip + parish content ── */}
      {/* The map is part of the scroll content — it scrolls with the page.     */}
      {/* Only the SafeAreaView block above remains pinned at the top.           */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Network Error Banner */}
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

        {/* Map — NOT fixed/sticky; scrolls naturally with page content */}
        <View style={styles.mapWrap}>
          <JamaicaMap
            parishCounts={parishCounts}
            selectedParish={selectedParish}
            onParishPress={handleParishPress}
          />
          {/* Legend overlay */}
          <View style={styles.legendOverlay} pointerEvents="none">
            {adminStatusOverlay && isAdmin ? (
              <>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.greenLight }]} />
                  <Text style={styles.legendText}>Live</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
                  <Text style={styles.legendText}>Pending</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
                  <Text style={styles.legendText}>Flagged</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.gold }]} />
                  <Text style={styles.legendText}>Has events</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.greenLight }]} />
                  <Text style={styles.legendText}>Selected</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.surfaceBorder }]} />
                  <Text style={styles.legendText}>No events</Text>
                </View>
              </>
            )}
          </View>
          {/* Admin status counts */}
          {adminStatusOverlay && isAdmin && adminStatusCounts ? (
            <View style={styles.adminStatusBanner} pointerEvents="none">
              <View style={styles.adminStatusItem}>
                <View style={[styles.adminStatusDot, { backgroundColor: Colors.greenLight }]} />
                <Text style={styles.adminStatusNum}>{adminStatusCounts.live}</Text>
                <Text style={styles.adminStatusLabel}>Live</Text>
              </View>
              <View style={styles.adminStatusDivider} />
              <View style={styles.adminStatusItem}>
                <View style={[styles.adminStatusDot, { backgroundColor: '#FF9800' }]} />
                <Text style={styles.adminStatusNum}>{adminStatusCounts.pending}</Text>
                <Text style={styles.adminStatusLabel}>Pending</Text>
              </View>
              <View style={styles.adminStatusDivider} />
              <View style={styles.adminStatusItem}>
                <View style={[styles.adminStatusDot, { backgroundColor: '#F44336' }]} />
                <Text style={styles.adminStatusNum}>{adminStatusCounts.flagged}</Text>
                <Text style={styles.adminStatusLabel}>Flagged</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Parish chip strip — scrolls with map */}
        <View style={styles.chipScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable onPress={resetMap} style={[styles.chip, !selectedParish && styles.chipActive]}>
              <MaterialIcons name="public" size={13} color={!selectedParish ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.chipText, !selectedParish && styles.chipTextActive]}>All Island</Text>
            </Pressable>
            {activeParishes.map((parish) => {
              const isActive = selectedParish === parish;
              return (
                <Pressable key={parish} onPress={() => handleParishPress(parish)} style={[styles.chip, isActive && styles.chipActive]}>
                  <MaterialIcons name="place" size={13} color={isActive ? Colors.textOnGold : Colors.gold} />
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{parish}</Text>
                  <View style={[styles.chipCount, isActive && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, isActive && styles.chipCountTextActive]}>
                      {formatCount(parishCounts[parish])}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Island-wide overview */}
        {!selectedParish ? (
          <>
            <PlacementAd placementName="Map Screen" style={{ marginBottom: Spacing.md }} />
            <View style={styles.sectionHeader}>
              <View style={styles.goldBar} />
              <Text style={styles.sectionTitle}>Island Overview</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <MaterialIcons name="event" size={20} color={Colors.gold} />
                <Text style={styles.statNum}>{formatCount(filteredTotal)}</Text>
                <Text style={styles.statLabel}>{dateFilter === 'today' ? "Today's" : dateFilter === 'weekend' ? 'Weekend' : 'Total'} Events</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="place" size={20} color={Colors.greenLight} />
                <Text style={styles.statNum}>{activeCount}</Text>
                <Text style={styles.statLabel}>Active Parishes</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="people" size={20} color="#FF6B35" />
                <Text style={styles.statNum}>
                  {formatCount(events.reduce((s, e) => s + e.goingCount, 0))}
                </Text>
                <Text style={styles.statLabel}>Going</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View style={styles.goldBar} />
              <Text style={styles.sectionTitle}>Events by Parish</Text>
            </View>

            {isLoading ? (
              <>
                <SkeletonParishRow />
                <SkeletonParishRow />
                <SkeletonParishRow />
              </>
            ) : activeParishes.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-note" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No events posted yet</Text>
                <Text style={styles.emptySub}>Promoters can post events via the + tab.</Text>
              </View>
            ) : (
              activeParishes.map((parish) => {
                const count = parishCounts[parish];
                const topEvent = events.find((e) => e.parish === parish);
                return (
                  <Pressable
                    key={parish}
                    onPress={() => handleParishPress(parish)}
                    style={({ pressed }) => [styles.parishRow, pressed && { opacity: 0.85 }]}
                  >
                    <View style={styles.parishRowLeft}>
                      {topEvent ? (
                        <Image source={{ uri: topEvent.coverImage }} style={styles.parishThumb} contentFit="cover" transition={200} />
                      ) : (
                        <View style={[styles.parishThumb, { backgroundColor: Colors.surfaceElevated }]} />
                      )}
                      <View style={styles.parishInfo}>
                        <Text style={styles.parishName}>{parish}</Text>
                        <Text style={styles.parishMeta} numberOfLines={1}>
                          {topEvent ? topEvent.title : '—'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.parishRowRight}>
                      <View style={styles.eventCountBadge}>
                        <Text style={styles.eventCountText}>{formatCount(count)}</Text>
                      </View>
                      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}

        {/* Parish detail */}
        {selectedParish ? (
          <>
            <View style={styles.parishDetailHeader}>
              <View style={styles.parishDetailIconWrap}>
                <MaterialIcons name="place" size={22} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.parishDetailTitle}>{selectedParish}</Text>
                <Text style={styles.parishDetailSub}>
                  {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''} happening here
                </Text>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: '/(tabs)/browse', params: { parish: selectedParish } } as any)}
                style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.viewAllText}>Browse All</Text>
                <MaterialIcons name="arrow-forward" size={13} color={Colors.gold} />
              </Pressable>
            </View>

            {selectedEvents.length > 0 ? (
              selectedEvents.map((event) => (
                <EventPreviewCard key={event.id} event={event} onPress={() => router.push(`/event/${event.id}` as any)} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-busy" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No events in {selectedParish}</Text>
                <Text style={styles.emptySub}>Check back soon or explore other parishes.</Text>
                <Pressable onPress={resetMap} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>View All Parishes</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        <View style={{ height: Spacing.xxl * 3 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.greenLight, flexShrink: 0 },
  subtitle: { fontSize: Typography.sm, color: Colors.textMuted },

  adminToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  adminToggleBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  adminToggleText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  adminToggleTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  adminStatusBanner: {
    position: 'absolute', top: 8, left: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, gap: 10,
  },
  adminStatusItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adminStatusDot: { width: 8, height: 8, borderRadius: 4 },
  adminStatusNum: { fontSize: Typography.sm, fontWeight: Typography.black, color: '#fff' },
  adminStatusLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  adminStatusDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.2)' },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  clearBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9, backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  // Map — part of scroll content, NOT sticky
  mapWrap: {
    height: SCREEN_WIDTH * 0.72,
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  legendOverlay: {
    position: 'absolute', bottom: 8, right: 10,
    flexDirection: 'row', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 9, color: 'rgba(255,255,255,0.7)' },

  chipScrollWrap: {
    height: 52, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  chipRow: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs,
    flexDirection: 'row', alignItems: 'center', height: 52,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, height: 34, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  chipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  chipCount: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  chipCountActive: { backgroundColor: 'rgba(0,0,0,0.25)' },
  chipCountText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textMuted },
  chipCountTextActive: { color: Colors.textOnGold },

  content: { paddingHorizontal: 0 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.md, marginTop: Spacing.xs, paddingHorizontal: Spacing.base,
  },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, paddingHorizontal: Spacing.base },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs,
  },
  statNum: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },

  parishRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
    marginBottom: Spacing.sm, gap: Spacing.md, marginHorizontal: Spacing.base,
  },
  parishRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  parishThumb: { width: 44, height: 44, borderRadius: Radius.md, flexShrink: 0 },
  parishInfo: { flex: 1, gap: 3 },
  parishName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  parishMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  parishRowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 0 },
  eventCountBadge: {
    minWidth: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xs, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  eventCountText: { fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.gold },

  parishDetailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33`,
    marginBottom: Spacing.md, marginHorizontal: Spacing.base,
  },
  parishDetailIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: `${Colors.gold}22`, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  parishDetailTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.gold },
  parishDetailSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  viewAllText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.base },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  emptyBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.lg,
    marginHorizontal: Spacing.base, marginTop: Spacing.sm, padding: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: '#FF7777', lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  retryBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  dateFilterWrap: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  dateFilterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  dateFilterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  dateFilterChipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  dateFilterChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
});
