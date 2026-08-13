// app/ticketing/cancel/[eventId].tsx — Phase 6
// Promoter event cancellation request flow.
// Events with ticket sales cannot be silently deleted — they must go through
// this controlled cancellation workflow requiring admin approval.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useCancellationRequest } from '../../../hooks/usePayouts';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';

const ACKNOWLEDGEMENTS = [
  'All eligible ticket orders will be refunded to customers.',
  'I am financially responsible for refund-related costs per Vybz Hub terms.',
  'This action cannot be undone without admin review.',
  'This action cannot be undone without admin review.',
];

export default function EventCancellationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();

  const { request, loading, submitting, error, load, submit, clearError } = useCancellationRequest(eventId ?? '');

  const [reason, setReason] = useState('');
  const [checkedAcks, setCheckedAcks] = useState<boolean[]>(ACKNOWLEDGEMENTS.map(() => false));
  const allAcksChecked = checkedAcks.every(Boolean);

  useEffect(() => { if (eventId) load(); }, [eventId, load]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!user) { router.replace('/auth' as any); return null; }

  const toggleAck = (idx: number) => {
    setCheckedAcks((prev) => prev.map((v, i) => i === idx ? !v : v));
  };

  const handleSubmit = async () => {
    if (!reason.trim() || !allAcksChecked) return;
    const result = await submit(reason.trim());
    if (result.ok) {
      setReason('');
      setCheckedAcks(ACKNOWLEDGEMENTS.map(() => false));
    }
  };

  const getStatusInfo = () => {
    if (!request) return null;
    const map: Record<string, { label: string; color: string; icon: string }> = {
      pending_admin:    { label: 'Pending Admin Review', color: '#FF9800', icon: 'hourglass-top' },
      approved_admin:   { label: 'Approved — Event Cancelled', color: Colors.error, icon: 'cancel' },
      rejected_admin:   { label: 'Rejected by Admin', color: Colors.textMuted, icon: 'do-not-disturb' },
    };
    return map[request.status] ?? { label: request.status, color: Colors.textMuted, icon: 'info' };
  };

  const statusInfo = getStatusInfo();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Request Event Cancellation</Text>
            <Text style={styles.headerSub}>This action requires admin approval</Text>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.gold} size="large" /></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + 120) }]}
          >
            {/* ── Existing Request Status ──────────────────────────── */}
            {request && statusInfo && (
              <View style={[styles.statusCard, { borderColor: `${statusInfo.color}44`, backgroundColor: `${statusInfo.color}10` }]}>
                <MaterialIcons name={statusInfo.icon as any} size={24} color={statusInfo.color} />
                <View style={{ flex: 1, gap: Spacing.xs }}>
                  <Text style={[styles.statusTitle, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                  <Text style={styles.statusReason}>{`"${request.reason}"`}</Text>
                  <Text style={styles.statusDate}>
                    Submitted {new Date(request.created_at).toLocaleDateString('en-JM', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </Text>
                  {request.rejection_reason && (
                    <View style={styles.rejectionNote}>
                      <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.rejectionText}>Admin note: {request.rejection_reason}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ── Warning ──────────────────────────────────────────── */}
            {!request && (
              <View style={styles.warningCard}>
                <MaterialIcons name="warning" size={20} color={Colors.error} />
                <View style={{ flex: 1, gap: Spacing.sm }}>
                  <Text style={styles.warningTitle}>This Is a Major Action</Text>
                  <Text style={styles.warningSub}>
                    Submitting a cancellation request will immediately pause ticket sales and notify Vybz Hub for review. Once approved by an admin:
                  </Text>
                  {[
                    'All valid tickets will be cancelled',
                    'All provider-paid (online/card) orders will be queued for refund',
                    'Your payout balance will be put on hold',
                    'Payout balance will be put on hold pending refund processing',
                  ].map((item, i) => (
                    <View key={i} style={styles.warningItem}>
                      <MaterialIcons name="fiber-manual-record" size={8} color={Colors.error} />
                      <Text style={styles.warningItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Cancellation Form ────────────────────────────────── */}
            {!request && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Reason for Cancellation</Text>
                  <TextInput
                    style={styles.reasonInput}
                    value={reason}
                    onChangeText={(v) => { setReason(v); clearError(); }}
                    placeholder="Explain why you need to cancel this event (required)"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    autoCapitalize="sentences"
                    accessibilityLabel="Cancellation reason"
                  />
                </View>

                {/* ── Acknowledgements ─────────────────────────────── */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>I Acknowledge and Agree</Text>
                  <View style={styles.card}>
                    {ACKNOWLEDGEMENTS.map((ack, idx) => (
                      <Pressable
                        key={idx}
                        onPress={() => toggleAck(idx)}
                        style={({ pressed }) => [
                          styles.ackRow,
                          idx > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <View style={[
                          styles.checkbox,
                          checkedAcks[idx] && { backgroundColor: Colors.gold, borderColor: Colors.gold },
                        ]}>
                          {checkedAcks[idx] && <MaterialIcons name="check" size={12} color={Colors.textOnGold} />}
                        </View>
                        <Text style={styles.ackText}>{ack}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {error ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* ── Submit CTA ─────────────────────────────────────────── */}
          {!request && (
            <View style={[styles.ctaContainer, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.base) }]}>
              <Pressable
                onPress={handleSubmit}
                disabled={!reason.trim() || !allAcksChecked || submitting}
                style={({ pressed }) => [
                  styles.ctaBtn,
                  (!reason.trim() || !allAcksChecked || submitting) && { opacity: 0.4 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <LinearGradient colors={['#C62828', '#F44336']} style={styles.ctaBtnInner}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="cancel" size={20} color="#fff" />
                      <Text style={styles.ctaBtnText}>Submit Cancellation Request</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
              {(!allAcksChecked || !reason.trim()) && (
                <Text style={styles.ctaHint}>Complete all acknowledgements and provide a reason to continue</Text>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },
  emptyTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },

  scroll: { padding: Spacing.base, gap: Spacing.xl },

  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1 },
  statusTitle: { fontSize: Typography.base, fontWeight: Typography.bold },
  statusReason: { fontSize: Typography.sm, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 20 },
  statusDate: { fontSize: Typography.xs, color: Colors.textMuted },
  rejectionNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginTop: Spacing.xs },
  rejectionText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: 'rgba(244,67,54,0.06)', borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: 'rgba(244,67,54,0.2)' },
  warningTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.error, marginBottom: Spacing.xs },
  warningSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  warningItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  warningItemText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },

  section: { gap: Spacing.md },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },

  reasonInput: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, fontSize: Typography.base, color: Colors.textPrimary, minHeight: 120 },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  ackText: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 20 },

  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  ctaContainer: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.sm },
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  ctaBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#fff' },
  ctaHint: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
});
