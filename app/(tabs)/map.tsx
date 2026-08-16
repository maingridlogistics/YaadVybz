// ─── Unified Map Tab ──────────────────────────────────────────────────────────
// Events | Businesses discovery using the existing parish-level map.
//
// MODE: EVENTS
//   Parish markers show event counts. Select a parish → list upcoming events.
//   Filters: All Dates / Today / This Weekend.
//
// MODE: BUSINESSES
//   Parish markers show business counts (live, non-private-home, non-mobile-only).
//   Select a parish → list businesses in that parish.
//   Filters: Category chip rail, Verified toggle.
//
// PRIVACY:
//   Business markers are PARISH-LEVEL only. No individual GPS pins are shown.
//   The search_businesses RPC returns only public fields — private home/mobile
//   businesses appear in the list but their precise coordinates are never exposed.
//   Service-area businesses show "Serves {parish}" labels to avoid implying
//   they are physically located there.
//
// LOCATION:
//   Fine/coarse location is blocked in app.json Android config (by design).
//   The map works fully via manual parish selection — no GPS required.
//
// BUSINESS DATA ARCHITECTURE (two-pass):
//   overviewBizResults: island-wide (parish:null) — used to build marker counts.
//     Counts are by primary_parish, representing where businesses are HQ'd.
//     Category and Verified filters apply here so counts match active filter state.
//   parishBizResults: targeted per-parish query when a parish is selected.
//     Returned by search_businesses(parish:X) which includes BOTH:
//     (a) businesses physically located in the parish
//     (b) service-area businesses that legitimately serve the parish
//     This matches the Business Explore definition.
//     Service-area results carry serves_parish:true → rendered as "Serves {parish}".

