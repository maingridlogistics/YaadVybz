// ─── Event Parish Discovery Page ─────────────────────────────────────────────
// Dedicated discovery destination for events in a specific parish.
// Visual hierarchy (mirrors business-parish):
//   Header:             ← Parish Name   X upcoming events
//   Top chip rail:      swipeable event-type chips (tapping → event-results)
//   Contextual search:  "Search events in Manchester..."
//   Popular Categories: compact 3-column grid
//   Upcoming Events:    server-ranked event rows (search_events RPC)
//
// Ranking is server-authoritative via search_events RPC (p_scope='upcoming').
// Client never sorts results — doing so would corrupt the blended ranking.
//
// Deep-link: /explore/event-parish?parish=Manchester

import React, { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useEvents } from '../../hooks/useEvents';
import { useCategories } from '../../hooks/useCategories';
import { EventCard } from '../../components/feature/EventCard';
import { searchEvents } from '../../services/eventSearchService';
import { Event } from '../../constants/data';

// ─── Category chip ────────────────────────────────────────────────────────────
const CategoryChip = memo(function CategoryChip({
  id,
  label,
  icon,
  color,
  selected,
  onPress,
}: {
  id: string;
  label: string;
  icon: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        ch.chip,
        selected && { backgroundColor: color, borderColor: color },
        pressed && { opacity: 0.8 },
      ]}
    >
      <MaterialIcons name={icon as any} size={13} color={selected ? '#fff' : color} />
      <Text style={[ch.label, selected && ch.labelActive]}>{label}</Text>
    </Pressable>
  );
});

