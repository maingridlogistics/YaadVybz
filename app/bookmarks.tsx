import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEvents } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { formatDate, formatCount } from '../constants/data';

// Parse date safely in local time (avoids UTC midnight shift for Jamaica UTC-5)
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function BookmarksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { events, userBookmarkIds, toggleBookmark } = useEvents();
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');

  const savedEvents = useMemo(
    () => events.filter((e) => userBookmarkIds.includes(e.id)),
    [events, userBookmarkIds],
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = useMemo(() => savedEvents.filter((e) => parseLocalDate(e.date) >= today), [savedEvents]);
  const past = useMemo(() => savedEvents.filter((e) => parseLocalDate(e.date) < today), [savedEvents]);
  const filtered = filter === 'all' ? savedEvents : filter === 'upcoming' ? upcoming : past;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Saved Events</Text>
            <Text style={styles.headerSub}>{savedEvents.length} bookmarked · {upcoming.length} upcoming</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {(['upcoming', 'all', 'past'] as const).map((tab) => {
            const count = tab === 'all' ? savedEvents.length : tab === 'upcoming' ? upcoming.length : past.length;
            return (
              <Pressable
                key={tab}
                onPress={() => setFilter(tab)}
                style={[styles.filterBtn, filter === tab && styles.filterBtnActive]}
              >
                <Text style={[styles.filterText, filter === tab && styles.filterTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      {!user ? (
        <View style={styles.gate}>
          <MaterialIcons name="bookmark-border" size={48} color={Colors.textMuted} />
          <Text style={styles.gateTitle}>Sign In to View Saved Events</Text>
          <Pressable
            onPress={() => router.push('/auth' as any)}
            style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
              <Text style={styles.gateBtnText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : savedEvents.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="bookmark-border" size={40} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Saved Events</Text>
          <Text style={styles.emptySub}>
            Tap the bookmark icon on any event to save it here for quick access.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.browseBtnInner}>
              <MaterialIcons name="search" size={18} color={Colors.textOnGold} />
              <Text style={styles.browseBtnText}>Browse Events</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.emptyFilter}>
              <MaterialIcons name="event-busy" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyFilterText}>No {filter} saved events.</Text>
            </View>
          ) : (
            filtered.map((event) => {
              const isPast = parseLocalDate(event.date) < today;
              const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
              return (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                  style={({ pressed }) => [styles.card, isPast && styles.cardPast, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.cardImageWrap}>
                    <Image
                      source={event.coverImage ? { uri: event.coverImage } : require('../assets/images/icon.png')}
                      style={styles.cardImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.65)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {/* Time badge */}
                    <View style={[styles.timeBadge, isPast && styles.timeBadgePast]}>
                      {!isPast && <MaterialIcons name="upcoming" size={10} color={Colors.greenLight} />}
                      <Text style={[styles.timeBadgeText, !isPast && { color: Colors.greenLight }]}>
                        {isPast ? 'Past' : 'Upcoming'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>

                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <MaterialIcons name="event" size={12} color={Colors.gold} />
                        <Text style={styles.metaText}>{formatDate(event.date)}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <MaterialIcons name="place" size={12} color={Colors.textMuted} />
                        <Text style={styles.metaText} numberOfLines={1}>{event.venue}, {event.parish}</Text>
                      </View>
                    </View>

                    <View style={styles.bottomRow}>
                      <View style={styles.heatRow}>
                        <MaterialIcons name="people" size={11} color={Colors.textMuted} />
                        <Text style={styles.heatText}>{formatCount(event.goingCount + event.interestedCount)} interested</Text>
                      </View>
                      <Text style={[styles.price, isFree && styles.priceFree]}>
                        {isFree ? 'Free' : event.ticketPrice}
                      </Text>
                    </View>
                  </View>

                  {/* Unsave button */}
                  <Pressable
                    onPress={() => toggleBookmark(event.id)}
                    style={styles.unsaveBtn}
                    hitSlop={8}
                  >
                    <MaterialIcons name="bookmark" size={22} color={Colors.gold} />
                  </Pressable>
                </Pressable>
              );
            })
          )}
          <View style={{ height: Spacing.xxl * 2 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  filterRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base, marginVertical: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 3,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  filterBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
  filterBtnActive: { backgroundColor: Colors.surfaceElevated },
  filterText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  filterTextActive: { color: Colors.textPrimary, fontWeight: Typography.bold },

  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  gateTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  gateBtn: { width: '100%', borderRadius: Radius.md, overflow: 'hidden' },
  gateBtnInner: { paddingVertical: Spacing.base, alignItems: 'center' },
  gateBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  browseBtn: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  browseBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  browseBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  emptyFilter: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.sm },
  emptyFilterText: { fontSize: Typography.sm, color: Colors.textMuted },

  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.sm },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  cardPast: { opacity: 0.72 },
  cardImageWrap: { width: 88, height: 88, flexShrink: 0, position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  timeBadge: {
    position: 'absolute', top: Spacing.xs, left: Spacing.xs,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full,
  },
  timeBadgePast: {},
  timeBadgeText: { fontSize: 9, color: Colors.textMuted, fontWeight: Typography.semibold },
  cardBody: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 18 },
  metaRow: { gap: 3 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heatText: { fontSize: 10, color: Colors.textMuted },
  price: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },
  priceFree: { color: Colors.greenLight },
  unsaveBtn: { padding: Spacing.md, flexShrink: 0 },
});
