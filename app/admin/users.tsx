/**
 * Admin Portal — Users Tab
 * Search, filter, inspect, suspend, verify, and manage user accounts.
 * Handles account deletion requests. Admin-only.
 *
 * DELETE-REQUEST FIX: Uses a Modal-based confirmation instead of Alert.alert
 * so it works correctly on both native and web (Live Preview).
 * FunctionsHttpError is handled to surface real backend error messages.
 */

import React, { useState, useCallback, useEffect } from 'react';
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
import { supabase } from '../../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type RoleFilter = 'all' | 'attendee' | 'promoter' | 'admin';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  subscription_tier: string;
  verified_promoter: boolean;
  joined_at: string | null;
}

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

// ─── Confirm Modal (web-safe alternative to Alert.alert) ──────────────────────
interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
}

function ConfirmModal({
  action,
  onClose,
}: {
  action: ConfirmAction | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!action) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cm.overlay} onPress={onClose}>
        <Pressable style={[cm.sheet, { marginBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <Text style={cm.title}>{action.title}</Text>
          <Text style={cm.message}>{action.message}</Text>
          <View style={cm.btnRow}>
            <Pressable onPress={onClose} style={cm.cancelBtn}>
              <Text style={cm.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { action.onConfirm(); onClose(); }}
              style={[cm.confirmBtn, { backgroundColor: action.confirmColor }]}
            >
              <Text style={cm.confirmText}>{action.confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  sheet: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 400,
  },
  title: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  message: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  confirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.md },
  confirmText: { fontSize: Typography.sm, color: '#fff', fontWeight: Typography.bold as any },
});

