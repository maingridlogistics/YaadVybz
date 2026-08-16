/**
 * Vybz Hub — Profile Verification Screen
 *
 * Allows Pro/Elite users to request Profile Verification.
 * Verification is NOT automatic on subscription — it requires admin approval.
 *
 * States: not_requested → pending → approved | rejected → (resubmit) → pending
 *
 * Writes:
 *   - INSERT to profile_verification_requests (new request)
 *   - resubmit_profile_verification() RPC (retry after rejection)
 *
 * Read-only: verified_promoter on user_profiles (set only by admin RPC)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

interface VerificationRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export default function ProfileVerificationScreen() {
  const { user, verifiedPromoter, refreshProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');

  const tier = user?.subscriptionTier ?? 'free';
  const isEligible = tier === 'pro' || tier === 'elite';

  const loadRequest = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('profile_verification_requests')
      .select('id, status, notes, rejection_reason, created_at, reviewed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRequest(data as VerificationRequest | null);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadRequest(); }, [loadRequest]);

  const handleSubmit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('profile_verification_requests')
        .insert({ user_id: user.id, notes: notes.trim(), status: 'pending' });
      if (error) throw new Error(error.message);
      await loadRequest();
      Alert.alert(
        'Request Submitted',
        'Your Profile Verification request is now pending review by the Vybz Hub team.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('resubmit_profile_verification', {
        p_notes: notes.trim(),
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Failed to resubmit request.');
      setNotes('');
      await loadRequest();
      Alert.alert(
        'Resubmitted',
        'Your updated verification request has been submitted for review.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to resubmit.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-JM', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

  // ── Verified state ──────────────────────────────────────────────────────────
  if (!loading && verifiedPromoter) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <TopBar onBack={() => router.back()} />
        </SafeAreaView>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.statusCard}>
            <LinearGradient
              colors={[`${Colors.gold}18`, `${Colors.gold}06`]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={s.statusIconWrap}>
              <MaterialIcons name="verified" size={48} color={Colors.gold} />
            </View>
            <Text style={s.statusTitle}>Verified Profile</Text>
            <Text style={s.statusDesc}>
              Your profile has been verified by the Vybz Hub team. The verified badge is
              displayed on your public promoter profile and event listings.
            </Text>
            <View style={s.verifiedBadgeRow}>
              <MaterialIcons name="verified" size={16} color={Colors.gold} />
              <Text style={s.verifiedBadgeText}>Verified Promoter</Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
            <Text style={s.infoText}>
              Your verified status is tied to your identity, not your subscription. It
              persists even if you change plans.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Not eligible (free tier) ────────────────────────────────────────────────
  if (!loading && !isEligible) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <TopBar onBack={() => router.back()} />
        </SafeAreaView>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.statusCard}>
            <View style={s.statusIconWrap}>
              <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
            </View>
            <Text style={s.statusTitle}>Profile Verification Included</Text>
            <Text style={s.statusDesc}>
              Profile Verification is included with Pro and Elite subscriptions. Upgrade
              to unlock the ability to request a Verified Profile badge.
            </Text>
            <Pressable
              onPress={() => router.push('/monetization/upgrade' as any)}
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                <MaterialIcons name="workspace-premium" size={16} color={Colors.textOnGold} />
                <Text style={s.ctaBtnText}>Upgrade to Pro</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <TopBar onBack={() => router.back()} />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={Colors.gold} size="large" />
          </View>
        ) : request === null ? (
          // ── NOT REQUESTED ───────────────────────────────────────────────────
          <>
            <View style={s.headerSection}>
              <View style={s.headerIcon}>
                <MaterialIcons name="verified-user" size={32} color={Colors.gold} />
              </View>
              <Text style={s.headerTitle}>Verify Your Profile</Text>
              <Text style={s.headerDesc}>
                As a {tier === 'elite' ? 'Elite' : 'Pro'} member, you can request a Verified Profile
                badge. Our team reviews requests and approves profiles that meet our
                verification standards.
              </Text>
            </View>

            <View style={s.benefitsCard}>
              <Text style={s.benefitsTitle}>What Verification Means</Text>
              {[
                ['verified', 'Verified badge on your public promoter profile'],
                ['visibility', 'Increased trust with event attendees'],
                ['check-circle', 'Badge appears on your event listings'],
                ['lock', 'Persists even if you change subscription plans'],
              ].map(([icon, text]) => (
                <View key={text} style={s.benefitRow}>
                  <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
                  <Text style={s.benefitText}>{text}</Text>
                </View>
              ))}
            </View>

            <View style={s.noteCard}>
              <MaterialIcons name="info-outline" size={14} color="#FF9800" />
              <Text style={s.noteText}>
                Subscribing to Pro or Elite does not automatically verify your profile.
                Verification requires a separate review by the Vybz Hub team.
              </Text>
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Optional Notes</Text>
              <Text style={s.fieldHint}>
                Any information you want to share with our review team (social links,
                business name, years of experience, etc.)
              </Text>
              <TextInput
                style={s.textarea}
                placeholder="e.g. I promote events under @VybzKing on Instagram, been active since 2019..."
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel="Verification notes"
                maxLength={500}
              />
              <Text style={s.charCount}>{notes.length}/500</Text>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [s.ctaBtn, submitting && { opacity: 0.5 }, pressed && !submitting && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                  : <MaterialIcons name="send" size={16} color={Colors.textOnGold} />
                }
                <Text style={s.ctaBtnText}>
                  {submitting ? 'Submitting...' : 'Submit Verification Request'}
                </Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : request.status === 'pending' ? (
          // ── PENDING ─────────────────────────────────────────────────────────
          <>
            <View style={[s.statusCard, { borderColor: `${Colors.gold}44` }]}>
              <LinearGradient
                colors={[`${Colors.gold}12`, `${Colors.gold}04`]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={s.statusIconWrap}>
                <MaterialIcons name="hourglass-empty" size={40} color={Colors.gold} />
              </View>
              <Text style={s.statusTitle}>Verification Pending</Text>
              <Text style={s.statusDesc}>
                Your verification request is being reviewed by the Vybz Hub team. You
                will receive a notification once a decision has been made.
              </Text>
              <Text style={s.statusDate}>
                Submitted {formatDate(request.created_at)}
              </Text>
            </View>
            {request.notes ? (
              <View style={s.notesDisplay}>
                <Text style={s.notesDisplayLabel}>Your Notes</Text>
                <Text style={s.notesDisplayText}>{request.notes}</Text>
              </View>
            ) : null}
            <View style={s.infoCard}>
              <MaterialIcons name="schedule" size={14} color={Colors.textMuted} />
              <Text style={s.infoText}>
                Review typically takes 1–3 business days. Do not submit duplicate requests.
              </Text>
            </View>
          </>
        ) : request.status === 'approved' ? (
          // ── APPROVED (verified_promoter not yet refreshed) ───────────────────
          <>
            <View style={[s.statusCard, { borderColor: `${Colors.greenLight}44` }]}>
              <LinearGradient
                colors={[`${Colors.greenLight}12`, `${Colors.greenLight}04`]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[s.statusIconWrap, { backgroundColor: `${Colors.greenLight}18` }]}>
                <MaterialIcons name="check-circle" size={40} color={Colors.greenLight} />
              </View>
              <Text style={[s.statusTitle, { color: Colors.greenLight }]}>Verification Approved</Text>
              <Text style={s.statusDesc}>
                Your profile has been verified. The Verified badge is now visible on your
                public profile and event listings.
              </Text>
              {request.reviewed_at ? (
                <Text style={s.statusDate}>Approved {formatDate(request.reviewed_at)}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={async () => { await refreshProfile(); router.back(); }}
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                <MaterialIcons name="verified" size={16} color={Colors.textOnGold} />
                <Text style={s.ctaBtnText}>View Verified Profile</Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          // ── REJECTED ────────────────────────────────────────────────────────
          <>
            <View style={[s.statusCard, { borderColor: 'rgba(255,152,0,0.4)' }]}>
              <LinearGradient
                colors={['rgba(255,152,0,0.08)', 'rgba(255,152,0,0.02)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[s.statusIconWrap, { backgroundColor: 'rgba(255,152,0,0.15)' }]}>
                <MaterialIcons name="info" size={40} color="#FF9800" />
              </View>
              <Text style={[s.statusTitle, { color: '#FF9800' }]}>Verification Needs Attention</Text>
              {request.rejection_reason ? (
                <View style={s.rejectionNote}>
                  <Text style={s.rejectionNoteText}>{request.rejection_reason}</Text>
                </View>
              ) : (
                <Text style={s.statusDesc}>
                  Your verification request was not approved at this time. You may update
                  your request and resubmit.
                </Text>
              )}
              {request.reviewed_at ? (
                <Text style={s.statusDate}>Reviewed {formatDate(request.reviewed_at)}</Text>
              ) : null}
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Update Your Notes</Text>
              <Text style={s.fieldHint}>
                Add additional context before resubmitting. Be as specific as possible.
              </Text>
              <TextInput
                style={s.textarea}
                placeholder="Update your information here..."
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel="Updated verification notes"
                maxLength={500}
              />
              <Text style={s.charCount}>{notes.length}/500</Text>
            </View>

            <Pressable
              onPress={handleResubmit}
              disabled={submitting}
              style={({ pressed }) => [s.ctaBtn, submitting && { opacity: 0.5 }, pressed && !submitting && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                  : <MaterialIcons name="refresh" size={16} color={Colors.textOnGold} />
                }
                <Text style={s.ctaBtnText}>
                  {submitting ? 'Resubmitting...' : 'Resubmit Request'}
                </Text>
              </LinearGradient>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.topBar}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
        hitSlop={8}
      >
        <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <Text style={s.topBarTitle}>Profile Verification</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  content: { padding: Spacing.base, gap: Spacing.base },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  headerSection: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  headerIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  headerTitle: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  headerDesc: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  benefitsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.sm,
  },
  benefitsTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: 2 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitText: { fontSize: Typography.sm, color: Colors.textSecondary, flex: 1 },

  noteCard: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.25)',
  },
  noteText: { flex: 1, fontSize: Typography.xs, color: '#FFB74D', lineHeight: 18 },

  field: { gap: Spacing.xs },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  fieldHint: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  textarea: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, minHeight: 110,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  charCount: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'right' },

  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  ctaBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Status card
  statusCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.md,
    marginTop: Spacing.md,
  },
  statusIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  statusTitle: { fontSize: 20, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  statusDesc: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  statusDate: { fontSize: Typography.xs, color: Colors.textMuted },

  verifiedBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  verifiedBadgeText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },

  notesDisplay: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.xs,
  },
  notesDisplayLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  notesDisplayText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  rejectionNote: {
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.25)',
    alignSelf: 'stretch',
  },
  rejectionNoteText: { fontSize: Typography.sm, color: '#FFB74D', lineHeight: 20, textAlign: 'center' },

  infoCard: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },
});
