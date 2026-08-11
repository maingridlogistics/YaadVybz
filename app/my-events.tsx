import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useEvents } from '../hooks/useEvents';
import { useNotifications } from '../hooks/useNotifications';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { EVENT_TYPES, TYPE_COLORS, formatDate, formatCount } from '../constants/data';
import { notifyRsvpUsersEventCancelled } from '../services/emailService';
import { canPurchaseDigitalFeatures } from '../constants/purchaseGate';

// ─── Moderation status badge config ─────────────────────────────────────────
const MODERATION_STATUS_CONFIG: Record<string, {
  label: string;
  icon: string;
  textColor: string;
  borderColor: string;
}> = {
  live: {
    label: 'Live',
    icon: 'check-circle',
    textColor: '#4CAF50',
    borderColor: 'rgba(76,175,80,0.55)',
  },
  pending: {
    label: 'Pending Review',
    icon: 'hourglass-empty',
    textColor: '#FFD54F',
    borderColor: 'rgba(255,213,79,0.55)',
  },
  flagged: {
    label: 'Flagged',
    icon: 'flag',
    textColor: '#FF9800',
    borderColor: 'rgba(255,152,0,0.55)',
  },
  rejected: {
    label: 'Rejected',
    icon: 'block',
    textColor: '#FF5252',
    borderColor: 'rgba(255,82,82,0.55)',
  },
};