// ─── User Card ────────────────────────────────────────────────────────────────
function UserCard({ user: u, onPress }: { user: UserRow; onPress: () => void }) {
  const isAdmin = u.roles.includes('admin');
  const isPromoter = u.roles.includes('promoter');
  const tierColor = u.subscription_tier === 'elite' ? '#E91E63' : u.subscription_tier === 'pro' ? Colors.gold : Colors.textMuted;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.userCard, pressed && { opacity: 0.88 }]}>
      <View style={[styles.userAvatar, isAdmin ? styles.avatarAdmin : isPromoter ? styles.avatarPromoter : styles.avatarAttendee]}>
        <Text style={styles.userAvatarLetter}>{(u.name || u.email || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>{u.name || '—'}</Text>
          {u.verified_promoter && <MaterialIcons name="verified" size={14} color={Colors.gold} />}
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>{u.email || '—'}</Text>
        <View style={styles.userBadges}>
          {u.roles.map((role) => (
            <View key={role} style={[styles.roleBadge, role === 'admin' ? styles.badgeAdmin : role === 'promoter' ? styles.badgePromoter : styles.badgeAttendee]}>
              <Text style={[styles.roleBadgeText, role === 'admin' ? { color: Colors.gold } : role === 'promoter' ? { color: '#7C4DFF' } : { color: Colors.greenLight }]}>
                {role}
              </Text>
            </View>
          ))}
          {u.subscription_tier !== 'free' && (
            <View style={[styles.roleBadge, { backgroundColor: `${tierColor}18`, borderColor: `${tierColor}44` }]}>
              <Text style={[styles.roleBadgeText, { color: tierColor }]}>{u.subscription_tier}</Text>
            </View>
          )}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Deletion Request Card ────────────────────────────────────────────────────
function DeletionCard({
  req,
  onApprove,
  onReject,
  isProcessing,
}: {
  req: DeletionRequest;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  const statusColors: Record<string, string> = {
    pending: '#FF9800',
    approved: Colors.greenLight,
    rejected: Colors.textMuted,
    failed: Colors.error,
  };
  const sc = statusColors[req.status] ?? Colors.textMuted;
  const isPending = req.status === 'pending';

  return (
    <View style={[styles.deletionCard, isProcessing && { opacity: 0.7 }]}>
      <View style={styles.deletionAvatar}>
        <Text style={styles.deletionAvatarLetter}>{(req.user_name || req.user_email || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.deletionInfo}>
        <Text style={styles.deletionName}>{req.user_name || 'Unknown User'}</Text>
        <Text style={styles.deletionEmail}>{req.user_email || '—'}</Text>
        {req.reason ? <Text style={styles.deletionReason} numberOfLines={2}>{`"${req.reason}"`}</Text> : null}
        {req.rejection_reason ? <Text style={[styles.deletionReason, { color: '#FF9800' }]} numberOfLines={2}>{`Rejected: ${req.rejection_reason}`}</Text> : null}
        <View style={styles.deletionMeta}>
          <View style={[styles.deletionStatusPill, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
            <View style={[styles.deletionStatusDot, { backgroundColor: sc }]} />
            <Text style={[styles.deletionStatusText, { color: sc }]}>
              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
            </Text>
          </View>
          <Text style={styles.deletionDate}>
            {new Date(req.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        {/* Show User ID for admin reference */}
        <Text style={styles.deletionUserId} selectable>UID: {req.user_id?.slice(0, 16)}…</Text>
      </View>
      {isPending && (
        <View style={styles.deletionActions}>
          {isProcessing ? (
            <ActivityIndicator color={Colors.gold} size="small" />
          ) : (
            <>
              <Pressable
                onPress={onApprove}
                style={({ pressed }) => [styles.deletionApproveBtn, pressed && { opacity: 0.8 }]}
                accessibilityLabel="Approve deletion request"
              >
                <MaterialIcons name="delete-forever" size={14} color="#fff" />
                <Text style={styles.deletionApproveBtnText}>Delete</Text>
              </Pressable>
              <Pressable
                onPress={onReject}
                style={({ pressed }) => [styles.deletionRejectBtn, pressed && { opacity: 0.8 }]}
                hitSlop={4}
                accessibilityLabel="Reject deletion request"
              >
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminUsersTab() {
  const { user: adminUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'users' | 'deletions'>('users');

  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<DeletionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Confirm modal state (approve path + generic confirms)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Result feedback modal
  const [resultModal, setResultModal] = useState<{ visible: boolean; success: boolean; message: string }>({ visible: false, success: false, message: '' });

  const loadUsers = useCallback(async (q: string, role: RoleFilter) => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_profiles')
        .select('id, name, email, roles, subscription_tier, verified_promoter, joined_at')
        .order('joined_at', { ascending: false })
        .limit(60);

      if (q.trim().length >= 2) {
        query = query.or(`name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`);
      }

      if (role === 'admin') {
        query = query.contains('roles', ['admin']);
      } else if (role === 'promoter') {
        query = query.contains('roles', ['promoter']);
      } else if (role === 'attendee') {
        query = query.contains('roles', ['attendee']);
      }

      const { data } = await query;
      setUsers((data ?? []) as UserRow[]);
    } catch {}
    setLoading(false);
  }, []);

  const loadDeletions = useCallback(async () => {
    setDeletionLoading(true);
    try {
      const { data } = await supabase
        .from('account_deletion_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setDeletionRequests((data ?? []) as DeletionRequest[]);
    } catch {}
    setDeletionLoading(false);
  }, []);

  useEffect(() => { loadUsers(search, roleFilter); }, [roleFilter, loadUsers]);
  useEffect(() => { if (activeSection === 'deletions') loadDeletions(); }, [activeSection, loadDeletions]);

  const handleSearch = useCallback(() => { loadUsers(search, roleFilter); }, [search, roleFilter, loadUsers]);

  // ── Core deletion API call ────────────────────────────────────────────────
  const executeDeletion = useCallback(async (req: DeletionRequest, action: 'approve' | 'reject', rejectionReason?: string) => {
    const reqId = req.id;
    setProcessingIds((prev) => { const s = new Set(prev); s.add(reqId); return s; });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session. Please sign in again.');

      const body: Record<string, any> = { request_id: reqId, action };
      if (action === 'reject' && rejectionReason) body.rejection_reason = rejectionReason;

      const { data, error } = await supabase.functions.invoke('delete-account', {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        // Extract actual error text from FunctionsHttpError
        let msg = error.message ?? 'Request failed';
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = (error as any).context?.status ?? 500;
            const text = await (error as any).context?.text?.();
            msg = text ? `[${statusCode}] ${text}` : msg;
          } catch { /* ignore */ }
        }
        throw new Error(msg);
      }

      // Success
      setResultModal({
        visible: true,
        success: true,
        message: action === 'approve'
          ? `Account for "${req.user_name ?? req.user_email ?? 'user'}" has been deleted. All associated data was permanently removed.`
          : `Deletion request from "${req.user_name ?? req.user_email ?? 'user'}" has been rejected. The account remains active.`,
      });

      // Refresh the deletions list
      await loadDeletions();
    } catch (err: any) {
      setResultModal({
        visible: true,
        success: false,
        message: err?.message ?? 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(reqId); return s; });
    }
  }, [loadDeletions]);

  // ── Approve: show confirmation modal first ────────────────────────────────
  const handleApproveDeletion = useCallback((req: DeletionRequest) => {
    setConfirmAction({
      title: 'Approve Deletion Request?',
      message: `This will permanently delete the account for "${req.user_name ?? req.user_email ?? 'this user'}". All events, RSVPs, tickets, and data will be removed via CASCADE. This cannot be undone.`,
      confirmLabel: 'Approve Delete',
      confirmColor: '#F44336',
      onConfirm: () => executeDeletion(req, 'approve'),
    });
  }, [executeDeletion]);

  // ── Reject: show reason modal ─────────────────────────────────────────────
  const handleConfirmRejectDeletion = useCallback(async () => {
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

  const pendingDeletionCount = deletionRequests.filter((r) => r.status === 'pending').length;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="people" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Users</Text>
            <Text style={styles.headerSub}>Search, inspect, and manage platform accounts</Text>
          </View>
        </View>

        {/* Section toggle */}
        <View style={styles.sectionToggle}>
          <Pressable
            onPress={() => setActiveSection('users')}
            style={[styles.toggleBtn, activeSection === 'users' && styles.toggleBtnActive]}
          >
            <MaterialIcons name="person" size={13} color={activeSection === 'users' ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[styles.toggleText, activeSection === 'users' && styles.toggleTextActive]}>Accounts</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveSection('deletions')}
            style={[styles.toggleBtn, activeSection === 'deletions' && styles.toggleBtnActive]}
          >
            <MaterialIcons name="delete-forever" size={13} color={activeSection === 'deletions' ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[styles.toggleText, activeSection === 'deletions' && styles.toggleTextActive]}>Delete Requests</Text>
            {pendingDeletionCount > 0 && (
              <View style={styles.toggleBadge}>
                <Text style={styles.toggleBadgeText}>{pendingDeletionCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {activeSection === 'users' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        >
          {/* Search */}
          <View style={styles.searchRow}>
            <MaterialIcons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              accessibilityLabel="Search users"
            />
            {search.length > 0 && (
              <Pressable onPress={() => { setSearch(''); loadUsers('', roleFilter); }} hitSlop={8}>
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </Pressable>
            )}
            <Pressable onPress={handleSearch} style={styles.searchBtn} hitSlop={4}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
          </View>

          {/* Role filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(['all', 'attendee', 'promoter', 'admin'] as RoleFilter[]).map((role) => {
              const roleColors: Record<string, string> = { all: Colors.gold, attendee: Colors.greenLight, promoter: '#7C4DFF', admin: '#F44336' };
              const isAct = roleFilter === role;
              const rc = roleColors[role];
              return (
                <Pressable
                  key={role}
                  onPress={() => setRoleFilter(role)}
                  style={[styles.filterChip, isAct && { backgroundColor: `${rc}22`, borderColor: `${rc}77` }]}
                >
                  <Text style={[styles.filterChipText, isAct && { color: rc }]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.gold} />
            </View>
          ) : users.length === 0 ? (
            <View style={styles.centered}>
              <MaterialIcons name="person-search" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No users found</Text>
              <Text style={styles.emptySub}>Try a different search term or filter.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultCount}>{users.length} result{users.length !== 1 ? 's' : ''}</Text>
              {users.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  onPress={() => router.push(`/promoter/${u.id}` as any)}
                />
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        >
          {/* Info banner */}
          <View style={styles.sectionLabel}>
            <MaterialIcons name="info-outline" size={14} color="#42A5F5" />
            <Text style={styles.sectionLabelText}>
              Approving a request permanently deletes the account and all data (events, tickets, RSVPs) via CASCADE. Rejecting preserves the account. Both actions are irreversible.
            </Text>
          </View>

          {deletionLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.gold} />
            </View>
          ) : deletionRequests.length === 0 ? (
            <View style={styles.centered}>
              <MaterialIcons name="delete-sweep" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No deletion requests</Text>
              <Text style={styles.emptySub}>Account deletion requests will appear here.</Text>
            </View>
          ) : (
            <>
              {/* Pending first */}
              {deletionRequests.filter((r) => r.status === 'pending').length > 0 && (
                <>
                  <View style={styles.subSectionLabel}>
                    <View style={[styles.subSectionDot, { backgroundColor: '#FF9800' }]} />
                    <Text style={styles.subSectionText}>Pending ({deletionRequests.filter((r) => r.status === 'pending').length})</Text>
                  </View>
                  {deletionRequests.filter((r) => r.status === 'pending').map((req) => (
                    <DeletionCard
                      key={req.id}
                      req={req}
                      isProcessing={processingIds.has(req.id)}
                      onApprove={() => handleApproveDeletion(req)}
                      onReject={() => { setRejectTarget(req); setRejectReason(''); setRejectError(''); }}
                    />
                  ))}
                </>
              )}

              {/* Processed */}
              {deletionRequests.filter((r) => r.status !== 'pending').length > 0 && (
                <>
                  <View style={[styles.subSectionLabel, { marginTop: Spacing.md }]}>
                    <View style={[styles.subSectionDot, { backgroundColor: Colors.textMuted }]} />
                    <Text style={[styles.subSectionText, { color: Colors.textMuted }]}>
                      Processed ({deletionRequests.filter((r) => r.status !== 'pending').length})
                    </Text>
                  </View>
                  {deletionRequests.filter((r) => r.status !== 'pending').map((req) => (
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
            </>
          )}
        </ScrollView>
      )}

      {/* ── Approve confirmation Modal (web-safe) ── */}
      <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} />

      {/* ── Reject deletion modal ── */}
      <Modal visible={rejectTarget !== null} transparent animationType="slide" onRequestClose={() => setRejectTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setRejectTarget(null)}>
            <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Reject Deletion Request</Text>
              {rejectTarget ? (
                <View style={styles.rejectTargetRow}>
                  <MaterialIcons name="person" size={14} color={Colors.textMuted} />
                  <Text style={styles.rejectTargetName}>{rejectTarget.user_name ?? rejectTarget.user_email ?? 'Unknown user'}</Text>
                </View>
              ) : null}
              <Text style={styles.modalFieldLabel}>Reason (optional — shown to user)</Text>
              <TextInput
                style={styles.modalInput}
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
                <View style={styles.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={styles.errorText}>{rejectError}</Text>
                </View>
              ) : null}
              <View style={styles.modalBtnRow}>
                <Pressable onPress={() => setRejectTarget(null)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmRejectDeletion}
                  disabled={rejectSubmitting}
                  style={[styles.modalConfirmBtn, { backgroundColor: '#FF9800' }, rejectSubmitting && { opacity: 0.5 }]}
                >
                  {rejectSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Reject Request</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Result feedback modal ── */}
      <Modal visible={resultModal.visible} transparent animationType="fade" onRequestClose={() => setResultModal((p) => ({ ...p, visible: false }))}>
        <Pressable style={cm.overlay} onPress={() => setResultModal((p) => ({ ...p, visible: false }))}>
          <Pressable style={[cm.sheet, { alignItems: 'center' }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.resultIcon, { backgroundColor: resultModal.success ? `${Colors.greenLight}18` : 'rgba(244,67,54,0.12)' }]}>
              <MaterialIcons
                name={resultModal.success ? 'check-circle' : 'error-outline'}
                size={32}
                color={resultModal.success ? Colors.greenLight : '#F44336'}
              />
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

  sectionToggle: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base, marginVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 3, borderWidth: 1, borderColor: Colors.surfaceBorder, gap: 3,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.sm,
  },
  toggleBtnActive: { backgroundColor: Colors.gold },
  toggleText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  toggleTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
  toggleBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleBadgeText: { fontSize: 9, fontWeight: Typography.bold as any, color: '#fff' },

  body: { padding: Spacing.base, gap: Spacing.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  searchBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  searchBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  filterChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.xs },
  centered: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarAdmin: { backgroundColor: Colors.goldSurface, borderWidth: 1.5, borderColor: `${Colors.gold}44` },
  avatarPromoter: { backgroundColor: 'rgba(124,77,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(124,77,255,0.44)' },
  avatarAttendee: { backgroundColor: Colors.greenSurface, borderWidth: 1.5, borderColor: `${Colors.greenLight}44` },
  userAvatarLetter: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  userName: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  userEmail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  userBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  roleBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1,
  },
  badgeAdmin: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` },
  badgePromoter: { backgroundColor: 'rgba(124,77,255,0.18)', borderColor: 'rgba(124,77,255,0.44)' },
  badgeAttendee: { backgroundColor: Colors.greenSurface, borderColor: `${Colors.greenLight}44` },
  roleBadgeText: { fontSize: 9, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },

  sectionLabel: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
  },
  sectionLabelText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },

  subSectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  subSectionDot: { width: 8, height: 8, borderRadius: 4 },
  subSectionText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#FF9800', textTransform: 'uppercase' as any, letterSpacing: 0.5 },

  deletionCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  deletionAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(239,83,80,0.15)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(239,83,80,0.3)', flexShrink: 0,
  },
  deletionAvatarLetter: { fontSize: Typography.md, fontWeight: Typography.black as any, color: '#EF5350' },
  deletionInfo: { flex: 1, gap: 3 },
  deletionName: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  deletionEmail: { fontSize: Typography.xs, color: Colors.textMuted },
  deletionReason: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 16 },
  deletionMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  deletionStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start',
  },
  deletionStatusDot: { width: 6, height: 6, borderRadius: 3 },
  deletionStatusText: { fontSize: 10, fontWeight: Typography.bold as any },
  deletionDate: { fontSize: 10, color: Colors.textMuted },
  deletionUserId: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 1 },

  deletionActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end', minWidth: 64 },
  deletionApproveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    backgroundColor: '#F44336', borderRadius: Radius.md,
  },
  deletionApproveBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#fff' },
  deletionRejectBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },

  resultIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: 'rgba(244,67,54,0.1)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)',
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.error, lineHeight: 17 },

  rejectTargetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm },
  rejectTargetName: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium as any },

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
  modalConfirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, minHeight: 48 },
  modalConfirmText: { color: '#fff', fontWeight: Typography.bold as any },
});
