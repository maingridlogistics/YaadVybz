/**
 * Admin Portal — User Detail Screen
 * Full administrative view of a platform user.
 * Shows profile data, roles, subscription, events, deletion requests.
 * Admin-only. Accessed from app/admin/users.tsx.
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatDate } from '../../../constants/data';

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  home_parish: string | null;
  roles: string[];
  subscription_tier: string | null;
  verified_promoter: boolean;
  require_event_approval: boolean;
  joined_at: string | null;
  updated_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  remaining_boosts: number;
  monthly_boost_allowance: number;
  avatar_url: string | null;
}

interface EventRow {
  id: string;
  title: string;
  status: string;
  date: string;
  parish: string;
  created_at: string;
}

interface SubRow {
  id: string;
  plan: string;
  status: string;
  payment_provider: string;
  billing_cycle: string;
  current_period_end: string | null;
  environment: string;
  created_at: string;
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionBar} />
      <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminUserDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerifRequest, setPendingVerifRequest] = useState<{ id: string } | null>(null);

  // Verify modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyAction, setVerifyAction] = useState<'verify' | 'unverify'>('verify');
  const [actionLoading, setActionLoading] = useState(false);

  // Grant subscription modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantPlan, setGrantPlan] = useState<'pro' | 'elite'>('pro');
  const [grantCycle, setGrantCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [grantLoading, setGrantLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, eventsRes, subsRes, verifRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, name, email, phone, home_parish, roles, subscription_tier, verified_promoter, require_event_approval, joined_at, updated_at, subscription_status, current_period_end, remaining_boosts, monthly_boost_allowance, avatar_url')
          .eq('id', userId)
          .single(),
        supabase
          .from('events')
          .select('id, title, status, date, parish, created_at')
          .eq('promoter_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('subscriptions')
          .select('id, plan, status, payment_provider, billing_cycle, current_period_end, environment, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('profile_verification_requests')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'pending')
          .maybeSingle(),
      ]);

      if (profileRes.error || !profileRes.data) {
        setError('User not found or access denied.');
      } else {
        setProfile(profileRes.data as UserProfile);
      }
      setEvents((eventsRes.data ?? []) as EventRow[]);
      setSubs((subsRes.data ?? []) as SubRow[]);
      setPendingVerifRequest((verifRes.data as any) ?? null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load user data.');
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleVerifyPromoter = useCallback(async () => {
    if (!userId) return;
    setActionLoading(true);
    try {
      const newVal = verifyAction === 'verify';
      // Must use SECURITY DEFINER RPC — table-level UPDATE is revoked from
      // authenticated role; column-level REVOKE blocks verified_promoter directly.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_set_verified_promoter', {
        p_user_id: userId,
        p_verified: newVal,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const result = rpcResult as { ok: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Failed to update verification status.');
      setProfile((prev) => prev ? { ...prev, verified_promoter: newVal } : prev);
      setShowVerifyModal(false);
      Alert.alert('Success', `Promoter ${newVal ? 'verified' : 'unverified'} successfully.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Action failed.');
    }
    setActionLoading(false);
  }, [userId, verifyAction]);

  const handleGrantSubscription = useCallback(async () => {
    if (!userId) return;
    setGrantLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session.');

      const { error: fnErr } = await supabase.functions.invoke('admin-grant-subscription', {
        body: { user_id: userId, plan: grantPlan, billing_cycle: grantCycle },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnErr) {
        let msg = fnErr.message ?? 'Failed to grant subscription';
        try {
          const ctx = (fnErr as any).context;
          if (ctx) {
            const text = typeof ctx.text === 'function' ? await ctx.text() : null;
            if (text) msg = `[${ctx.status}] ${text}`;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      await load();
      setShowGrantModal(false);
      Alert.alert('Subscription Granted', `${grantPlan === 'elite' ? 'Elite' : 'Pro'} subscription granted successfully.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to grant subscription.');
    }
    setGrantLoading(false);
  }, [userId, grantPlan, grantCycle, load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="error-outline" size={36} color={Colors.textMuted} />
        <Text style={styles.errorTitle}>User not found</Text>
        <Text style={styles.errorSub}>{error ?? 'Could not load user data.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isAdmin = profile.roles.includes('admin');
  const isPromoter = profile.roles.includes('promoter');
  const tierColor = profile.subscription_tier === 'elite' ? '#E91E63' : profile.subscription_tier === 'pro' ? Colors.gold : Colors.textMuted;
  const avatarLetter = (profile.name || profile.email || '?')[0].toUpperCase();
  const statusColors: Record<string, string> = {
    live: Colors.greenLight, pending: '#FF9800', flagged: '#FF5722', rejected: '#F44336',
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backIconBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle} numberOfLines={1}>{profile.name || 'User Detail'}</Text>
            <Text style={styles.topBarSub}>Admin View</Text>
          </View>
          {!isAdmin && (
            <Pressable
              onPress={() => {
                setVerifyAction(profile.verified_promoter ? 'unverify' : 'verify');
                setShowVerifyModal(true);
              }}
              style={({ pressed }) => [styles.verifyBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name={profile.verified_promoter ? 'verified' : 'verified-user'} size={14} color={Colors.gold} />
              <Text style={styles.verifyBtnText}>{profile.verified_promoter ? 'Unverify' : 'Verify'}</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* ── Profile Card ── */}
        <View style={styles.profileCard}>
          <View style={[
            styles.avatarCircle,
            isAdmin ? styles.avatarAdmin : isPromoter ? styles.avatarPromoter : styles.avatarAttendee,
          ]}>
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>{profile.name || '—'}</Text>
              {profile.verified_promoter && <MaterialIcons name="verified" size={16} color={Colors.gold} />}
            </View>
            <Text style={styles.email}>{profile.email || profile.phone || '—'}</Text>
            <View style={styles.badgesRow}>
              {profile.roles.map((role) => {
                const roleColors: Record<string, string> = { admin: Colors.gold, promoter: '#7C4DFF', attendee: Colors.greenLight };
                const rc = roleColors[role] ?? Colors.textMuted;
                return (
                  <View key={role} style={[styles.roleBadge, { backgroundColor: `${rc}18`, borderColor: `${rc}44` }]}>
                    <Text style={[styles.roleBadgeText, { color: rc }]}>{role}</Text>
                  </View>
                );
              })}
              {profile.subscription_tier && profile.subscription_tier !== 'free' && (
                <View style={[styles.roleBadge, { backgroundColor: `${tierColor}18`, borderColor: `${tierColor}44` }]}>
                  <Text style={[styles.roleBadgeText, { color: tierColor }]}>{profile.subscription_tier}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Admin account notice */}
        {isAdmin && (
          <View style={styles.adminNotice}>
            <MaterialIcons name="admin-panel-settings" size={16} color={Colors.gold} />
            <Text style={styles.adminNoticeText}>This is an administrator account. Administrative actions are restricted.</Text>
          </View>
        )}

        {/* ── Account Details ── */}
        <SectionHeader icon="person" title="Account Details" />
        <View style={styles.card}>
          <InfoRow label="User ID" value={profile.id} />
          <View style={styles.divider} />
          <InfoRow label="Email" value={profile.email ?? '—'} />
          <View style={styles.divider} />
          <InfoRow label="Phone" value={profile.phone ?? '—'} />
          <View style={styles.divider} />
          <InfoRow label="Home Parish" value={profile.home_parish ?? '—'} />
          <View style={styles.divider} />
          <InfoRow label="Joined" value={profile.joined_at ? formatDate(profile.joined_at.slice(0, 10)) : '—'} />
          <View style={styles.divider} />
          <InfoRow label="Last Updated" value={profile.updated_at ? new Date(profile.updated_at).toLocaleDateString('en-JM') : '—'} />
        </View>

        {/* ── Subscription ── */}
        <SectionHeader icon="workspace-premium" title="Subscription" />
        <View style={styles.card}>
          <InfoRow label="Tier" value={profile.subscription_tier ?? 'free'} />
          <View style={styles.divider} />
          <InfoRow label="Status" value={profile.subscription_status ?? '—'} />
          <View style={styles.divider} />
          <InfoRow label="Period End" value={profile.current_period_end ? new Date(profile.current_period_end).toLocaleDateString('en-JM') : '—'} />
          <View style={styles.divider} />
          <InfoRow label="Boost Credits" value={`${profile.remaining_boosts} / ${profile.monthly_boost_allowance}`} />
          {subs.length > 0 && (
            <>
              <View style={[styles.divider, { marginTop: Spacing.md }]} />
              <Text style={styles.subSectionLabel}>Subscription Records</Text>
              {subs.map((sub) => {
                const pc: Record<string, string> = { apple: Colors.textSecondary, stripe: '#635BFF', google: Colors.greenLight, admin: Colors.gold };
                const sc2: Record<string, string> = { active: Colors.greenLight, trialing: Colors.gold, past_due: '#FF9800', canceled: Colors.textMuted };
                return (
                  <View key={sub.id} style={styles.subRow}>
                    <View style={[styles.subDot, { backgroundColor: pc[sub.payment_provider] ?? Colors.textMuted }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subPlan}>{sub.plan} · {sub.billing_cycle}</Text>
                      <Text style={styles.subMeta}>{sub.payment_provider} · {sub.status}
                        {sub.environment === 'sandbox' ? ' (sandbox)' : ''}</Text>
                      {sub.current_period_end && (
                        <Text style={styles.subMeta}>Until {new Date(sub.current_period_end).toLocaleDateString('en-JM')}</Text>
                      )}
                    </View>
                    <View style={[styles.subStatusDot, { backgroundColor: sc2[sub.status] ?? Colors.textMuted }]} />
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Grant subscription — admin action */}
        {!isAdmin && (
          <Pressable
            onPress={() => setShowGrantModal(true)}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="card-giftcard" size={16} color={Colors.textOnGold} />
            <Text style={styles.actionBtnText}>Grant Subscription</Text>
          </Pressable>
        )}

        {pendingVerifRequest && !isAdmin && (
          <Pressable
            onPress={() => router.push('/admin/profile-verifications' as any)}
            style={({ pressed }) => [styles.verifAlert, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="verified-user" size={16} color="#FF9800" />
            <View style={{ flex: 1 }}>
              <Text style={styles.verifAlertTitle}>Pending Verification Request</Text>
              <Text style={styles.verifAlertSub}>This user has submitted a profile verification request awaiting review.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color="#FF9800" />
          </Pressable>
        )}

        {/* ── Events ── */}
        {isPromoter && (
          <>
            <SectionHeader icon="event" title={`Events (${events.length}${events.length === 20 ? '+' : ''})`} />
            {events.length === 0 ? (
              <Text style={styles.emptyText}>No events posted.</Text>
            ) : (
              <View style={styles.card}>
                {events.map((evt, idx) => {
                  const sc = statusColors[evt.status] ?? Colors.textMuted;
                  return (
                    <React.Fragment key={evt.id}>
                      {idx > 0 && <View style={styles.divider} />}
                      <Pressable
                        onPress={() => router.push(`/event/${evt.id}` as any)}
                        style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.8 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{evt.title}</Text>
                          <Text style={styles.eventMeta}>{evt.parish} · {formatDate(evt.date)}</Text>
                        </View>
                        <View style={[styles.eventStatusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
                          <Text style={[styles.eventStatusText, { color: sc }]}>{evt.status}</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── Internal ID (for support) ── */}
        <View style={styles.idRow}>
          <MaterialIcons name="fingerprint" size={12} color={Colors.textMuted} />
          <Text style={styles.idText} selectable>{userId}</Text>
        </View>
      </ScrollView>

      {/* ── Verify Modal ── */}
      <Modal visible={showVerifyModal} transparent animationType="fade" onRequestClose={() => setShowVerifyModal(false)}>
        <Pressable style={modal.overlay} onPress={() => setShowVerifyModal(false)}>
          <Pressable style={[modal.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
            <Text style={modal.title}>{verifyAction === 'verify' ? 'Verify Promoter' : 'Remove Verification'}</Text>
            <Text style={modal.message}>
              {verifyAction === 'verify'
                ? `Grant ${profile.name} the verified promoter badge? This will be visible on their public profile.`
                : `Remove the verified badge from ${profile.name}? This cannot be seen by other users after removal.`}
            </Text>
            <View style={modal.btnRow}>
              <Pressable onPress={() => setShowVerifyModal(false)} style={modal.cancelBtn}>
                <Text style={modal.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleVerifyPromoter}
                disabled={actionLoading}
                style={[modal.confirmBtn, { backgroundColor: verifyAction === 'verify' ? Colors.gold : '#FF9800' }, actionLoading && { opacity: 0.5 }]}
              >
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={modal.confirmText}>{verifyAction === 'verify' ? 'Verify' : 'Remove Badge'}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Grant Subscription Modal ── */}
      <Modal visible={showGrantModal} transparent animationType="slide" onRequestClose={() => setShowGrantModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={modal.overlay} onPress={() => setShowGrantModal(false)}>
            <Pressable style={[modal.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
              <View style={modal.handle} />
              <Text style={modal.title}>Grant Subscription</Text>
              <Text style={modal.message}>
                Grant a complimentary subscription to {profile.name}. This uses the existing admin-grant-subscription Edge Function.
              </Text>

              <Text style={modal.fieldLabel}>Plan</Text>
              <View style={modal.toggleRow}>
                {(['pro', 'elite'] as const).map((p) => (
                  <Pressable key={p} onPress={() => setGrantPlan(p)} style={[modal.toggleBtn, grantPlan === p && modal.toggleBtnActive]}>
                    <Text style={[modal.toggleText, grantPlan === p && { color: Colors.textOnGold }]}>
                      {p === 'elite' ? 'Elite' : 'Promoter Pro'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[modal.fieldLabel, { marginTop: Spacing.md }]}>Billing Cycle</Text>
              <View style={modal.toggleRow}>
                {(['monthly', 'yearly'] as const).map((c) => (
                  <Pressable key={c} onPress={() => setGrantCycle(c)} style={[modal.toggleBtn, grantCycle === c && modal.toggleBtnActive]}>
                    <Text style={[modal.toggleText, grantCycle === c && { color: Colors.textOnGold }]}>
                      {c === 'yearly' ? 'Yearly' : 'Monthly'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={modal.btnRow}>
                <Pressable onPress={() => setShowGrantModal(false)} style={modal.cancelBtn}>
                  <Text style={modal.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleGrantSubscription}
                  disabled={grantLoading}
                  style={[modal.confirmBtn, { backgroundColor: Colors.gold }, grantLoading && { opacity: 0.5 }]}
                >
                  {grantLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={modal.confirmText}>Grant</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  errorTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  errorSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  backBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  backBtnText: { color: Colors.gold, fontWeight: Typography.semibold as any },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  verifyBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },

  body: { padding: Spacing.base, gap: Spacing.md },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base,
  },
  avatarCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 2,
  },
  avatarAdmin: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}55` },
  avatarPromoter: { backgroundColor: 'rgba(124,77,255,0.18)', borderColor: 'rgba(124,77,255,0.44)' },
  avatarAttendee: { backgroundColor: Colors.greenSurface, borderColor: `${Colors.greenLight}44` },
  avatarLetter: { fontSize: Typography.xl, fontWeight: Typography.black as any, color: Colors.textPrimary },
  profileInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  displayName: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary },
  email: { fontSize: Typography.xs, color: Colors.textMuted },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  roleBadgeText: { fontSize: 10, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },

  adminNotice: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  adminNoticeText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: Spacing.sm, gap: Spacing.md },
  infoLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0, width: 100 },
  infoValue: { flex: 1, fontSize: 11, color: Colors.textPrimary, textAlign: 'right', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder },

  subSectionLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: Spacing.sm },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  subDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  subPlan: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  subMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  subStatusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, backgroundColor: Colors.gold, borderRadius: Radius.lg,
  },
  actionBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  eventStatusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  eventStatusText: { fontSize: 9, fontWeight: Typography.bold as any },

  verifAlert: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  verifAlertTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: '#FF9800' },
  verifAlertSub: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 1, lineHeight: 16 },

  emptyText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },

  idRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    justifyContent: 'center', paddingVertical: Spacing.sm,
  },
  idText: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace' },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  sheet: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 400,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs },
  title: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  message: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm },
  toggleBtn: {
    flex: 1, paddingVertical: Spacing.sm, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  toggleBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  toggleText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.semibold as any },
  btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  confirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, minHeight: 48 },
  confirmText: { fontSize: Typography.sm, color: '#fff', fontWeight: Typography.bold as any },
});
