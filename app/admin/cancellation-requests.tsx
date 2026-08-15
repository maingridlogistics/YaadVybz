/**
 * Admin Portal — Cancellation Requests
 * Review and act on event cancellation requests.
 * Admin-only. Accessed from Profile → Moderation → Cancellation Requests.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useAdminCancellations } from '../../hooks/usePayouts';

export default function CancellationRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const adminCancellations = useAdminCancellations();
  const { load: loadCancellations } = adminCancellations;
  const safeBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { loadCancellations(); }, [loadCancellations]);

  if (!isAdmin) {
    return (
      <View style={s.gate}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={s.gateText}>Admin access required.</Text>
        <Pressable onPress={() => router.back()} style={s.gateBtn}>
          <Text style={s.gateBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const pending = adminCancellations.requests.filter((r) => r.status === 'pending_admin');
  const processed = adminCancellations.requests.filter((r) => r.status !== 'pending_admin').slice(0, 20);

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={safeBack} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="cancel" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Cancellation Requests</Text>
            <Text style={s.headerSub}>
              {pending.length > 0 ? `${pending.length} pending review` : 'Event cancellation management'}
            </Text>
          </View>
          {pending.length > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{pending.length}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Info banner */}
        <View style={s.infoBanner}>
          <MaterialIcons name="warning" size={13} color="#FF9800" />
          <Text style={s.infoBannerText}>
            Approving a cancellation voids all tickets and queues refunds for paid attendees. This cannot be undone.
          </Text>
        </View>

        {adminCancellations.loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.xl }} />
        ) : null}

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <View style={s.sectionLabel}>
              <View style={[s.sectionDot, { backgroundColor: '#FF9800' }]} />
              <Text style={s.sectionLabelText}>PENDING REVIEW ({pending.length})</Text>
            </View>
            {pending.map((req) => (
              <View key={req.id} style={s.requestRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.requestTitle} numberOfLines={1}>{req.event_title || 'Untitled Event'}</Text>
                  <Text style={s.requestMeta}>
                    {req.event_date ? `Event date: ${req.event_date}` : ''}
                  </Text>
                  {req.reason ? (
                    <Text style={s.requestReason} numberOfLines={3}>{`"${req.reason}"`}</Text>
                  ) : null}
                  <Text style={s.requestDate}>
                    Submitted {new Date(req.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <View style={s.requestActions}>
                  <Pressable
                    onPress={() => Alert.alert(
                      'Approve Cancellation',
                      `Approve cancellation for "${req.event_title}"?\n\nThis will:\n• Cancel the event\n• Void all tickets\n• Queue refunds for paid attendees\n\nThis cannot be undone.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Approve',
                          style: 'destructive',
                          onPress: async () => {
                            const result = await adminCancellations.approve(req.id);
                            if (!result.ok) Alert.alert('Error', result.error ?? 'Failed to approve cancellation.');
                            else Alert.alert('Approved', `Cancellation approved. ${result.refund_records_created ?? 0} refund record${(result.refund_records_created ?? 0) !== 1 ? 's' : ''} created.`);
                          },
                        },
                      ]
                    )}
                    style={s.approveBtn}
                  >
                    <MaterialIcons name="check" size={13} color="#fff" />
                    <Text style={s.approveBtnText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setRejectTarget(req); setRejectReason(''); }}
                    style={s.rejectBtn}
                    hitSlop={4}
                  >
                    <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Processed */}
        {processed.length > 0 && (
          <>
            <View style={[s.sectionLabel, { marginTop: pending.length > 0 ? Spacing.base : 0 }]}>
              <View style={[s.sectionDot, { backgroundColor: Colors.textMuted }]} />
              <Text style={[s.sectionLabelText, { color: Colors.textMuted }]}>PROCESSED ({processed.length})</Text>
            </View>
            {processed.map((req) => (
              <View key={req.id} style={[s.requestRow, { opacity: 0.65 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.requestTitle} numberOfLines={1}>{req.event_title || 'Untitled'}</Text>
                  <View style={[
                    s.processedChip,
                    { backgroundColor: req.status === 'approved_admin' ? 'rgba(244,67,54,0.12)' : Colors.surfaceElevated },
                  ]}>
                    <Text style={[s.processedChipText, { color: req.status === 'approved_admin' ? Colors.error : Colors.textMuted }]}>
                      {req.status === 'approved_admin' ? 'Cancelled & Refunded' : 'Rejected'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {adminCancellations.requests.length === 0 && !adminCancellations.loading && (
          <View style={s.emptyState}>
            <MaterialIcons name="event-available" size={40} color={Colors.greenLight} />
            <Text style={s.emptyTitle}>No cancellation requests</Text>
            <Text style={s.emptySub}>Event cancellation requests will appear here.</Text>
          </View>
        )}
      </ScrollView>

      {/* Reject modal */}
      <Modal
        visible={rejectTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectTarget(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.modalOverlay} onPress={() => setRejectTarget(null)}>
            <Pressable
              style={[s.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Reject Cancellation Request</Text>
              {rejectTarget ? (
                <View style={s.rejectTargetRow}>
                  <MaterialIcons name="event" size={14} color={Colors.textMuted} />
                  <Text style={s.rejectTargetText} numberOfLines={1}>{rejectTarget.event_title || 'Untitled Event'}</Text>
                </View>
              ) : null}
              <Text style={s.modalFieldLabel}>Reason for Rejection (optional)</Text>
              <TextInput
                style={s.modalInput}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Why is this cancellation request being rejected?"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Rejection reason"
              />
              <View style={s.modalBtnRow}>
                <Pressable onPress={() => setRejectTarget(null)} style={s.modalCancelBtn}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    if (!rejectTarget) return;
                    const result = await adminCancellations.reject(rejectTarget.id, rejectReason.trim() || '');
                    if (!result.ok) Alert.alert('Error', result.error ?? 'Failed to reject.');
                    setRejectTarget(null);
                  }}
                  style={[s.modalConfirmBtn, { backgroundColor: '#FF9800' }]}
                >
                  <Text style={s.modalConfirmText}>Reject Request</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  headerBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#FF9800', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: Typography.black as any, color: '#fff' },
  body: { padding: Spacing.base, gap: Spacing.sm },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  infoBannerText: { flex: 1, fontSize: Typography.xs, color: '#FFB74D', lineHeight: 17 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabelText: { fontSize: 11, fontWeight: Typography.bold as any, color: '#FF9800', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  requestRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  requestTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  requestMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  requestReason: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 17 },
  requestDate: { fontSize: 10, color: Colors.textMuted },
  requestActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end' },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 7, backgroundColor: Colors.error, borderRadius: Radius.md,
  },
  approveBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#fff' },
  rejectBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  processedChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start', marginTop: 4 },
  processedChipText: { fontSize: 10, fontWeight: Typography.bold as any },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  rejectTargetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm },
  rejectTargetText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium as any },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.base, borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  modalFieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.surfaceBorder, padding: Spacing.md, color: Colors.textPrimary,
    fontSize: Typography.base, minHeight: 80,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalCancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  modalConfirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.md },
  modalConfirmText: { color: '#fff', fontWeight: Typography.bold as any },
});
