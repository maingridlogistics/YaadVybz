// ─── Event Category Discovery Page ───────────────────────────────────────────
// Dedicated discovery destination for events of a specific type, Jamaica-wide.
// Shows parish rail to narrow down + event list.
// Tap a parish → /explore/event-results?parish=X&typeId=Y (canonical combined)
//
// Deep-link: /explore/event-category?typeId=xxx&typeLabel=Parties%2FFetes

import React, { useState, useMemo, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, Pressable,
  TextInput, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { getParishImage } from '../../constants/parishImages';
import { useEvents } from '../../hooks/useEvents';
import { EventCard } from '../../components/feature/EventCard';
import { isEventPassed } from '../../constants/data';
import { compareBrowse } from '../../constants/rankingUtils';

const SCREEN_W = Dimensions.get('window').width;
const PARISH_CARD_W = Math.round((SCREEN_W - Spacing.base * 2 - 10 * 2) / 2.5);

const ParishRailCard = memo(function ParishRailCard({
  parish, count, onPress,
}: {
  parish: string; count: number; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { width: PARISH_CARD_W, height: 90, borderRadius: Radius.lg, overflow: 'hidden', flexShrink: 0, borderWidth: 1, borderColor: Colors.surfaceBorder },
        pressed && { opacity: 0.82 },
      ]}
    >
      <Image source={getParishImage(parish)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFillObject} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.sm, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: Typography.bold, color: '#fff' }} numberOfLines={1}>{parish}</Text>
        {count > 0 ? (
          <Text style={{ fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold }}>
            {count} {count === 1 ? 'event' : 'events'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

export default function EventCategoryScreen() {
  const { typeId, typeLabel, typeIcon, typeColor } = useLocalSearchParams<{
    typeId: string;
    typeLabel: string;
    typeIcon: string;
    typeColor: string;
  }>();
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();

  const color = typeColor ?? Colors.gold;
  const icon = typeIcon ?? 'event';
  const label = typeLabel ?? 'Events';

  const [searchText, setSearchText] = useState('');

  // Jamaica-wide events for this type
  const typeEvents = useMemo(() => {
    return events
      .filter((e) => {
        if (isEventPassed(e.date)) return false;
        const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
        return types.includes(typeId);
      })
      .sort(compareBrowse);
  }, [events, typeId]);

  // Filtered by search
  const filteredEvents = useMemo(() => {
    if (!searchText.trim()) return typeEvents;
    const q = searchText.trim().toLowerCase();
    return typeEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.parish.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q)
    );
  }, [typeEvents, searchText]);

  // Count per parish for rail
  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    typeEvents.forEach((e) => {
      counts[e.parish] = (counts[e.parish] ?? 0) + 1;
    });
    return counts;
  }, [typeEvents]);

  const activeParishes = [...JAMAICA_PARISHES].filter((p) => (parishCounts[p] ?? 0) > 0);

  const handleParishSelect = useCallback(
    (parish: string) => {
      router.push({
        pathname: '/explore/event-results',
        params: { parish, typeId, typeLabel: label, typeIcon: icon, typeColor: color },
      } as any);
    },
    [router, typeId, label, icon, color]
  );

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

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={[s.iconWrap, { backgroundColor: `${color}1A` }]}>
            <MaterialIcons name={icon as any} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{label}</Text>
            <Text style={s.subtitle}>
              {filteredEvents.length} upcoming event{filteredEvents.length !== 1 ? 's' : ''} across Jamaica
            </Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search ${label}...`}
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </SafeAreaView>

      <FlatList
        data={filteredEvents}
        keyExtractor={(e) => e.id}
        renderItem={renderEvent}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !searchText.trim() && activeParishes.length > 0 ? (
            <View>
              <Text style={s.sectionTitle}>Browse by Parish</Text>
              <View style={s.railOuter}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  contentContainerStyle={s.railContent}
                >
                  {activeParishes.map((parish) => (
                    <ParishRailCard
                      key={parish}
                      parish={parish}
                      count={parishCounts[parish] ?? 0}
                      onPress={() => handleParishSelect(parish)}
                    />
                  ))}
                </ScrollView>
              </View>
              <Text style={s.sectionTitle}>All Upcoming</Text>
            </View>
          ) : searchText.trim() ? (
            <View style={s.resultHeader}>
              <MaterialIcons name="search" size={14} color={Colors.gold} />
              <Text style={s.resultLabel}>{`"${searchText.trim()}"`}</Text>
              <Text style={s.resultCount}>{filteredEvents.length} found</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <MaterialIcons name="event" size={36} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No {label} upcoming</Text>
            <Text style={s.emptySub}>Check back soon — new events are added regularly.</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 42, backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base, marginVertical: Spacing.sm,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1, fontSize: Typography.sm, color: Colors.textPrimary,
    paddingVertical: 0, includeFontPadding: false,
  },
  listContent: { paddingHorizontal: Spacing.base },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  railOuter: { marginHorizontal: -Spacing.base, marginBottom: Spacing.md },
  railContent: { paddingHorizontal: Spacing.base, gap: 10, paddingBottom: 2 },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  resultLabel: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
