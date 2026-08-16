// ─── Event Parish Discovery Page ─────────────────────────────────────────────
// Dedicated discovery destination for events in a specific parish.
// Two inline states:
//   "all"    → Popular Categories grid + Featured Events
//   <typeId> → Filtered event list for that type
//
// Deep-link: /explore/event-parish?parish=Manchester
// Deep-link: /explore/event-parish?parish=Manchester&typeId=xxx

import React, { useState, useMemo, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useEvents } from '../../hooks/useEvents';
import { useCategories } from '../../hooks/useCategories';
import { EventCard } from '../../components/feature/EventCard';
import { isEventPassed } from '../../constants/data';
import { compareBrowse } from '../../constants/rankingUtils';

const SCREEN_W = Dimensions.get('window').width;

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

// ─── Category rail card (fixed width, horizontal scroll) ────────────────────
const CatRailCard = memo(function CatRailCard({
  id, label, icon, color, onPress,
}: {
  id: string; label: string; icon: string; color: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cg.card, pressed && { opacity: 0.82 }]}>
      <View style={[cg.iconRing, { backgroundColor: `${color}1A` }]}>
        <MaterialIcons name={icon as any} size={24} color={color} />
      </View>
      <Text style={[cg.label, { color }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
});

const cg = StyleSheet.create({
  card: {
    width: 88, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 6,
    gap: 6, height: 92, flexShrink: 0,
  },
  iconRing: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: Typography.semibold, textAlign: 'center', lineHeight: 14, paddingHorizontal: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function EventParishScreen() {
  const { parish } = useLocalSearchParams<{
    parish: string;
  }>();
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();
  const { eventTypes } = useCategories();

  const [searchText, setSearchText] = useState('');

  // Parish events (upcoming)
  const parishEvents = useMemo(() => {
    return events
      .filter((e) => e.parish === parish && !isEventPassed(e.date))
      .sort(compareBrowse);
  }, [events, parish]);

  // Count per type for chip labels (used in active chip list)
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishEvents.forEach((e) => {
      const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
      types.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return counts;
  }, [parishEvents]);

  const totalCount = parishEvents.length;

  // Category chip tap → navigate to canonical event-results (converges with Category-first path)
  const handleTypeSelect = useCallback((typeId: string) => {
    const type = eventTypes.find((t) => t.id === typeId);
    if (type) {
      router.push({
        pathname: '/explore/event-results',
        params: { parish, typeId, typeLabel: type.label, typeIcon: type.icon, typeColor: type.color },
      } as any);
    }
  }, [router, eventTypes, parish]);

  // Active types (only types that have events in this parish)
  const activeTypes = eventTypes.filter((t) => (typeCounts[t.id] ?? 0) > 0);

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
              {totalCount} upcoming event{totalCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Category chip rail — tapping navigates to canonical event-results */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRail}>
          {activeTypes.map((type) => (
            <CategoryChip
              key={type.id}
              id={type.id}
              label={type.label}
              icon={type.icon}
              color={type.color}
              selected={false}
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
        </View>
      </SafeAreaView>

      {/* Content — Landing State (category taps navigate to event-results) */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.landingContent}>
        {/* Popular Categories horizontal rail */}
        {activeTypes.length > 0 ? (
          <View style={s.catSection}>
            <Text style={s.sectionTitle}>Popular Categories</Text>
            <View style={s.catRailOuter}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                contentContainerStyle={s.catRailContent}
              >
                {activeTypes.map((type) => (
                  <CatRailCard
                    key={type.id}
                    id={type.id}
                    label={type.label}
                    icon={type.icon}
                    color={type.color}
                    onPress={() => handleTypeSelect(type.id)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {/* Search-filtered events (inline, no category navigation) */}
        {searchText.trim() ? (
          (() => {
            const searchFiltered = parishEvents.filter((e) => {
              const q = searchText.trim().toLowerCase();
              return (
                e.title.toLowerCase().includes(q) ||
                e.venue.toLowerCase().includes(q) ||
                e.promoterName.toLowerCase().includes(q)
              );
            });
            return (
              <View>
                <Text style={s.sectionTitle}>Results for "{searchText.trim()}"</Text>
                {searchFiltered.length === 0 ? (
                  <View style={s.emptyState}>
                    <MaterialIcons name="search-off" size={36} color={Colors.textMuted} />
                    <Text style={s.emptyTitle}>No events matched</Text>
                    <Text style={s.emptySub}>Try a different search term.</Text>
                  </View>
                ) : (
                  searchFiltered.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      variant="row"
                      isGoing={userGoingIds.includes(event.id)}
                      isInterested={userInterestedIds.includes(event.id)}
                      onToggleGoing={() => toggleGoing(event.id)}
                      onToggleInterested={() => toggleInterested(event.id)}
                    />
                  ))
                )}
              </View>
            );
          })()
        ) : parishEvents.length > 0 ? (
          <View>
            <Text style={s.sectionTitle}>Upcoming Events</Text>
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
        ) : (
          <View style={s.emptyState}>
            <MaterialIcons name="event" size={36} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No upcoming events in {parish}</Text>
            <Text style={s.emptySub}>Check back soon for new events.</Text>
          </View>
        )}
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
  headerContent: {},
  headerImg: {},
  headerText: {},
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
  catRailOuter: { marginHorizontal: -Spacing.base, marginBottom: Spacing.xl },
  catRailContent: {
    paddingHorizontal: Spacing.base, gap: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', paddingVertical: 2,
  },
  catSection: { marginBottom: Spacing.lg },
  catRailOuter: { marginHorizontal: -Spacing.base },
  catRailContent: {
    paddingHorizontal: Spacing.base, gap: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', paddingVertical: 2,
  },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
