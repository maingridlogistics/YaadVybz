// ─── Event Combined Results ────────────────────────────────────────────────────
// Canonical convergence page for Parish + Event Type combined discovery.
// Uses search_events RPC for server-authoritative ranking with live Search Priority.
// Both navigation paths converge here:
//   Parish-first:  /explore/event-parish?parish=X → tap type chip → /explore/event-results?parish=X&typeId=Y
//   Type-first:    /explore/event-category?typeId=Y → tap parish → /explore/event-results?parish=X&typeId=Y

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

import { useEvents } from '../../hooks/useEvents';
import { EventCard } from '../../components/feature/EventCard';
import { Event } from '../../constants/data';
import { searchEvents } from '../../services/eventSearchService';

const LIMIT = 100;
const DEBOUNCE_MS = 300;

export default function EventResultsScreen() {
  const { parish, typeId, typeLabel, typeColor } = useLocalSearchParams<{
    parish: string;
    typeId: string;
    typeLabel?: string;
    typeIcon?: string;
    typeColor?: string;
  }>();
  const router = useRouter();
  // RSVP state still comes from EventsContext (user-specific, not affected by Search Priority)
  const { userGoingIds, userInterestedIds, toggleGoing, toggleInterested } = useEvents();

  const color = typeColor ?? Colors.gold;
  const label = typeLabel ?? 'Events';

  const [results, setResults] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchText, setSearchText] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(0);

  // ── Fetch from server-authoritative RPC ────────────────────────────────────
  const fetchResults = useCallback(async (query: string, token: number) => {
    setLoading(true);
    setError(false);
    const { results: evts, error: err } = await searchEvents({
      parish: parish ?? null,
      typeId: typeId ?? null,
      query: query.trim() || null,
      upcoming: true,
      limit: LIMIT,
    });
    if (tokenRef.current !== token) return; // stale — discard
    if (err) { setError(true); setLoading(false); return; }
    setResults(evts);
    setLoading(false);
  }, [parish, typeId]);

  // Initial load on mount
  useEffect(() => {
    const token = ++tokenRef.current;
    fetchResults('', token);
  }, [fetchResults]);

  // Debounced re-fetch on search text change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const token = ++tokenRef.current;
      fetchResults(searchText, token);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchText, fetchResults]);

  const renderEvent = useCallback(
    ({ item }: { item: Event }) => (
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
          <View style={{ flex: 1 }}>
            <Text style={s.context}>{parish}</Text>
            <View style={s.titleRow}>
              <View style={[s.typeDot, { backgroundColor: color }]} />
              <Text style={s.title} numberOfLines={1}>{label}</Text>
            </View>
            <Text style={s.subtitle}>
              {loading
                ? 'Loading...'
                : `${results.length} upcoming event${results.length !== 1 ? 's' : ''}`}
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

      {error ? (
        <View style={s.errorState}>
          <MaterialIcons name="error-outline" size={32} color={Colors.error} />
          <Text style={s.errorTitle}>Could not load events</Text>
          <Pressable onPress={() => { const t = ++tokenRef.current; fetchResults(searchText, t); }} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(e) => e.id}
          renderItem={renderEvent}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? (
              <View style={s.loaderState}>
                <ActivityIndicator size="large" color={Colors.gold} />
                <Text style={s.loaderText}>Finding {label} in {parish}...</Text>
              </View>
            ) : (
              <View style={s.emptyState}>
                <MaterialIcons name="event" size={36} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>No {label} in {parish}</Text>
                <Text style={s.emptySub}>Try another category or browse all events in {parish}.</Text>
                <Pressable onPress={() => router.back()} style={s.backBtn2}>
                  <Text style={s.backBtn2Text}>Back to {parish}</Text>
                </Pressable>
              </View>
            )
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
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  context: { fontSize: Typography.xs, color: Colors.textMuted, letterSpacing: 0.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 1 },
  typeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  subtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
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
  loaderState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  loaderText: { fontSize: Typography.sm, color: Colors.textMuted },
  errorState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  errorTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  retryBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  retryText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
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
