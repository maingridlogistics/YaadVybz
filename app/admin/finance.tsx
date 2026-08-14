
/**
 * Admin Portal — Finance Tab
 * Subscriptions, boosts, promoter payouts, refunds, disputes, cancellations.
 * Admin-only.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatMinorAmount } from '../../services/customerTicketingService';
import { formatPayoutStatus } from '../../services/payoutService';
import { useAdminCancellations, useAdminPayouts } from '../../hooks/usePayouts';

type FinanceSection = 'tickets' | 'payouts' | 'subs' | 'disputes' | 'cancellations';

const SECTION_TABS: { key: FinanceSection; icon: string; label: string }[] = [
  { key: 'tickets',       icon: 'confirmation-number',    label: 'Ticket Sales' },
  { key: 'payouts',       icon: 'account-balance-wallet', label: 'Payouts' },
  { key: 'subs',          icon: 'subscriptions',          label: 'Subscriptions' },
  { key: 'disputes',      icon: 'gavel',                  label: 'Disputes' },
  { key: 'cancellations', icon: 'cancel',                 label: 'Cancellations' },
];

// ─── Sub ledger row ───────────────────────────────────────────────────────────
function SubRow({ sub }: { sub: any }) {
  const providerColors: Record<string, string> = {
    apple: Colors.textSecondary, stripe: '#635BFF', google: Colors.greenLight, admin: Colors.gold,
  };
  const sColors: Record<string, string> = {
    active: Colors.greenLight, trialing: Colors.gold, past_due: '#FF9800', canceled: Colors.textMuted,
  };
  const pColor = providerColors[sub.payment_provider] ?? Colors.textMuted;
  const sColor = sColors[sub.status] ?? Colors.textMuted;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={styles.subRow}>
      <View style={[styles.subProviderDot, { backgroundColor: pColor }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={styles.subPlan}>{sub.plan === 'elite' ? 'Elite' : sub.plan === 'pro' ? 'Pro' : sub.plan ?? '—'}</Text>
          <View style={[styles.subProviderChip, { backgroundColor: `${pColor}18`, borderColor: `${pColor}44` }]}>
            <Text style={[styles.subProviderTag, { color: pColor }]}>
              {sub.payment_provider === 'admin' ? 'Admin Grant' : sub.payment_provider ?? 'stripe'}
            </Text>
          </View>
          <Text style={[styles.subStatus, { color: sColor }]}>{sub.status}</Text>
          {sub.environment === 'sandbox' && <Text style={[styles.subStatus, { color: '#FF9800' }]}>sandbox</Text>}
        </View>
        <Text style={styles.subMeta}>{sub.billing_cycle ?? '—'}</Text>
        {periodEnd && <Text style={styles.subMeta}>{sub.status === 'active' ? `Renews ${periodEnd}` : `Period ended ${periodEnd}`}</Text>}
      </View>
      <View style={[styles.subStatusDot, { backgroundColor: sColor }]} />
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// ─── Ticket Order Row ─────────────────────────────────────────────────────────
function TicketOrderRow({ order }: { order: any }) {
  const statusColors: Record<string, string> = {
    paid: Colors.greenLight, pending: '#FF9800', failed: '#F44336', refunded: '#9E9E9E', voided: '#607D8B',
  };
  const sc = statusColors[order.payment_status] ?? Colors.textMuted;
  const providerColors: Record<string, string> = { stripe: '#635BFF', apple: Colors.textSecondary, google: Colors.greenLight };
  const pc = providerColors[order.payment_provider] ?? Colors.textMuted;
  const date = order.paid_at ? new Date(order.paid_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: '2-digit' }) : new Date(order.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: '2-digit' });

  return (
    <View style={styles.ticketOrderRow}>
      <View style={styles.ticketOrderLeft}>
        <Text style={styles.ticketOrderAmount}>{formatMinorAmount(order.customer_total_minor ?? order.base_subtotal_minor ?? 0, order.currency ?? 'USD')}</Text>
        <Text style={styles.ticketOrderMeta} numberOfLines={1}>
          {order.buyer_name || order.buyer_email || 'Anonymous'} · #{order.order_number ?? order.id?.slice(0, 8)}
        </Text>
        <View style={styles.ticketOrderBadgeRow}>
          <View style={[styles.ticketOrderStatusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
            <View style={[styles.ticketOrderDot, { backgroundColor: sc }]} />
            <Text style={[styles.ticketOrderStatusText, { color: sc }]}>{order.payment_status}</Text>
          </View>
          <View style={[styles.ticketOrderProviderChip, { backgroundColor: `${pc}18`, borderColor: `${pc}44` }]}>
            <Text style={[styles.ticketOrderProviderText, { color: pc }]}>{order.payment_provider ?? 'stripe'}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.ticketOrderDate}>{date}</Text>
    </View>
  );
}

export default function AdminFinanceTab() {
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<FinanceSection>('tickets');

  const adminCancellations = useAdminCancellations();
  const adminPayouts = useAdminPayouts();

  // Ticket Sales state
  const [ticketOrders, setTicketOrders] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('paid');
  const [ticketPage, setTicketPage] = useState(0);
  const TICKET_PAGE_SIZE = 40;

  const [subLedger, setSubLedger] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subFilter, setSubFilter] = useState('all');

  const [disputes, setDisputes] = useState<any[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputeFilter, setDisputeFilter] = useState('all');

  const [payoutActionTarget, setPayoutActionTarget] = useState<any>(null);
  const [payoutActionType, setPayoutActionType] = useState<'processing' | 'paid' | 'failed' | null>(null);
  const [payoutProviderRef, setPayoutProviderRef] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');

  const [cancellationRejectTarget, setCancellationRejectTarget] = useState<any>(null);
  const [cancellationRejectReason, setCancellationRejectReason] = useState('');

  const loadTickets = useCallback(async (page = 0, status = ticketStatusFilter, search = ticketSearch) => {
    setTicketsLoading(true);
    try {
      let query = supabase
        .from('ticket_orders')
        .select('id, order_number, buyer_id, buyer_name, buyer_email, event_id, currency, base_subtotal_minor, customer_total_minor, promoter_proceeds_minor, payment_status, payment_provider, paid_at, created_at, sale_source')
        .order('created_at', { ascending: false })
        .range(page * TICKET_PAGE_SIZE, (page + 1) * TICKET_PAGE_SIZE - 1);

      if (status !== 'all') query = query.eq('payment_status', status);
      if (search.trim().length >= 2) {
        query = query.or(`order_number.ilike.%${search.trim()}%,buyer_email.ilike.%${search.trim()}%,buyer_name.ilike.%${search.trim()}%`);
      }
      const { data } = await query;
      if (page === 0) {
        setTicketOrders(data ?? []);
      } else {
        setTicketOrders((prev) => [...prev, ...(data ?? [])]);
      }
      setTicketPage(page);
    } catch (error) { // Added error handling for consistency
      console.error('Error loading tickets:', error);
    }
    setTicketsLoading(false);
  }, [ticketStatusFilter, ticketSearch]);

  const loadSubs = useCallback(async () => {
    setSubLoading(true);
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, user_id, plan, status, payment_provider, billing_cycle, current_period_end, cancel_at_period_end, original_transaction_id, stripe_subscription_id, provider_product_id, environment, created_at, auto_renew_status')
        .order('created_at', { ascending: false })
        .limit(150);
      setSubLedger(data ?? []);
    } catch (error) { // Added error handling for consistency
      console.error('Error loading subscriptions:', error);
    }
    setSubLoading(false);
  }, []);

  const loadDisputes = useCallback(async () => {
    setDisputesLoading(true);
    try {
      const { data } = await supabase.from('payment_disputes').select('*').order('created_at', { ascending: false }).limit(100);
      setDisputes(data ?? []);
    } catch (error) { // Added error handling for consistency
      console.error('Error loading disputes:', error);
    }
    setDisputesLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'tickets') loadTickets(0);
    if (activeSection === 'subs') loadSubs();
    if (activeSection === 'disputes') loadDisputes();
    if (activeSection === 'payouts') adminPayouts.load();
    if (activeSection === 'cancellations') adminCancellations.load();
  }, [activeSection, loadTickets, loadSubs, loadDisputes, adminPayouts.load, adminCancellations.load]); // Removed eslint-disable-next-line as the issue is resolved

  const filteredSubs = subFilter === 'all' ? subLedger : subLedger.filter((s) => s.payment_provider === subFilter);
  const filteredDisputes = disputeFilter === 'all' ? disputes : disputes.filter((d) => d.status === disputeFilter);

  const disputeStatusColors: Record<string, string> = {
    open: '#FF9800', needs_response: '#F44336', under_review: '#42A5F5', won: Colors.greenLight, lost: '#F44336',
  };

  const openDisputeCount = disputes.filter((d) => d.status === 'open' || d.status === 'needs_response').length;
  const pendingPayoutCount = adminPayouts.payouts.filter((p) => p.status === 'requested').length;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="account-balance-wallet" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Finance</Text>
            <Text style={styles.headerSub}>Subscriptions, payouts, disputes & cancellations</Text>
          </View>
        </View>
        {/* Section tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
          {SECTION_TABS.map((s) => {
            const badge = s.key === 'disputes' ? openDisputeCount : s.key === 'payouts' ? pendingPayoutCount : 0;
            return (
              <Pressable
                key={s.key}
                onPress={() => setActiveSection(s.key)}
                style={[styles.sectionTab, activeSection === s.key && styles.sectionTabActive]}
              >
                <MaterialIcons name={s.icon as any} size={12} color={activeSection === s.key ? Colors.textOnGold : Colors.textMuted} />
                <Text style={[styles.sectionTabText, activeSection === s.key && styles.sectionTabTextActive]}>{s.label}</Text>
                {badge > 0 && (
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{badge}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* ── Ticket Sales ── */}
        {activeSection === 'tickets' && (
          <>
            <View style={styles.infoBanner}>
              <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
              <Text style={styles.infoBannerText}>Showing paid ticket orders. Use filters and search to find specific transactions.</Text>
            </View>

            {/* Status filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {['paid', 'pending', 'failed', 'refunded', 'all'].map((s) => {
                const isAct = ticketStatusFilter === s;
                const sc2: Record<string, string> = { paid: Colors.greenLight, pending: '#FF9800', failed: '#F44336', refunded: '#9E9E9E', all: Colors.gold };
                const c = sc2[s] ?? Colors.textMuted;
                return (
                  <Pressable key={s} onPress={() => { setTicketStatusFilter(s); loadTickets(0, s, ticketSearch); }} style={[styles.filterChip, isAct && { backgroundColor: `${c}22`, borderColor: `${c}77` }]}>
                    <Text style={[styles.filterChipText, isAct && { color: c }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Search */}
            <View style={styles.ticketSearchRow}>
              <MaterialIcons name="search" size={15} color={Colors.textMuted} />
              <TextInput
                style={styles.ticketSearchInput}
                placeholder="Search by order #, email, name..."
                placeholderTextColor={Colors.textMuted}
                value={ticketSearch}
                onChangeText={setTicketSearch}
                onSubmitEditing={() => loadTickets(0, ticketStatusFilter, ticketSearch)}
                returnKeyType="search"
                accessibilityLabel="Search ticket orders"
              />
              {ticketSearch.length > 0 && (
                <Pressable onPress={() => { setTicketSearch(''); loadTickets(0, ticketStatusFilter, ''); }} hitSlop={8}>
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>

            {ticketsLoading && ticketPage === 0 ? (
              <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.md }} />
            ) : ticketOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="confirmation-number" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No ticket orders found</Text>
              </View>
            ) : (
              <>
                <Text style={styles.ticketResultCount}>{ticketOrders.length}+ orders</Text>
                {ticketOrders.map((order) => <TicketOrderRow key={order.id} order={order} />)}
                <Pressable
                  onPress={() => loadTickets(ticketPage + 1, ticketStatusFilter, ticketSearch)}
                  disabled={ticketsLoading}
                  style={({ pressed }) => [styles.loadMoreBtn, pressed && { opacity: 0.7 }, ticketsLoading && { opacity: 0.5 }]}
                >
                  {ticketsLoading ? <ActivityIndicator size="small" color={Colors.gold} /> : (
                    <>
                      <MaterialIcons name="expand-more" size={16} color={Colors.gold} />
                      <Text style={styles.loadMoreText}>Load More</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ── Payouts ── */}
        {activeSection === 'payouts' && (
          <>
            <View style={styles.infoBanner}>
              <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
              <Text style={styles.infoBannerText}>Manual payout workflow: Start Processing → transfer externally → Mark as Paid with reference.</Text>
            </View>
            {adminPayouts.loading && <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.md }} />}
            {adminPayouts.payouts.filter((p) => ['requested', 'processing'].includes(p.status)).map((payout) => (
              <View key={payout.id} style={styles.payoutRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.payoutAmount}>{formatMinorAmount(payout.amount_minor, payout.currency)}</Text>
                  <Text style={styles.payoutMeta}>{payout.currency} · {new Date(payout.initiated_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric' })}</Text>
                  {payout.provider_payout_ref && <Text style={styles.payoutRef}>{payout.provider_payout_ref}</Text>}
                </View>
                <View style={styles.payoutActions}>
                  {payout.status === 'requested' && (
                    <Pressable onPress={() => { setPayoutActionTarget(payout); setPayoutActionType('processing'); setPayoutProviderRef(''); setPayoutNotes(''); }} style={[styles.payoutActionBtn, { backgroundColor: '#9C27B0' }]}>
                      <Text style={styles.payoutActionBtnText}>Start</Text>
                    </Pressable>
                  )}
                  {payout.status === 'processing' && (
                    <Pressable onPress={() => { setPayoutActionTarget(payout); setPayoutActionType('paid'); setPayoutProviderRef(''); setPayoutNotes(''); }} style={[styles.payoutActionBtn, { backgroundColor: Colors.greenLight }]}>
                      <Text style={styles.payoutActionBtnText}>Mark Paid</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => { setPayoutActionTarget(payout); setPayoutActionType('failed'); setPayoutProviderRef(''); setPayoutNotes(''); }} style={[styles.payoutActionBtn, { backgroundColor: Colors.error }]}>
                    <Text style={styles.payoutActionBtnText}>Fail</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {adminPayouts.payouts.filter((p) => !['requested', 'processing'].includes(p.status)).slice(0, 30).map((payout) => {
              const { color, label } = formatPayoutStatus(payout.status);
              return (
                <View key={payout.id} style={[styles.payoutRow, { opacity: 0.7 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.payoutAmount}>{formatMinorAmount(payout.amount_minor, payout.currency)}</Text>
                    <Text style={styles.payoutMeta}>{new Date(payout.initiated_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.payoutStatusPill, { backgroundColor: `${color}18` }]}>
                    <Text style={[styles.payoutStatusText, { color }]}>{label}</Text>
                  </View>
                </View>
              );
            })}
            {adminPayouts.payouts.length === 0 && !adminPayouts.loading && (
              <View style={styles.emptyState}>
                <MaterialIcons name="account-balance-wallet" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No payout requests</Text>
              </View>
            )}
          </>
        )}

        {/* ── Subscriptions ── */}
        {activeSection === 'subs' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {['all', 'apple', 'stripe', 'google', 'admin'].map((p) => {
                const isAct = subFilter === p;
                const pc = p === 'apple' ? Colors.textSecondary : p === 'stripe' ? '#635BFF' : p === 'google' ? Colors.greenLight : p === 'admin' ? Colors.gold : Colors.textMuted;
                return (
                  <Pressable key={p} onPress={() => setSubFilter(p)} style={[styles.filterChip, isAct && { backgroundColor: `${pc}22`, borderColor: `${pc}77` }]}>
                    <Text style={[styles.filterChipText, isAct && { color: pc }]}>
                      {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {subLoading && <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.md }} />}
            {filteredSubs.map((sub) => <SubRow key={sub.id} sub={sub} />)}
            {filteredSubs.length === 0 && !subLoading && (
              <View style={styles.emptyState}>
                <MaterialIcons name="subscriptions" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No subscription records</Text>
              </View>
            )}
          </>
        )}

        {/* ── Disputes ── */}
        {activeSection === 'disputes' && (
          <>
            <View style={styles.infoBanner}>
              <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
              <Text style={styles.infoBannerText}>Use your Stripe Dashboard to submit evidence and manage dispute outcomes. This view is read-only.</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {['all', 'open', 'needs_response', 'under_review', 'won', 'lost'].map((s) => {
                const isAct = disputeFilter === s;
                const sc = s === 'all' ? Colors.gold : (disputeStatusColors[s] ?? Colors.textMuted);
                return (
                  <Pressable key={s} onPress={() => setDisputeFilter(s)} style={[styles.filterChip, isAct && { backgroundColor: `${sc}22`, borderColor: `${sc}77` }]}>
                    <Text style={[styles.filterChipText, isAct && { color: sc }]}>
                      {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {disputesLoading && <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.md }} />}
            {filteredDisputes.map((d: any) => {
              const dc = disputeStatusColors[d.status] ?? Colors.textMuted;
              return (
                <View key={d.id} style={styles.disputeRow}>
                  <View style={[styles.disputeStripe, { backgroundColor: dc }]} />
                  <View style={{ flex: 1, padding: Spacing.md, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={[styles.disputeStatusChip, { backgroundColor: `${dc}18`, borderColor: `${dc}44` }]}>
                        <Text style={[styles.disputeStatusText, { color: dc }]}>
                          {d.status?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </Text>
                      </View>
                      <Text style={styles.disputeAmount}>{formatMinorAmount(d.amount_minor ?? 0, d.currency ?? 'USD')}</Text>
                    </View>
                    <Text style={styles.disputeId}>...{String(d.provider_dispute_id ?? '').slice(-12)}</Text>
                    {d.reason && <Text style={styles.disputeReason}>{d.reason.replace(/_/g, ' ')}</Text>}
                    {d.evidence_due_at && (d.status === 'needs_response' || d.status === 'open') && (
                      <Text style={styles.disputeDue}>Due: {new Date(d.evidence_due_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric' })}</Text>
                    )}
                    <Text style={styles.disputeMeta}>{new Date(d.created_at).toLocaleDateString()}</Text>
                  </View>
                </View>
              );
            })}
            {filteredDisputes.length === 0 && !disputesLoading && (
              <View style={styles.emptyState}>
                <MaterialIcons name="gavel" size={40} color={Colors.greenLight} />
                <Text style={styles.emptyTitle}>No disputes</Text>
              </View>
            )}
          </>
        )}

        {/* ── Cancellations ── */}
        {activeSection === 'cancellations' && (
          <>
            {adminCancellations.loading && <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.md }} />}
            {adminCancellations.requests.filter((r) => r.status === 'pending_admin').map((req) => (
              <View key={req.id} style={styles.cancellationRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.cancellationTitle}>{req.event_title || 'Untitled Event'}</Text>
                  <Text style={styles.cancellationMeta}>{req.event_date}</Text>
                  <Text style={styles.cancellationReason} numberOfLines={2}>{`"${req.reason}"`}</Text>
                </View>
                <View style={styles.cancellationActions}>
                  <Pressable
                    onPress={() => Alert.alert('Approve Cancellation', `Approve cancellation for "${req.event_title}"? This will void all tickets and queue refunds.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Approve', style: 'destructive', onPress: async () => {
                        const result = await adminCancellations.approve(req.id);
                        if (!result.ok) Alert.alert('Error', result.error ?? 'Failed');
                        else Alert.alert('Approved', `${result.refund_records_created ?? 0} refunds created.`);
                      }},
                    ])}
                    style={styles.cancellationApproveBtn}
                  >
                    <MaterialIcons name="check" size={13} color="#fff" />
                    <Text style={styles.cancellationApproveBtnText}>Approve</Text>
                  </Pressable>
                  <Pressable onPress={() => { setCancellationRejectTarget(req); setCancellationRejectReason(''); }} style={styles.cancellationRejectBtn}>
                    <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ))}
            {adminCancellations.requests.filter((r) => r.status !== 'pending_admin').slice(0, 20).map((req) => (
              <View key={req.id} style={[styles.cancellationRow, { opacity: 0.65 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cancellationTitle}>{req.event_title || 'Untitled'}</Text>
                  <View style={[styles.cancellationStatusChip, { backgroundColor: req.status === 'approved_admin' ? 'rgba(244,67,54,0.12)' : Colors.surfaceElevated }]}>
                    <Text style={[styles.cancellationStatusText, { color: req.status === 'approved_admin' ? Colors.error : Colors.textMuted }]}>
                      {req.status === 'approved_admin' ? 'Cancelled' : 'Rejected'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            {adminCancellations.requests.length === 0 && !adminCancellations.loading && (
              <View style={styles.emptyState}>
                <MaterialIcons name="cancel" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No cancellation requests</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Payout action modal */}
      <Modal visible={payoutActionTarget !== null} transparent animationType="slide" onRequestClose={() => setPayoutActionTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setPayoutActionTarget(null)}>
            <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>
                {payoutActionType === 'processing' ? 'Start Processing' : payoutActionType === 'paid' ? 'Mark as Paid' : 'Mark as Failed'}
              </Text>
              <Text style={styles.modalFieldLabel}>Amount: {payoutActionTarget ? formatMinorAmount(payoutActionTarget.amount_minor, payoutActionTarget.currency) : ''}</Text>
              {payoutActionType === 'paid' && (
                <>
                  <Text style={[styles.modalFieldLabel, { marginTop: Spacing.md }]}>Payment Reference *</Text>
                  <TextInput style={styles.modalInput} value={payoutProviderRef} onChangeText={setPayoutProviderRef} placeholder="Bank transfer ref, wire ID..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
                </>
              )}
              <Text style={[styles.modalFieldLabel, { marginTop: Spacing.md }]}>Notes (optional)</Text>
              <TextInput style={styles.modalInput} value={payoutNotes} onChangeText={setPayoutNotes} placeholder="Internal notes..." placeholderTextColor={Colors.textMuted} multiline numberOfLines={2} textAlignVertical="top" />
              <View style={styles.modalBtnRow}>
                <Pressable onPress={() => setPayoutActionTarget(null)} style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
                <Pressable
                  onPress={async () => {
                    if (!payoutActionTarget || !payoutActionType) return;
                    if (payoutActionType === 'paid' && !payoutProviderRef.trim()) {
                      Alert.alert('Reference Required', 'Enter the payment reference before marking as paid.');
                      return;
                    }
                    const result = await adminPayouts.updateStatus({ payoutId: payoutActionTarget.id, newStatus: payoutActionType, providerRef: payoutProviderRef.trim() || undefined, notes: payoutNotes.trim() || undefined });
                    if (!result.ok) Alert.alert('Error', result.error ?? 'Action failed.');
                    setPayoutActionTarget(null);
                  }}
                  style={[styles.modalConfirmBtn, { backgroundColor: payoutActionType === 'paid' ? Colors.greenLight : payoutActionType === 'processing' ? '#9C27B0' : Colors.error }]}
                >
                  <Text style={styles.modalConfirmText}>{payoutActionType === 'processing' ? 'Confirm' : payoutActionType === 'paid' ? 'Mark Paid' : 'Mark Failed'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancellation reject modal */}
      <Modal visible={cancellationRejectTarget !== null} transparent animationType="slide" onRequestClose={() => setCancellationRejectTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setCancellationRejectTarget(null)}>
            <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Reject Cancellation</Text>
              <Text style={styles.modalFieldLabel}>Reason (optional)</Text>
              <TextInput style={styles.modalInput} value={cancellationRejectReason} onChangeText={setCancellationRejectReason} placeholder="Why is this being rejected?" placeholderTextColor={Colors.textMuted} multiline numberOfLines={3} textAlignVertical="top" />
              <View style={styles.modalBtnRow}>
                <Pressable onPress={() => setCancellationRejectTarget(null)} style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
                <Pressable
                  onPress={async () => {
                    if (!cancellationRejectTarget) return;
                    const result = await adminCancellations.reject(cancellationRejectTarget.id, cancellationRejectReason);
                    if (!result.ok) Alert.alert('Error', result.error ?? 'Failed to reject.');
                    setCancellationRejectTarget(null);
                  }}
                  style={[styles.modalConfirmBtn, { backgroundColor: '#FF9800' }]}
                >
                  <Text style={styles.modalConfirmText}>Reject</Text>
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
  sectionTabs: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  sectionTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  sectionTabActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  sectionTabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  sectionTabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
  sectionBadge: { minWidth: 15, height: 15, borderRadius: 7, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  sectionBadgeText: { fontSize: 8, fontWeight: Typography.bold as any, color: '#fff' },
  body: { padding: Spacing.base, gap: Spacing.sm },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
  },
  infoBannerText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  filterChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  ticketOrderRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  ticketOrderLeft: { flex: 1, gap: 3 },
  ticketOrderAmount: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  ticketOrderMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  ticketOrderBadgeRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 2 },
  ticketOrderStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1,
  },
  ticketOrderDot: { width: 5, height: 5, borderRadius: 2.5 },
  ticketOrderStatusText: { fontSize: 9, fontWeight: Typography.bold as any },
  ticketOrderProviderChip: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1,
  },
  ticketOrderProviderText: { fontSize: 9, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },
  ticketOrderDate: { fontSize: Typography.xs, color: Colors.textMuted, flexShrink: 0, marginLeft: Spacing.sm, marginTop: 2 },
  ticketSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 44,
  },
  ticketSearchInput: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  ticketResultCount: { fontSize: Typography.xs, color: Colors.textMuted },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, borderColor: `${Colors.gold}44`,
    backgroundColor: Colors.goldSurface,
  },
  loadMoreText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  payoutAmount: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  payoutMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  payoutRef: { fontSize: 10, color: Colors.textMuted },
  payoutActions: { flexDirection: 'row', gap: Spacing.xs, flexShrink: 0 },
  payoutActionBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  payoutActionBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#fff' },
  payoutStatusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  payoutStatusText: { fontSize: 10, fontWeight: Typography.bold as any },
  subRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  subProviderDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  subStatusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3, flexShrink: 0 },
  subPlan: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  subProviderChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  subProviderTag: { fontSize: 9, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },
  subStatus: { fontSize: 9, fontWeight: Typography.medium as any },
  subMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  disputeRow: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  disputeStripe: { width: 4, flexShrink: 0 },
  disputeStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  disputeStatusText: { fontSize: 10, fontWeight: Typography.bold as any },
  disputeAmount: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  disputeId: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  disputeReason: { fontSize: Typography.xs, color: Colors.textSecondary, textTransform: 'capitalize' as any },
  disputeDue: { fontSize: Typography.xs, color: '#FF9800', fontWeight: Typography.medium as any },
  disputeMeta: { fontSize: 10, color: Colors.textMuted },
  cancellationRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  cancellationTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  cancellationMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  cancellationReason: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 16 },
  cancellationActions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0 },
  cancellationApproveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.error, borderRadius: Radius.md,
  },
  cancellationApproveBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: '#fff' },
  cancellationRejectBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancellationStatusChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start', marginTop: 4 },
  cancellationStatusText: { fontSize: 10, fontWeight: Typography.bold as any },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.base, borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  modalFieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
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
