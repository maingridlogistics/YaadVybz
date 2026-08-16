// ─── Event Combined Results ────────────────────────────────────────────────────
// Canonical convergence page for Parish + Event Type combined discovery.
// Both navigation paths converge here:
//   Parish-first:  /explore/event-parish?parish=X → tap type chip → /explore/event-results?parish=X&typeId=Y
//   Type-first:    /explore/event-category?typeId=Y → tap parish → /explore/event-results?parish=X&typeId=Y
//
// Deep-link: /explore/event-results?parish=Manchester&typeId=xxx&typeLabel=Parties%2FFetes

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useEvents } from '../../hooks/useEvents';
import { EventCard } from '../../components/feature/EventCard';
import { isEventPassed } from '../../constants/data';
import { compareBrowse } from '../../constants/rankingUtils';

export default function EventResultsScreen() {
  const { parish, typeId, typeLabel, typeIcon, typeColor } = useLocalSearchParams<{
    parish: string;
    typeId: string;
    typeLabel?: string;
    typeIcon?: string;
    typeColor?: string;
  }>();
  const router = useRouter();
  const { events, userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();

  const color = typeColor ?? Colors.gold;
  const icon = typeIcon ?? 'event';
  const label = typeLabel ?? 'Events';

  const [searchText, setSearchText] = useState('');

  const results = useMemo(() => {
    return events
      .filter((e) => {
        if (isEventPassed(e.date)) return false;
        if (e.parish !== parish) return false;
        const types = Array.isArray(e.eventTypes) ? e.eventTypes : [e.type];
        if (!types.includes(typeId)) return false;
        if (searchText.trim()) {
          const q = searchText.trim().toLowerCase();
          return (
            e.title.toLowerCase().includes(q) ||
            e.venue.toLowerCase().includes(q) ||
            e.promoterName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort(compareBrowse);
  }, [events, parish, typeId, searchText]);

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
            <MaterialIcons name={icon as any} size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{label} in {parish}</Text>
            <Text style={s.subtitle}>
              {results.length} upcoming event{results.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search ${label} in ${parish}...`}
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </SafeAreaView>

      <FlatList
        data={results}
        keyExtractor={(e) => e.id}
        renderItem={renderEvent}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <MaterialIcons name="event" size={36} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No {label} in {parish}</Text>
            <Text style={s.emptySub}>Try another category or browse all events in {parish}.</Text>
            <Pressable
              onPress={() => router.back()}
              style={s.backBtn2}
            >
              <Text style={s.backBtn2Text}>Back to {parish}</Text>
            </Pressable>
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
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
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
  listContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  backBtn2: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs,
  },
  backBtn2Text: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
