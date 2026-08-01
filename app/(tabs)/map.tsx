import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEvents } from '../../hooks/useEvents';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';
import { PARISHES, EVENT_TYPES, TYPE_COLORS, formatDate, formatCount, Event } from '../../constants/data';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Parish geographic positions (% of map container) ────────────────────────
// Approximate lat/lon mapped to a rectangular container representing Jamaica.
// Jamaica spans roughly: W 77.9° → E 76.2° (lon), N 18.5° → S 17.7° (lat)
const PARISH_POSITIONS: Record<string, { x: number; y: number }> = {
  'Hanover':        { x: 8.5,  y: 34 },
  'St. James':      { x: 19,   y: 23 },
  'Trelawny':       { x: 34,   y: 17 },
  'St. Ann':        { x: 50,   y: 14 },
  'St. Mary':       { x: 66,   y: 22 },
  'Portland':       { x: 82,   y: 24 },
  'St. Thomas':     { x: 91,   y: 65 },
  'Kingston':       { x: 80,   y: 80 },
  'St. Andrew':     { x: 74,   y: 62 },
  'St. Catherine':  { x: 65,   y: 66 },
  'Clarendon':      { x: 54,   y: 60 },
  'Manchester':     { x: 47,   y: 52 },
  'St. Elizabeth':  { x: 33,   y: 68 },
  'Westmoreland':   { x: 11,   y: 72 },
};

// Island outline points (percentage-based polygon approximating Jamaica's shape)
// Used to draw a dark-green filled shape behind the pins.
const ISLAND_POLY = [
  [5,   45], [8,  35], [10, 28], [16, 18], [25, 10], [35, 7 ],
  [45, 5 ], [55, 6 ], [64, 10], [73, 14], [82, 15], [90, 20],
  [96, 30], [98, 40], [97, 55], [93, 68], [87, 78], [80, 85],
  [72, 88], [62, 88], [52, 86], [40, 84], [28, 82], [18, 80],
  [10, 75], [5,  65], [3,  55], [4,  48],
];

// ─── Island SVG-like shape drawn with absolute positioned views ───────────────
// We use a simpler approach: a styled View with borderRadius approximating the island.
// The "true" outline is achieved with a combination of two overlapping rounded rects.

// ─── Types ────────────────────────────────────────────────────────────────────
interface PinProps {
  parish: string;
  count: number;
  x: number;
  y: number;
  isSelected: boolean;
  onPress: () => void;
  mapWidth: number;
  mapHeight: number;
}

// ─── Parish Pin Component ─────────────────────────────────────────────────────
function ParishPin({ parish, count, x, y, isSelected, onPress, mapWidth, mapHeight }: PinProps) {
  const hasEvents = count > 0;
  const PIN_SIZE = isSelected ? 36 : hasEvents ? 30 : 22;
  const left = (x / 100) * mapWidth - PIN_SIZE / 2;
  const top  = (y / 100) * mapHeight - PIN_SIZE / 2;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pin, { left, top, width: PIN_SIZE + 16, height: PIN_SIZE + 20 }]}
      hitSlop={6}
    >
      {/* Glow ring for selected */}
      {isSelected && (
        <View style={[styles.pinGlow, { width: PIN_SIZE + 14, height: PIN_SIZE + 14, borderRadius: (PIN_SIZE + 14) / 2 }]} />
      )}

      {/* Pin dot */}
      <View style={[
        styles.pinDot,
        { width: PIN_SIZE, height: PIN_SIZE, borderRadius: PIN_SIZE / 2 },
        hasEvents ? styles.pinDotActive : styles.pinDotEmpty,
        isSelected && styles.pinDotSelected,
      ]}>
        {hasEvents ? (
          <Text style={[styles.pinCount, isSelected && styles.pinCountSelected]}>
            {count}
          </Text>
        ) : (
          <View style={styles.pinEmptyDot} />
        )}
      </View>

      {/* Label on selection */}
      {isSelected && (
        <View style={styles.pinLabel}>
          <Text style={styles.pinLabelText} numberOfLines={1}>{parish}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Event Preview Card ────────────────────────────────────────────────────────
function EventPreviewCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const typeInfo  = EVENT_TYPES.find((t) => t.id === event.type);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [previewStyles.card, pressed && { opacity: 0.88 }]}
    >
      {/* Flyer thumbnail */}
      <View style={previewStyles.imgWrap}>
        <Image
          source={{ uri: event.coverImage }}
          style={previewStyles.img}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Type badge */}
        <View style={[previewStyles.typeBadge, { backgroundColor: `${typeColor}CC` }]}>
          <MaterialIcons name={typeInfo?.icon as any} size={10} color="#fff" />
        </View>
      </View>

      {/* Info */}
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
          <Text style={[
            previewStyles.price,
            (event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry') && previewStyles.priceFree,
          ]}>
            {event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? 'Free' : event.ticketPrice}
          </Text>
          <View style={previewStyles.heatRow}>
            <MaterialIcons name="people" size={10} color={Colors.textMuted} />
            <Text style={previewStyles.heatText}>{formatCount(event.goingCount + event.interestedCount)}</Text>
          </View>
        </View>
      </View>

      {/* Arrow */}
      <View style={previewStyles.arrow}>
        <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.gold} />
      </View>
    </Pressable>
  );
}

const previewStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  imgWrap: {
    width: 80,
    height: 80,
    position: 'relative',
    flexShrink: 0,
  },
  img: { width: '100%', height: '100%' },
  typeBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 3,
  },
  title: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    lineHeight: 17,
  },
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
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();
  const [selectedParish, setSelectedParish] = useState<string | null>(null);

  // Map container dimensions
  const MAP_W = SCREEN_WIDTH - Spacing.base * 2;
  const MAP_H = Math.round(MAP_W * 0.52); // ~52% aspect for Jamaica proportions

  // Event counts per parish
  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PARISHES.forEach((p) => { counts[p] = 0; });
    events.forEach((e) => {
      if (counts[e.parish] !== undefined) counts[e.parish]++;
    });
    return counts;
  }, [events]);

  // Events for the selected parish (or all for stats)
  const selectedEvents = useMemo(() => {
    if (!selectedParish) return [];
    return events.filter((e) => e.parish === selectedParish);
  }, [events, selectedParish]);

  // All parishes that have events
  const activeParishes = useMemo(
    () => PARISHES.filter((p) => parishCounts[p] > 0),
    [parishCounts]
  );

  const totalEvents = events.length;
  const activeCount = activeParishes.length;

  const handleParishPress = useCallback((parish: string) => {
    setSelectedParish((prev) => (prev === parish ? null : parish));
  }, []);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Events Map</Text>
            <Text style={styles.subtitle}>
              {activeCount} active parishes · {totalEvents} events island-wide
            </Text>
          </View>
          {selectedParish && (
            <Pressable
              onPress={() => setSelectedParish(null)}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="filter-list-off" size={15} color={Colors.gold} />
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>

        {/* ── Map card (sticky) ── */}
        <View style={styles.mapCardWrap}>
          <View style={[styles.mapCard, { width: MAP_W, height: MAP_H }]}>

            {/* Background gradient sky */}
            <LinearGradient
              colors={['#020D05', '#051A0A', '#071F0C']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Island body — two overlapping shapes approximate Jamaica's elongated form */}
            <View style={[styles.islandBody, {
              width: MAP_W * 0.86,
              height: MAP_H * 0.55,
              left: MAP_W * 0.07,
              top: MAP_H * 0.26,
              borderRadius: MAP_H * 0.28,
            }]} />
            {/* Northern bulge */}
            <View style={[styles.islandBody, {
              width: MAP_W * 0.62,
              height: MAP_H * 0.40,
              left: MAP_W * 0.19,
              top: MAP_H * 0.12,
              borderRadius: MAP_H * 0.20,
            }]} />
            {/* Eastern tip */}
            <View style={[styles.islandBodyAlt, {
              width: MAP_W * 0.18,
              height: MAP_H * 0.30,
              left: MAP_W * 0.78,
              top: MAP_H * 0.30,
              borderRadius: MAP_H * 0.12,
              transform: [{ rotate: '-15deg' }],
            }]} />

            {/* Subtle grid lines */}
            {[0.25, 0.5, 0.75].map((frac) => (
              <View key={`h${frac}`} style={[styles.gridLine, {
                top: MAP_H * frac,
                width: '100%',
                height: 1,
              }]} />
            ))}
            {[0.25, 0.5, 0.75].map((frac) => (
              <View key={`v${frac}`} style={[styles.gridLine, {
                left: MAP_W * frac,
                width: 1,
                height: '100%',
              }]} />
            ))}

            {/* "JAMAICA" watermark */}
            <Text style={[styles.watermark, { left: MAP_W * 0.35, top: MAP_H * 0.38 }]}>
              JAMAICA
            </Text>

            {/* Parish pins */}
            {PARISHES.map((parish) => {
              const pos = PARISH_POSITIONS[parish];
              if (!pos) return null;
              const count = parishCounts[parish] ?? 0;
              const isSelected = selectedParish === parish;
              return (
                <ParishPin
                  key={parish}
                  parish={parish}
                  count={count}
                  x={pos.x}
                  y={pos.y}
                  isSelected={isSelected}
                  onPress={() => handleParishPress(parish)}
                  mapWidth={MAP_W}
                  mapHeight={MAP_H}
                />
              );
            })}

            {/* Compass rose */}
            <View style={[styles.compass, { right: Spacing.md, bottom: Spacing.md }]}>
              <MaterialIcons name="explore" size={20} color={`${Colors.gold}66`} />
            </View>
          </View>

          {/* Map legend strip */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.gold }]} />
              <Text style={styles.legendText}>Has events</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.greenLight, width: 12, height: 12, borderRadius: 6 }]} />
              <Text style={styles.legendText}>Selected</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.surfaceBorder }]} />
              <Text style={styles.legendText}>No events</Text>
            </View>
            <Text style={styles.legendTip}>Tap a pin to explore</Text>
          </View>
        </View>

        {/* ── Parish chip strip ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          <Pressable
            onPress={() => setSelectedParish(null)}
            style={[styles.chip, !selectedParish && styles.chipActive]}
          >
            <MaterialIcons
              name="public"
              size={13}
              color={!selectedParish ? Colors.textOnGold : Colors.textMuted}
            />
            <Text style={[styles.chipText, !selectedParish && styles.chipTextActive]}>
              All Island
            </Text>
          </Pressable>

          {activeParishes.map((parish) => {
            const isActive = selectedParish === parish;
            return (
              <Pressable
                key={parish}
                onPress={() => handleParishPress(parish)}
                style={[styles.chip, isActive && styles.chipActive]}
              >
                <MaterialIcons
                  name="place"
                  size={13}
                  color={isActive ? Colors.textOnGold : Colors.gold}
                />
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {parish}
                </Text>
                <View style={[styles.chipCount, isActive && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, isActive && styles.chipCountTextActive]}>
                    {parishCounts[parish]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Content area ── */}
        <View style={styles.content}>

          {/* No parish selected — island stats */}
          {!selectedParish && (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.goldBar} />
                <Text style={styles.sectionTitle}>Island Overview</Text>
              </View>

              {/* Stats row */}
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

              {/* Parish breakdown list */}
              <View style={styles.sectionHeader}>
                <View style={styles.goldBar} />
                <Text style={styles.sectionTitle}>Events by Parish</Text>
              </View>

              {activeParishes.map((parish) => {
                const count = parishCounts[parish];
                const pEvents = events.filter((e) => e.parish === parish);
                const topEvent = pEvents[0];

                return (
                  <Pressable
                    key={parish}
                    onPress={() => handleParishPress(parish)}
                    style={({ pressed }) => [styles.parishRow, pressed && { opacity: 0.85 }]}
                  >
                    <View style={styles.parishRowLeft}>
                      {topEvent ? (
                        <Image
                          source={{ uri: topEvent.coverImage }}
                          style={styles.parishThumb}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={[styles.parishThumb, { backgroundColor: Colors.surfaceElevated }]} />
                      )}
                      <View style={styles.parishInfo}>
                        <Text style={styles.parishName}>{parish}</Text>
                        <Text style={styles.parishMeta}>
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
              })}
            </>
          )}

          {/* Parish selected — event preview cards */}
          {selectedParish && (
            <>
              {/* Parish header */}
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
                  onPress={() => router.push({
                    pathname: '/(tabs)/browse',
                    params: { parish: selectedParish },
                  } as any)}
                  style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.viewAllText}>Browse All</Text>
                  <MaterialIcons name="arrow-forward" size={13} color={Colors.gold} />
                </Pressable>
              </View>

              {selectedEvents.length > 0 ? (
                selectedEvents.map((event) => (
                  <EventPreviewCard
                    key={event.id}
                    event={event}
                    onPress={() => router.push(`/event/${event.id}` as any)}
                  />
                ))
              ) : (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <MaterialIcons name="event-busy" size={36} color={Colors.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>No events in {selectedParish}</Text>
                  <Text style={styles.emptySub}>Check back soon or explore other parishes.</Text>
                  <Pressable onPress={() => setSelectedParish(null)} style={styles.emptyBtn}>
                    <Text style={styles.emptyBtnText}>View All Parishes</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  clearBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  // Map card
  mapCardWrap: {
    margin: Spacing.base,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.card,
  },
  mapCard: {
    position: 'relative',
    overflow: 'hidden',
  },

  // Island shapes
  islandBody: {
    position: 'absolute',
    backgroundColor: '#0D2B14',
    borderWidth: 1,
    borderColor: '#1A4A22',
  },
  islandBodyAlt: {
    position: 'absolute',
    backgroundColor: '#0D2B14',
    borderWidth: 1,
    borderColor: '#1A4A22',
  },

  // Grid
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  watermark: {
    position: 'absolute',
    fontSize: 11,
    color: 'rgba(0,122,51,0.18)',
    fontWeight: Typography.black,
    letterSpacing: 7,
  },

  compass: {
    position: 'absolute',
  },

  // Pin
  pin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  pinGlow: {
    position: 'absolute',
    top: 2,
    backgroundColor: `${Colors.greenLight}22`,
    borderWidth: 1.5,
    borderColor: `${Colors.greenLight}55`,
  },
  pinDot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  pinDotEmpty: {
    backgroundColor: Colors.surfaceBorder,
  },
  pinDotActive: {
    backgroundColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 5,
  },
  pinDotSelected: {
    backgroundColor: Colors.greenLight,
    borderColor: '#fff',
    shadowColor: Colors.greenLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  pinCount: {
    fontSize: 9,
    fontWeight: Typography.black,
    color: Colors.textOnGold,
    lineHeight: 11,
  },
  pinCountSelected: {
    color: '#fff',
  },
  pinEmptyDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  pinLabel: {
    marginTop: 2,
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    maxWidth: 90,
    alignItems: 'center',
  },
  pinLabelText: {
    fontSize: 8.5,
    fontWeight: Typography.bold,
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, color: Colors.textMuted },
  legendTip: { marginLeft: 'auto', fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },

  // Chip strip
  chipScroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  chipRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  chipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  chipText: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  chipTextActive: {
    color: Colors.textOnGold,
    fontWeight: Typography.bold,
  },
  chipCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipCountActive: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  chipCountText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
  },
  chipCountTextActive: {
    color: Colors.textOnGold,
  },

  // Content
  content: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statNum: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Parish breakdown row
  parishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  parishRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  parishThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  parishInfo: { flex: 1, gap: 3 },
  parishName: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  parishMeta: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    numberOfLines: 1,
  } as any,
  parishRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  eventCountBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  eventCountText: {
    fontSize: Typography.sm,
    fontWeight: Typography.black,
    color: Colors.gold,
  },

  // Parish detail header (when selected)
  parishDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    marginBottom: Spacing.md,
  },
  parishDetailIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.gold}22`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  parishDetailTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.gold,
  },
  parishDetailSub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  viewAllText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
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
  emptyTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  emptyBtnText: {
    fontSize: Typography.sm,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
});
