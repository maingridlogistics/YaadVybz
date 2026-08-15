/**
 * Admin Portal — Flagged Events
 * Events flagged for review. Unflag or remove events.
 * Admin-only. Accessed from Profile → Moderation → Flagged Events.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate } from '../../constants/data';

export default function FlaggedEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getFlaggedEvents, approveEvent, rejectEvent } = useEvents();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const flaggedEvents = getFlaggedEvents();

  const safeBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any);

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
          <Pressable onPress={safeBack} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="flag" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Flagged Events</Text>
            <Text style={s.headerSub}>{flaggedEvents.length > 0 ? `${flaggedEvents.length} flagged` : 'No flagged events'}</Text>
          </View>
          {flaggedEvents.length > 0 && (
            <View style={s.headerBadge}><Text style={s.headerBadgeText}>{flaggedEvents.length}</Text></View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}>
        {flaggedEvents.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="verified-user" size={48} color={Colors.greenLight} />
            <Text style={s.emptyTitle}>No flagged events</Text>
            <Text style={s.emptySub}>All listings look good.</Text>
          </View>
        ) : (
          flaggedEvents.map((e) => (
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
                {e.flagReason ? (
                  <View style={s.flagReasonRow}>
                    <MaterialIcons name="flag" size={11} color="#FF5722" />
                    <Text style={s.flagReasonText} numberOfLines={1}>{e.flagReason}</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.eventActions}>
                {/* Unflag / Restore */}
                <Pressable
                  onPress={() => approveEvent(e.id)}
                  style={[s.actionBtn, { backgroundColor: Colors.greenLight }]}
                  hitSlop={4}
                >
                  <MaterialIcons name="flag" size={13} color="#fff" />
                </Pressable>
                {/* Edit */}
                <Pressable
                  onPress={() => router.push(`/edit-event/${e.id}` as any)}
                  style={[s.actionBtn, { backgroundColor: Colors.goldSurface, borderWidth: 1, borderColor: `${Colors.gold}55` }]}
                  hitSlop={4}
                >
                  <MaterialIcons name="edit" size={13} color={Colors.gold} />
                </Pressable>
                {/* Remove */}
                <Pressable
                  onPress={() => Alert.alert(
                    'Remove Event',
                    'This will reject and remove the event from public listings.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => rejectEvent(e.id, 'Removed by admin') },
                    ]
                  )}
                  style={[s.actionBtn, { backgroundColor: '#F44336' }]}
                  hitSlop={4}
                >
                  <MaterialIcons name="close" size={13} color="#fff" />
                </Pressable>
              </View>
            </Pressable>
          ))
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
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  headerBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: Typography.black as any, color: '#fff' },
  body: { padding: Spacing.base, gap: Spacing.sm },
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
  flagReasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagReasonText: { fontSize: 10, color: '#FF6B6B', flex: 1 },
  eventActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end' },
  actionBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl * 1.5, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
