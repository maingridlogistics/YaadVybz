/**
 * Admin — Profile Verification Queue
 *
 * Shows all profile verification requests for admin review.
 * Displays private evidence (ID document + selfie) via signed URLs (10-min expiry).
 * Approve/reject via admin_review_profile_verification() SECURITY DEFINER RPC.
 *
 * Evidence is stored in the private 'profile-verification' bucket.
 * Signed URLs are generated server-side via supabase.storage.createSignedUrl().
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface VerificationRequest {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string;
  legal_name: string | null;
  id_type: string | null;
  id_document_path: string | null;
  selfie_path: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_name: string | null;
  user_email: string | null;
  user_subscription_tier: string | null;
  user_verified_promoter: boolean;
}

interface SignedEvidence {
  idUrl: string | null;
  selfieUrl: string | null;
  loading: boolean;
}

const ID_TYPE_LABELS: Record<string, string> = {
  passport: 'Passport',
  drivers_license: "Driver's License",
  other_govt_id: 'Other Govt-Issued ID',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  approved: Colors.greenLight,
  rejected: '#F44336',
};

const REJECTION_PRESETS = [
  'The ID image is unclear or unreadable — please resubmit with a clearer photo.',
  'The selfie could not be compared with the submitted ID — please provide a clearer selfie.',
  'The name on the ID does not match the legal name provided.',
  'The submitted document type is not a supported government-issued photo ID.',
  'The submitted document appears to be expired.',
  'Additional verification information is required before we can approve this request.',
];

export default function AdminProfileVerificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  // Review modal
  const [reviewTarget, setReviewTarget] = useState<VerificationRequest | null>(null);
  const [evidence, setEvidence] = useState<SignedEvidence>({ idUrl: null, selfieUrl: null, loading: false });
  const [rejectReason, setRejectReason] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from('profile_verification_requests')
      .select(`
        id, user_id, status, notes, legal_name, id_type,
        id_document_path, selfie_path, rejection_reason, created_at, reviewed_at,
        user_profiles!inner(name, email, subscription_tier, verified_promoter)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter === 'pending') query.eq('status', 'pending');

    const { data, error } = await query;
    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      status: row.status,
      notes: row.notes,
      legal_name: row.legal_name,
      id_type: row.id_type,
      id_document_path: row.id_document_path,
      selfie_path: row.selfie_path,
      rejection_reason: row.rejection_reason,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      user_name: row.user_profiles?.name ?? null,
      user_email: row.user_profiles?.email ?? null,
      user_subscription_tier: row.user_profiles?.subscription_tier ?? null,
      user_verified_promoter: row.user_profiles?.verified_promoter ?? false,
    }));
    setRequests(mapped);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Generate signed URLs for evidence (10 minute expiry)
  const loadEvidence = useCallback(async (req: VerificationRequest) => {
    if (!req.id_document_path && !req.selfie_path) {
      setEvidence({ idUrl: null, selfieUrl: null, loading: false });
      return;
    }
    setEvidence({ idUrl: null, selfieUrl: null, loading: true });
    try {
      const [idResult, selfieResult] = await Promise.all([
        req.id_document_path
          ? supabase.storage.from('profile-verification').createSignedUrl(req.id_document_path, 600)
          : Promise.resolve({ data: null, error: null }),
        req.selfie_path
          ? supabase.storage.from('profile-verification').createSignedUrl(req.selfie_path, 600)
          : Promise.resolve({ data: null, error: null }),
      ]);
      setEvidence({
        idUrl: idResult.data?.signedUrl ?? null,
        selfieUrl: selfieResult.data?.signedUrl ?? null,
        loading: false,
      });
    } catch {
      setEvidence({ idUrl: null, selfieUrl: null, loading: false });
    }
  }, []);

  const openReview = useCallback((req: VerificationRequest) => {
    setReviewTarget(req);
    setRejectReason('');
    setShowPresets(false);
    loadEvidence(req);
  }, [loadEvidence]);

  const handleReview = useCallback(async (action: 'approve' | 'reject') => {
    if (!reviewTarget || actionLoading) return;
    if (action === 'reject' && !rejectReason.trim()) {
      Alert.alert('Rejection Reason Required', 'Please provide a reason that will be shown to the user.');
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_review_profile_verification', {
        p_request_id: reviewTarget.id,
        p_action: action,
        p_rejection_reason: action === 'reject' ? rejectReason.trim() : null,
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Review action failed.');
      setReviewTarget(null);
      setRejectReason('');
      await load();
      Alert.alert(
        action === 'approve' ? 'Request Approved' : 'Request Rejected',
        action === 'approve'
          ? `${reviewTarget.user_name ?? 'User'} has been granted the Verified Profile badge.`
          : `${reviewTarget.user_name ?? 'User'}'s request has been marked as needing attention.`,
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  }, [reviewTarget, rejectReason, actionLoading, load]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.topBarTitle}>Profile Verifications</Text>
            <Text style={s.topBarSub}>
              {loading ? '…' : `${requests.length} ${filter === 'pending' ? 'pending' : 'total'}`}
            </Text>
          </View>
          <Pressable
            onPress={() => setFilter((f) => (f === 'pending' ? 'all' : 'pending'))}
            style={({ pressed }) => [s.filterBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="filter-list" size={16} color={Colors.gold} />
            <Text style={s.filterBtnText}>{filter === 'pending' ? 'Pending' : 'All'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={Colors.gold} size="large" />
          </View>
        ) : requests.length === 0 ? (
          <View style={s.emptyWrap}>
            <MaterialIcons name="verified-user" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>
              {filter === 'pending' ? 'No Pending Requests' : 'No Requests'}
            </Text>
            <Text style={s.emptySub}>
              {filter === 'pending'
                ? 'All verification requests have been reviewed.'
                : 'No profile verification requests have been submitted yet.'}
            </Text>
          </View>
        ) : (
          requests.map((req) => {
            const sc = STATUS_COLORS[req.status] ?? Colors.textMuted;
            const tierColor = req.user_subscription_tier === 'elite' ? '#E91E63' : Colors.gold;
            return (
              <Pressable
                key={req.id}
                onPress={() => { if (req.status === 'pending') openReview(req); }}
                style={({ pressed }) => [s.card, pressed && req.status === 'pending' && { opacity: 0.85 }]}
              >
                <View style={s.cardHeader}>
                  <View style={[s.avatarCircle, { backgroundColor: `${tierColor}18`, borderColor: `${tierColor}33` }]}>
                    <Text style={[s.avatarLetter, { color: tierColor }]}>
                      {(req.user_name ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.userName} numberOfLines={1}>{req.user_name ?? '—'}</Text>
                      {req.user_verified_promoter && (
                        <MaterialIcons name="verified" size={14} color={Colors.gold} />
                      )}
                    </View>
                    <Text style={s.userEmail} numberOfLines={1}>{req.user_email ?? '—'}</Text>
                  </View>
                  <View style={[s.statusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
                    <Text style={[s.statusText, { color: sc }]}>{req.status}</Text>
                  </View>
                </View>

                {/* Submission details */}
                {req.legal_name ? (
                  <View style={s.detailsRow}>
                    <View style={s.detailItem}>
                      <MaterialIcons name="person" size={12} color={Colors.textMuted} />
                      <Text style={s.detailText}>{req.legal_name}</Text>
                    </View>
                    {req.id_type ? (
                      <View style={s.detailItem}>
                        <MaterialIcons name="badge" size={12} color={Colors.textMuted} />
                        <Text style={s.detailText}>{ID_TYPE_LABELS[req.id_type] ?? req.id_type}</Text>
                      </View>
                    ) : null}
                    <View style={s.detailItem}>
                      <MaterialIcons
                        name={req.id_document_path ? 'check-circle' : 'cancel'}
                        size={12}
                        color={req.id_document_path ? Colors.greenLight : '#EF5350'}
                      />
                      <Text style={s.detailText}>ID doc</Text>
                    </View>
                    <View style={s.detailItem}>
                      <MaterialIcons
                        name={req.selfie_path ? 'check-circle' : 'cancel'}
                        size={12}
                        color={req.selfie_path ? Colors.greenLight : '#EF5350'}
                      />
                      <Text style={s.detailText}>Selfie</Text>
                    </View>
                  </View>
                ) : null}

                <View style={s.cardMeta}>
                  <MaterialIcons name="workspace-premium" size={12} color={tierColor} />
                  <Text style={[s.metaText, { color: tierColor }]}>
                    {req.user_subscription_tier ?? 'free'}
                  </Text>
                  <Text style={s.metaDot}>·</Text>
                  <MaterialIcons name="schedule" size={12} color={Colors.textMuted} />
                  <Text style={s.metaText}>{formatDate(req.created_at)}</Text>
                  {req.reviewed_at ? (
                    <>
                      <Text style={s.metaDot}>·</Text>
                      <Text style={s.metaText}>Reviewed {formatDate(req.reviewed_at)}</Text>
                    </>
                  ) : null}
                </View>

                {req.notes ? (
                  <Text style={s.notes} numberOfLines={2}>{req.notes}</Text>
                ) : null}

                {req.rejection_reason ? (
                  <View style={s.rejectionNote}>
                    <MaterialIcons name="info-outline" size={12} color="#F44336" />
                    <Text style={s.rejectionText} numberOfLines={2}>{req.rejection_reason}</Text>
                  </View>
                ) : null}

                {req.status === 'pending' && (
                  <View style={s.reviewCta}>
                    <MaterialIcons name="rate-review" size={14} color={Colors.gold} />
                    <Text style={s.reviewCtaText}>Tap to Review Evidence</Text>
                    <MaterialIcons name="chevron-right" size={16} color={Colors.gold} />
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ── Review Modal ── */}
      <Modal
        visible={reviewTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!actionLoading) setReviewTarget(null); }}
      >
        <View style={m.overlay}>
          <Pressable
            style={m.backdrop}
            onPress={() => { if (!actionLoading) setReviewTarget(null); }}
          />
          <View style={[m.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={m.handle} />
            <Text style={m.title}>Review Verification</Text>

            {reviewTarget && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={m.scrollContent}>
                {/* User info */}
                <View style={m.userRow}>
                  <View style={m.userAvatar}>
                    <Text style={m.userAvatarLetter}>
                      {(reviewTarget.user_name ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.userName}>{reviewTarget.user_name ?? '—'}</Text>
                    <Text style={m.userEmail}>{reviewTarget.user_email ?? '—'}</Text>
                    <Text style={m.userTier}>{reviewTarget.user_subscription_tier ?? 'free'} plan</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setReviewTarget(null);
                      router.push(`/admin/user/${reviewTarget.user_id}` as any);
                    }}
                    hitSlop={8}
                  >
                    <MaterialIcons name="open-in-new" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>

                {/* Submitted details */}
                <View style={m.detailsBox}>
                  <Text style={m.detailsTitle}>Submitted Details</Text>
                  <View style={m.detailRow}>
                    <Text style={m.detailLabel}>Legal Name</Text>
                    <Text style={m.detailValue}>{reviewTarget.legal_name ?? '—'}</Text>
                  </View>
                  <View style={m.detailRow}>
                    <Text style={m.detailLabel}>ID Type</Text>
                    <Text style={m.detailValue}>
                      {reviewTarget.id_type ? ID_TYPE_LABELS[reviewTarget.id_type] ?? reviewTarget.id_type : '—'}
                    </Text>
                  </View>
                  <View style={m.detailRow}>
                    <Text style={m.detailLabel}>Submitted</Text>
                    <Text style={m.detailValue}>{formatDate(reviewTarget.created_at)}</Text>
                  </View>
                </View>

                {/* Notes */}
                {reviewTarget.notes ? (
                  <View style={m.notesBox}>
                    <Text style={m.notesLabel}>User Notes</Text>
                    <Text style={m.notesText}>{reviewTarget.notes}</Text>
                  </View>
                ) : (
                  <Text style={m.noNotes}>No additional notes provided</Text>
                )}

                {/* Evidence */}
                <Text style={m.evidenceTitle}>Verification Evidence</Text>
                {evidence.loading ? (
                  <View style={m.evidenceLoading}>
                    <ActivityIndicator color={Colors.gold} />
                    <Text style={m.evidenceLoadingText}>Loading private evidence…</Text>
                  </View>
                ) : (
                  <View style={m.evidenceRow}>
                    <View style={m.evidenceItem}>
                      <Text style={m.evidenceLabel}>Government ID</Text>
                      {evidence.idUrl ? (
                        <Image
                          source={{ uri: evidence.idUrl }}
                          style={m.evidenceImage}
                          contentFit="contain"
                          transition={200}
                        />
                      ) : (
                        <View style={m.evidencePlaceholder}>
                          <MaterialIcons name={reviewTarget.id_document_path ? 'error-outline' : 'cancel'} size={24} color={Colors.textMuted} />
                          <Text style={m.evidencePlaceholderText}>
                            {reviewTarget.id_document_path ? 'Could not load' : 'Not uploaded'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={m.evidenceItem}>
                      <Text style={m.evidenceLabel}>Selfie</Text>
                      {evidence.selfieUrl ? (
                        <Image
                          source={{ uri: evidence.selfieUrl }}
                          style={m.evidenceImage}
                          contentFit="contain"
                          transition={200}
                        />
                      ) : (
                        <View style={m.evidencePlaceholder}>
                          <MaterialIcons name={reviewTarget.selfie_path ? 'error-outline' : 'cancel'} size={24} color={Colors.textMuted} />
                          <Text style={m.evidencePlaceholderText}>
                            {reviewTarget.selfie_path ? 'Could not load' : 'Not uploaded'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Rejection reason */}
                <View style={m.field}>
                  <View style={m.fieldLabelRow}>
                    <Text style={m.fieldLabel}>Rejection Reason (required if rejecting)</Text>
                    <Pressable
                      onPress={() => setShowPresets((p) => !p)}
                      style={m.presetsToggle}
                      hitSlop={8}
                    >
                      <Text style={m.presetsToggleText}>Presets</Text>
                      <MaterialIcons name={showPresets ? 'expand-less' : 'expand-more'} size={14} color={Colors.gold} />
                    </Pressable>
                  </View>
                  {showPresets && (
                    <View style={m.presetsBox}>
                      {REJECTION_PRESETS.map((preset) => (
                        <Pressable
                          key={preset}
                          onPress={() => { setRejectReason(preset); setShowPresets(false); }}
                          style={({ pressed }) => [m.presetItem, pressed && { opacity: 0.7 }]}
                        >
                          <MaterialIcons name="check-circle-outline" size={14} color={Colors.gold} />
                          <Text style={m.presetText}>{preset}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <TextInput
                    style={m.input}
                    placeholder="Reason shown to the user (neutral, no internal notes)…"
                    placeholderTextColor={Colors.textMuted}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Action buttons */}
                <View style={m.btnRow}>
                  <Pressable
                    onPress={() => handleReview('reject')}
                    disabled={actionLoading}
                    style={({ pressed }) => [m.rejectBtn, actionLoading && { opacity: 0.5 }, pressed && !actionLoading && { opacity: 0.8 }]}
                  >
                    {actionLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={m.rejectBtnText}>Needs Attention</Text>}
                  </Pressable>
                  <Pressable
                    onPress={() => handleReview('approve')}
                    disabled={actionLoading}
                    style={({ pressed }) => [m.approveBtn, actionLoading && { opacity: 0.5 }, pressed && !actionLoading && { opacity: 0.85 }]}
                  >
                    {actionLoading
                      ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                      : (
                        <>
                          <MaterialIcons name="verified" size={16} color={Colors.textOnGold} />
                          <Text style={m.approveBtnText}>Approve & Verify</Text>
                        </>
                      )}
                  </Pressable>
                </View>

                <View style={m.privacyNote}>
                  <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                  <Text style={m.privacyNoteText}>
                    Evidence links expire in 10 minutes. Documents are deleted ~30 days after a final decision.
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
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
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  filterBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },

  body: { padding: Spacing.base, gap: Spacing.md },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  avatarLetter: { fontSize: Typography.md, fontWeight: Typography.black as any },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  userEmail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  statusChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, flexShrink: 0,
  },
  statusText: { fontSize: 10, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },

  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: Typography.xs, color: Colors.textMuted },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: Typography.xs, color: Colors.textMuted },
  metaDot: { fontSize: Typography.xs, color: Colors.textMuted },

  notes: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  rejectionNote: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: 'rgba(244,67,54,0.08)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)',
  },
  rejectionText: { flex: 1, fontSize: Typography.xs, color: '#EF5350', lineHeight: 17 },

  reviewCta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingTop: Spacing.xs, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  reviewCtaText: { flex: 1, fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
    maxHeight: '92%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.sm,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.md },

  scrollContent: { gap: Spacing.md, paddingBottom: Spacing.md },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  userAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  userAvatarLetter: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.gold },
  userName: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  userEmail: { fontSize: Typography.xs, color: Colors.textMuted },
  userTier: { fontSize: Typography.xs, color: Colors.gold, marginTop: 2 },

  detailsBox: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    paddingHorizontal: Spacing.md,
  },
  detailsTitle: {
    fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  detailLabel: { fontSize: Typography.xs, color: Colors.textMuted, flexShrink: 0 },
  detailValue: { fontSize: Typography.xs, color: Colors.textPrimary, textAlign: 'right', flex: 1, fontWeight: Typography.medium as any },

  notesBox: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: 4,
  },
  notesLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  notesText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  noNotes: { fontSize: Typography.sm, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center' },

  evidenceTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  evidenceLoading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.xl },
  evidenceLoadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  evidenceRow: { flexDirection: 'row', gap: Spacing.md },
  evidenceItem: { flex: 1, gap: Spacing.xs },
  evidenceLabel: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  evidenceImage: {
    height: 180, borderRadius: Radius.lg, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  evidencePlaceholder: {
    height: 180, borderRadius: Radius.lg, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.surfaceBorder, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
  },
  evidencePlaceholderText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  field: { gap: Spacing.xs },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  presetsToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  presetsToggleText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.medium as any },
  presetsBox: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  presetItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  presetText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, minHeight: 80,
    fontSize: Typography.sm, color: Colors.textPrimary,
  },

  btnRow: { flexDirection: 'row', gap: Spacing.md },
  rejectBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EF5350', borderRadius: Radius.md, minHeight: 48,
  },
  rejectBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: '#fff' },
  approveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
    backgroundColor: Colors.gold, borderRadius: Radius.md, minHeight: 48,
  },
  approveBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  privacyNote: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  privacyNoteText: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});
