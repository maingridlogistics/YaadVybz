/**
 * Admin Portal — Events Tab
 * Approval queue, flagged events, all events management.
 * Admin-only. No promoter event-ownership actions.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate } from '../../constants/data';
import { notifyPromoterEventApproved, notifyPromoterEventRejected } from '../../services/emailService';
import { TICKETING_ENABLED } from '../../constants/featureFlags';

type EventSection = 'queue' | 'flagged' | 'all';

const STATUS_COLORS: Record<string, string> = {
  live: Colors.greenLight, pending: '#FF9800', flagged: '#FF5722', rejected: '#F44336',
};

// ─── Event Row ────────────────────────────────────────────────────────────────
function EventRow({
  event,
  onApprove,
  onReject,
  onNavigate,
  onUnflag,
  showFeatureSwitch,
  onToggleFeatured,
}: {
  event: any;
  onApprove?: () => void;
  onReject?: () => void;
  onNavigate: () => void;
  onUnflag?: () => void;
  showFeatureSwitch?: boolean;
  onToggleFeatured?: (val: boolean) => void;
}) {
  const isCancelled = event.cancellation_status === 'cancellation_approved';
  const displayStatus = isCancelled ? 'cancelled' : event.status;
  const sc = isCancelled ? '#9E9E9E' : (STATUS_COLORS[displayStatus] ?? Colors.textMuted);

  return (
    <Pressable onPress={onNavigate} style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.9 }]}>
      {event.coverImage ? (
        <Image source={{ uri: event.coverImage }} style={styles.eventThumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.eventThumb, { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
          <MaterialIcons name="event" size={20} color={Colors.textMuted} />
        </View>
      )}
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.eventMeta}>{event.promoterName} · {event.parish}</Text>
        <Text style={styles.eventDate}>{formatDate(event.date)}</Text>
        <View style={[styles.eventStatusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
          <View style={[styles.eventStatusDot, { backgroundColor: sc }]} />
          <Text style={[styles.eventStatusText, { color: sc }]}>
            {isCancelled ? 'Cancelled' : displayStatus}
          </Text>
        </View>
        {event.flagReason ? <Text style={styles.flagReason} numberOfLines={1}>Flag: {event.flagReason}</Text> : null}
      </View>
      <View style={styles.eventActions}>
        {onApprove ? (
          <Pressable onPress={onApprove} style={styles.approveBtn} hitSlop={4}>
            <MaterialIcons name="check" size={15} color="#fff" />
          </Pressable>
        ) : null}
        {onReject ? (
          <Pressable onPress={onReject} style={styles.rejectBtn} hitSlop={4}>
            <MaterialIcons name="close" size={15} color="#fff" />
          </Pressable>
        ) : null}
        {onUnflag ? (
          <Pressable onPress={onUnflag} style={[styles.approveBtn, { backgroundColor: Colors.greenLight }]} hitSlop={4}>
            <MaterialIcons name="flag" size={13} color="#fff" />
          </Pressable>
        ) : null}
        {showFeatureSwitch && onToggleFeatured ? (
          <View style={styles.featureSwitch}>
            <MaterialIcons name="star" size={11} color={event.featured ? Colors.gold : Colors.textMuted} />
            <Switch
              value={event.featured ?? false}
              onValueChange={onToggleFeatured}
              trackColor={{ false: Colors.surfaceBorder, true: `${Colors.gold}55` }}
              thumbColor={event.featured ? Colors.gold : Colors.textMuted}
              ios_backgroundColor={Colors.surfaceBorder}
              accessibilityLabel="Feature toggle"
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ visible, onClose, onConfirm, title = 'Reject Event' }: {
  visible: boolean; onClose: () => void; onConfirm: (reason: string) => void; title?: string;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalFieldLabel}>Reason (optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Incomplete information..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              accessibilityLabel="Rejection reason"
            />
            <View style={styles.modalBtnRow}>
              <Pressable onPress={onClose} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { onConfirm(reason); setReason(''); }}
                style={styles.modalRejectBtn}
              >
                <Text style={styles.modalRejectText}>Reject</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminEventsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requireEventApproval } = useAuth();
  const { allEvents, events, getPendingEvents, getFlaggedEvents, approveEvent, rejectEvent, editEvent } = useEvents();

  const [activeSection, setActiveSection] = useState<EventSection>('queue');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const pendingEvents = getPendingEvents();
  const flaggedEvents = getFlaggedEvents();
  const allForAdmin = useMemo(() => allEvents.length > 0 ? allEvents : events, [allEvents, events]);

  const filteredAll = useMemo(() => {
    return allForAdmin.filter((e) => {
      const isCancelled = (e as any).cancellation_status === 'cancellation_approved';
      let matchStatus = true;
      if (statusFilter === 'cancelled') matchStatus = isCancelled;
      else if (statusFilter !== 'all') matchStatus = e.status === statusFilter;
      const q = search.toLowerCase().trim();
      const matchSearch = q === '' || e.title.toLowerCase().includes(q) || e.promoterName.toLowerCase().includes(q) || e.parish.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [allForAdmin, statusFilter, search]);

  const handleApprove = useCallback(async (id: string) => {
    const evt = allForAdmin.find((e) => e.id === id);
    try {
      await approveEvent(id);
      // Only notify AFTER the database approval succeeds
      if (evt?.promoterId) void notifyPromoterEventApproved(evt.promoterId, id, evt.title);
    } catch (err) {
      Alert.alert('Approval Failed', 'Failed to approve event. Please try again.');
    }
  }, [allForAdmin, approveEvent]);

  const handleRejectConfirm = useCallback((reason: string) => {
    if (!rejectTarget) return;
    const evt = allForAdmin.find((e) => e.id === rejectTarget);
    rejectEvent(rejectTarget, reason);
    if (evt?.promoterId) void notifyPromoterEventRejected(evt.promoterId, rejectTarget, evt.title, reason || undefined);
    setRejectTarget(null);
  }, [rejectTarget, allForAdmin, rejectEvent]);

  const SECTIONS = [
    { key: 'queue' as EventSection, label: 'Queue', badge: pendingEvents.length, icon: 'pending-actions' },
    { key: 'flagged' as EventSection, label: 'Flagged', badge: flaggedEvents.length, icon: 'flag' },
    { key: 'all' as EventSection, label: 'All Events', badge: 0, icon: 'list-alt' },
  ];

  const STATUS_OPTS = ['all', 'live', 'pending', 'flagged', 'rejected', 'cancelled'];

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="event" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Events</Text>
            <Text style={styles.headerSub}>Moderation, approval, and management</Text>
          </View>
        </View>

        {/* Section tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
          {SECTIONS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setActiveSection(s.key)}
              style={[styles.sectionTab, activeSection === s.key && styles.sectionTabActive]}
            >
              <MaterialIcons name={s.icon as any} size={13} color={activeSection === s.key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.sectionTabText, activeSection === s.key && styles.sectionTabTextActive]}>{s.label}</Text>
              {s.badge > 0 && (
                <View style={[styles.sectionBadge, activeSection === s.key && styles.sectionBadgeActive]}>
                  <Text style={[styles.sectionBadgeText, activeSection === s.key && styles.sectionBadgeTextActive]}>{s.badge}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* ── Queue ── */}
        {activeSection === 'queue' && (
          <>
            <View style={styles.moderationBanner}>
              {requireEventApproval ? (
                <>
                  <MaterialIcons name="pending-actions" size={14} color="#FF9800" />
                  <Text style={[styles.moderationText, { color: '#FF9800' }]}>Moderation ON — new events require approval</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="bolt" size={14} color={Colors.greenLight} />
                  <Text style={[styles.moderationText, { color: Colors.greenLight }]}>Auto-publish ON — new events go live immediately</Text>
                </>
              )}
            </View>
            {pendingEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="done-all" size={40} color={Colors.greenLight} />
                <Text style={styles.emptyTitle}>Queue is clear</Text>
                <Text style={styles.emptySub}>No pending events to review.</Text>
              </View>
            ) : (
              pendingEvents.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onNavigate={() => router.push(`/event/${e.id}` as any)}
                  onApprove={() => { void handleApprove(e.id); }}
                  onReject={() => setRejectTarget(e.id)}
                />
              ))
            )}
          </>
        )}

        {/* ── Flagged ── */}
        {activeSection === 'flagged' && (
          <>
            {flaggedEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="verified-user" size={40} color={Colors.greenLight} />
                <Text style={styles.emptyTitle}>No flagged events</Text>
                <Text style={styles.emptySub}>All listings look good.</Text>
              </View>
            ) : (
              flaggedEvents.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onNavigate={() => router.push(`/event/${e.id}` as any)}
                  onUnflag={() => approveEvent(e.id)}
                  onReject={() => {
                    Alert.alert('Remove Event', 'This will reject and remove the event from public listings.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => rejectEvent(e.id, 'Removed by admin') },
                    ]);
                  }}
                />
              ))
            )}
          </>
        )}

        {/* ── All Events ── */}
        {activeSection === 'all' && (
          <>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by title, promoter, parish..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                accessibilityLabel="Search all events"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <MaterialIcons name="close" size={15} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusFilterRow}>
              {STATUS_OPTS.map((s) => {
                const isAct = statusFilter === s;
                const sc2 = s === 'all' ? Colors.gold : (STATUS_COLORS[s] ?? '#9E9E9E');
                const cnt = s === 'all' ? allForAdmin.length : s === 'cancelled' ? allForAdmin.filter((e) => (e as any).cancellation_status === 'cancellation_approved').length : allForAdmin.filter((e) => e.status === s).length;
                return (
                  <Pressable key={s} onPress={() => setStatusFilter(s)} style={[styles.statusChip, isAct && { backgroundColor: `${sc2}22`, borderColor: `${sc2}77` }]}>
                    <Text style={[styles.statusChipText, isAct && { color: sc2 }]}>
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({cnt})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {filteredAll.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="search-off" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No events found</Text>
                <Text style={styles.emptySub}>Try a different filter or search term.</Text>
              </View>
            ) : (
              filteredAll.slice(0, 100).map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onNavigate={() => router.push(`/event/${e.id}` as any)}
                  showFeatureSwitch
                  onToggleFeatured={(val) => editEvent(e.id, { featured: val })}
                />
              ))
            )}
            {filteredAll.length > 100 && (
              <Text style={styles.limitText}>Showing 100 of {filteredAll.length} results</Text>
            )}
          </>
        )}
      </ScrollView>

      <RejectModal visible={rejectTarget !== null} onClose={() => setRejectTarget(null)} onConfirm={handleRejectConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  sectionTabs: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  sectionTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  sectionTabActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  sectionTabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  sectionTabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
  sectionBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  sectionBadgeActive: { backgroundColor: 'rgba(0,0,0,0.25)' },
  sectionBadgeText: { fontSize: 9, fontWeight: Typography.bold as any, color: '#fff' },
  sectionBadgeTextActive: { color: Colors.textOnGold },
  body: { padding: Spacing.base, gap: Spacing.sm },
  moderationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base,
    borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  moderationText: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semibold as any },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  statusFilterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  statusChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  statusChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  eventThumb: { width: 60, height: 60, borderRadius: Radius.md, flexShrink: 0 },
  eventInfo: { flex: 1, gap: 3 },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  eventDate: { fontSize: Typography.xs, color: Colors.gold },
  eventStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1,
  },
  eventStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  eventStatusText: { fontSize: 9, fontWeight: Typography.bold as any },
  flagReason: { fontSize: 10, color: '#FF6B6B' },
  eventActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end' },
  approveBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  featureSwitch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  limitText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.base, borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  modalFieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, color: Colors.textPrimary, fontSize: Typography.base, minHeight: 80,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  modalRejectBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: '#F44336', borderRadius: Radius.md },
  modalRejectText: { color: '#fff', fontWeight: Typography.bold as any },
});
