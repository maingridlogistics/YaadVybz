import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { NotificationRecord, NotificationType } from '../constants/data';

// ─── Notification type config ─────────────────────────────────────────────────
const TYPE_CONFIG: Record<NotificationType, { icon: string; color: string }> = {
  new_event_parish:   { icon: 'place',         color: '#00BCD4' },
  new_event_promoter: { icon: 'campaign',      color: '#FF9800' },
  event_reminder:     { icon: 'alarm',         color: Colors.gold },
  event_change:       { icon: 'edit-calendar', color: '#9C27B0' },
  event_cancelled:    { icon: 'event-busy',    color: '#F44336' },
  event_approved:     { icon: 'check-circle',  color: Colors.greenLight },
  event_rejected:     { icon: 'cancel',        color: '#FF6B6B' },
  new_follower:       { icon: 'person-add',    color: Colors.gold },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-JM', { month: 'short', day: 'numeric' });
}

// ─── Notification Row ─────────────────────────────────────────────────────────
function NotifRow({
  notif,
  onPress,
  onDismiss,
}: {
  notif: NotificationRecord;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const cfg = TYPE_CONFIG[notif.type] ?? { icon: 'notifications', color: Colors.gold };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.notifRow,
        !notif.read && styles.notifRowUnread,
        pressed && { opacity: 0.88 },
      ]}
    >
      {/* Unread indicator */}
      {!notif.read && <View style={styles.unreadDot} />}

      {/* Icon */}
      <View style={[styles.notifIcon, { backgroundColor: `${cfg.color}20` }]}>
        <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
      </View>

      {/* Content */}
      <View style={styles.notifContent}>
        <Text style={[styles.notifTitle, !notif.read && styles.notifTitleUnread]}>
          {notif.title}
        </Text>
        <Text style={styles.notifBody} numberOfLines={2}>{notif.body}</Text>
        <Text style={styles.notifTime}>{timeAgo(notif.createdAt)}</Text>
      </View>

      {/* Dismiss */}
      <Pressable onPress={onDismiss} style={styles.dismissBtn} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={Colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.topBarTitle}>Notifications</Text>
          </View>
        </SafeAreaView>
        <View style={styles.guestWrap}>
          <View style={styles.guestIcon}>
            <MaterialIcons name="notifications-off" size={44} color={Colors.textMuted} />
          </View>
          <Text style={styles.guestTitle}>Sign In Required</Text>
          <Text style={styles.guestSub}>
            Create an account to receive notifications about events in your parish, from promoters you follow, and RSVP reminders.
          </Text>
          <Pressable
            onPress={() => router.push('/auth' as any)}
            style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.guestBtnInner}
            >
              <MaterialIcons name="login" size={16} color={Colors.textOnGold} />
              <Text style={styles.guestBtnText}>Sign In / Register</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  const displayed = filter === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  const handlePress = (notif: NotificationRecord) => {
    markRead(notif.id);
    if (notif.eventId) {
      router.push(`/event/${notif.eventId}` as any);
    } else if (notif.promoterId) {
      router.push(`/promoter/${notif.promoterId}` as any);
    }
  };

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Remove all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: clearAll },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.unreadCount}>{unreadCount} unread</Text>
            )}
          </View>
          <View style={styles.topActions}>
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                style={({ pressed }) => [styles.topActionBtn, pressed && { opacity: 0.7 }]}
                hitSlop={8}
              >
                <MaterialIcons name="done-all" size={18} color={Colors.gold} />
              </Pressable>
            )}
            {notifications.length > 0 && (
              <Pressable
                onPress={handleClearAll}
                style={({ pressed }) => [styles.topActionBtn, pressed && { opacity: 0.7 }]}
                hitSlop={8}
              >
                <MaterialIcons name="delete-sweep" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {(['all', 'unread'] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {displayed.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="notifications-none" size={44} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'No Unread Notifications' : 'No Notifications Yet'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'unread'
              ? 'All caught up!'
              : 'Follow promoters and RSVP to events to get personalized alerts.'}
          </Text>
          {filter === 'unread' && (
            <Pressable
              onPress={() => setFilter('all')}
              style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.emptyBtnText}>Show All</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {/* Types legend */}
          <View style={styles.legendRow}>
            {[
              { type: 'event_reminder' as NotificationType, label: 'Reminders' },
              { type: 'new_event_promoter' as NotificationType, label: 'From Following' },
              { type: 'new_event_parish' as NotificationType, label: 'Parish' },
            ].map(({ type, label }) => {
              const cfg = TYPE_CONFIG[type];
              return (
                <View key={type} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: cfg.color }]} />
                  <Text style={styles.legendLabel}>{label}</Text>
                </View>
              );
            })}
          </View>

          {displayed.map((notif) => (
            <NotifRow
              key={notif.id}
              notif={notif}
              onPress={() => handlePress(notif)}
              onDismiss={() => removeNotification(notif.id)}
            />
          ))}

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  unreadCount: { fontSize: Typography.xs, color: Colors.gold, marginTop: 1 },
  topActions: { flexDirection: 'row', gap: Spacing.sm },
  topActionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  filterTab: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  filterTabActive: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}55` },
  filterTabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  filterTabTextActive: { color: Colors.gold, fontWeight: Typography.bold },

  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  legendRow: {
    flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap',
    marginBottom: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
    position: 'relative',
  },
  notifRowUnread: {
    borderColor: `${Colors.gold}44`,
    backgroundColor: Colors.goldSurface,
  },
  unreadDot: {
    position: 'absolute', top: 12, left: 8,
    width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.gold,
  },
  notifIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifContent: { flex: 1, gap: 2 },
  notifTitle: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium, lineHeight: 18 },
  notifTitleUnread: { color: Colors.textPrimary, fontWeight: Typography.bold },
  notifBody: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  notifTime: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  dismissBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated, flexShrink: 0,
  },

  // Guest gate
  guestWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  guestIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  guestTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  guestSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  guestBtn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  guestBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  guestBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  emptyIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  emptyBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
