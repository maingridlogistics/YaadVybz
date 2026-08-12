// app/ticketing/door/[eventId].tsx — Phase 5: Sell at Door
//
// Authorized users: event promoter, door_sales staff, manager staff.
// Scanner-only staff and customers cannot access this screen.
// All authorization is enforced server-side by door_sale_cash RPC and
// create-door-card-checkout Edge Function.
//
// Security:
//   - Client never controls price, fees, currency, inventory, or sold_by.
//   - Idempotency key prevents duplicate cash orders on double-tap.
//   - Offline sales blocked (network connectivity required).
//   - TICKETING_ENABLED feature flag guards all routes.

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Modal,
  Linking,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useCashDoorSale, useCardDoorSale } from '../../../hooks/useDoorSales';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { getSupabaseClient } from '../../../lib/supabase';
import { formatMinorAmount } from '../../../services/doorSalesService';
import type { PublicTicketTier } from '../../../services/customerTicketingService';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = 'door_cash' | 'door_card';

interface TierQuantity {
  tier: PublicTicketTier;
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadEventTiers(eventId: string): Promise<{
  eventTitle: string;
  currency: string;
  tiers: PublicTicketTier[];
  error: string | null;
}> {
  const supabase = getSupabaseClient();
  const [eventRes, settingsRes, tiersRes] = await Promise.all([
    supabase.from('events').select('title').eq('id', eventId).maybeSingle(),
    supabase.from('event_ticket_settings').select('enabled, currency, sales_status').eq('event_id', eventId).maybeSingle(),
    supabase.from('event_ticket_types')
      .select('id, event_id, name, description, price_minor, currency, quantity_total, quantity_sold, quantity_reserved, min_per_order, max_per_order, sales_start_at, sales_end_at, status, sort_order')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .order('sort_order', { ascending: true }),
  ]);

  const settings = settingsRes.data as any;
  if (!settings?.enabled) {
    return { eventTitle: (eventRes.data as any)?.title ?? '', currency: 'USD', tiers: [], error: 'Ticket sales are not enabled for this event.' };
  }
  if (['cancelled', 'ended'].includes(settings.sales_status)) {
    return { eventTitle: (eventRes.data as any)?.title ?? '', currency: settings.currency ?? 'USD', tiers: [], error: 'Ticket sales have been closed for this event.' };
  }

  const tiers = ((tiersRes.data ?? []) as any[]).map((t) => ({
    ...t,
    available: Math.max(0, t.quantity_total - t.quantity_sold - t.quantity_reserved),
  })) as PublicTicketTier[];

  return {
    eventTitle: (eventRes.data as any)?.title ?? '',
    currency: settings.currency ?? 'USD',
    tiers,
    error: null,
  };
}

// ─── Sale Success Modal ───────────────────────────────────────────────────────

function SaleSuccessModal({
  visible,
  orderNumber,
  ticketsIssued,
  currency,
  totalMinor,
  sellAndCheckin,
  checkinOk,
  onClose,
}: {
  visible: boolean;
  orderNumber: string;
  ticketsIssued: number;
  currency: string;
  totalMinor: number;
  sellAndCheckin: boolean;
  checkinOk: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={successStyles.overlay}>
        <View style={successStyles.card}>
          <View style={successStyles.iconWrap}>
            <LinearGradient colors={[Colors.greenLight, '#00c85a']} style={successStyles.iconGrad}>
              <MaterialIcons name="check-circle" size={40} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={successStyles.title}>Sale Complete</Text>
          <Text style={successStyles.orderNum}>Order #{orderNumber}</Text>

          <View style={successStyles.row}>
            <Text style={successStyles.rowLabel}>Tickets Issued</Text>
            <Text style={successStyles.rowValue}>{ticketsIssued}</Text>
          </View>
          <View style={successStyles.row}>
            <Text style={successStyles.rowLabel}>Amount Collected</Text>
            <Text style={[successStyles.rowValue, { color: Colors.greenLight }]}>
              {formatMinorAmount(totalMinor, currency)}
            </Text>
          </View>

          {sellAndCheckin && (
            <View style={[successStyles.row, { marginTop: Spacing.sm }]}>
              <MaterialIcons
                name={checkinOk ? 'how-to-reg' : 'warning'}
                size={16}
                color={checkinOk ? Colors.greenLight : Colors.gold}
              />
              <Text style={[successStyles.checkinNote, { color: checkinOk ? Colors.greenLight : Colors.gold }]}>
                {checkinOk ? 'Checked in successfully' : 'Sale succeeded — check-in failed. Ticket is valid for normal scanning.'}
              </Text>
            </View>
          )}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [successStyles.btn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={successStyles.btnInner}>
              <Text style={successStyles.btnText}>New Sale</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const successStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  iconWrap: { borderRadius: 40, overflow: 'hidden', marginBottom: Spacing.sm },
  iconGrad: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  orderNum: { fontSize: Typography.sm, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch' },
  rowLabel: { fontSize: Typography.base, color: Colors.textSecondary },
  rowValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  checkinNote: { flex: 1, fontSize: Typography.xs, lineHeight: 17, marginLeft: Spacing.sm },
  btn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  btnInner: { paddingVertical: Spacing.base, alignItems: 'center' },
  btnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DoorSaleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();

  // Event data
  const [eventTitle, setEventTitle] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [tiers, setTiers] = useState<PublicTicketTier[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Sale form state
  const [tierQuantities, setTierQuantities] = useState<TierQuantity[]>([]);
  const [attendeeName, setAttendeeName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('door_cash');
  const [sellAndCheckin, setSellAndCheckin] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);

  // Success state
  const [successVisible, setSuccessVisible] = useState(false);
  const [successData, setSuccessData] = useState<{
    orderNumber: string;
    ticketsIssued: number;
    totalMinor: number;
    sellAndCheckin: boolean;
    checkinOk: boolean;
  } | null>(null);

  const isSubmittingRef = useRef(false);

  const cashHook = useCashDoorSale(eventId ?? '', user?.id ?? '');
  const cardHook = useCardDoorSale();

  // ── Load tiers ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!eventId) return;
    setLoadingTiers(true);
    setLoadError(null);
    const result = await loadEventTiers(eventId);
    setEventTitle(result.eventTitle);
    setCurrency(result.currency);
    setTiers(result.tiers);
    // Initialize quantities
    setTierQuantities(result.tiers.map((t) => ({ tier: t, quantity: 0 })));
    if (result.error) setLoadError(result.error);
    setLoadingTiers(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

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

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  // ── Quantity controls ───────────────────────────────────────────────────────
  const setQuantity = (tierId: string, delta: number) => {
    setTierQuantities((prev) => prev.map((tq) => {
      if (tq.tier.id !== tierId) return tq;
      const max = Math.min(tq.tier.available, tq.tier.max_per_order);
      const newQty = Math.max(0, Math.min(tq.quantity + delta, max));
      return { ...tq, quantity: newQty };
    }));
  };

  const selectedItems = tierQuantities.filter((tq) => tq.quantity > 0);
  const hasSelection  = selectedItems.length > 0;

  // Server will calculate authoritative amounts — this is UI-only preview
  const baseSubtotalMinor = selectedItems.reduce(
    (sum, tq) => sum + tq.tier.price_minor * tq.quantity, 0,
  );
  const customerFeeMinor  = Math.round(baseSubtotalMinor * 5 / 100);
  const customerTotalMinor = baseSubtotalMinor + customerFeeMinor;

  // ── Cash sale submission ────────────────────────────────────────────────────
  const handleCashSale = async () => {
    if (isSubmittingRef.current) return;
    if (!hasSelection) return;

    isSubmittingRef.current = true;

    const result = await cashHook.submit({
      items: selectedItems.map((tq) => ({ ticket_type_id: tq.tier.id, quantity: tq.quantity })),
      attendeeName: attendeeName.trim() || 'Walk-up Customer',
      contactInfo: contactInfo.trim() || undefined,
      sellAndCheckin,
    });

    isSubmittingRef.current = false;

    if (result.ok) {
      setSuccessData({
        orderNumber:  result.order_number ?? '',
        ticketsIssued: result.tickets_issued ?? selectedItems.reduce((s, tq) => s + tq.quantity, 0),
        totalMinor:   result.customer_total_minor ?? customerTotalMinor,
        sellAndCheckin: result.sell_and_checkin ?? sellAndCheckin,
        checkinOk:    result.checkin_ok ?? true,
      });
      setSuccessVisible(true);
    }
  };

  // ── Card sale submission ────────────────────────────────────────────────────
  const handleCardSale = async () => {
    if (isSubmittingRef.current) return;
    if (!hasSelection) return;

    // JMD card gate (server will also enforce, this is a UX guard)
    if (currency === 'JMD') {
      cardHook.clearError();
      return;
    }

    isSubmittingRef.current = true;

    const result = await cardHook.createCheckout({
      eventId: eventId ?? '',
      items: selectedItems.map((tq) => ({ ticket_type_id: tq.tier.id, quantity: tq.quantity })),
      attendeeName: attendeeName.trim() || 'Walk-up Customer',
    });

    isSubmittingRef.current = false;

    if (result.ok && result.checkout_url) {
      Linking.openURL(result.checkout_url);
    }
  };

  // ── Reset after success ─────────────────────────────────────────────────────
  const handleSuccessClose = () => {
    setSuccessVisible(false);
    setSuccessData(null);
    setAttendeeName('');
    setContactInfo('');
    setSellAndCheckin(false);
    // Re-load tiers to get updated inventory
    load();
  };

  const activeError = cashHook.error ?? cardHook.error;
  const isSubmitting = cashHook.submitting || cardHook.submitting;

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Sell at Door</Text>
            {eventTitle ? (
              <Text style={styles.headerSub} numberOfLines={1}>{eventTitle}</Text>
            ) : null}
          </View>
          <View style={styles.offlineTag}>
            <MaterialIcons name="wifi" size={14} color={Colors.greenLight} />
            <Text style={styles.offlineTagText}>Online</Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loadingTiers ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.gold} size="large" />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: Math.max(Spacing.xxl * 3, insets.bottom + 160) },
            ]}
          >
            {/* Load error */}
            {loadError ? (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            ) : null}

            {/* Submission error */}
            {activeError ? (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                <Text style={styles.errorText}>{activeError}</Text>
                <Pressable onPress={() => { cashHook.clearError(); cardHook.clearError(); }} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color={Colors.error} />
                </Pressable>
              </View>
            ) : null}

            {/* ── Section: Ticket Selection ─────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Tickets</Text>

              {tiers.length === 0 && !loadError ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="confirmation-number" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No active ticket tiers available.</Text>
                </View>
              ) : (
                tiers.map((tier) => {
                  const tq = tierQuantities.find((q) => q.tier.id === tier.id);
                  const qty = tq?.quantity ?? 0;
                  const available = tier.available;
                  const soldOut = available === 0;

                  return (
                    <View key={tier.id} style={[styles.tierCard, soldOut && { opacity: 0.5 }]}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.tierName}>{tier.name}</Text>
                        {tier.description ? (
                          <Text style={styles.tierDesc} numberOfLines={2}>{tier.description}</Text>
                        ) : null}
                        <View style={styles.tierMeta}>
                          <Text style={styles.tierPrice}>
                            {formatMinorAmount(tier.price_minor, currency)}
                          </Text>
                          <Text style={styles.tierAvail}>
                            {soldOut ? 'Sold Out' : `${available} left`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.qtyControl}>
                        <Pressable
                          onPress={() => setQuantity(tier.id, -1)}
                          disabled={qty === 0 || soldOut}
                          style={({ pressed }) => [
                            styles.qtyBtn,
                            (qty === 0 || soldOut) && { opacity: 0.35 },
                            pressed && { opacity: 0.6 },
                          ]}
                          hitSlop={8}
                        >
                          <MaterialIcons name="remove" size={18} color={Colors.textPrimary} />
                        </Pressable>
                        <Text style={styles.qtyValue}>{qty}</Text>
                        <Pressable
                          onPress={() => setQuantity(tier.id, +1)}
                          disabled={soldOut || qty >= Math.min(available, tier.max_per_order)}
                          style={({ pressed }) => [
                            styles.qtyBtn,
                            (soldOut || qty >= Math.min(available, tier.max_per_order)) && { opacity: 0.35 },
                            pressed && { opacity: 0.6 },
                          ]}
                          hitSlop={8}
                        >
                          <MaterialIcons name="add" size={18} color={Colors.textPrimary} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* ── Section: Attendee Info ────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attendee Details</Text>
              <View style={styles.card}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={attendeeName}
                    onChangeText={setAttendeeName}
                    placeholder="Walk-up Customer"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="done"
                    accessibilityLabel="Attendee name"
                  />
                </View>

                <Pressable
                  onPress={() => setShowContactInfo((v) => !v)}
                  style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <Text style={styles.toggleLabel}>
                    {showContactInfo ? 'Hide contact info' : 'Add contact info (optional)'}
                  </Text>
                  <MaterialIcons
                    name={showContactInfo ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </Pressable>

                {showContactInfo && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Phone / Email (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={contactInfo}
                      onChangeText={setContactInfo}
                      placeholder="For receipt or follow-up only"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      returnKeyType="done"
                      accessibilityLabel="Attendee contact info"
                    />
                  </View>
                )}
              </View>
            </View>

            {/* ── Section: Payment Method ───────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Method</Text>
              <View style={styles.paymentRow}>
                {/* Cash */}
                <Pressable
                  onPress={() => setPaymentMethod('door_cash')}
                  style={({ pressed }) => [
                    styles.paymentBtn,
                    paymentMethod === 'door_cash' && styles.paymentBtnActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <MaterialIcons
                    name="payments"
                    size={24}
                    color={paymentMethod === 'door_cash' ? Colors.textOnGold : Colors.textMuted}
                  />
                  <Text style={[
                    styles.paymentBtnText,
                    paymentMethod === 'door_cash' && { color: Colors.textOnGold },
                  ]}>
                    Cash
                  </Text>
                  {currency === 'JMD' ? (
                    <Text style={styles.paymentCurrencyTag}>JMD ✓</Text>
                  ) : (
                    <Text style={styles.paymentCurrencyTag}>USD ✓</Text>
                  )}
                </Pressable>

                {/* Card */}
                <Pressable
                  onPress={() => setPaymentMethod('door_card')}
                  style={({ pressed }) => [
                    styles.paymentBtn,
                    paymentMethod === 'door_card' && styles.paymentBtnActive,
                    currency === 'JMD' && { opacity: 0.45 },
                    pressed && { opacity: 0.7 },
                  ]}
                  disabled={currency === 'JMD'}
                >
                  <MaterialIcons
                    name="credit-card"
                    size={24}
                    color={paymentMethod === 'door_card' ? Colors.textOnGold : Colors.textMuted}
                  />
                  <Text style={[
                    styles.paymentBtnText,
                    paymentMethod === 'door_card' && { color: Colors.textOnGold },
                  ]}>
                    Card
                  </Text>
                  {currency === 'JMD' ? (
                    <Text style={[styles.paymentCurrencyTag, { color: Colors.textMuted }]}>Unavailable</Text>
                  ) : (
                    <Text style={styles.paymentCurrencyTag}>USD ✓</Text>
                  )}
                </Pressable>
              </View>

              {/* JMD card notice */}
              {currency === 'JMD' && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                  <Text style={styles.infoText}>
                    JMD card payments are not available yet. Cash sales are fully supported for JMD events.
                  </Text>
                </View>
              )}

              {/* Card notice for staff */}
              {paymentMethod === 'door_card' && currency !== 'JMD' && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                  <Text style={styles.infoText}>
                    A Stripe checkout link will open. Share it with the customer to complete card payment. Ticket is issued after verified payment.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Sell & Check In (cash only) ───────────────────────────── */}
            {paymentMethod === 'door_cash' && (
              <View style={styles.section}>
                <View style={styles.card}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.switchLabel}>Sell &amp; Check In</Text>
                      <Text style={styles.switchDesc}>
                        Immediately check in the attendee after cash collection. Useful for direct-entry door sales.
                      </Text>
                    </View>
                    <Switch
                      value={sellAndCheckin}
                      onValueChange={setSellAndCheckin}
                      trackColor={{ false: Colors.surfaceElevated, true: Colors.greenLight }}
                      thumbColor={Colors.textPrimary}
                      accessibilityLabel="Sell and check in toggle"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* ── Order Summary ─────────────────────────────────────────── */}
            {hasSelection && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Order Summary</Text>
                <View style={styles.card}>
                  {selectedItems.map((tq) => (
                    <View key={tq.tier.id} style={styles.summaryRow}>
                      <Text style={styles.summaryItem}>
                        {tq.tier.name} × {tq.quantity}
                      </Text>
                      <Text style={styles.summaryAmount}>
                        {formatMinorAmount(tq.tier.price_minor * tq.quantity, currency)}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.summaryRow, styles.summaryDivider]}>
                    <Text style={styles.summaryItem}>Service Fee (5%)</Text>
                    <Text style={styles.summaryAmount}>{formatMinorAmount(customerFeeMinor, currency)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryItem, { fontWeight: Typography.bold, color: Colors.textPrimary }]}>
                      Customer Pays
                    </Text>
                    <Text style={[styles.summaryAmount, { color: Colors.gold, fontWeight: Typography.bold, fontSize: Typography.lg }]}>
                      {formatMinorAmount(customerTotalMinor, currency)}
                    </Text>
                  </View>

                  {/* Cash accounting note */}
                  {paymentMethod === 'door_cash' && (
                    <View style={styles.cashNote}>
                      <MaterialIcons name="account-balance-wallet" size={13} color={Colors.textMuted} />
                      <Text style={styles.cashNoteText}>
                        You collect {formatMinorAmount(customerTotalMinor, currency)} cash directly. Platform fee {formatMinorAmount(Math.round(baseSubtotalMinor * 10 / 100), currency)} is owed to Vybz Hub.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Sticky CTA ───────────────────────────────────────────────── */}
        {!loadingTiers && (
          <View style={[styles.ctaContainer, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.base) }]}>
            <Pressable
              onPress={paymentMethod === 'door_cash' ? handleCashSale : handleCardSale}
              disabled={!hasSelection || isSubmitting}
              style={({ pressed }) => [
                styles.ctaBtn,
                (!hasSelection || isSubmitting) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.ctaBtnInner}>
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.textOnGold} size="small" />
                ) : (
                  <>
                    <MaterialIcons
                      name={paymentMethod === 'door_cash' ? 'payments' : 'open-in-browser'}
                      size={20}
                      color={Colors.textOnGold}
                    />
                    <Text style={styles.ctaBtnText}>
                      {paymentMethod === 'door_cash'
                        ? `Confirm Cash Sale${hasSelection ? ` — ${formatMinorAmount(customerTotalMinor, currency)}` : ''}`
                        : `Open Card Checkout${hasSelection ? ` — ${formatMinorAmount(customerTotalMinor, currency)}` : ''}`}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            {!hasSelection && (
              <Text style={styles.ctaHint}>Select at least one ticket to continue</Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Success modal */}
      {successData && (
        <SaleSuccessModal
          visible={successVisible}
          orderNumber={successData.orderNumber}
          ticketsIssued={successData.ticketsIssued}
          currency={currency}
          totalMinor={successData.totalMinor}
          sellAndCheckin={successData.sellAndCheckin}
          checkinOk={successData.checkinOk}
          onClose={handleSuccessClose}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, padding: Spacing.xl },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  offlineTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,168,70,0.1)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(0,168,70,0.2)',
  },
  offlineTagText: { fontSize: 10, color: Colors.greenLight, fontWeight: Typography.semibold },

  scroll: { padding: Spacing.base, gap: Spacing.xl },

  section: { gap: Spacing.md },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  tierCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
  },
  tierName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  tierDesc: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  tierMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 2 },
  tierPrice: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  tierAvail: { fontSize: Typography.xs, color: Colors.textMuted },

  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  qtyValue: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, minWidth: 24, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: Spacing.md,
  },
  fieldGroup: { gap: Spacing.sm },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },

  paymentRow: { flexDirection: 'row', gap: Spacing.md },
  paymentBtn: {
    flex: 1, alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.base,
  },
  paymentBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  paymentBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary },
  paymentCurrencyTag: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(33,150,243,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.2)',
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.info, lineHeight: 17 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  switchLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  switchDesc: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryDivider: { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.md, marginTop: Spacing.sm },
  summaryItem: { fontSize: Typography.sm, color: Colors.textSecondary },
  summaryAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },

  cashNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cashNoteText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },

  emptyCard: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },

  ctaContainer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  ctaBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  ctaHint: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
});