import React, { useState, useMemo, useEffect, useCallback, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
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
import {
  PARISHES,
  EVENT_TYPES,
  TYPE_COLORS,
  formatDate,
  formatCount,
  Event,
  isEventPassed,
  isToday,
  isThisWeekend,
} from '../../constants/data';
import {
  searchBusinesses,
  fetchBusinessCategories,
  BusinessSearchResult,
  BusinessCategory,
} from '../../services/businessService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Business marker color (distinct from Events gold) ───────────────────────
const BIZ_COLOR = '#4CAF50'; // green — clearly different from event gold

// ─── Mode toggle ──────────────────────────────────────────────────────────────
type MapMode = 'events' | 'businesses';

function ModeToggle({ value, onChange }: { value: MapMode; onChange: (m: MapMode) => void }) {
  return (
    <View style={mt.wrap}>
      {(['events', 'businesses'] as const).map((m) => {
        const active = value === m;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            style={[mt.btn, active && mt.btnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <MaterialIcons
              name={m === 'events' ? 'event' : 'storefront'}
              size={13}
              color={active ? Colors.textOnGold : Colors.textSecondary}
            />
            <Text style={[mt.label, active && mt.labelActive]}>
              {m === 'events' ? 'Events' : 'Businesses'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const mt = StyleSheet.create({
  wrap: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 3,
    borderWidth: 1, borderColor: Colors.surfaceBorder, height: 40,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
  },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5, borderRadius: Radius.sm - 1,
  },
  btnActive: { backgroundColor: Colors.gold },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  labelActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
});

// ─── Event Preview Card ────────────────────────────────────────────────────────
const EventPreviewCard = memo(function EventPreviewCard({
  event,
  onPress,
}: {
  event: Event;
  onPress: () => void;
}) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const typeInfo = EVENT_TYPES.find((t) => t.id === event.type);
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [previewStyles.card, pressed && { opacity: 0.88 }]}
      accessibilityLabel={`${event.title}, ${event.parish}`}
    >
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
            <Text style={previewStyles.heatText}>
              {formatCount(event.goingCount + event.interestedCount)}
            </Text>
          </View>
        </View>
      </View>
      <View style={previewStyles.arrow}>
        <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.gold} />
      </View>
    </Pressable>
  );
});

const previewStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden', marginBottom: Spacing.sm,
    marginHorizontal: Spacing.base,
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

// ─── Business Preview Card ─────────────────────────────────────────────────────
const BizPreviewCard = memo(function BizPreviewCard({
  biz,
  contextParish,
  onPress,
}: {
  biz: BusinessSearchResult;
  contextParish: string;
  onPress: () => void;
}) {
  // Service-area match: show "Serves {contextParish}" — does NOT reveal primary location.
  // Physical match: show "Town, Parish" — accurate physical address context.
  const locationStr = biz.serves_parish
    ? `Serves ${contextParish}`
    : biz.town
    ? `${biz.town}, ${biz.primary_parish}`
    : biz.primary_parish;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bizPreviewStyles.card, pressed && { opacity: 0.88 }]}
      accessibilityLabel={`${biz.name}, ${biz.category_label}`}
    >
      <View style={bizPreviewStyles.thumbWrap}>
        {biz.cover_url ?? biz.logo_url ? (
          <Image
            source={{ uri: (biz.cover_url ?? biz.logo_url)! }}
            style={bizPreviewStyles.thumb}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[bizPreviewStyles.thumb, bizPreviewStyles.thumbPlaceholder]}>
            <MaterialIcons name={biz.category_icon as any} size={20} color={biz.category_color} />
          </View>
        )}
        <View style={[bizPreviewStyles.catBadge, { backgroundColor: biz.category_color }]}>
          <MaterialIcons name={biz.category_icon as any} size={8} color="#fff" />
        </View>
      </View>
      <View style={bizPreviewStyles.info}>
        <View style={bizPreviewStyles.nameRow}>
          <Text style={bizPreviewStyles.name} numberOfLines={1}>{biz.name}</Text>
          {biz.verified ? (
            <MaterialIcons name="verified" size={12} color={Colors.gold} />
          ) : null}
        </View>
        <Text style={[bizPreviewStyles.cat, { color: biz.category_color }]} numberOfLines={1}>
          {biz.category_label}
        </Text>
        <View style={bizPreviewStyles.metaRow}>
          <MaterialIcons
            name={biz.serves_parish ? 'near-me' : 'place'}
            size={10}
            color={biz.serves_parish ? Colors.info : Colors.textMuted}
          />
          <Text
            style={[bizPreviewStyles.location, biz.serves_parish && { color: Colors.info }]}
            numberOfLines={1}
          >
            {locationStr}
          </Text>
        </View>
        {biz.avg_rating != null && biz.avg_rating > 0 ? (
          <View style={bizPreviewStyles.ratingRow}>
            <MaterialIcons name="star" size={10} color={Colors.gold} />
            <Text style={bizPreviewStyles.rating}>{biz.avg_rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <View style={bizPreviewStyles.arrow}>
        <MaterialIcons name="arrow-forward-ios" size={12} color={BIZ_COLOR} />
      </View>
    </Pressable>
  );
});

const bizPreviewStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    marginBottom: Spacing.sm, marginHorizontal: Spacing.base,
  },
  thumbWrap: { width: 80, height: 80, position: 'relative', flexShrink: 0 },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: {
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  catBadge: {
    position: 'absolute', top: 5, left: 5,
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  cat: { fontSize: 11, fontWeight: Typography.semibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: 11, color: Colors.gold, fontWeight: Typography.bold },
  arrow: { paddingRight: Spacing.md },
});

// ─── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  const opacity = useSharedValue(0.4);
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
  const { events, isLoading: eventsLoading, error, clearError, refreshEvents, allEvents } = useEvents();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  // ── Mode ────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<MapMode>('events');

  // ── Shared state ────────────────────────────────────────────────────────────
  const [selectedParish, setSelectedParish] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Events-mode state ───────────────────────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'weekend'>('all');
  const [adminStatusOverlay, setAdminStatusOverlay] = useState(false);

  // ── Business-mode state ─────────────────────────────────────────────────────
  // overviewBizResults: island-wide (parish:null) — for marker counts
  // parishBizResults:   parish-scoped (parish:X) — for the detail list when a parish is selected
  const [overviewBizResults, setOverviewBizResults] = useState<BusinessSearchResult[]>([]);
  const [parishBizResults, setParishBizResults] = useState<BusinessSearchResult[]>([]);
  const [bizLoading, setBizLoading] = useState(false);
  const [parishBizLoading, setParishBizLoading] = useState(false);
  const [bizError, setBizError] = useState(false);
  const [parishBizError, setParishBizError] = useState(false);
  const [bizCategories, setBizCategories] = useState<BusinessCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const overviewTokenRef = useRef(0);
  const parishTokenRef = useRef(0);

  // ── Load overview (island-wide) business data ───────────────────────────────
  // Loads all businesses with no parish filter to build per-parish counts.
  // Category filter applies here so counts stay consistent with the active chip.
  const loadOverviewBusinesses = useCallback(async (categoryId: string | null) => {
    setBizLoading(true);
    setBizError(false);
    const token = ++overviewTokenRef.current;
    const { results, error: err } = await searchBusinesses({
      parish: null, categoryId: categoryId ?? null, query: null, limit: 400, offset: 0,
    });
    if (token !== overviewTokenRef.current) return;
    if (err) { setBizError(true); } else { setOverviewBizResults(results); }
    setBizLoading(false);
  }, []);

  // ── Load parish-specific business data ────────────────────────────────────
  // Returns BOTH physical businesses in the parish AND service-area businesses
  // that cover the parish — matches Business Explore behaviour.
  const loadParishBusinesses = useCallback(async (parish: string, categoryId: string | null) => {
    setParishBizLoading(true);
    setParishBizError(false);
    const token = ++parishTokenRef.current;
    const { results, error: err } = await searchBusinesses({
      parish, categoryId: categoryId ?? null, query: null, limit: 200, offset: 0,
    });
    if (token !== parishTokenRef.current) return;
    if (err) { setParishBizError(true); } else { setParishBizResults(results); }
    setParishBizLoading(false);
  }, []);

  // Overview load: fires when entering businesses mode or category filter changes
  useEffect(() => {
    if (mode === 'businesses') {
      loadOverviewBusinesses(selectedCategoryId);
    }
  }, [mode, selectedCategoryId, loadOverviewBusinesses]);

  // Parish load: fires when a parish is selected (or category changes while parish is active)
  useEffect(() => {
    if (mode === 'businesses' && selectedParish) {
      loadParishBusinesses(selectedParish, selectedCategoryId);
    } else {
      setParishBizResults([]); // clear stale data when parish is deselected
    }
  }, [mode, selectedParish, selectedCategoryId, loadParishBusinesses]);

  // Load business categories once
  useEffect(() => {
    if (bizCategories.length === 0) {
      fetchBusinessCategories().then(setBizCategories).catch(() => {});
    }
  }, [bizCategories.length]);

  // ── Mode switch: clear per-mode state to prevent contamination ─────────────
  const handleModeChange = useCallback((next: MapMode) => {
    setMode(next);
    setSearchQuery('');
    // Reset business filters when switching away so they don't bleed into Events mode
    if (next === 'events') {
      setSelectedCategoryId(null);
      setVerifiedOnly(false);
    }
    // Keep selectedParish for smoother UX
  }, []);

  // ── Refresh ─────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (mode === 'events') {
      await refreshEvents();
    } else {
      const tasks: Promise<void>[] = [
        loadOverviewBusinesses(selectedCategoryId).then(() => {}),
      ];
      if (selectedParish) {
        tasks.push(loadParishBusinesses(selectedParish, selectedCategoryId).then(() => {}));
      }
      await Promise.all(tasks);
    }
    setRefreshing(false);
  }, [mode, refreshEvents, loadOverviewBusinesses, loadParishBusinesses, selectedParish, selectedCategoryId]);

  // ── Admin status (events only) ──────────────────────────────────────────────
  const adminStatusCounts = useMemo(() => {
    if (!isAdmin || !adminStatusOverlay || mode !== 'events') return null;
    const source = allEvents.length > 0 ? allEvents : events;
    const counts = { live: 0, pending: 0, flagged: 0 };
    source.forEach((e: any) => {
      if (e.status === 'flagged') counts.flagged++;
      else if (e.status === 'pending') counts.pending++;
      else counts.live++;
    });
    return counts;
  }, [isAdmin, adminStatusOverlay, allEvents, events, mode]);

  // ── Events computations ─────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (isEventPassed(e.date)) return false;
      if (dateFilter === 'today') return isToday(e.date);
      if (dateFilter === 'weekend') return isThisWeekend(e.date);
      return true;
    });
  }, [events, dateFilter]);

  const eventParishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PARISHES.forEach((p) => { counts[p] = 0; });
    filteredEvents.forEach((e) => { if (counts[e.parish] !== undefined) counts[e.parish]++; });
    return counts;
  }, [filteredEvents]);

  const selectedEvents = useMemo(() => {
    if (!selectedParish) return [];
    return filteredEvents.filter((e) => e.parish === selectedParish);
  }, [filteredEvents, selectedParish]);

  const eventActiveParishes = useMemo(
    () => PARISHES.filter((p) => eventParishCounts[p] > 0),
    [eventParishCounts]
  );

  const eventFilteredTotal = useMemo(
    () => Object.values(eventParishCounts).reduce((s, c) => s + c, 0),
    [eventParishCounts]
  );

  // ── Business computations ───────────────────────────────────────────────────
  //
  // Overview counts: by primary_parish from overviewBizResults (island-wide load).
  //   These represent where businesses are physically headquartered.
  //   Verified filter applies so the marker count matches what the Verified chip shows.
  //   Note: service-area coverage of OTHER parishes is intentionally not added here —
  //   the overview map communicates "businesses based here", not "businesses that serve here".
  //   The parish detail list (parishBizResults) correctly includes service-area businesses.
  //
  // Parish detail: from parishBizResults (parish-scoped load via search_businesses RPC).
  //   Includes physical + service-area businesses available in the parish.
  //   Verified + search filters applied on top of the server result.

  const filteredOverviewResults = useMemo(() => {
    return verifiedOnly ? overviewBizResults.filter((b) => b.verified) : overviewBizResults;
  }, [overviewBizResults, verifiedOnly]);

  const bizParishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PARISHES.forEach((p) => { counts[p] = 0; });
    filteredOverviewResults.forEach((b) => {
      if (counts[b.primary_parish] !== undefined) counts[b.primary_parish]++;
    });
    return counts;
  }, [filteredOverviewResults]);

  // Parish detail: parishBizResults scoped to selectedParish (physical + service-area).
  // Apply verified and contextual search filters on top.
  const selectedBizResults = useMemo(() => {
    if (!selectedParish) return [];
    let list = parishBizResults;
    if (verifiedOnly) list = list.filter((b) => b.verified);
    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase();
      list = list.filter((b) =>
        b.name.toLowerCase().includes(q) ||
        b.category_label.toLowerCase().includes(q) ||
        (b.town ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [parishBizResults, selectedParish, verifiedOnly, searchQuery]);

  const bizActiveParishes = useMemo(
    () => PARISHES.filter((p) => bizParishCounts[p] > 0),
    [bizParishCounts]
  );

  const bizTotal = useMemo(
    () => Object.values(bizParishCounts).reduce((s, c) => s + c, 0),
    [bizParishCounts]
  );

  // Verified count for the stat card (from island-wide overview, no other filters)
  const verifiedCount = useMemo(
    () => overviewBizResults.filter((b) => b.verified).length,
    [overviewBizResults]
  );

  // ── Derived for current mode ────────────────────────────────────────────────
  const parishCounts = mode === 'events' ? eventParishCounts : bizParishCounts;
  const activeParishes = mode === 'events' ? eventActiveParishes : bizActiveParishes;
  const markerColor = mode === 'events' ? Colors.gold : BIZ_COLOR;
  const anyBizLoading = bizLoading || parishBizLoading;

  // ── Event search in parish context ──────────────────────────────────────────
  const searchFilteredEvents = useMemo(() => {
    if (searchQuery.trim().length < 2) return selectedEvents;
    const q = searchQuery.toLowerCase();
    return selectedEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.typeLabel.toLowerCase().includes(q) ||
        e.parish.toLowerCase().includes(q)
    );
  }, [selectedEvents, searchQuery]);

  // ── Pulse animation (live dot) ──────────────────────────────────────────────
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 950 }), withTiming(1, { duration: 950 })),
      -1, false,
    );
  }, [pulseOpacity]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const handleParishPress = useCallback((parish: string) => {
    setSelectedParish((prev) => (prev === parish ? null : parish));
    setSearchQuery('');
  }, []);

  const resetMap = useCallback(() => {
    setSelectedParish(null);
    setSearchQuery('');
  }, []);

  // ── Subtitle ────────────────────────────────────────────────────────────────
  const subtitleText = useMemo(() => {
    if (mode === 'events') {
      if (eventsLoading) return 'Loading events…';
      if (dateFilter !== 'all') {
        const label = dateFilter === 'today' ? 'Today' : 'This weekend';
        return `${label} · ${eventFilteredTotal} events · ${eventActiveParishes.length} parishes`;
      }
      return `${eventActiveParishes.length} active parishes · ${events.length} events island-wide`;
    }
    if (anyBizLoading) return 'Loading businesses…';
    return `${bizActiveParishes.length} parishes · ${bizTotal} businesses`;
  }, [
    mode, eventsLoading, anyBizLoading, dateFilter,
    eventFilteredTotal, eventActiveParishes, events.length,
    bizActiveParishes.length, bizTotal,
  ]);

  return (
    <View style={styles.container}>
      {/* ── STICKY HEADER ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Map</Text>
            <View style={styles.subtitleRow}>
              <Animated.View style={[styles.liveDot, pulseStyle]} />
              <Text style={styles.subtitle} numberOfLines={1}>{subtitleText}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {isAdmin && mode === 'events' ? (
              <Pressable
                onPress={() => setAdminStatusOverlay((v) => !v)}
                style={({ pressed }) => [
                  styles.adminToggleBtn,
                  adminStatusOverlay && styles.adminToggleBtnActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <MaterialIcons
                  name="admin-panel-settings" size={15}
                  color={adminStatusOverlay ? Colors.textOnGold : Colors.gold}
                />
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
              accessibilityLabel="Notifications"
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

        <ModeToggle value={mode} onChange={handleModeChange} />

        {mode === 'events' ? (
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
                  name={icon as any} size={13}
                  color={dateFilter === key ? Colors.textOnGold : Colors.textSecondary}
                />
                <Text style={[styles.dateFilterChipText, dateFilter === key && styles.dateFilterChipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.bizFilterWrap}>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bizFilterRow}
            >
              <Pressable
                onPress={() => { setSelectedCategoryId(null); setSelectedParish(null); }}
                style={[styles.bizChip, !selectedCategoryId && styles.bizChipActive]}
              >
                <MaterialIcons name="apps" size={12} color={!selectedCategoryId ? Colors.textOnGold : Colors.textSecondary} />
                <Text style={[styles.bizChipText, !selectedCategoryId && styles.bizChipTextActive]}>All</Text>
              </Pressable>
              {bizCategories.slice(0, 10).map((cat) => {
                const active = selectedCategoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => { setSelectedCategoryId(active ? null : cat.id); setSelectedParish(null); }}
                    style={[styles.bizChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                  >
                    <MaterialIcons name={cat.icon as any} size={12} color={active ? '#fff' : cat.color} />
                    <Text style={[styles.bizChipText, active && { color: '#fff', fontWeight: Typography.bold }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setVerifiedOnly((v) => !v)}
                style={[styles.bizChip, verifiedOnly && { backgroundColor: Colors.gold, borderColor: Colors.gold }]}
              >
                <MaterialIcons name="verified" size={12} color={verifiedOnly ? Colors.textOnGold : Colors.gold} />
                <Text style={[styles.bizChipText, verifiedOnly && { color: Colors.textOnGold, fontWeight: Typography.bold }]}>
                  Verified
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        )}
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing} onRefresh={handleRefresh}
            tintColor={markerColor} colors={[markerColor]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Error banners */}
        {error && mode === 'events' ? (
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
        {(bizError || parishBizError) && mode === 'businesses' ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={16} color="#FF4444" />
            <Text style={styles.errorText} numberOfLines={2}>Could not load businesses.</Text>
            <Pressable
              onPress={() => {
                if (bizError) loadOverviewBusinesses(selectedCategoryId);
                if (parishBizError && selectedParish) loadParishBusinesses(selectedParish, selectedCategoryId);
              }}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="refresh" size={14} color={Colors.gold} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Parish-level discovery note — clarifies markers are aggregate, not individual pins */}
        <View style={styles.discoveryNote} pointerEvents="none">
          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
          <Text style={styles.discoveryNoteText}>
            {mode === 'events'
              ? 'Parish-level · tap a marker to see events'
              : 'Parish-level · tap a marker to see businesses'}
          </Text>
        </View>

        {/* Map */}
        <View style={styles.mapWrap}>
          <JamaicaMap
            parishCounts={parishCounts}
            selectedParish={selectedParish}
            onParishPress={handleParishPress}
            markerColor={markerColor}
          />
          <View style={styles.legendOverlay} pointerEvents="none">
            {adminStatusOverlay && isAdmin && mode === 'events' ? (
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
                  <View style={[styles.legendDot, { backgroundColor: markerColor }]} />
                  <Text style={styles.legendText}>
                    {mode === 'events' ? 'Has events' : 'Has businesses'}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.greenLight }]} />
                  <Text style={styles.legendText}>Selected</Text>
                </View>
              </>
            )}
          </View>
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

        {/* Parish chip strip */}
        <View style={styles.chipScrollWrap}>
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              onPress={resetMap}
              style={[styles.chip, !selectedParish && { ...styles.chipActive, backgroundColor: markerColor, borderColor: markerColor }]}
            >
              <MaterialIcons name="public" size={13} color={!selectedParish ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.chipText, !selectedParish && styles.chipTextActive]}>All Island</Text>
            </Pressable>
            {activeParishes.map((parish) => {
              const isActive = selectedParish === parish;
              const count = parishCounts[parish];
              return (
                <Pressable
                  key={parish}
                  onPress={() => handleParishPress(parish)}
                  style={[styles.chip, isActive && { ...styles.chipActive, backgroundColor: markerColor, borderColor: markerColor }]}
                >
                  <MaterialIcons name="place" size={13} color={isActive ? Colors.textOnGold : markerColor} />
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{parish}</Text>
                  <View style={[styles.chipCount, isActive && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, isActive && styles.chipCountTextActive]}>
                      {formatCount(count)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Contextual search — only when a parish is selected */}
        {selectedParish ? (
          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={17} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={
                mode === 'events'
                  ? `Search events in ${selectedParish}…`
                  : `Search businesses in ${selectedParish}…`
              }
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={`Search ${mode} in ${selectedParish}`}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── EVENTS MODE ── */}
        {mode === 'events' ? (
          <>
            {!selectedParish ? (
              <>
                <PlacementAd placementName="Map Screen" style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.md }} />
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionBar, { backgroundColor: Colors.gold }]} />
                  <Text style={styles.sectionTitle}>Island Overview</Text>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <MaterialIcons name="event" size={20} color={Colors.gold} />
                    <Text style={styles.statNum}>{formatCount(eventFilteredTotal)}</Text>
                    <Text style={styles.statLabel}>
                      {dateFilter === 'today' ? "Today's" : dateFilter === 'weekend' ? 'Weekend' : 'Upcoming'} Events
                    </Text>
                  </View>
                  <View style={styles.statCard}>
                    <MaterialIcons name="place" size={20} color={Colors.greenLight} />
                    <Text style={styles.statNum}>{eventActiveParishes.length}</Text>
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
                  <View style={[styles.sectionBar, { backgroundColor: Colors.gold }]} />
                  <Text style={styles.sectionTitle}>Events by Parish</Text>
                </View>
                {eventsLoading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : eventActiveParishes.length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialIcons name="event-note" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No events posted yet</Text>
                    <Text style={styles.emptySub}>Check back soon.</Text>
                  </View>
                ) : (
                  eventActiveParishes.map((parish) => {
                    const count = eventParishCounts[parish];
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
                          <View style={[styles.countBadge, { backgroundColor: `${Colors.gold}22`, borderColor: `${Colors.gold}44` }]}>
                            <Text style={[styles.countBadgeText, { color: Colors.gold }]}>{formatCount(count)}</Text>
                          </View>
                          <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </>
            ) : (
              <>
                <View style={[styles.parishDetailHeader, { borderColor: `${Colors.gold}33`, backgroundColor: Colors.goldSurface }]}>
                  <View style={[styles.parishDetailIconWrap, { backgroundColor: `${Colors.gold}22`, borderColor: `${Colors.gold}44` }]}>
                    <MaterialIcons name="event" size={22} color={Colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.parishDetailTitle, { color: Colors.gold }]}>{selectedParish}</Text>
                    <Text style={styles.parishDetailSub}>
                      {searchFilteredEvents.length} event{searchFilteredEvents.length !== 1 ? 's' : ''} found
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push({ pathname: '/explore/event-parish', params: { parish: selectedParish } } as any)}
                    style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.viewAllText}>Browse All</Text>
                    <MaterialIcons name="arrow-forward" size={13} color={Colors.gold} />
                  </Pressable>
                </View>
                {searchFilteredEvents.length > 0 ? (
                  searchFilteredEvents.map((event) => (
                    <EventPreviewCard
                      key={event.id} event={event}
                      onPress={() => router.push(`/event/${event.id}` as any)}
                    />
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <MaterialIcons name="event-busy" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No events found</Text>
                    <Text style={styles.emptySub}>
                      {searchQuery ? 'Try a different search term.' : `No upcoming events in ${selectedParish}.`}
                    </Text>
                    <Pressable onPress={resetMap} style={styles.emptyBtn}>
                      <Text style={styles.emptyBtnText}>View All Parishes</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        ) : null}

        {/* ── BUSINESSES MODE ── */}
        {mode === 'businesses' ? (
          <>
            {!selectedParish ? (
              <>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionBar, { backgroundColor: BIZ_COLOR }]} />
                  <Text style={styles.sectionTitle}>Island Overview</Text>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <MaterialIcons name="storefront" size={20} color={BIZ_COLOR} />
                    {bizLoading
                      ? <ActivityIndicator size="small" color={BIZ_COLOR} />
                      : <Text style={styles.statNum}>{formatCount(bizTotal)}</Text>}
                    <Text style={styles.statLabel}>Listed Businesses</Text>
                  </View>
                  <View style={styles.statCard}>
                    <MaterialIcons name="place" size={20} color={Colors.greenLight} />
                    <Text style={styles.statNum}>{bizActiveParishes.length}</Text>
                    <Text style={styles.statLabel}>Parishes</Text>
                  </View>
                  <View style={styles.statCard}>
                    <MaterialIcons name="verified" size={20} color={Colors.gold} />
                    <Text style={styles.statNum}>{formatCount(verifiedCount)}</Text>
                    <Text style={styles.statLabel}>Verified</Text>
                  </View>
                </View>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionBar, { backgroundColor: BIZ_COLOR }]} />
                  <Text style={styles.sectionTitle}>Businesses by Parish</Text>
                </View>
                {bizLoading && overviewBizResults.length === 0 ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : bizActiveParishes.length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialIcons name="store-mall-directory" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No businesses found</Text>
                    <Text style={styles.emptySub}>
                      {selectedCategoryId || verifiedOnly
                        ? 'Try clearing the filters.'
                        : 'Be the first to list a business.'}
                    </Text>
                    <Pressable onPress={() => router.push('/explore/business-parishes' as any)} style={styles.emptyBtn}>
                      <Text style={styles.emptyBtnText}>Browse Businesses</Text>
                    </Pressable>
                  </View>
                ) : (
                  bizActiveParishes.map((parish) => {
                    const count = bizParishCounts[parish];
                    const topBiz = filteredOverviewResults.find((b) => b.primary_parish === parish);
                    return (
                      <Pressable
                        key={parish}
                        onPress={() => handleParishPress(parish)}
                        style={({ pressed }) => [styles.parishRow, pressed && { opacity: 0.85 }]}
                      >
                        <View style={styles.parishRowLeft}>
                          {topBiz?.logo_url ?? topBiz?.cover_url ? (
                            <Image
                              source={{ uri: (topBiz.logo_url ?? topBiz.cover_url)! }}
                              style={styles.parishThumb} contentFit="cover" transition={200}
                            />
                          ) : (
                            <View style={[styles.parishThumb, { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
                              <MaterialIcons
                                name={topBiz ? topBiz.category_icon as any : 'storefront'}
                                size={20} color={topBiz ? topBiz.category_color : BIZ_COLOR}
                              />
                            </View>
                          )}
                          <View style={styles.parishInfo}>
                            <Text style={styles.parishName}>{parish}</Text>
                            <Text style={styles.parishMeta} numberOfLines={1}>
                              {topBiz ? topBiz.name : '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.parishRowRight}>
                          <View style={[styles.countBadge, { backgroundColor: `${BIZ_COLOR}22`, borderColor: `${BIZ_COLOR}44` }]}>
                            <Text style={[styles.countBadgeText, { color: BIZ_COLOR }]}>{formatCount(count)}</Text>
                          </View>
                          <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </>
            ) : (
              <>
                <View style={[styles.parishDetailHeader, { borderColor: `${BIZ_COLOR}33`, backgroundColor: `${BIZ_COLOR}10` }]}>
                  <View style={[styles.parishDetailIconWrap, { backgroundColor: `${BIZ_COLOR}22`, borderColor: `${BIZ_COLOR}44` }]}>
                    <MaterialIcons name="storefront" size={22} color={BIZ_COLOR} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.parishDetailTitle, { color: BIZ_COLOR }]}>{selectedParish}</Text>
                    <Text style={styles.parishDetailSub}>
                      {parishBizLoading
                        ? 'Loading…'
                        : `${selectedBizResults.length} business${selectedBizResults.length !== 1 ? 'es' : ''} available`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push({ pathname: '/explore/business-parish', params: { parish: selectedParish } } as any)}
                    style={({ pressed }) => [styles.viewAllBtn, { borderColor: `${BIZ_COLOR}44` }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={[styles.viewAllText, { color: BIZ_COLOR }]}>Browse All</Text>
                    <MaterialIcons name="arrow-forward" size={13} color={BIZ_COLOR} />
                  </Pressable>
                </View>

                {parishBizLoading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : parishBizError ? (
                  <View style={styles.errorBanner}>
                    <MaterialIcons name="error-outline" size={16} color="#FF4444" />
                    <Text style={styles.errorText}>Could not load businesses for this parish.</Text>
                    <Pressable
                      onPress={() => loadParishBusinesses(selectedParish, selectedCategoryId)}
                      style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
                    >
                      <MaterialIcons name="refresh" size={14} color={Colors.gold} />
                      <Text style={styles.retryBtnText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : selectedBizResults.length > 0 ? (
                  <>
                    {selectedBizResults.map((biz) => (
                      <BizPreviewCard
                        key={biz.id} biz={biz} contextParish={selectedParish}
                        onPress={() => router.push(`/business/${biz.id}` as any)}
                      />
                    ))}
                    {/* Service-area footnote — explains why some businesses show "Serves X" */}
                    {selectedBizResults.some((b) => b.serves_parish) ? (
                      <View style={styles.serviceAreaNote}>
                        <MaterialIcons name="near-me" size={11} color={Colors.info} />
                        <Text style={styles.serviceAreaNoteText}>
                          Businesses marked "Serves {selectedParish}" are based elsewhere
                          but cover this parish.
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <MaterialIcons name="store-mall-directory" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No businesses found</Text>
                    <Text style={styles.emptySub}>
                      {searchQuery
                        ? 'Try a different search term.'
                        : `No listed businesses available in ${selectedParish} matching current filters.`}
                    </Text>
                    <Pressable onPress={resetMap} style={styles.emptyBtn}>
                      <Text style={styles.emptyBtnText}>View All Parishes</Text>
                    </Pressable>
                  </View>
                )}
              </>
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
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, marginBottom: Spacing.sm,
  },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.greenLight, flexShrink: 0 },
  subtitle: { fontSize: Typography.sm, color: Colors.textMuted, flex: 1 },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  adminToggleBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  adminToggleBtnActive: { backgroundColor: Colors.gold },
  adminStatusBanner: {
    position: 'absolute', top: 8, left: 10, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 12, paddingVertical: 7,
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
  bellBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9, backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  dateFilterWrap: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, backgroundColor: Colors.background,
  },
  dateFilterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  dateFilterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  dateFilterChipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold },
  dateFilterChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  bizFilterWrap: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, paddingVertical: Spacing.sm },
  bizFilterRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.sm, alignItems: 'center' },
  bizChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder, minHeight: 34,
  },
  bizChipActive: { backgroundColor: BIZ_COLOR, borderColor: BIZ_COLOR },
  bizChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.medium },
  bizChipTextActive: { color: '#fff', fontWeight: Typography.bold },

  mapWrap: {
    height: SCREEN_WIDTH * 0.72, position: 'relative',
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  legendOverlay: {
    position: 'absolute', bottom: 8, right: 10, flexDirection: 'row', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 9, color: 'rgba(255,255,255,0.7)' },

  chipScrollWrap: { height: 52, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, overflow: 'hidden' },
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginVertical: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, height: 44,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1, fontSize: Typography.sm, color: Colors.textPrimary,
    paddingVertical: 0, includeFontPadding: false,
  },

  content: { paddingHorizontal: 0 },

  discoveryNote: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.base, paddingVertical: 5,
    backgroundColor: Colors.background,
  },
  discoveryNoteText: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },

  serviceAreaNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: `${Colors.info}10`, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: `${Colors.info}25`,
  },
  serviceAreaNoteText: { flex: 1, fontSize: 10, color: Colors.info, lineHeight: 15 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.md, marginTop: Spacing.md, paddingHorizontal: Spacing.base,
  },
  sectionBar: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, paddingHorizontal: Spacing.base },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs, minHeight: 80, justifyContent: 'center',
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
  countBadge: {
    minWidth: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xs, borderWidth: 1,
  },
  countBadgeText: { fontSize: Typography.sm, fontWeight: Typography.black },

  parishDetailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1,
    marginBottom: Spacing.md, marginHorizontal: Spacing.base,
  },
  parishDetailIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  parishDetailTitle: { fontSize: Typography.md, fontWeight: Typography.black },
  parishDetailSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  viewAllText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  emptyState: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.base,
  },
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
});
