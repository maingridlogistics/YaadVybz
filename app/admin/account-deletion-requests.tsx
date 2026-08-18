/**
 * Admin Portal — Account Deletion Requests
 * Dedicated screen for reviewing and acting on account deletion requests.
 * Admin-only. Accessed from Profile → People → Account Deletion Requests.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeSheet } from '../../components/ui/KeyboardSafeSheet';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface DeletionRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  reason: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
}

function ConfirmModal({ action, onClose }: { action: ConfirmAction | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!action) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cm.overlay} onPress={onClose}>
        <Pressable style={[cm.sheet, { marginBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <Text style={cm.title}>{action.title}</Text>
          <Text style={cm.message}>{action.message}</Text>
          <View style={cm.btnRow}>
            <Pressable onPress={onClose} style={cm.cancelBtn}><Text style={cm.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={() => { action.onConfirm(); onClose(); }} style={[cm.confirmBtn, { backgroundColor: action.confirmColor }]}>
              <Text style={cm.confirmText}>{action.confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 400 },
  title: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  message: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  confirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.md },
  confirmText: { fontSize: Typography.sm, color: '#fff', fontWeight: Typography.bold as any },
});

function DeletionCard({ req, onApprove, onReject, isProcessing }: {
  req: DeletionRequest; onApprove: () => void; onReject: () => void; isProcessing: boolean;
}) {
  const statusColors: Record<string, string> = { pending: '#FF9800', approved: Colors.greenLight, rejected: Colors.textMuted, failed: Colors.error };
  const sc = statusColors[req.status] ?? Colors.textMuted;
  const isPending = req.status === 'pending';

  return (
    <View style={[s.card, isProcessing && { opacity: 0.7 }]}>
      <View style={s.cardAvatar}>
        <Text style={s.cardAvatarLetter}>{(req.user_name || req.user_email || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={s.cardInfo}>
        <Text style={s.cardName}>{req.user_name || 'Unknown User'}</Text>
        <Text style={s.cardEmail}>{req.user_email || '—'}</Text>
        {req.reason ? <Text style={s.cardReason} numberOfLines={2}>{`"${req.reason}"`}</Text> : null}
        {req.rejection_reason ? <Text style={[s.cardReason, { color: '#FF9800' }]} numberOfLines={2}>{`Rejected: ${req.rejection_reason}`}</Text> : null}
        <View style={s.cardMeta}>
          <View style={[s.statusPill, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
            <View style={[s.statusDot, { backgroundColor: sc }]} />
            <Text style={[s.statusText, { color: sc }]}>{req.status.charAt(0).toUpperCase() + req.status.slice(1)}</Text>
          </View>
          <Text style={s.cardDate}>
            {new Date(req.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <Text style={s.cardUid} selectable>UID: {req.user_id?.slice(0, 16)}…</Text>
      </View>
      {isPending && (
        <View style={s.cardActions}>
          {isProcessing ? (
            <ActivityIndicator color={Colors.gold} size="small" />
          ) : (
            <>
              <Pressable onPress={onApprove} style={s.approveBtn} accessibilityLabel="Approve deletion">
                <MaterialIcons name="delete-forever" size={14} color="#fff" />
                <Text style={s.approveBtnText}>Delete</Text>
              </Pressable>
              <Pressable onPress={onReject} style={s.rejectBtn} hitSlop={4} accessibilityLabel="Reject deletion">
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function AccountDeletionRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: adminUser } = useAuth();
  const isAdmin = adminUser?.roles.includes('admin') ?? false;

  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DeletionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState('');
  const [resultModal, setResultModal] = useState<{ visible: boolean; success: boolean; message: string }>({ visible: false, success: false, message: '' });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('account_deletion_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setRequests((data ?? []) as DeletionRequest[]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const executeDeletion = useCallback(async (req: DeletionRequest, action: 'approve' | 'reject', rejectionReason?: string) => {
    const reqId = req.id;
    setProcessingIds((prev) => { const s = new Set(prev); s.add(reqId); return s; });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session.');
      const body: Record<string, any> = { request_id: reqId, action };
      if (action === 'reject' && rejectionReason) body.rejection_reason = rejectionReason;
      const { error } = await supabase.functions.invoke('delete-account', {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        let msg = (error as any).message ?? 'Request failed';
        try {
          const ctx = (error as any).context;
          if (ctx) {
            const statusCode = ctx.status ?? 500;
            const text = typeof ctx.text === 'function' ? await ctx.text() : null;
            msg = text ? `[${statusCode}] ${text}` : msg;
          }
        } catch {}
        throw new Error(msg);
      }
      setResultModal({
        visible: true, success: true,
        message: action === 'approve'
          ? `Account for "${req.user_name ?? req.user_email ?? 'user'}" has been deleted permanently.`
          : `Deletion request from "${req.user_name ?? req.user_email ?? 'user'}" has been rejected. Account remains active.`,
      });
      await loadRequests();
    } catch (err: any) {
      setResultModal({ visible: true, success: false, message: err?.message ?? 'An unexpected error occurred.' });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(reqId); return s; });
    }
  }, [loadRequests]);

  const handleApprove = useCallback((req: DeletionRequest) => {
    setConfirmAction({
      title: 'Approve Deletion Request?',
      message: `This will permanently delete the account for "${req.user_name ?? req.user_email ?? 'this user'}". All events, RSVPs, tickets, and data will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Approve Delete',
      confirmColor: '#F44336',
      onConfirm: () => executeDeletion(req, 'approve'),
    });
  }, [executeDeletion]);

  const handleConfirmReject = useCallback(async () => {
    if (!rejectTarget) return;
    setRejectSubmitting(true);
    setRejectError('');
    try {
      await executeDeletion(rejectTarget, 'reject', rejectReason.trim() || undefined);
      setRejectTarget(null);
      setRejectReason('');
    } catch (err: any) {
      setRejectError(err?.message ?? 'Failed to reject request.');
    } finally {
      setRejectSubmitting(false);
    }
  }, [rejectTarget, rejectReason, executeDeletion]);

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

  const pending = requests.filter((r) => r.status === 'pending');
  const processed = requests.filter((r) => r.status !== 'pending');

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="delete-forever" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Account Deletion Requests</Text>
            <Text style={s.headerSub}>{pending.length > 0 ? `${pending.length} pending review` : 'No pending requests'}</Text>
          </View>
          {pending.length > 0 && (
            <View style={s.headerBadge}><Text style={s.headerBadgeText}>{pending.length}</Text></View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}>
        <View style={s.infoBanner}>
          <MaterialIcons name="info-outline" size={14} color="#42A5F5" />
          <Text style={s.infoBannerText}>
            Approving permanently deletes the account and all associated data (events, RSVPs, tickets) via CASCADE. Rejecting preserves the account. Both actions are irreversible.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.xl }} />
        ) : null}

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <View style={s.sectionLabel}>
              <View style={[s.sectionDot, { backgroundColor: '#FF9800' }]} />
              <Text style={s.sectionLabelText}>PENDING ({pending.length})</Text>
            </View>
            {pending.map((req) => (
              <DeletionCard
                key={req.id}
                req={req}
                isProcessing={processingIds.has(req.id)}
                onApprove={() => handleApprove(req)}
                onReject={() => { setRejectTarget(req); setRejectReason(''); setRejectError(''); }}
              />
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
              <DeletionCard
                key={req.id}
                req={req}
                isProcessing={false}
                onApprove={() => {}}
                onReject={() => {}}
              />
            ))}
          </>
        )}

        {requests.length === 0 && !loading && (
          <View style={s.emptyState}>
            <MaterialIcons name="delete-sweep" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No deletion requests</Text>
            <Text style={s.emptySub}>Account deletion requests will appear here.</Text>
          </View>
        )}
      </ScrollView>

      <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} />

      <KeyboardSafeSheet visible={rejectTarget !== null} onClose={() => setRejectTarget(null)}>
        <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Reject Deletion Request</Text>
              {rejectTarget ? (
                <View style={s.rejectTargetRow}>
                  <MaterialIcons name="person" size={14} color={Colors.textMuted} />
                  <Text style={s.rejectTargetName}>{rejectTarget.user_name ?? rejectTarget.user_email ?? 'Unknown user'}</Text>
                </View>
              ) : null}
              <Text style={s.modalFieldLabel}>Reason (optional — shown to user)</Text>
              <TextInput
                style={s.modalInput}
                value={rejectReason}
                onChangeText={(v) => { setRejectReason(v); setRejectError(''); }}
                placeholder="Why is this request being rejected?"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Rejection reason"
              />
              {rejectError ? (
                <View style={s.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={s.errorText}>{rejectError}</Text>
                </View>
              ) : null}
              <View style={s.modalBtnRow}>
                <Pressable onPress={() => setRejectTarget(null)} style={s.modalCancelBtn}><Text style={s.modalCancelText}>Cancel</Text></Pressable>
                <Pressable
                  onPress={handleConfirmReject}
                  disabled={rejectSubmitting}
                  style={[s.modalConfirmBtn, { backgroundColor: '#FF9800' }, rejectSubmitting && { opacity: 0.5 }]}
                >
                  {rejectSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmText}>Reject Request</Text>}
                </Pressable>
              </View>
        </View>
      </KeyboardSafeSheet>

      {/* Result modal */}
      <Modal visible={resultModal.visible} transparent animationType="fade" onRequestClose={() => setResultModal((p) => ({ ...p, visible: false }))}>
        <Pressable style={cm.overlay} onPress={() => setResultModal((p) => ({ ...p, visible: false }))}>
          <Pressable style={[cm.sheet, { alignItems: 'center' }]} onPress={(e) => e.stopPropagation()}>
            <View style={[s.resultIcon, { backgroundColor: resultModal.success ? `${Colors.greenLight}18` : 'rgba(244,67,54,0.12)' }]}>
              <MaterialIcons name={resultModal.success ? 'check-circle' : 'error-outline'} size={32} color={resultModal.success ? Colors.greenLight : '#F44336'} />
            </View>
            <Text style={cm.title}>{resultModal.success ? 'Success' : 'Error'}</Text>
            <Text style={cm.message}>{resultModal.message}</Text>
            <Pressable
              onPress={() => setResultModal((p) => ({ ...p, visible: false }))}
              style={[cm.confirmBtn, { backgroundColor: resultModal.success ? Colors.greenLight : '#F44336', width: '100%', marginTop: Spacing.xs }]}
            >
              <Text style={cm.confirmText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
  headerBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: Typography.black as any, color: '#fff' },
  body: { padding: Spacing.base, gap: Spacing.sm },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
  },
  infoBannerText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabelText: { fontSize: 11, fontWeight: Typography.bold as any, color: '#FF9800', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  cardAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,83,80,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,83,80,0.3)', flexShrink: 0 },
  cardAvatarLetter: { fontSize: Typography.md, fontWeight: Typography.black as any, color: '#EF5350' },
  cardInfo: { flex: 1, gap: 3 },
  cardName: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  cardEmail: { fontSize: Typography.xs, color: Colors.textMuted },
  cardReason: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 16 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: Typography.bold as any },
  cardDate: { fontSize: 10, color: Colors.textMuted },
  cardUid: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 1 },
  cardActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end', minWidth: 64 },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 7, backgroundColor: '#F44336', borderRadius: Radius.md },
  approveBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#fff' },
  rejectBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  resultIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, backgroundColor: 'rgba(244,67,54,0.1)', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)' },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.error, lineHeight: 17 },
  rejectTargetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm },
  rejectTargetName: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium as any },
  modalSheet: { padding: Spacing.base, gap: Spacing.md },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  modalFieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  modalInput: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, color: Colors.textPrimary, fontSize: Typography.base, minHeight: 80 },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalCancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  modalConfirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, minHeight: 48 },
  modalConfirmText: { color: '#fff', fontWeight: Typography.bold as any },
});
