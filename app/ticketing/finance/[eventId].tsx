// app/ticketing/finance/[eventId].tsx — Phase 6
// Promoter finance dashboard: payout balance, payout request, refunds, liabilities.
// TICKETING_ENABLED guard applied. Promoter and admin only.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { usePromoterFinance, usePayoutBalance, usePayoutAccounts, usePayoutHistory, usePayoutRequest } from '../../../hooks/usePayouts';
import { formatMinorAmount } from '../../../services/doorSalesService';
import { formatPayoutStatus, formatCancellationStatus, addPayoutAccount } from '../../../services/payoutService';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';

// ─── Finance Row ──────────────────────────────────────────────────────────────

function FinanceRow({ label, value, color, sub, icon }: {
  label: string; value: string; color?: string; sub?: string; icon?: string;
}) {
  return (
    <View style={styles.financeRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.financeRowLabel}>{label}</Text>
        {sub ? <Text style={styles.financeRowSub}>{sub}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        {icon ? <MaterialIcons name={icon as any} size={14} color={color ?? Colors.textMuted} /> : null}
        <Text style={[styles.financeRowValue, color ? { color } : {}]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Payout Eligibility Card ──────────────────────────────────────────────────

function PayoutEligibilityCard({
  eligibleAt,
  payoutStatus,
}: {
  eligibleAt: string | null;
  payoutStatus: string | null;
}) {
  const now = new Date();
  const eligible = eligibleAt ? new Date(eligibleAt) : null;
  const isEligible = eligible ? eligible <= now : false;
  const isPendingEvent = payoutStatus === 'pending_event';
  const isPostHold = payoutStatus === 'post_event_hold';
  const isReady = payoutStatus === 'eligible';

  const daysRemaining = eligible && !isEligible
    ? Math.ceil((eligible.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const getConfig = (): {
    icon: 'check-circle' | 'hourglass-top' | 'event' | 'schedule';
    color: string;
    bg: string;
    border: string;
    title: string;
    description: string;
  } => {
    if (isReady) {
      return {
        icon: 'check-circle',
        color: Colors.greenLight,
        bg: 'rgba(0,168,70,0.08)',
        border: 'rgba(0,168,70,0.3)',
        title: 'Eligible for Payout',
        description: 'Your balance is available. Request a payout using the button above.',
      };
    }
    if (isPostHold && eligible) {
      return {
        icon: 'hourglass-top',
        color: '#FF9800',
        bg: 'rgba(255,152,0,0.08)',
        border: 'rgba(255,152,0,0.3)',
        title: `Hold Ends ${eligible.toLocaleDateString('en-JM', { month: 'short', day: 'numeric' })}`,
        description: `${daysRemaining} business day${daysRemaining !== 1 ? 's' : ''} remaining. Proceeds held 5 business days post-event (weekdays only — public holidays not calculated).`,
      };
    }
    if (isPendingEvent) {
      return {
        icon: 'event',
        color: Colors.textMuted,
        bg: Colors.surfaceElevated,
        border: Colors.surfaceBorder,
        title: 'Event Has Not Occurred Yet',
        description: 'The 5-business-day hold starts after your event date.',
      };
    }
    return {
      icon: 'schedule',
      color: Colors.info,
      bg: 'rgba(33,150,243,0.08)',
      border: 'rgba(33,150,243,0.2)',
      title: 'Payout Timeline Pending',
      description: eligible
        ? `Eligible from ${eligible.toLocaleDateString('en-JM', { month: 'long', day: 'numeric', year: 'numeric' })}.`
        : 'Eligibility date will be calculated after the event.',
    };
  };

  const cfg = getConfig();

  const steps: { label: string; done: boolean }[] = [
    { label: 'Event', done: !isPendingEvent },
    { label: '5 Biz Days', done: isReady },
    { label: 'Eligible', done: isReady },
  ];

  return (
    <View style={[eligStyles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={eligStyles.header}>
        <MaterialIcons name={cfg.icon} size={18} color={cfg.color} />
        <Text style={[eligStyles.title, { color: cfg.color }]}>{cfg.title}</Text>
      </View>
      <Text style={eligStyles.description}>{cfg.description}</Text>

      {/* Progress timeline */}
      <View style={eligStyles.timeline}>
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <View style={eligStyles.timelineStep}>
              <View style={[
                eligStyles.timelineDot,
                { backgroundColor: step.done ? Colors.greenLight : Colors.surfaceBorder },
              ]}>
                {step.done ? (
                  <MaterialIcons name="check" size={10} color="#fff" />
                ) : null}
              </View>
              <Text style={[
                eligStyles.timelineLabel,
                step.done && { color: Colors.textSecondary },
              ]}>
                {step.label}
              </Text>
            </View>
            {i < steps.length - 1 ? (
              <View style={[
                eligStyles.timelineLine,
                { backgroundColor: step.done ? Colors.greenLight : Colors.surfaceBorder },
              ]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      {eligible ? (
        <View style={eligStyles.dateRow}>
          <MaterialIcons name="calendar-today" size={12} color={Colors.textMuted} />
          <Text style={eligStyles.dateText}>
            Eligibility date: {eligible.toLocaleDateString('en-JM', {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            })}
          </Text>
        </View>
      ) : null}

      <View style={eligStyles.schedulerNote}>
        <MaterialIcons name="autorenew" size={12} color={Colors.textMuted} />
        <Text style={eligStyles.schedulerNoteText}>
          Status updated daily at 02:00 UTC by automatic scheduler
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PromoterFinanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();

  const { load: loadFinance, summary: financeSummary, loading: financeLoading, error: financeError } = usePromoterFinance(eventId ?? '');
  const { accounts, load: loadAccounts } = usePayoutAccounts(user?.id ?? '');
  const { payouts, load: loadPayoutHistory } = usePayoutHistory(user?.id ?? '');
  const payoutReq = usePayoutRequest();

  const currency = financeSummary?.currency ?? 'USD';
  const { balance: balanceData, load: loadBalance } = usePayoutBalance(user?.id ?? '', currency);

  const [refreshing, setRefreshing] = useState(false);
  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [addAccountDisplayName, setAddAccountDisplayName] = useState('');
  const [addAccountCurrency, setAddAccountCurrency] = useState('USD');
  const [addAccountMethod, setAddAccountMethod] = useState('bank_transfer_usd');
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    await Promise.all([loadFinance(), loadAccounts(), loadPayoutHistory()]);
  }, [loadFinance, loadAccounts, loadPayoutHistory]);

  useEffect(() => {
    loadAll();
  }, [eventId, loadAll]);

  useEffect(() => {
    if (currency && user?.id) loadBalance();
  }, [currency, user?.id, loadBalance]);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    await loadBalance();
    setRefreshing(false);
  };

  const handleRequestPayout = async () => {
    if (!selectedAccountId) {
      Alert.alert('Select Account', 'Please select a payout account first.');
      return;
    }
    const result = await payoutReq.requestPayout({
      eventId: eventId ?? '',
      currency,
      payoutAccountId: selectedAccountId,
    });
    if (result.ok) {
      setPayoutModalVisible(false);
      await loadAll();
      await loadBalance();
      Alert.alert('Payout Requested', `Your payout request of ${formatMinorAmount(result.amount_minor ?? 0, currency)} has been submitted for processing.`);
    }
  };

  const handleAddAccount = async () => {
    if (!addAccountDisplayName.trim()) {
      setAddAccountError('Please enter an account name.');
      return;
    }
    setAddAccountLoading(true);
    setAddAccountError(null);
    const { error } = await addPayoutAccount({
      promoterId: user.id,
      currency: addAccountCurrency,
      payoutMethod: addAccountMethod,
      displayName: addAccountDisplayName.trim(),
      bankCountry: 'JM',
    });
    setAddAccountLoading(false);
    if (error) { setAddAccountError(error); return; }
    setAddAccountModalVisible(false);
    setAddAccountDisplayName('');
    await loadAccounts();
  };

  const fs = financeSummary;
  const bal = balanceData;
  const ps = fs?.payout_status ? formatPayoutStatus(fs.payout_status) : null;
  const cs = formatCancellationStatus(fs?.cancellation_status ?? null);

  const eligibleAccounts = accounts.filter((a) =>
    a.status === 'verified' && a.currency.toUpperCase() === currency.toUpperCase()
  );
  const pendingAccounts = accounts.filter((a) => a.status === 'pending_verification');
  const canRequestPayout = (bal?.eligible_minor ?? 0) > 0 && !bal?.has_financial_hold && !fs?.cancellation_status;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Finance & Payouts</Text>
            <Text style={styles.headerSub}>Ticket revenue and payout management</Text>
          </View>
        </View>
      </SafeAreaView>

      {financeLoading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.gold} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} />}
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) }]}
        >
          {financeError ? (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={styles.errorText}>{financeError}</Text>
            </View>
          ) : null}

          {/* ── Payout Status Banner ─────────────────────────────────── */}
          {ps && (
            <View style={[styles.statusBanner, { borderColor: `${ps.color}44`, backgroundColor: `${ps.color}10` }]}>
              <View style={[styles.statusDot, { backgroundColor: ps.color }]} />
              <Text style={[styles.statusBannerText, { color: ps.color }]}>Payout Status: {ps.label}</Text>
              {bal?.has_financial_hold && (
                <MaterialIcons name="lock" size={14} color={Colors.error} />
              )}
            </View>
          )}

          {/* Cancellation warning */}
          {fs?.cancellation_status ? (
            <View style={[styles.statusBanner, { borderColor: 'rgba(244,67,54,0.4)', backgroundColor: 'rgba(244,67,54,0.08)' }]}>
              <MaterialIcons name="cancel" size={14} color={Colors.error} />
              <Text style={[styles.statusBannerText, { color: Colors.error }]}>{cs.label}</Text>
            </View>
          ) : null}

          {/* Hold warning */}
          {bal?.has_financial_hold ? (
            <View style={styles.holdBanner}>
              <MaterialIcons name="warning" size={16} color={Colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.holdBannerTitle}>Payout Temporarily On Hold</Text>
                <Text style={styles.holdBannerSub}>Contact Vybz Hub support for details.</Text>
              </View>
            </View>
          ) : null}

          {/* ── Payout Balance ───────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payout Balance ({currency})</Text>
            <View style={styles.balanceCard}>
              <View style={styles.balanceMain}>
                <Text style={styles.balanceLabel}>Eligible for Payout</Text>
                <Text style={styles.balanceAmount}>
                  {formatMinorAmount(bal?.eligible_minor ?? 0, currency)}
                </Text>
                {bal?.notes ? (
                  <Text style={styles.balanceNote}>{bal.notes}</Text>
                ) : null}
              </View>

              <View style={styles.balanceRows}>
                <FinanceRow
                  label="Gross Ticket Sales"
                  value={formatMinorAmount(bal?.gross_platform_minor ?? 0, currency)}
                  color={Colors.textPrimary}
                  sub="Online + door card only"
                />
                {(bal?.total_refunded_minor ?? 0) > 0 && (
                  <FinanceRow
                    label="Refunds Issued"
                    value={`-${formatMinorAmount(bal!.total_refunded_minor!, currency)}`}
                    color={Colors.error}
                    icon="undo"
                  />
                )}
                {(bal?.total_liability_minor ?? 0) > 0 && (
                  <FinanceRow
                    label="Open Liabilities"
                    value={`-${formatMinorAmount(bal!.total_liability_minor!, currency)}`}
                    color={Colors.error}
                    icon="warning"
                  />
                )}
                {(bal?.total_paid_out_minor ?? 0) > 0 && (
                  <FinanceRow
                    label="Already Paid Out"
                    value={`-${formatMinorAmount(bal!.total_paid_out_minor!, currency)}`}
                    color={Colors.textMuted}
                    icon="check-circle"
                  />
                )}
                {(bal?.in_flight_minor ?? 0) > 0 && (
                  <FinanceRow
                    label="Payout In Progress"
                    value={`-${formatMinorAmount(bal!.in_flight_minor!, currency)}`}
                    color="#FF9800"
                    sub="Requested or processing"
                    icon="sync"
                  />
                )}
                {(bal?.post_event_hold_minor ?? 0) > 0 && (
                  <FinanceRow
                    label="Post-Event Hold"
                    value={formatMinorAmount(bal!.post_event_hold_minor!, currency)}
                    color="#FF9800"
                    sub="Will be eligible after hold period"
                    icon="hourglass-top"
                  />
                )}
                {(bal?.pending_event_minor ?? 0) > 0 && (
                  <FinanceRow
                    label="Pending Event"
                    value={formatMinorAmount(bal!.pending_event_minor!, currency)}
                    color={Colors.textMuted}
                    sub="Available after event occurs"
                    icon="event"
                  />
                )}
              </View>

              {/* Compact eligibility date note inside balance card */}
              {fs?.payout_eligible_at ? (
                <View style={styles.eligibleRow}>
                  <MaterialIcons name="schedule" size={13} color={Colors.info} />
                  <Text style={styles.eligibleText}>
                    Eligible from {new Date(fs.payout_eligible_at).toLocaleDateString('en-JM', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })} — weekdays only, holidays not calculated
                  </Text>
                </View>
              ) : null}

              {/* Request payout CTA */}
              <Pressable
                onPress={() => setPayoutModalVisible(true)}
                disabled={!canRequestPayout}
                style={({ pressed }) => [
                  styles.payoutCta,
                  !canRequestPayout && { opacity: 0.4 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.payoutCtaInner}>
                  <MaterialIcons name="account-balance-wallet" size={18} color={Colors.textOnGold} />
                  <Text style={styles.payoutCtaText}>
                    {canRequestPayout
                      ? `Request Payout — ${formatMinorAmount(bal?.eligible_minor ?? 0, currency)}`
                      : 'No Eligible Balance'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          {/* ── Payout Eligibility Status Card ──────────────────────── */}
          {fs?.payout_status ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payout Eligibility</Text>
              <PayoutEligibilityCard
                eligibleAt={(fs as any).payout_eligible_at ?? null}
                payoutStatus={fs.payout_status}
              />
            </View>
          ) : null}

          {/* ── Event Revenue Breakdown ──────────────────────────────── */}
          {fs ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Revenue</Text>
              <View style={styles.card}>
                <FinanceRow label="Gross Ticket Sales" value={formatMinorAmount(fs.platform_gross_minor ?? 0, currency)} />
                <FinanceRow label="Customer Service Fees" value={formatMinorAmount(fs.platform_customer_fees_minor ?? 0, currency)} color={Colors.textMuted} />
                <FinanceRow label="Platform Fee Deducted" value={`-${formatMinorAmount(fs.platform_promoter_fees_minor ?? 0, currency)}`} color={Colors.error} />
                <View style={styles.divider} />
                <FinanceRow label="Your Proceeds (Online + Card)" value={formatMinorAmount(fs.promoter_proceeds_minor ?? 0, currency)} color={Colors.gold} />
                {(fs.cash_collected_directly_minor ?? 0) > 0 && (
                  <>
                    <View style={styles.divider} />
                    <FinanceRow
                      label="Cash Collected Directly"
                      value={formatMinorAmount(fs.cash_collected_directly_minor ?? 0, currency)}
                      color={Colors.greenLight}
                      sub="No platform fee — already in your hands. Not included in payout balance."
                      icon="payments"
                    />
                  </>
                )}
              </View>

              {/* Refunds */}
              {((fs.total_refunded_minor ?? 0) > 0 || (fs.refunds_pending_minor ?? 0) > 0) && (
                <View style={styles.card}>
                  <View style={styles.cardSectionHeader}>
                    <MaterialIcons name="undo" size={14} color={Colors.error} />
                    <Text style={styles.cardSectionHeaderText}>Refunds</Text>
                  </View>
                  {(fs.total_refunded_minor ?? 0) > 0 && (
                    <FinanceRow label="Issued" value={formatMinorAmount(fs.total_refunded_minor ?? 0, currency)} color={Colors.error} />
                  )}
                  {(fs.refunds_pending_minor ?? 0) > 0 && (
                    <FinanceRow label="Pending" value={formatMinorAmount(fs.refunds_pending_minor ?? 0, currency)} color="#FF9800" />
                  )}
                </View>
              )}

              {/* Cancellation cash obligations */}
              {(fs.cash_orders_promoter_must_refund ?? 0) > 0 && (
                <View style={styles.warningCard}>
                  <MaterialIcons name="warning" size={16} color={Colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.warningTitle}>Cash Refunds You Must Handle</Text>
                    <Text style={styles.warningSub}>
                      {fs.cash_orders_promoter_must_refund} cash order{fs.cash_orders_promoter_must_refund !== 1 ? 's' : ''} cannot be automatically refunded. You collected this cash directly and must refund affected customers personally.
                    </Text>
                  </View>
                </View>
              )}

              {/* Open liabilities */}
              {(fs.open_liabilities_minor ?? 0) > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardSectionHeader}>
                    <MaterialIcons name="warning" size={14} color={Colors.error} />
                    <Text style={[styles.cardSectionHeaderText, { color: Colors.error }]}>Open Liabilities</Text>
                  </View>
                  <FinanceRow label="Amount Owed to Platform" value={formatMinorAmount(fs.open_liabilities_minor ?? 0, currency)} color={Colors.error} />
                </View>
              )}

              {/* Disputes */}
              {(fs.disputes?.length ?? 0) > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardSectionHeader}>
                    <MaterialIcons name="gavel" size={14} color="#FF9800" />
                    <Text style={[styles.cardSectionHeaderText, { color: '#FF9800' }]}>Payment Disputes</Text>
                  </View>
                  {fs.disputes!.map((d) => (
                    <View key={d.id} style={styles.disputeRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.disputeReason}>{d.reason ?? 'Dispute'}</Text>
                        <Text style={styles.disputeDate}>{new Date(d.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric' })}</Text>
                      </View>
                      <View>
                        <Text style={styles.disputeAmount}>{formatMinorAmount(d.amount_minor, d.currency)}</Text>
                        <Text style={[styles.disputeStatus, { color: d.status === 'lost' ? Colors.error : '#FF9800' }]}>{d.status}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* ── Payout History ───────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payout History</Text>
            {payouts.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="account-balance-wallet" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No payout history yet.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {payouts.map((p, i) => {
                  const pst = formatPayoutStatus(p.status);
                  return (
                    <View key={p.id} style={[styles.payoutHistoryRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder }]}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.payoutHistoryAmount}>
                          {formatMinorAmount(p.amount_minor, p.currency)}
                        </Text>
                        <Text style={styles.payoutHistoryDate}>
                          Requested {new Date(p.initiated_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {p.completed_at ? (
                          <Text style={styles.payoutHistoryDate}>
                            Paid {new Date(p.completed_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Text>
                        ) : null}
                        {p.provider_payout_ref ? (
                          <Text style={styles.payoutHistoryRef} numberOfLines={1}>Ref: {p.provider_payout_ref}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.payoutStatusChip, { backgroundColor: `${pst.color}18`, borderColor: `${pst.color}44` }]}>
                        <Text style={[styles.payoutStatusText, { color: pst.color }]}>{pst.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Payout Accounts ──────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Payout Accounts</Text>
              <Pressable
                onPress={() => setAddAccountModalVisible(true)}
                style={({ pressed }) => [styles.addAccountBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="add" size={14} color={Colors.gold} />
                <Text style={styles.addAccountBtnText}>Add Account</Text>
              </Pressable>
            </View>

            {accounts.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="account-balance" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No payout accounts configured.</Text>
                <Text style={styles.emptySubText}>Add a bank account to receive payouts. Admin must verify your account before you can request a payout.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {accounts.map((acct, i) => (
                  <View key={acct.id} style={[styles.accountRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder }]}>
                    <View style={styles.accountIcon}>
                      <MaterialIcons name="account-balance" size={18} color={acct.status === 'verified' ? Colors.greenLight : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.accountName}>{acct.display_name}</Text>
                      <Text style={styles.accountMeta}>{acct.currency} · {acct.payout_method.replace(/_/g, ' ')}</Text>
                    </View>
                    <View style={[styles.accountStatusBadge, { backgroundColor: acct.status === 'verified' ? 'rgba(76,175,80,0.12)' : 'rgba(255,152,0,0.12)' }]}>
                      <Text style={[styles.accountStatusText, { color: acct.status === 'verified' ? Colors.greenLight : '#FF9800' }]}>
                        {acct.status === 'verified' ? 'Verified' : 'Pending Verification'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {pendingAccounts.length > 0 && (
              <View style={styles.infoRow}>
                <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                <Text style={styles.infoText}>Pending accounts must be verified by Vybz Hub admin before payouts can be processed.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Payout Request Modal ────────────────────────────────────── */}
      <Modal visible={payoutModalVisible} transparent animationType="slide" onRequestClose={() => setPayoutModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPayoutModalVisible(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Request Payout</Text>
            <Text style={styles.modalSub}>
              {'Eligible Amount: '}
              <Text style={{ color: Colors.gold, fontWeight: Typography.bold }}>{formatMinorAmount(bal?.eligible_minor ?? 0, currency)}</Text>
            </Text>

            <Text style={styles.fieldLabel}>Select Payout Account</Text>
            {eligibleAccounts.length === 0 ? (
              <View style={styles.warningCard}>
                <MaterialIcons name="warning" size={14} color="#FF9800" />
                <Text style={[styles.warningSub, { flex: 1 }]}>
                  {`No verified ${currency} payout account found. Add and verify a payout account first.`}
                </Text>
              </View>
            ) : (
              eligibleAccounts.map((acct) => (
                <Pressable
                  key={acct.id}
                  onPress={() => setSelectedAccountId(acct.id)}
                  style={({ pressed }) => [
                    styles.accountOption,
                    selectedAccountId === acct.id && styles.accountOptionSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <MaterialIcons name="account-balance" size={20} color={selectedAccountId === acct.id ? Colors.gold : Colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountName, selectedAccountId === acct.id && { color: Colors.gold }]}>{acct.display_name}</Text>
                    <Text style={styles.accountMeta}>{acct.currency} · Verified</Text>
                  </View>
                  {selectedAccountId === acct.id ? <MaterialIcons name="check-circle" size={18} color={Colors.gold} /> : null}
                </Pressable>
              ))
            )}

            <View style={styles.payoutNotice}>
              <MaterialIcons name="info-outline" size={14} color={Colors.info} />
              <Text style={styles.payoutNoticeText}>
                Payouts are processed manually by Vybz Hub within 2–5 business days. Holidays are not included in the business day calculation.
              </Text>
            </View>

            {payoutReq.error ? (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                <Text style={styles.errorText}>{payoutReq.error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleRequestPayout}
              disabled={!selectedAccountId || payoutReq.submitting || eligibleAccounts.length === 0}
              style={({ pressed }) => [
                styles.modalBtn,
                (!selectedAccountId || payoutReq.submitting || eligibleAccounts.length === 0) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.modalBtnInner}>
                {payoutReq.submitting ? (
                  <ActivityIndicator color={Colors.textOnGold} size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Submit Payout Request</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Add Account Modal ─────────────────────────────────────── */}
      <Modal visible={addAccountModalVisible} transparent animationType="slide" onRequestClose={() => setAddAccountModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setAddAccountModalVisible(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Payout Account</Text>
            <Text style={styles.modalSub}>Account details will be verified by Vybz Hub before payouts can be processed.</Text>

            <Text style={styles.fieldLabel}>Account Name / Bank Reference</Text>
            <TextInput
              style={styles.input}
              value={addAccountDisplayName}
              onChangeText={setAddAccountDisplayName}
              placeholder="e.g. NCB Jamaica - Business Account"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Account display name"
            />

            <Text style={styles.fieldLabel}>Currency</Text>
            <View style={styles.paymentRow}>
              {(['USD', 'JMD'] as const).map((cur) => (
                <Pressable
                  key={cur}
                  onPress={() => {
                    setAddAccountCurrency(cur);
                    setAddAccountMethod(cur === 'JMD' ? 'bank_transfer_jmd' : 'bank_transfer_usd');
                  }}
                  style={({ pressed }) => [
                    styles.currencyOption,
                    addAccountCurrency === cur && styles.currencyOptionSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[styles.currencyOptionText, addAccountCurrency === cur && { color: Colors.textOnGold }]}>
                    {cur}
                  </Text>
                </Pressable>
              ))}
            </View>

            {addAccountError ? (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                <Text style={styles.errorText}>{addAccountError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleAddAccount}
              disabled={addAccountLoading || !addAccountDisplayName.trim()}
              style={({ pressed }) => [styles.modalBtn, (addAccountLoading || !addAccountDisplayName.trim()) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.modalBtnInner}>
                {addAccountLoading ? <ActivityIndicator color={Colors.textOnGold} size="small" /> : <Text style={styles.modalBtnText}>Add Account</Text>}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBannerText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold },

  holdBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: 'rgba(244,67,54,0.08)', borderRadius: Radius.md, padding: Spacing.base, borderWidth: 1, borderColor: 'rgba(244,67,54,0.3)' },
  holdBannerTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.error },
  holdBannerSub: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },

  section: { gap: Spacing.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },

  balanceCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  balanceMain: { padding: Spacing.base, gap: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  balanceLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  balanceAmount: { fontSize: 32, fontWeight: Typography.black, color: Colors.gold },
  balanceNote: { fontSize: Typography.xs, color: Colors.error, marginTop: Spacing.xs },
  balanceRows: { padding: Spacing.base, gap: Spacing.md },
  eligibleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  eligibleText: { flex: 1, fontSize: Typography.xs, color: Colors.info, lineHeight: 16 },
  payoutCta: { borderRadius: 0, overflow: 'hidden' },
  payoutCtaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  payoutCtaText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  cardSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  cardSectionHeaderText: { fontSize: Typography.xs, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5, color: Colors.textMuted },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder, marginHorizontal: Spacing.base },

  financeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  financeRowLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  financeRowSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  financeRowValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, flexShrink: 0 },

  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: 'rgba(244,67,54,0.08)', borderRadius: Radius.md, padding: Spacing.base, borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)' },
  warningTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.error, marginBottom: Spacing.xs },
  warningSub: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  disputeRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  disputeReason: { fontSize: Typography.sm, color: Colors.textPrimary },
  disputeDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  disputeAmount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'right' },
  disputeStatus: { fontSize: 10, fontWeight: Typography.bold, textAlign: 'right', textTransform: 'uppercase' },

  payoutHistoryRow: { padding: Spacing.base, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  payoutHistoryAmount: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  payoutHistoryDate: { fontSize: Typography.xs, color: Colors.textMuted },
  payoutHistoryRef: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace' },
  payoutStatusChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  payoutStatusText: { fontSize: 10, fontWeight: Typography.bold },

  emptyCard: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder },
  emptyText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  emptySubText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 },

  addAccountBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  addAccountBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  accountIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  accountMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  accountStatusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  accountStatusText: { fontSize: 10, fontWeight: Typography.bold },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(33,150,243,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.2)' },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.info, lineHeight: 17 },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, gap: Spacing.md, borderTopWidth: 1, borderColor: Colors.surfaceBorder },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  modalSub: { fontSize: Typography.sm, color: Colors.textSecondary },
  modalBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  modalBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  modalBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, fontSize: Typography.base, color: Colors.textPrimary },
  paymentRow: { flexDirection: 'row', gap: Spacing.md },
  currencyOption: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  currencyOptionSelected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  currencyOptionText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textMuted },
  accountOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  accountOptionSelected: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  payoutNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(33,150,243,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.2)' },
  payoutNoticeText: { flex: 1, fontSize: Typography.xs, color: Colors.info, lineHeight: 17 },
});

// ─── Eligibility Card Styles ──────────────────────────────────────────────────

const eligStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    flex: 1,
  },
  description: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  timelineStep: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  timelineLine: {
    flex: 1,
    height: 2,
    marginBottom: Spacing.lg,
    marginHorizontal: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  schedulerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  schedulerNoteText: {
    fontSize: 10,
    color: Colors.textMuted,
    flex: 1,
  },
});
