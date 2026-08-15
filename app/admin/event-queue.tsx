/**
 * Admin Portal — Event Queue
 * Pending events awaiting admin approval.
 * Admin-only. Accessed from Profile → Moderation → Event Queue.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  TextInput,
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

const STATUS_COLORS: Record<string, string> = {
  live: Colors.greenLight, pending: '#FF9800', flagged: '#FF5722', rejected: '#F44336',
};

function EventRow({ event, onApprove, onReject, onNavigate, onEdit }: {
  event: any; onApprove?: () => void; onReject?: () => void;
  onNavigate: () => void; onEdit?: () => void;
}) {
  const sc = STATUS_COLORS[event.status] ?? Colors.textMuted;
  return (
    <Pressable onPress={onNavigate} style={({ pressed }) => [s.eventRow, pressed && { opacity: 0.9 }]}>
      {event.coverImage ? (
        <Image source={{ uri: event.coverImage }} style={s.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[s.thumb, s.thumbPlaceholder]}>
          <MaterialIcons name="event" size={20} color={Colors.textMuted} />
        </View>
      )}
      <View style={s.eventInfo}>
        <Text style={s.eventTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={s.eventMeta}>{event.promoterName} · {event.parish}</Text>
        <Text style={s.eventDate}>{formatDate(event.date)}</Text>
        <View style={[s.statusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
          <View style={[s.statusDot, { backgroundColor: sc }]} />
          <Text style={[s.statusText, { color: sc }]}>{event.status}</Text>
        </View>
      </View>
      <View style={s.eventActions}>
        {onApprove ? (
          <Pressable onPress={onApprove} style={s.approveBtn} hitSlop={4}>
            <MaterialIcons name="check" size={15} color="#fff" />
          </Pressable>
        ) : null}
        {onReject ? (
          <Pressable onPress={onReject} style={s.rejectBtn} hitSlop={4}>
            <MaterialIcons name="close" size={15} color="#fff" />
          </Pressable>
        ) : null}
        {onEdit ? (
          <Pressable onPress={onEdit} style={s.editBtn} hitSlop={4}>
            <MaterialIcons name="edit" size={13} color={Colors.gold} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function RejectModal({ visible, onClose, onConfirm }: {
  visible: boolean; onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={s.modalOverlay} onPress={onClose}>
          <Pressable style={[s.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Reject Event</Text>
            <Text style={s.modalLabel}>Reason (optional)</Text>
            <TextInput
              style={s.modalInput}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Incomplete information..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              accessibilityLabel="Rejection reason"
            />
            <View style={s.modalBtnRow}>
              <Pressable onPress={onClose} style={s.modalCancelBtn}><Text style={s.modalCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={() => { onConfirm(reason); setReason(''); }} style={s.modalRejectBtn}>
                <Text style={s.modalRejectText}>Reject</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function EventQueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, requireEventApproval } = useAuth();
  const { allEvents, events, getPendingEvents, approveEvent, rejectEvent } = useEvents();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const allForAdmin = allEvents.length > 0 ? allEvents : events;
  const pendingEvents = getPendingEvents();

  const handleApprove = useCallback(async (id: string) => {
    const evt = allForAdmin.find((e) => e.id === id);
    try {
      await approveEvent(id);
      if (evt?.promoterId) void notifyPromoterEventApproved(evt.promoterId, id, evt.title);
    } catch {
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
            <MaterialIcons name="pending-actions" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Event Queue</Text>
            <Text style={s.headerSub}>{pendingEvents.length > 0 ? `${pendingEvents.length} pending` : 'No pending events'}</Text>
          </View>
          {pendingEvents.length > 0 && (
            <View style={s.headerBadge}><Text style={s.headerBadgeText}>{pendingEvents.length}</Text></View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}>
        {/* Moderation status */}
        <View style={[s.moderationBanner, requireEventApproval ? s.bannerOn : s.bannerOff]}>
          <MaterialIcons name={requireEventApproval ? 'pending-actions' : 'bolt'} size={14} color={requireEventApproval ? '#FF9800' : Colors.greenLight} />
          <Text style={[s.moderationText, { color: requireEventApproval ? '#FF9800' : Colors.greenLight }]}>
            {requireEventApproval ? 'Moderation ON — new events require approval' : 'Auto-publish ON — new events go live immediately'}
          </Text>
        </View>

        {pendingEvents.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="done-all" size={48} color={Colors.greenLight} />
            <Text style={s.emptyTitle}>Queue is clear</Text>
            <Text style={s.emptySub}>No pending events to review.</Text>
          </View>
        ) : (
          pendingEvents.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              onNavigate={() => router.push(`/event/${e.id}` as any)}
              onApprove={() => { void handleApprove(e.id); }}
              onReject={() => setRejectTarget(e.id)}
              onEdit={() => router.push(`/edit-event/${e.id}` as any)}
            />
          ))
        )}
      </ScrollView>

      <RejectModal visible={rejectTarget !== null} onClose={() => setRejectTarget(null)} onConfirm={handleRejectConfirm} />
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
  headerBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#FF9800', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: Typography.black as any, color: '#fff' },
  body: { padding: Spacing.base, gap: Spacing.sm },
  moderationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base, borderWidth: 1,
  },
  bannerOn: { backgroundColor: 'rgba(255,152,0,0.1)', borderColor: 'rgba(255,152,0,0.3)' },
  bannerOff: { backgroundColor: `${Colors.greenLight}10`, borderColor: `${Colors.greenLight}33` },
  moderationText: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semibold as any },
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
  approveBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}55` },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl * 1.5, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.base, borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  modalLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.surfaceBorder, padding: Spacing.md, color: Colors.textPrimary, fontSize: Typography.base, minHeight: 80,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalCancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  modalRejectBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: '#F44336', borderRadius: Radius.md },
  modalRejectText: { color: '#fff', fontWeight: Typography.bold as any },
});