const ch = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  label: { fontSize: 12, color: Colors.textSecondary, fontWeight: Typography.semibold },
  labelActive: { color: '#fff', fontWeight: Typography.bold },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function EventParishScreen() {
  const { parish } = useLocalSearchParams<{ parish: string }>();
  const router = useRouter();
  const { userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();
  const { eventTypes } = useCategories();

  const [searchText, setSearchText] = useState('');
  const [selectedChip, setSelectedChip] = useState<string>('__all__');

  // ── Server-authoritative parish events (search_events RPC) ─────────────────
  const [parishEvents, setParishEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const fetchTokenRef = useRef(0);

  const loadParishEvents = useCallback(async (query: string | null) => {
    if (!parish) return;
    setLoading(true);
    setLoadError(false);
    const token = ++fetchTokenRef.current;
    const { results, error } = await searchEvents({
      parish,
      query: query?.trim() || null,
      scope: 'upcoming',
      limit: 100,
      offset: 0,
    });
    if (token !== fetchTokenRef.current) return; // stale
    if (error) {
      setLoadError(true);
    } else {
      setParishEvents(results);
    }
    setLoading(false);
  }, [parish]);

  // Initial load + debounced search re-fetch
  useEffect(() => {
    if (!searchText.trim()) {
      loadParishEvents(null);
      return;
    }
    const timer = setTimeout(() => loadParishEvents(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText, loadParishEvents]);

  const totalCount = parishEvents.length;

  // Count per type — used to show only types that have events in this parish
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishEvents.forEach((e) => {
      const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
      types.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return counts;
  }, [parishEvents]);

  // Top-5 event types for this parish by count, capped at 5 for the Popular Categories grid
  const popularTypes = useMemo(() => {
    const sorted = [...eventTypes].sort(
      (a, b) => (typeCounts[b.id] ?? 0) - (typeCounts[a.id] ?? 0)
    );
    return sorted.slice(0, 5);
  }, [eventTypes, typeCounts]);

  // Category chip tap → navigate to canonical event-results
  const handleTypeSelect = useCallback((typeId: string) => {
    setSelectedChip(typeId);
    const type = eventTypes.find((t) => t.id === typeId);
    if (type) {
      router.push({
        pathname: '/explore/event-results',
        params: { parish, typeId, typeLabel: type.label, typeIcon: type.icon, typeColor: type.color },
      } as any);
    }
  }, [router, eventTypes, parish]);

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.parishName}>{parish}</Text>
            <Text style={s.parishCount}>
              {loading
                ? 'Loading…'
                : `${totalCount} upcoming event${totalCount !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>

        {/* Category chip rail — ALL event types + count badge; tapping → event-results */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRail}
        >
          {/* All Categories chip — default selected */}
          <Pressable
            onPress={() => setSelectedChip('__all__')}
            style={({ pressed }) => [
              ch.chip,
              selectedChip === '__all__' && { backgroundColor: Colors.gold, borderColor: Colors.gold },
              pressed && { opacity: 0.8 },
            ]}
          >
            <MaterialIcons name="apps" size={13} color={selectedChip === '__all__' ? '#fff' : Colors.gold} />
            <Text style={[ch.label, selectedChip === '__all__' && ch.labelActive]}>All</Text>
          </Pressable>
          {eventTypes.map((type) => (
            <CategoryChip
              key={type.id}
              id={type.id}
              label={type.label}
              icon={type.icon}
              color={type.color}
              selected={selectedChip === type.id}
              onPress={() => handleTypeSelect(type.id)}
            />
          ))}
        </ScrollView>

        {/* Contextual search */}
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search events in ${parish}...`}
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {loading && searchText.trim().length > 0 ? (
            <ActivityIndicator size="small" color={Colors.gold} />
          ) : null}
        </View>
      </SafeAreaView>

      {/* ── Scrollable content ── */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.landingContent}>

        {/* Error state */}
        {loadError ? (
          <View style={s.errorBanner}>
            <MaterialIcons name="wifi-off" size={16} color="#FF4444" />
            <Text style={s.errorText}>Could not load events. Check your connection.</Text>
            <Pressable
              onPress={() => loadParishEvents(searchText || null)}
              style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="refresh" size={14} color={Colors.gold} />
              <Text style={s.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Popular Categories — compact 3-column × 2-row grid, max 6 cards (only shown when not searching) */}
        {!searchText.trim() && popularTypes.length > 0 ? (
          <View style={s.catSection}>
            <Text style={s.sectionTitle}>Popular Categories</Text>
            <View style={s.catGrid}>
              {popularTypes.map((type) => (
                <Pressable
                  key={type.id}
                  onPress={() => handleTypeSelect(type.id)}
                  style={({ pressed }) => [s.catGridCell, pressed && { opacity: 0.8 }]}
                >
                  <View style={[s.catGridIcon, { backgroundColor: `${type.color}1A` }]}>
                    <MaterialIcons name={type.icon as any} size={22} color={type.color} />
                  </View>
                  <Text style={[s.catGridLabel, { color: type.color }]} numberOfLines={2}>
                    {type.label}
                  </Text>
                  {(typeCounts[type.id] ?? 0) > 0 ? (
                    <Text style={[s.catGridCount, { color: type.color }]}>
                      {typeCounts[type.id]}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {/* "All" cell — always the 6th card, opens event categories with parish context */}
              <Pressable
                style={({ pressed }) => [s.catGridCell, pressed && { opacity: 0.8 }]}
                onPress={() => router.push({
                  pathname: '/explore/event-categories',
                  params: { parish },
                } as any)}
              >
                <View style={[s.catGridIcon, { backgroundColor: `${Colors.gold}1A` }]}>
                  <MaterialIcons name="more-horiz" size={22} color={Colors.gold} />
                </View>
                <Text style={[s.catGridLabel, { color: Colors.gold }]}>All</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Event list — server-ranked results; client must NOT re-sort */}
        {loading && parishEvents.length === 0 ? (
          <View style={s.loadingState}>
            <ActivityIndicator size="large" color={Colors.gold} />
            <Text style={s.loadingText}>Loading events…</Text>
          </View>
        ) : parishEvents.length > 0 ? (
          <View>
            <Text style={s.sectionTitle}>
              {searchText.trim() ? `Results for "${searchText.trim()}"` : 'Upcoming Events'}
            </Text>
            {parishEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                variant="row"
                isGoing={userGoingIds.includes(event.id)}
                isInterested={userInterestedIds.includes(event.id)}
                onToggleGoing={() => toggleGoing(event.id)}
                onToggleInterested={() => toggleInterested(event.id)}
              />
            ))}
          </View>
        ) : !loadError ? (
          <View style={s.emptyState}>
            <MaterialIcons name={searchText.trim() ? 'search-off' : 'event'} size={36} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>
              {searchText.trim() ? 'No events matched' : `No upcoming events in ${parish}`}
            </Text>
            <Text style={s.emptySub}>
              {searchText.trim() ? 'Try a different search term.' : 'Check back soon for new events.'}
            </Text>
          </View>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  parishName: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  parishCount: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  chipRail: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.xs, flexDirection: 'row', alignItems: 'center',
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 42, backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1, fontSize: Typography.sm, color: Colors.textPrimary,
    paddingVertical: 0, includeFontPadding: false,
  },

  landingContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm, marginTop: Spacing.xs,
  },

  // Popular Categories — compact 3-column grid
  catSection: { marginBottom: Spacing.lg },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catGridCell: {
    width: '30%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 6,
  },
  catGridIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  catGridLabel: {
    fontSize: 10, fontWeight: Typography.semibold,
    textAlign: 'center', lineHeight: 13,
  },
  catGridCount: {
    fontSize: 9, fontWeight: Typography.bold,
    textAlign: 'center',
  },

  loadingState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },

  emptyState: { alignItems: 'center', paddingTop: 40, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.lg,
    marginBottom: Spacing.md, padding: Spacing.md,
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
