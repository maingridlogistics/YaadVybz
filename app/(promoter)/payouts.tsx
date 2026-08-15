/**
 * Promoter Payouts Screen
 *
 * Direct destination for Profile → Payouts.
 *
 * Shows:
 *   1. Balance hero (cross-event, by currency) — get_promoter_payout_balance RPC
 *   2. Request Payout CTA (opens event picker to choose which event to pay out)
 *   3. Payout History — promoter_payouts table
 *   4. Payout Accounts — promoter_payout_accounts table
 *
 * All financial calculations are server-side only.
 * No client-side math.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { usePayoutBalance, usePayoutAccounts, usePayoutHistory } from '../../hooks/usePayouts';
import { formatMinorAmount } from '../../services/customerTicketingService';
import { formatPayoutStatus, addPayoutAccount } from '../../services/payoutService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

// ─── Currency picker ──────────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'JMD'] as const;
type Currency = typeof CURRENCIES[number];

// ─── Section header ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={ss.sectionTitle}>{children}</Text>
  );
}

// ─── Payout history row ───────────────────────────────────────────────────────
function PayoutHistoryRow({
  payout,
  hasBorder,
}: {
  payout: any;
  hasBorder: boolean;
}) {
  const { label, color } = formatPayoutStatus(payout.status);
  return (
    <View style={[ss.historyRow, hasBorder && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={ss.historyAmount}>
          {formatMinorAmount(payout.amount_minor, payout.currency)}
        </Text>
        <Text style={ss.historyDate}>
          Requested {new Date(payout.initiated_at).toLocaleDateString('en-JM', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </Text>
        {payout.completed_at ? (
          <Text style={ss.historyDate}>
            Paid {new Date(payout.completed_at).toLocaleDateString('en-JM', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </Text>
        ) : null}
        {payout.failure_reason ? (
          <Text style={[ss.historyDate, { color: Colors.error }]}>{payout.failure_reason}</Text>
        ) : null}
      </View>
      <View style={[ss.statusChip, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
        <Text style={[ss.statusChipText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Account row ──────────────────────────────────────────────────────────────
function AccountRow({ account, hasBorder }: { account: any; hasBorder: boolean }) {
  const verified = account.status === 'verified';
  return (
    <View style={[ss.accountRow, hasBorder && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder }]}>
      <View style={[ss.accountIcon, { backgroundColor: verified ? 'rgba(76,175,80,0.12)' : Colors.surfaceElevated }]}>
        <MaterialIcons name="account-balance" size={18} color={verified ? Colors.greenLight : Colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ss.accountName}>{account.display_name}</Text>
        <Text style={ss.accountMeta}>{account.currency} · {account.payout_method.replace(/_/g, ' ')}</Text>
      </View>
      <View style={[ss.accountBadge, { backgroundColor: verified ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)' }]}>
        <Text style={[ss.accountBadgeText, { color: verified ? Colors.greenLight : '#FF9800' }]}>
          {verified ? 'Verified' : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PromoterPayoutsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [currency, setCurrency] = useState<Currency>('USD');
  const [refreshing, setRefreshing] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountName, setAddAccountName] = useState('');
  const [addAccountCurrency, setAddAccountCurrency] = useState<Currency>('USD');
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);

  const { balance, load: loadBalance } = usePayoutBalance(user?.id ?? '', currency);
  const { accounts, load: loadAccounts } = usePayoutAccounts(user?.id ?? '');
  const { payouts, load: loadPayouts } = usePayoutHistory(user?.id ?? '');

  const loadAll = useCallback(async () => {
    await Promise.all([loadBalance(), loadAccounts(), loadPayouts()]);
  }, [loadBalance, loadAccounts, loadPayouts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // Re-load balance when currency changes
  useEffect(() => { loadBalance(); }, [currency, loadBalance]);

  if (!user) return null;

  const eligibleMinor = balance?.eligible_minor ?? 0;
  const hasHold = balance?.has_financial_hold ?? false;
  const canRequest = eligibleMinor > 0 && !hasHold;

  const handleRequestPayout = () => {
    // Routes to event picker with finance action — user picks which event to pay out
    router.push('/promoter-event-picker?action=finance' as any);
  };

  const handleAddAccount = async () => {
    if (!addAccountName.trim()) {
      setAddAccountError('Please enter an account name.');
      return;
    }
    setAddAccountLoading(true);
    setAddAccountError(null);
    const { error } = await addPayoutAccount({
      promoterId: user.id,
      currency: addAccountCurrency,
      payoutMethod: addAccountCurrency === 'JMD' ? 'bank_transfer_jmd' : 'bank_transfer_usd',
      displayName: addAccountName.trim(),
      bankCountry: 'JM',
    });
    setAddAccountLoading(false);
    if (error) { setAddAccountError(error); return; }
    setShowAddAccount(false);
    setAddAccountName('');
    await loadAccounts();
    Alert.alert('Account Added', 'Your payout account is pending verification by Vybz Hub admin.');
  };

  const recentPayouts = payouts.slice(0, 10);

  return (
    <View style={ss.container}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={ss.header}>
          <Pressable
            onPress={() => navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)/profile' as any)}
            style={({ pressed }) => [ss.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={[ss.headerIconWrap]}>
            <MaterialIcons name="savings" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ss.headerTitle}>Payouts</Text>
            <Text style={ss.headerSub}>Balance, history and payout accounts</Text>
          </View>
          {/* Currency selector */}
          <Pressable
            onPress={() => setShowCurrencyPicker(true)}
            style={({ pressed }) => [ss.currencyBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={ss.currencyBtnText}>{currency}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={16} color={Colors.gold} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />
        }
        contentContainerStyle={[
          ss.scrollContent,
          { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
        ]}
      >
        {/* ── Balance hero ─────────────────────────────────────────────── */}
        <View style={ss.balanceCard}>
          <Text style={ss.balanceHeading}>AVAILABLE BALANCE</Text>

          <Text style={[ss.balanceAmount, { color: hasHold ? '#FF9800' : Colors.greenLight }]}>
            {formatMinorAmount(eligibleMinor, currency)}
          </Text>

          <View style={ss.balanceMetaRow}>
            <Text style={ss.balanceCurrency}>{currency}</Text>
            <View style={ss.balanceDot} />
            <Text style={[ss.balanceStatus, { color: hasHold ? '#FF9800' : Colors.greenLight }]}>
              {hasHold ? 'Hold active' : 'Eligible for payout'}
            </Text>
          </View>

          {/* Hold warning */}
          {hasHold && (
            <View style={ss.holdBanner}>
              <MaterialIcons name="warning" size={13} color={Colors.error} />
              <Text style={ss.holdText}>Financial hold is active. Contact support to resolve.</Text>
            </View>
          )}

          {/* Balance breakdown */}
          {balance && (
            <View style={ss.balanceBreakdown}>
              {(balance.gross_platform_minor ?? 0) > 0 && (
                <View style={ss.breakdownRow}>
                  <Text style={ss.breakdownLabel}>Gross Ticket Sales</Text>
                  <Text style={ss.breakdownValue}>{formatMinorAmount(balance.gross_platform_minor!, currency)}</Text>
                </View>
              )}
              {(balance.total_refunded_minor ?? 0) > 0 && (
                <View style={ss.breakdownRow}>
                  <Text style={ss.breakdownLabel}>Refunds Issued</Text>
                  <Text style={[ss.breakdownValue, { color: Colors.error }]}>
                    -{formatMinorAmount(balance.total_refunded_minor!, currency)}
                  </Text>
                </View>
              )}
              {(balance.total_paid_out_minor ?? 0) > 0 && (
                <View style={ss.breakdownRow}>
                  <Text style={ss.breakdownLabel}>Already Paid Out</Text>
                  <Text style={[ss.breakdownValue, { color: Colors.textMuted }]}>
                    -{formatMinorAmount(balance.total_paid_out_minor!, currency)}
                  </Text>
                </View>
              )}
              {(balance.in_flight_minor ?? 0) > 0 && (
                <View style={ss.breakdownRow}>
                  <Text style={ss.breakdownLabel}>Payout in Progress</Text>
                  <Text style={[ss.breakdownValue, { color: '#FF9800' }]}>
                    -{formatMinorAmount(balance.in_flight_minor!, currency)}
                  </Text>
                </View>
              )}
              {(balance.post_event_hold_minor ?? 0) > 0 && (
                <View style={ss.breakdownRow}>
                  <Text style={ss.breakdownLabel}>Post-Event Hold</Text>
                  <Text style={[ss.breakdownValue, { color: '#FF9800' }]}>
                    {formatMinorAmount(balance.post_event_hold_minor!, currency)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Request Payout CTA */}
          <Pressable
            onPress={handleRequestPayout}
            disabled={!canRequest}
            style={({ pressed }) => [
              ss.payoutCta,
              !canRequest && { opacity: 0.4 },
              pressed && canRequest && { opacity: 0.88 },
            ]}
          >
            <LinearGradient
              colors={canRequest ? [Colors.gold, Colors.goldDim] : ['#333', '#333']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={ss.payoutCtaInner}
            >
              <MaterialIcons name="account-balance-wallet" size={18} color={canRequest ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[ss.payoutCtaText, !canRequest && { color: Colors.textMuted }]}>
                {canRequest ? 'Request Payout' : 'No Eligible Balance'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text style={ss.balanceNote}>
            Processed in {currency}. Payouts are settled within 2–5 business days.
          </Text>
        </View>

        {/* ── Payout History ────────────────────────────────────────────── */}
        <View style={ss.section}>
          <SectionTitle>Payout History</SectionTitle>
          {recentPayouts.length === 0 ? (
            <View style={ss.emptyCard}>
              <MaterialIcons name="history" size={28} color={Colors.textMuted} />
              <Text style={ss.emptyText}>No payout history yet.</Text>
              <Text style={ss.emptySub}>Completed payouts will appear here.</Text>
            </View>
          ) : (
            <View style={ss.card}>
              {recentPayouts.map((p, i) => (
                <PayoutHistoryRow key={p.id} payout={p} hasBorder={i > 0} />
              ))}
            </View>
          )}
        </View>

        {/* ── Payout Accounts ───────────────────────────────────────────── */}
        <View style={ss.section}>
          <View style={ss.sectionHeaderRow}>
            <SectionTitle>Payout Accounts</SectionTitle>
            <Pressable
              onPress={() => setShowAddAccount(true)}
              style={({ pressed }) => [ss.addBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="add" size={14} color={Colors.gold} />
              <Text style={ss.addBtnText}>Add Account</Text>
            </Pressable>
          </View>

          {accounts.length === 0 ? (
            <View style={ss.emptyCard}>
              <MaterialIcons name="account-balance" size={28} color={Colors.textMuted} />
              <Text style={ss.emptyText}>No payout accounts configured.</Text>
              <Text style={ss.emptySub}>
                Add a bank account so Vybz Hub can process your payouts.{'\n'}
                Accounts must be verified by admin before payouts can be sent.
              </Text>
              <Pressable
                onPress={() => setShowAddAccount(true)}
                style={({ pressed }) => [ss.emptyAddBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={ss.emptyAddBtnInner}>
                  <MaterialIcons name="add" size={16} color={Colors.textOnGold} />
                  <Text style={ss.emptyAddBtnText}>Add Payout Account</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <View style={ss.card}>
              {accounts.map((a, i) => (
                <AccountRow key={a.id} account={a} hasBorder={i > 0} />
              ))}
            </View>
          )}

          {accounts.some((a) => a.status === 'pending_verification') && (
            <View style={ss.infoRow}>
              <MaterialIcons name="info-outline" size={13} color={Colors.info} />
              <Text style={ss.infoText}>
                Pending accounts must be verified by Vybz Hub admin before payouts can be processed.
              </Text>
            </View>
          )}
        </View>

        {/* Per-event finance shortcut */}
        <View style={ss.section}>
          <SectionTitle>Per-Event Finance</SectionTitle>
          <Pressable
            onPress={() => router.push('/promoter-event-picker?action=finance' as any)}
            style={({ pressed }) => [ss.card, ss.linkCard, pressed && { opacity: 0.8 }]}
          >
            <View style={ss.linkCardIcon}>
              <MaterialIcons name="bar-chart" size={22} color={Colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ss.linkCardTitle}>Event Finance Detail</Text>
              <Text style={ss.linkCardSub}>Revenue breakdown, refunds, disputes and payout request per event</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Currency picker modal ─────────────────────────────────────── */}
      <Modal visible={showCurrencyPicker} transparent animationType="fade" onRequestClose={() => setShowCurrencyPicker(false)}>
        <Pressable style={ss.modalOverlay} onPress={() => setShowCurrencyPicker(false)}>
          <View style={[ss.modalSheet, { marginBottom: insets.bottom + 24 }]}>
            <Text style={ss.modalTitle}>Select Currency</Text>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => { setCurrency(c); setShowCurrencyPicker(false); }}
                style={({ pressed }) => [
                  ss.currencyOption,
                  c === currency && ss.currencyOptionActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[ss.currencyOptionText, c === currency && { color: Colors.gold }]}>{c}</Text>
                {c === currency && <MaterialIcons name="check" size={16} color={Colors.gold} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Add account modal ─────────────────────────────────────────── */}
      <Modal visible={showAddAccount} transparent animationType="slide" onRequestClose={() => setShowAddAccount(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={ss.addModalOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowAddAccount(false)} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
              showsVerticalScrollIndicator={false}
            >
          <View style={[ss.addModalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={ss.modalHandle} />
            <Text style={ss.addModalTitle}>Add Payout Account</Text>
            <Text style={ss.addModalSub}>
              Account details will be verified by Vybz Hub admin before payouts can be processed.
            </Text>

            <Text style={ss.fieldLabel}>Account Name / Bank Reference</Text>
            <TextInput
              style={ss.input}
              value={addAccountName}
              onChangeText={setAddAccountName}
              placeholder="e.g. NCB Jamaica – Business Account"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Account display name"
            />

            <Text style={ss.fieldLabel}>Currency</Text>
            <View style={ss.currencyRow}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setAddAccountCurrency(c)}
                  style={({ pressed }) => [
                    ss.currencyChip,
                    addAccountCurrency === c && ss.currencyChipActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[ss.currencyChipText, addAccountCurrency === c && { color: Colors.textOnGold }]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            {addAccountError ? (
              <View style={ss.errorRow}>
                <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                <Text style={ss.errorText}>{addAccountError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleAddAccount}
              disabled={addAccountLoading || !addAccountName.trim()}
              style={({ pressed }) => [
                ss.addModalBtn,
                (addAccountLoading || !addAccountName.trim()) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={ss.addModalBtnInner}>
                {addAccountLoading
                  ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                  : <Text style={ss.addModalBtnText}>Add Account</Text>}
              </LinearGradient>
            </Pressable>
          </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  currencyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  currencyBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },

  scrollContent: { padding: Spacing.base, gap: Spacing.xl },

  // Balance card
  balanceCard: {
    backgroundColor: '#0D1A12', borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: `${Colors.gold}30`,
    padding: Spacing.base, gap: Spacing.md,
  },
  balanceHeading: {
    fontSize: 11, fontWeight: Typography.bold, color: Colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  balanceAmount: { fontSize: 40, fontWeight: Typography.black, letterSpacing: -1 },
  balanceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  balanceCurrency: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted },
  balanceDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted },
  balanceStatus: { fontSize: Typography.sm, fontWeight: Typography.semibold },

  holdBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(244,67,54,0.08)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)',
  },
  holdText: { flex: 1, fontSize: Typography.xs, color: Colors.error, lineHeight: 17 },

  balanceBreakdown: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.md,
    padding: Spacing.md, gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  breakdownValue: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textPrimary },

  payoutCta: { borderRadius: Radius.lg, overflow: 'hidden' },
  payoutCtaInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  payoutCtaText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  balanceNote: {
    fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.sm,
  },

  // Section
  section: { gap: Spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: 11, fontWeight: Typography.bold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },

  // Card
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },

  // History
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  historyAmount: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  historyDate: { fontSize: Typography.xs, color: Colors.textMuted },
  statusChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusChipText: { fontSize: 10, fontWeight: Typography.bold },

  // Account
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  accountIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  accountName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  accountMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  accountBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  accountBadgeText: { fontSize: 10, fontWeight: Typography.bold },

  // Link card
  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  linkCardIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  linkCardTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  linkCardSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

  // Add button
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  addBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  // Empty
  emptyCard: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  emptyAddBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs, alignSelf: 'stretch' },
  emptyAddBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  emptyAddBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Info
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(33,150,243,0.06)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.18)',
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.info, lineHeight: 17 },

  // Currency picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end', alignItems: 'center',
  },
  modalSheet: {
    width: '100%', backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  modalTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  currencyOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.base, borderRadius: Radius.md, paddingHorizontal: Spacing.sm,
  },
  currencyOptionActive: { backgroundColor: Colors.goldSurface },
  currencyOptionText: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },

  // Add account modal
  addModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  addModalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs,
  },
  addModalTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  addModalSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  currencyRow: { flexDirection: 'row', gap: Spacing.md },
  currencyChip: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  currencyChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  currencyChipText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textMuted },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  addModalBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs },
  addModalBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  addModalBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
