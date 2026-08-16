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
  View, Text, StyleSheet, ScrollView, FlatList, Pressable,
  TextInput, Dimensions,
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
  const { parish, typeId: initialTypeId } = useLocalSearchParams<{
    parish: string;
    typeId?: string;
  }>();
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();
  const { eventTypes } = useCategories();

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(initialTypeId ?? null);
  const [searchText, setSearchText] = useState('');

  // Parish events (upcoming)
  const parishEvents = useMemo(() => {
    return events
      .filter((e) => e.parish === parish && !isEventPassed(e.date))
      .sort(compareBrowse);
  }, [events, parish]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return parishEvents.filter((e) => {
      if (selectedTypeId) {
        const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
        if (!types.includes(selectedTypeId)) return false;
      }
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          e.promoterName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [parishEvents, selectedTypeId, searchText]);

  // Count per type for chip labels
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishEvents.forEach((e) => {
      const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
      types.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return counts;
  }, [parishEvents]);

  const selectedType = useMemo(
    () => eventTypes.find((t) => t.id === selectedTypeId),
    [eventTypes, selectedTypeId]
  );

  const totalCount = selectedTypeId || searchText.trim()
    ? filteredEvents.length
    : parishEvents.length;

  const handleTypeSelect = useCallback((typeId: string | null) => {
    setSelectedTypeId(typeId);
    setSearchText('');
  }, []);

  const renderEvent = useCallback(
    ({ item }: { item: any }) => (
      <EventCard
        event={item}
        variant="row"
        isGoing={userGoingIds.includes(item.id)}
        isInterested={userInterestedIds.includes(item.id)}
        onToggleGoing={() => toggleGoing(item.id)}
        onToggleInterested={() => toggleInterested(item.id)}
      />
    ),
    [userGoingIds, userInterestedIds, toggleGoing, toggleInterested]
  );

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

        {/* Category chip rail */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRail}>
          <CategoryChip
            id="__all__"
            label="All"
            icon="apps"
            color={Colors.gold}
            selected={selectedTypeId === null}
            onPress={() => handleTypeSelect(null)}
          />
          {activeTypes.map((type) => (
            <CategoryChip
              key={type.id}
              id={type.id}
              label={type.label}
              icon={type.icon}
              color={type.color}
              selected={selectedTypeId === type.id}
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
            placeholder={
              selectedType
                ? `Search ${selectedType.label} in ${parish}...`
                : `Search events in ${parish}...`
            }
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </SafeAreaView>

      {/* Content */}
      {selectedTypeId === null && !searchText.trim() ? (
        /* ALL CATEGORIES LANDING */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.landingContent}>
          {activeTypes.length > 0 ? (
            <View>
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

          {parishEvents.length > 0 ? (
            <View>
              <Text style={s.sectionTitle}>Upcoming Events</Text>
              {parishEvents.slice(0, 8).map((event) => (
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
              {parishEvents.length > 8 && (
                <Pressable onPress={() => handleTypeSelect(null)} style={s.seeAllBtn}>
                  <Text style={s.seeAllText}>See all {parishEvents.length} events</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
                </Pressable>
              )}
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
      ) : (
        /* FILTERED STATE */
        <FlatList
          data={filteredEvents}
          keyExtractor={(e) => e.id}
          renderItem={renderEvent}
          contentContainerStyle={s.filteredContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            selectedType ? (
              <View style={s.resultHeader}>
                <View style={[s.resultDot, { backgroundColor: selectedType.color }]} />
                <Text style={[s.resultLabel, { color: selectedType.color }]}>{selectedType.label}</Text>
                <Text style={s.resultCount}>
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : (
              <View style={s.resultHeader}>
                <MaterialIcons name="search" size={14} color={Colors.gold} />
                <Text style={s.resultLabel}>"{searchText.trim()}"</Text>
                <Text style={s.resultCount}>{filteredEvents.length} found</Text>
              </View>
            )
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <MaterialIcons name="event" size={36} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>
                {selectedType ? `No ${selectedType.label} in ${parish}` : 'No events found'}
              </Text>
              <Text style={s.emptySub}>Try another category or time period.</Text>
              <Pressable onPress={() => handleTypeSelect(null)} style={s.clearBtn}>
                <Text style={s.clearBtnText}>Show All Events</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}
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
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: `${Colors.gold}33`, backgroundColor: Colors.goldSurface, marginTop: Spacing.sm,
  },
  seeAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  filteredContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  resultDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  resultLabel: { fontSize: Typography.md, fontWeight: Typography.black, flex: 1 },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  clearBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs,
  },
  clearBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
