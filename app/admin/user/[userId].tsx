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
  subscription_status: string | null;
  current_period_end: string | null;
  remaining_boosts: number;
  monthly_boost_allowance: number;
  verified_promoter: boolean;
  require_event_approval: boolean;
  joined_at: string | null;
  updated_at: string | null;
  avatar_url: string | null;
  lifetime_pro_owned: boolean;
  admin_pro_granted: boolean;
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
  const [actionLoading, setActionLoading] = useState(false);

  // Verify modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyAction, setVerifyAction] = useState<'verify' | 'unverify'>('verify');

  // Admin Pro grant modal
  const [showProGrantModal, setShowProGrantModal] = useState(false);
  const [proGrantAction, setProGrantAction] = useState<'grant' | 'revoke'>('grant');
  const [proGrantLoading, setProGrantLoading] = useState(false);

  // Lifetime Pro grant modal
  const [showProModal, setShowProModal] = useState(false);
  const [proAction, setProAction] = useState<'grant' | 'revoke'>('grant');
  const [proLoading, setProLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, eventsRes, subsRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, name, email, phone, home_parish, roles, subscription_tier, subscription_status, current_period_end, remaining_boosts, monthly_boost_allowance, verified_promoter, require_event_approval, joined_at, updated_at, avatar_url, lifetime_pro_owned, admin_pro_granted')
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
      ]);

      if (profileRes.error || !profileRes.data) {
        setError('User not found or access denied.');
      } else {
        setProfile(profileRes.data as UserProfile);
      }
      setEvents((eventsRes.data ?? []) as EventRow[]);
      setSubs((subsRes.data ?? []) as SubRow[]);
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

  // ── Grant / Revoke Admin Pro ────────────────────────────────────────────────
  const handleProGrantAction = useCallback(async () => {
    if (!userId) return;
    setProGrantLoading(true);
    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_grant_pro', {
        p_user_id: userId,
        p_grant: proGrantAction === 'grant',
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const result = rpcResult as { ok: boolean; effective_tier?: string; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Failed to update Admin Pro status.');
      await load();
      setShowProGrantModal(false);
      Alert.alert(
        'Success',
        proGrantAction === 'grant'
          ? `Pro access granted. Effective tier: ${result.effective_tier ?? 'pro'}.`
          : `Admin Pro revoked. Effective tier: ${result.effective_tier ?? 'free'}.`,
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Action failed.');
    }
    setProGrantLoading(false);
  }, [userId, proGrantAction, load]);

  // ── Grant / Revoke Lifetime Pro ───────────────────────────────────────────
  const handleProAction = useCallback(async () => {
    if (!userId) return;
    setProLoading(true);
    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_grant_lifetime_pro', {
        p_user_id: userId,
        p_grant: proAction === 'grant',
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const result = rpcResult as { ok: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Failed to update Pro status.');
      await load();
      setShowProModal(false);
      Alert.alert('Success', proAction === 'grant' ? 'Lifetime Pro granted.' : 'Lifetime Pro revoked.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Action failed.');
    }
    setProLoading(false);
  }, [userId, proAction, load]);

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
              {profile.admin_pro_granted && (
                <View style={[styles.roleBadge, { backgroundColor: 'rgba(124,77,255,0.12)', borderColor: 'rgba(124,77,255,0.35)' }]}>
                  <Text style={[styles.roleBadgeText, { color: '#7C4DFF' }]}>ADMIN PRO</Text>
                </View>
              )}
              {profile.lifetime_pro_owned && (
                <View style={[styles.roleBadge, { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` }]}>
                  <Text style={[styles.roleBadgeText, { color: Colors.gold }]}>LIFETIME PRO</Text>
                </View>
              )}
            </View>
          </View>
        </View>

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

        {/* ── Entitlements ── */}
        <SectionHeader icon="workspace-premium" title="Entitlements" />
        <View style={styles.card}>
          <InfoRow label="Effective Tier" value={profile.subscription_tier ?? 'free'} />
          <View style={styles.divider} />
          <InfoRow label="Lifetime Pro" value={profile.lifetime_pro_owned ? 'Yes — purchased ($49.99)' : 'No'} />
          <View style={styles.divider} />
          <InfoRow label="Admin Pro" value={profile.admin_pro_granted ? 'Yes — admin granted' : 'No'} />
          <View style={styles.divider} />
          <InfoRow label="Boost Credits" value={`${profile.remaining_boosts} / ${profile.monthly_boost_allowance}`} />
          {subs.length > 0 && (
            <>
              <View style={[styles.divider, { marginTop: Spacing.md }]} />
              <Text style={styles.subSectionLabel}>Legacy Subscription Records</Text>
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

        {/* Admin actions */}
        {!isAdmin && (
          <View style={styles.actionRow}>
            {/* Grant/Revoke Admin Pro */}
            <Pressable
              onPress={() => {
                setProGrantAction(profile.admin_pro_granted ? 'revoke' : 'grant');
                setShowProGrantModal(true);
              }}
              style={({ pressed }) => [
                styles.actionBtnHalf,
                { backgroundColor: profile.admin_pro_granted ? 'rgba(124,77,255,0.12)' : 'rgba(124,77,255,0.85)' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialIcons name="verified" size={15} color={profile.admin_pro_granted ? '#7C4DFF' : '#fff'} />
              <Text style={[styles.actionBtnHalfText, { color: profile.admin_pro_granted ? '#7C4DFF' : '#fff' }]}>
                {profile.admin_pro_granted ? 'Revoke Admin Pro' : 'Grant Admin Pro'}
              </Text>
            </Pressable>

            {/* Grant/Revoke Lifetime Pro */}
            <Pressable
              onPress={() => {
                setProAction(profile.lifetime_pro_owned ? 'revoke' : 'grant');
                setShowProModal(true);
              }}
              style={({ pressed }) => [
                styles.actionBtnHalf,
                { backgroundColor: profile.lifetime_pro_owned ? Colors.goldSurface : Colors.gold },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialIcons name="workspace-premium" size={15} color={profile.lifetime_pro_owned ? Colors.gold : Colors.textOnGold} />
              <Text style={[styles.actionBtnHalfText, { color: profile.lifetime_pro_owned ? Colors.gold : Colors.textOnGold }]}>
                {profile.lifetime_pro_owned ? 'Revoke Purchased Pro' : 'Grant Lifetime Pro'}
              </Text>
            </Pressable>
          </View>
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
                ? `Grant ${profile.name} the verified promoter badge?`
                : `Remove the verified badge from ${profile.name}?`}
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

      {/* ── Admin Pro Grant Modal ── */}
      <Modal visible={showProGrantModal} transparent animationType="fade" onRequestClose={() => setShowProGrantModal(false)}>
        <Pressable style={modal.overlay} onPress={() => setShowProGrantModal(false)}>
          <Pressable style={[modal.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
            <Text style={modal.title}>{proGrantAction === 'grant' ? 'Grant Admin Pro Access' : 'Revoke Admin Pro Access'}</Text>
            <Text style={modal.message}>
              {proGrantAction === 'grant'
                ? `Grant ${profile.name} Pro access for free? This is admin-assigned and does NOT simulate a purchase. If they later purchase Lifetime Pro, both sources coexist independently.`
                : `Revoke admin-granted Pro from ${profile.name}? If they own Lifetime Pro (purchased), their tier stays Pro.`}
            </Text>
            <View style={modal.btnRow}>
              <Pressable onPress={() => setShowProGrantModal(false)} style={modal.cancelBtn}>
                <Text style={modal.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleProGrantAction}
                disabled={proGrantLoading}
                style={[modal.confirmBtn, { backgroundColor: proGrantAction === 'grant' ? '#7C4DFF' : '#FF9800' }, proGrantLoading && { opacity: 0.5 }]}
              >
                {proGrantLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={modal.confirmText}>{proGrantAction === 'grant' ? 'Grant Admin Pro' : 'Revoke Admin Pro'}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Lifetime Pro Modal ── */}
      <Modal visible={showProModal} transparent animationType="fade" onRequestClose={() => setShowProModal(false)}>
        <Pressable style={modal.overlay} onPress={() => setShowProModal(false)}>
          <Pressable style={[modal.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
            <Text style={modal.title}>{proAction === 'grant' ? 'Grant Lifetime Pro' : 'Revoke Lifetime Pro'}</Text>
            <Text style={modal.message}>
              {proAction === 'grant'
                ? `Grant ${profile.name} lifetime Pro access? This sets lifetime_pro_owned = true without requiring an Apple purchase.`
                : `Revoke lifetime Pro from ${profile.name}? Their tier returns to free unless admin-granted Pro is still active.`}
            </Text>
            <View style={modal.btnRow}>
              <Pressable onPress={() => setShowProModal(false)} style={modal.cancelBtn}>
                <Text style={modal.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleProAction}
                disabled={proLoading}
                style={[modal.confirmBtn, { backgroundColor: proAction === 'grant' ? Colors.gold : '#FF9800' }, proLoading && { opacity: 0.5 }]}
              >
                {proLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={modal.confirmText}>{proAction === 'grant' ? 'Grant Pro' : 'Revoke Pro'}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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

  actionRow: { flexDirection: 'row', gap: Spacing.md },
  actionBtnHalf: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'transparent',
  },
  actionBtnHalfText: { fontSize: Typography.sm, fontWeight: Typography.bold as any },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  eventTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  eventStatusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  eventStatusText: { fontSize: 9, fontWeight: Typography.bold as any },

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