const DRAFT_KEY = 'vybzhub_post_draft';

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function MyEventsScreen() {
  const router = useRouter();
  const { published, updated } = useLocalSearchParams<{ published?: string; updated?: string }>();
  const { user } = useAuth();
  const { getUserPostedEvents, deleteEvent, userGoingIds, userInterestedIds } = useEvents();
  const { addNotification } = useNotifications();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const triggerToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setShowToast(false));
  };

  useEffect(() => {
    if (published === '1') triggerToast('Event published successfully!');
  }, [published]);

  useEffect(() => {
    if (updated === '1') triggerToast('Event updated successfully!');
  }, [updated]);

  const postedEvents = user ? getUserPostedEvents(user.id) : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filtered = postedEvents.filter((e) => {
    if (filter === 'all') return true;
    const eventDate = parseLocalDate(e.date);
    if (filter === 'upcoming') return eventDate >= today;
    return eventDate < today;
  });

  const upcoming = postedEvents.filter((e) => parseLocalDate(e.date) >= today);
  const past = postedEvents.filter((e) => parseLocalDate(e.date) < today);

  // ── Analytics totals ──────────────────────────────────────────────────────
  const totalViews = postedEvents.reduce((s, e) => s + (e.viewCount ?? 0), 0);
  const totalGoing = postedEvents.reduce((s, e) => s + e.goingCount, 0);
  const totalInterested = postedEvents.reduce((s, e) => s + e.interestedCount, 0);

  // ── Duplicate: saves event data to AsyncStorage then opens post wizard ────
  const handleDuplicate = async (eventId: string) => {
    const event = postedEvents.find((e) => e.id === eventId);
    if (!event) return;
    try {
      const draft = {
        title: `Copy of ${event.title}`,
        description: event.description ?? '',
        // Clear date/time — promoter must set new ones
        date: '',
        startTime: '',
        endTime: '',
        parish: event.parish ?? '',
        venue: event.venue ?? '',
        address: event.address ?? '',
        eventTypes: event.eventTypes ?? [],
        recurring: event.recurring ?? false,
        recurringFrequency: event.recurringFrequency ?? 'Weekly',
        flyerImages: event.flyerImages?.length
          ? event.flyerImages
          : event.coverImage ? [event.coverImage] : [],
        isFree: event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry',
        ticketPrice: (event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry')
          ? '' : event.ticketPrice ?? '',
        ageLimit: event.ageLimit ?? 'All Ages',
        dressCode: event.dressCode ?? '',
        lineupEntries: (event as any).lineupEntries ?? [],
        ticketLink: event.ticketLink ?? '',
        contactInfo: event.contactInfo ?? '',
        eventPhotosLink: '',
        lineupRoleInput: 'DJ',
        lineupNameInput: '',
        customImageUrl: '',
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (_) {}
    router.push('/(tabs)/post' as any);
  };

  const handleDelete = (id: string, title: string) => {
    const isRSVPd = userGoingIds.includes(id) || userInterestedIds.includes(id);
    const targetEvent = postedEvents.find((e) => e.id === id);

    const fireAndDelete = () => {
      if (isRSVPd) {
        addNotification({
          type: 'event_cancelled',
          title: 'Event Cancelled',
          body: `"${title}" has been cancelled. Your RSVP has been removed.`,
        });
      } else {
        addNotification({
          type: 'event_cancelled',
          title: 'Event Removed',
          body: `"${title}" has been removed from your listings.`,
        });
      }
      if (targetEvent) {
        notifyRsvpUsersEventCancelled(id, {
          eventTitle: title,
          eventId: id,
          parish: targetEvent.parish,
          date: targetEvent.date,
          startTime: targetEvent.startTime,
          venue: targetEvent.venue,
          changeDetails: 'This event has been cancelled by the organiser.',
        });
      }
      deleteEvent(id);
    };

    if (Platform.OS === 'web') {
      setDeleteConfirm({ id, title });
    } else {
      Alert.alert(
        'Delete Event',
        `Are you sure you want to delete "${title}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: fireAndDelete },
        ]
      );
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      const confirmEvent = postedEvents.find((e) => e.id === deleteConfirm.id);
      const isRSVPd = userGoingIds.includes(deleteConfirm.id) || userInterestedIds.includes(deleteConfirm.id);
      if (isRSVPd) {
        addNotification({ type: 'event_cancelled', title: 'Event Cancelled', body: `"${deleteConfirm.title}" has been cancelled.` });
      } else {
        addNotification({ type: 'event_cancelled', title: 'Event Removed', body: `"${deleteConfirm.title}" has been removed.` });
      }
      if (confirmEvent) {
        notifyRsvpUsersEventCancelled(deleteConfirm.id, {
          eventTitle: deleteConfirm.title,
          eventId: deleteConfirm.id,
          parish: confirmEvent.parish,
          date: confirmEvent.date,
          startTime: confirmEvent.startTime,
          venue: confirmEvent.venue,
          changeDetails: 'This event has been cancelled by the organiser.',
        });
      }
      deleteEvent(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gate}>
          <MaterialIcons name="lock" size={40} color={Colors.gold} />
          <Text style={styles.gateTitle}>Sign In Required</Text>
          <Pressable onPress={() => router.push('/auth' as any)} style={styles.gateBtn}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
              <Text style={styles.gateBtnText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toast */}
      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
          <MaterialIcons name="check-circle" size={18} color={Colors.textOnGold} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Events</Text>
            <Text style={styles.headerSub}>{postedEvents.length} published · {upcoming.length} upcoming</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/post' as any)}
            style={({ pressed }) => [styles.postBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.postBtnInner}>
              <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
              <Text style={styles.postBtnText}>Post</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {(['all', 'upcoming', 'past'] as const).map((tab) => {
            const count = tab === 'all' ? postedEvents.length : tab === 'upcoming' ? upcoming.length : past.length;
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

      {postedEvents.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="campaign" size={40} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No events posted yet</Text>
          <Text style={styles.emptySub}>Start reaching thousands of party-goers across Jamaica.</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/post' as any)}
            style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.emptyBtnInner}>
              <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
              <Text style={styles.emptyBtnText}>Post Your First Event</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {/* Analytics overview strip */}
          <View style={styles.analyticsStrip}>
            <View style={styles.analyticsStat}>
              <MaterialIcons name="visibility" size={14} color={Colors.textMuted} />
              <Text style={styles.analyticsNum}>{totalViews.toLocaleString()}</Text>
              <Text style={styles.analyticsLabel}>Views</Text>
            </View>
            <View style={styles.analyticsDivider} />
            <View style={styles.analyticsStat}>
              <MaterialIcons name="check-circle" size={14} color={Colors.greenLight} />
              <Text style={[styles.analyticsNum, { color: Colors.greenLight }]}>{totalGoing.toLocaleString()}</Text>
              <Text style={styles.analyticsLabel}>Going</Text>
            </View>
            <View style={styles.analyticsDivider} />
            <View style={styles.analyticsStat}>
              <MaterialIcons name="star" size={14} color={Colors.gold} />
              <Text style={[styles.analyticsNum, { color: Colors.gold }]}>{totalInterested.toLocaleString()}</Text>
              <Text style={styles.analyticsLabel}>Interested</Text>
            </View>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyFilter}>
              <MaterialIcons name="event-busy" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyFilterText}>No {filter} events.</Text>
            </View>
          ) : (
            filtered.map((event) => {
              const isPast = parseLocalDate(event.date) < today;
              const typeColor = TYPE_COLORS[event.type] || Colors.gold;
              const primaryType = EVENT_TYPES.find((t) => t.id === event.type);

              return (
                <View key={event.id} style={[styles.card, isPast && styles.cardPast]}>
                  {/* Image */}
                  <Pressable
                    onPress={() => router.push(`/event/${event.id}` as any)}
                    style={styles.cardImageWrap}
                  >
                    <Image
                      source={event.coverImage ? { uri: event.coverImage } : require('../assets/images/icon.png')}
                      style={styles.cardImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.6)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {/* Time badge (top-left) */}
                    {isPast ? (
                      <View style={[styles.statusBadge, styles.statusBadgePast]}>
                        <Text style={styles.statusBadgeText}>Past</Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.statusBadgeUpcoming]}>
                        <MaterialIcons name="upcoming" size={10} color={Colors.greenLight} />
                        <Text style={[styles.statusBadgeText, { color: Colors.greenLight }]}>Upcoming</Text>
                      </View>
                    )}
                    {/* Moderation badge (top-right) */}
                    {(() => {
                      const cfg = MODERATION_STATUS_CONFIG[event.status];
                      if (!cfg) return null;
                      return (
                        <View style={[styles.moderationBadge, { borderColor: cfg.borderColor }]}>
                          <MaterialIcons name={cfg.icon as any} size={10} color={cfg.textColor} />
                          <Text style={[styles.moderationBadgeText, { color: cfg.textColor }]}>{cfg.label}</Text>
                        </View>
                      );
                    })()}
                    {/* Image count (bottom-right) */}
                    {event.flyerImages && event.flyerImages.length > 1 && (
                      <View style={styles.imageCountBadge}>
                        <MaterialIcons name="collections" size={10} color="#fff" />
                        <Text style={styles.imageCountText}>{event.flyerImages.length}</Text>
                      </View>
                    )}
                  </Pressable>

                  {/* Rejection reason banner */}
                  {event.status === 'rejected' && event.rejectedReason ? (
                    <View style={styles.rejectionBanner}>
                      <MaterialIcons name="error-outline" size={13} color={Colors.error} style={{ flexShrink: 0 }} />
                      <Text style={styles.rejectionText} numberOfLines={3}>
                        <Text style={styles.rejectionLabel}>Rejected: </Text>
                        {event.rejectedReason}
                      </Text>
                    </View>
                  ) : null}

                  {/* Info */}
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <View style={[styles.typePill, { backgroundColor: `${typeColor}20` }]}>
                        <MaterialIcons name={primaryType?.icon as any} size={11} color={typeColor} />
                        <Text style={[styles.typePillText, { color: typeColor }]}>{event.typeLabel}</Text>
                      </View>
                      {event.recurring && (
                        <View style={styles.recurringPill}>
                          <MaterialIcons name="repeat" size={10} color={Colors.gold} />
                          <Text style={styles.recurringPillText}>{event.recurringFrequency}</Text>
                        </View>
                      )}
                    </View>

                    <Pressable onPress={() => router.push(`/event/${event.id}` as any)}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
                    </Pressable>

                    <View style={styles.cardMeta}>
                      <View style={styles.metaItem}>
                        <MaterialIcons name="event" size={13} color={Colors.textMuted} />
                        <Text style={styles.metaText}>{formatDate(event.date)}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <MaterialIcons name="place" size={13} color={Colors.textMuted} />
                        <Text style={styles.metaText} numberOfLines={1}>{event.parish}</Text>
                      </View>
                    </View>

                    <View style={styles.cardStats}>
                      <View style={styles.stat}>
                        <MaterialIcons name="check-circle" size={13} color={Colors.greenLight} />
                        <Text style={styles.statText}>{formatCount(event.goingCount)} going</Text>
                      </View>
                      <View style={styles.stat}>
                        <MaterialIcons name="star" size={13} color={Colors.gold} />
                        <Text style={styles.statText}>{formatCount(event.interestedCount)} interested</Text>
                      </View>
                      {event.viewCount !== undefined && event.viewCount > 0 && (
                        <View style={styles.stat}>
                          <MaterialIcons name="visibility" size={13} color={Colors.textMuted} />
                          <Text style={styles.statText}>{formatCount(event.viewCount)} views</Text>
                        </View>
                      )}
                      <Text style={[styles.pricePill, (event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry') && styles.pricePillFree]}>
                        {event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? 'Free' : event.ticketPrice}
                      </Text>
                    </View>

                    {/* Actions */}
                    <View style={styles.cardActions}>
                      <Pressable
                        onPress={() => router.push(`/edit-event/${event.id}` as any)}
                        style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
                      >
                        <MaterialIcons name="edit" size={15} color={Colors.gold} />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </Pressable>
                      {/* Duplicate button */}
                      <Pressable
                        onPress={() => handleDuplicate(event.id)}
                        style={({ pressed }) => [styles.duplicateBtn, pressed && { opacity: 0.7 }]}
                      >
                        <MaterialIcons name="content-copy" size={15} color={Colors.textSecondary} />
                        <Text style={styles.duplicateBtnText}>Copy</Text>
                      </Pressable>
                      {/* Boost / Stats button */}
                      {(event.boosted || canPurchaseDigitalFeatures) ? (
                        <Pressable
                          onPress={() => {
                            if (event.boosted) {
                              router.push(`/monetization/boost-performance/${event.id}` as any);
                            } else if (canPurchaseDigitalFeatures) {
                              router.push(`/monetization/boost/${event.id}` as any);
                            }
                          }}
                          style={({ pressed }) => [styles.viewBtn, { flex: 1.2 }, pressed && { opacity: 0.7 }]}
                        >
                          <MaterialIcons
                            name={event.boosted ? 'bar-chart' : 'rocket-launch'}
                            size={15}
                            color={event.boosted ? '#00BCD4' : Colors.textSecondary}
                          />
                          <Text style={[styles.viewBtnText, event.boosted && { color: '#00BCD4' }]}>
                            {event.boosted ? 'Stats' : 'Boost'}
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => handleDelete(event.id, event.title)}
                        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                      >
                        <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
                        <Text style={styles.deleteBtnText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: Spacing.xxl * 2 }} />
        </ScrollView>
      )}

      {/* Web delete confirmation modal */}
      {Platform.OS === 'web' && deleteConfirm && (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalIcon}>
                <MaterialIcons name="delete-outline" size={28} color={Colors.error} />
              </View>
              <Text style={styles.modalTitle}>Delete Event</Text>
              <Text style={styles.modalMessage}>
                Are you sure you want to delete "{deleteConfirm.title}"? This cannot be undone.
              </Text>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setDeleteConfirm(null)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmDelete} style={styles.modalDeleteBtn}>
                  <Text style={styles.modalDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  toast: {
    position: 'absolute', top: 56, left: Spacing.base, right: Spacing.base, zIndex: 999,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  toastText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold, flex: 1 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, padding: Spacing.xl },
  gateTitle: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary },
  gateBtn: { width: '100%', borderRadius: Radius.md, overflow: 'hidden' },
  gateBtnInner: { paddingVertical: Spacing.base, alignItems: 'center' },
  gateBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  postBtn: { borderRadius: Radius.full, overflow: 'hidden' },
  postBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: Spacing.md },
  postBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

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

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  emptyBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  emptyBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  emptyFilter: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.sm },
  emptyFilterText: { fontSize: Typography.sm, color: Colors.textMuted },

  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.md },

  // Analytics strip
  analyticsStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  analyticsStat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.md },
  analyticsNum: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  analyticsLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  analyticsDivider: { width: 1, height: 32, backgroundColor: Colors.surfaceBorder },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  cardPast: { opacity: 0.75 },
  cardImageWrap: { height: 160, position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  statusBadge: {
    position: 'absolute', top: Spacing.sm, left: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  statusBadgePast: {},
  statusBadgeUpcoming: {},
  statusBadgeText: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.semibold },
  moderationBadge: {
    position: 'absolute', top: Spacing.sm, right: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
  },
  moderationBadgeText: { fontSize: 10, fontWeight: Typography.semibold as any },
  imageCountBadge: {
    position: 'absolute', bottom: Spacing.sm, right: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full,
  },
  imageCountText: { fontSize: 10, color: '#fff' },

  // Rejection reason banner
  rejectionBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.07)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,68,68,0.18)',
  },
  rejectionLabel: { fontWeight: Typography.bold as any },
  rejectionText: { flex: 1, fontSize: Typography.xs, color: Colors.error, lineHeight: 17 },

  cardBody: { padding: Spacing.md, gap: Spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  typePillText: { fontSize: 10, fontWeight: Typography.bold },
  recurringPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  recurringPillText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },
  cardTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, lineHeight: 24 },
  cardMeta: { flexDirection: 'row', gap: Spacing.base },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: Typography.xs, color: Colors.textMuted },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: Typography.xs, color: Colors.textMuted },
  pricePill: {
    marginLeft: 'auto', fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full,
  },
  pricePillFree: { color: Colors.greenLight, backgroundColor: Colors.greenSurface },

  cardActions: {
    flexDirection: 'row', gap: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.sm,
  },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.goldSurface, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  editBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  duplicateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  duplicateBtnText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold },
  viewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  viewBtnText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: 'rgba(255,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  deleteBtnText: { fontSize: Typography.xs, color: Colors.error, fontWeight: Typography.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  modalBox: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', gap: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center' },
  modalIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,68,68,0.1)', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  modalMessage: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  modalActions: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalCancelText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
  modalDeleteBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: 'rgba(255,68,68,0.15)', borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' },
  modalDeleteText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.error },
});
