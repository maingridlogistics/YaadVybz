/**
 * Admin Portal — Payouts
 * Process and manage promoter payout requests.
 * Admin-only. Accessed from Profile → Money → Payouts.
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
import { formatMinorAmount } from '../../services/customerTicketingService';
import { formatPayoutStatus } from '../../services/payoutService';
import { useAdminPayouts } from '../../hooks/usePayouts';

export default function AdminPayoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const adminPayouts = useAdminPayouts();

  const safeBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any);

  const [payoutActionTarget, setPayoutActionTarget] = useState<any>(null);
  const [payoutActionType, setPayoutActionType] = useState<'processing' | 'paid' | 'failed' | null>(null);
  const [payoutProviderRef, setPayoutProviderRef] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');

  useEffect(() => { adminPayouts.load(); }, []);

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

  const pendingPayouts = adminPayouts.payouts.filter((p) => ['requested', 'processing'].includes(p.status));
  const historyPayouts = adminPayouts.payouts.filter((p) => !['requested', 'processing'].includes(p.status)).slice(0, 30);
  const pendingCount = adminPayouts.payouts.filter((p) => p.status === 'requested').length;

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={safeBack} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="account-balance-wallet" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Payouts</Text>
            <Text style={s.headerSub}>
              {pendingCount > 0 ? `${pendingCount} pending payout${pendingCount !== 1 ? 's' : ''}` : 'Promoter payout management'}
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Info */}
        <View style={s.infoBanner}>
          <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
          <Text style={s.infoBannerText}>Manual payout workflow: Start Processing → transfer externally → Mark as Paid with reference.</Text>
        </View>

        {adminPayouts.loading && (
          <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.xl }} />
        )}

        {/* Pending / Active */}
        {pendingPayouts.length > 0 && (
          <>
            <View style={s.sectionLabel}>
              <View style={[s.sectionDot, { backgroundColor: '#FF9800' }]} />
              <Text style={s.sectionLabelText}>PENDING ({pendingPayouts.length})</Text>
            </View>
            {pendingPayouts.map((payout) => (
              <View key={payout.id} style={s.payoutRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.payoutAmount}>{formatMinorAmount(payout.amount_minor, payout.currency)}</Text>
                  <Text style={s.payoutMeta}>{payout.currency} · {new Date(payout.initiated_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  {payout.provider_payout_ref ? <Text style={s.payoutRef}>Ref: {payout.provider_payout_ref}</Text> : null}
                  {payout.notes ? <Text style={s.payoutNotes} numberOfLines={1}>{payout.notes}</Text> : null}
                  <View style={[s.payoutStatusPill, { backgroundColor: payout.status === 'processing' ? 'rgba(156,39,176,0.15)' : 'rgba(255,152,0,0.15)' }]}>
                    <Text style={[s.payoutStatusText, { color: payout.status === 'processing' ? '#CE93D8' : '#FF9800' }]}>
                      {payout.status === 'processing' ? 'Processing' : 'Requested'}
                    </Text>
                  </View>
                </View>
                <View style={s.payoutActions}>
                  {payout.status === 'requested' && (
                    <Pressable
                      onPress={() => { setPayoutActionTarget(payout); setPayoutActionType('processing'); setPayoutProviderRef(''); setPayoutNotes(''); }}
                      style={[s.actionBtn, { backgroundColor: '#9C27B0' }]}
                    >
                      <Text style={s.actionBtnText}>Start</Text>
                    </Pressable>
                  )}
                  {payout.status === 'processing' && (
                    <Pressable
                      onPress={() => { setPayoutActionTarget(payout); setPayoutActionType('paid'); setPayoutProviderRef(''); setPayoutNotes(''); }}
                      style={[s.actionBtn, { backgroundColor: Colors.greenLight }]}
                    >
                      <Text style={s.actionBtnText}>Mark Paid</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => { setPayoutActionTarget(payout); setPayoutActionType('failed'); setPayoutProviderRef(''); setPayoutNotes(''); }}
                    style={[s.actionBtn, { backgroundColor: Colors.error }]}
                  >
                    <Text style={s.actionBtnText}>Fail</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* History */}
        {historyPayouts.length > 0 && (
          <>
            <View style={[s.sectionLabel, { marginTop: pendingPayouts.length > 0 ? Spacing.base : 0 }]}>
              <View style={[s.sectionDot, { backgroundColor: Colors.textMuted }]} />
              <Text style={[s.sectionLabelText, { color: Colors.textMuted }]}>HISTORY</Text>
            </View>
            {historyPayouts.map((payout) => {
              const { color, label } = formatPayoutStatus(payout.status);
              return (
                <View key={payout.id} style={[s.payoutRow, { opacity: 0.7 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.payoutAmount}>{formatMinorAmount(payout.amount_minor, payout.currency)}</Text>
                    <Text style={s.payoutMeta}>{new Date(payout.initiated_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    {payout.provider_payout_ref ? <Text style={s.payoutRef}>{payout.provider_payout_ref}</Text> : null}
                  </View>
                  <View style={[s.payoutStatusPill, { backgroundColor: `${color}18` }]}>
                    <Text style={[s.payoutStatusText, { color }]}>{label}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {adminPayouts.payouts.length === 0 && !adminPayouts.loading && (
          <View style={s.emptyState}>
            <MaterialIcons name="account-balance-wallet" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No payout requests</Text>
            <Text style={s.emptySub}>Promoter payout requests will appear here.</Text>
          </View>
        )}
      </ScrollView>

      {/* Payout action modal */}
      <Modal
        visible={payoutActionTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPayoutActionTarget(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.modalOverlay} onPress={() => setPayoutActionTarget(null)}>
            <Pressable
              style={[s.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>
                {payoutActionType === 'processing' ? 'Start Processing' : payoutActionType === 'paid' ? 'Mark as Paid' : 'Mark as Failed'}
              </Text>
              <Text style={s.modalFieldLabel}>
                Amount: {payoutActionTarget ? formatMinorAmount(payoutActionTarget.amount_minor, payoutActionTarget.currency) : ''}
              </Text>
              {payoutActionType === 'paid' && (
                <>
                  <Text style={[s.modalFieldLabel, { marginTop: Spacing.md }]}>Payment Reference *</Text>
                  <TextInput
                    style={s.modalInput}
                    value={payoutProviderRef}
                    onChangeText={setPayoutProviderRef}
                    placeholder="Bank transfer ref, wire ID..."
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    accessibilityLabel="Payment reference"
                  />
                </>
              )}
              <Text style={[s.modalFieldLabel, { marginTop: Spacing.md }]}>Notes (optional)</Text>
              <TextInput
                style={s.modalInput}
                value={payoutNotes}
                onChangeText={setPayoutNotes}
                placeholder="Internal notes..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                accessibilityLabel="Notes"
              />
              <View style={s.modalBtnRow}>
                <Pressable onPress={() => setPayoutActionTarget(null)} style={s.modalCancelBtn}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    if (!payoutActionTarget || !payoutActionType) return;
                    if (payoutActionType === 'paid' && !payoutProviderRef.trim()) {
                      Alert.alert('Reference Required', 'Enter the payment reference before marking as paid.');
                      return;
                    }
                    const result = await adminPayouts.updateStatus({
                      payoutId: payoutActionTarget.id,
                      newStatus: payoutActionType,
                      providerRef: payoutProviderRef.trim() || undefined,
                      notes: payoutNotes.trim() || undefined,
                    });
                    if (!result.ok) Alert.alert('Error', result.error ?? 'Action failed.');
                    setPayoutActionTarget(null);
                  }}
                  style={[
                    s.modalConfirmBtn,
                    {
                      backgroundColor: payoutActionType === 'paid'
                        ? Colors.greenLight
                        : payoutActionType === 'processing'
                        ? '#9C27B0'
                        : Colors.error,
                    },
                  ]}
                >
                  <Text style={s.modalConfirmText}>
                    {payoutActionType === 'processing' ? 'Confirm' : payoutActionType === 'paid' ? 'Mark Paid' : 'Mark Failed'}
                  </Text>
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
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
  },
  infoBannerText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabelText: { fontSize: 11, fontWeight: Typography.bold as any, color: '#FF9800', textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  payoutAmount: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  payoutMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  payoutRef: { fontSize: 10, color: Colors.textMuted },
  payoutNotes: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
  payoutActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end' },
  actionBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  actionBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#fff' },
  payoutStatusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  payoutStatusText: { fontSize: 10, fontWeight: Typography.bold as any },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
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
    fontSize: Typography.base, minHeight: 50,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalCancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  modalConfirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.md },
  modalConfirmText: { color: '#fff', fontWeight: Typography.bold as any },
});
