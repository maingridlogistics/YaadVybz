import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { JamaicaMap } from '../../components/feature/JamaicaMap';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { PARISHES, EVENT_TYPES, TYPE_COLORS, formatDate, formatCount, Event } from '../../constants/data';

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
        <Image source={{ uri: event.coverImage }} style={previewStyles.img} contentFit="cover" transition={200} />
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

// ─── Main Map Screen ───────────────────────────────────────────────────────────
export default function MapScreen() {
  const router = useRouter();
  const { events, refreshEvents } = useEvents();
  const { unreadCount } = useNotifications();
  const [selectedParish, setSelectedParish] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  };

  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PARISHES.forEach((p) => { counts[p] = 0; });
    events.forEach((e) => { if (counts[e.parish] !== undefined) counts[e.parish]++; });
    return counts;
  }, [events]);

  const selectedEvents = useMemo(() => {
    if (!selectedParish) return [];
    return events.filter((e) => e.parish === selectedParish);
  }, [events, selectedParish]);

  const activeParishes = useMemo(
    () => PARISHES.filter((p) => parishCounts[p] > 0),
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
      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Events Map</Text>
            <Text style={styles.subtitle}>
              {activeCount} active parishes · {totalEvents} events island-wide
            </Text>
          </View>
          <View style={styles.headerRight}>
            {selectedParish && (
              <Pressable
                onPress={resetMap}
                style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
              >
                <MaterialIcons name="filter-list-off" size={15} color={Colors.gold} />
                <Text style={styles.clearBtnText}>Clear</Text>
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
      </SafeAreaView>

      {/* ── Map (platform-specific: real MapView on native, grid on web) ── */}
      <View style={styles.mapWrap}>
        <JamaicaMap
          parishCounts={parishCounts}
          selectedParish={selectedParish}
          onParishPress={handleParishPress}
        />

        {/* Legend overlay (native only, hidden on web via the component itself) */}
        <View style={styles.legendOverlay} pointerEvents="none">
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
        </View>
      </View>

      {/* ── Parish chip strip ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
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
                  {parishCounts[parish]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Scrollable bottom content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />}
      >

        {/* Island-wide overview */}
        {!selectedParish && (
          <>
            <PlacementAd placementName="Map Screen" style={{ marginBottom: Spacing.md }} />
            <View style={styles.sectionHeader}>
              <View style={styles.goldBar} />
              <Text style={styles.sectionTitle}>Island Overview</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <MaterialIcons name="event" size={20} color={Colors.gold} />
                <Text style={styles.statNum}>{totalEvents}</Text>
                <Text style={styles.statLabel}>Total Events</Text>
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

            {activeParishes.length === 0 ? (
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
                        <Text style={styles.eventCountText}>{count}</Text>
                      </View>
                      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </>
        )}

        {/* Parish detail */}
        {selectedParish && (
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
        )}

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
  subtitle: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  clearBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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

  mapWrap: {
    height: SCREEN_WIDTH * 0.62,
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

  chipScroll: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, maxHeight: 52 },
  chipRow: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs, flexDirection: 'row', alignItems: 'center' },
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

  content: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md, marginTop: Spacing.xs },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
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
    marginBottom: Spacing.sm, gap: Spacing.md,
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
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33`, marginBottom: Spacing.md,
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

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  emptyBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
