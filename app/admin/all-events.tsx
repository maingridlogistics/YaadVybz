
/**
 * Admin Portal — All Events
 * Search, filter, and manage all events on the platform.
 * Admin-only. Accessed from Profile → Moderation → All Events.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate } from '../../constants/data';

const STATUS_COLORS: Record<string, string> = {
  live: Colors.greenLight, pending: '#FF9800', flagged: '#FF5722', rejected: '#F44336',
};
const STATUS_OPTS = ['all', 'live', 'pending', 'flagged', 'rejected', 'cancelled'];

export default function AllEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { allEvents, events, editEvent } = useEvents();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 40;

  const allForAdmin = allEvents.length > 0 ? allEvents : events;

  // Reset to page 0 when filter/search changes
  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(0); }, []);
  const handleStatusFilter = useCallback((v: string) => { setStatusFilter(v); setPage(0); }, []);

  const filtered = useMemo(() => {
    return allForAdmin.filter((e) => {
      const isCancelled = (e as any).cancellation_status === 'cancellation_approved';
      let matchStatus = true;
      if (statusFilter === 'cancelled') matchStatus = isCancelled;
      else if (statusFilter !== 'all') matchStatus = e.status === statusFilter && !isCancelled;
      const q = search.toLowerCase().trim();
      const matchSearch = q === '' || e.title.toLowerCase().includes(q) || e.promoterName.toLowerCase().includes(q) || e.parish.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [allForAdmin, statusFilter, search]);

  const pageCount = page + 1;
  const displayed = useMemo(() => filtered.slice(0, pageCount * PAGE_SIZE), [filtered, pageCount, PAGE_SIZE]);
  const hasMore = displayed.length < filtered.length;

  if (!isAdmin) {
    return (
      <View style={s.gate}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={s.gateText}>Admin access required.</Text>
        <Pressable onPress={() => router.back()} style={s.gateBtn}><Text style={s.gateBtnText}>Go Back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="list-alt" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>All Events</Text>
            <Text style={s.headerSub}>{displayed.length} of {filtered.length} (total {allForAdmin.length})</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}>
        {/* Search */}
        <View style={s.searchRow}>
          <MaterialIcons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by title, promoter, parish..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={handleSearch}
            accessibilityLabel="Search all events"
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(''); setPage(0); }} hitSlop={8}>
              <MaterialIcons name="close" size={15} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {STATUS_OPTS.map((st) => {
            const isAct = statusFilter === st;
            const c = st === 'all' ? Colors.gold : (STATUS_COLORS[st] ?? '#9E9E9E');
            const cnt = st === 'all' ? allForAdmin.length : st === 'cancelled'
              ? allForAdmin.filter((e) => (e as any).cancellation_status === 'cancellation_approved').length
              : allForAdmin.filter((e) => e.status === st).length;
            return (
              <Pressable
                key={st}
                onPress={() => handleStatusFilter(st)}
                style={[s.filterChip, isAct && { backgroundColor: `${c}22`, borderColor: `${c}77` }]}
              >
                <Text style={[s.filterChipText, isAct && { color: c }]}>
                  {st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)} ({cnt})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="search-off" size={36} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No events found</Text>
            <Text style={s.emptySub}>Try a different filter or search term.</Text>
          </View>
        ) : (
          displayed.map((e) => {
            const isCancelled = (e as any).cancellation_status === 'cancellation_approved';
            const displayStatus = isCancelled ? 'cancelled' : e.status;
            const sc = isCancelled ? '#9E9E9E' : (STATUS_COLORS[displayStatus] ?? Colors.textMuted);
            return (
              <Pressable key={e.id} onPress={() => router.push(`/event/${e.id}` as any)} style={({ pressed }) => [s.eventRow, pressed && { opacity: 0.9 }]}>
                {e.coverImage ? (
                  <Image source={{ uri: e.coverImage }} style={s.thumb} contentFit="cover" transition={200} />
                ) : (
                  <View style={[s.thumb, s.thumbPlaceholder]}>
                    <MaterialIcons name="event" size={20} color={Colors.textMuted} />
                  </View>
                )}
                <View style={s.eventInfo}>
                  <Text style={s.eventTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={s.eventMeta}>{e.promoterName} · {e.parish}</Text>
                  <Text style={s.eventDate}>{formatDate(e.date)}</Text>
                  <View style={[s.statusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
                    <View style={[s.statusDot, { backgroundColor: sc }]} />
                    <Text style={[s.statusText, { color: sc }]}>{isCancelled ? 'Cancelled' : displayStatus}</Text>
                  </View>
                </View>
                <View style={s.eventActions}>
                  {/* Featured toggle */}
                  <View style={s.featuredRow}>
                    <MaterialIcons name="star" size={11} color={e.featured ? Colors.gold : Colors.textMuted} />
                    <Switch
                      value={e.featured ?? false}
                      onValueChange={(val) => editEvent(e.id, { featured: val })}
                      trackColor={{ false: Colors.surfaceBorder, true: `${Colors.gold}55` }}
                      thumbColor={e.featured ? Colors.gold : Colors.textMuted}
                      ios_backgroundColor={Colors.surfaceBorder}
                      accessibilityLabel="Feature toggle"
                    />
                  </View>
                  {/* Edit */}
                  <Pressable
                    onPress={() => router.push(`/edit-event/${e.id}` as any)}
                    style={s.editBtn}
                    hitSlop={4}
                  >
                    <MaterialIcons name="edit" size={13} color={Colors.gold} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
        {hasMore && (
          <Pressable
            onPress={() => setPage((p) => p + 1)}
            style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={s.loadMoreText}>Load More ({filtered.length - displayed.length} remaining)</Text>
            <MaterialIcons name="expand-more" size={18} color={Colors.gold} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gate: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  gateText: { fontSize: Typography.base, color: Colors.textMuted },
  gateBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  gateBtnText: { color: Colors.gold, fontWeight: Typography.semibold as any },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  body: { padding: Spacing.base, gap: Spacing.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  filterChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  thumb: { width: 60, height: 60, borderRadius: Radius.md, flexShrink: 0 },
  thumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  eventInfo: { flex: 1, gap: 3 },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  eventDate: { fontSize: Typography.xs, color: Colors.gold },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 9, fontWeight: Typography.bold as any },
  eventActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end' },
  featuredRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}55` },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
    paddingVertical: Spacing.base, marginTop: Spacing.sm,
  },
  loadMoreText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },
});
