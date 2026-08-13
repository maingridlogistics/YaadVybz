// app/ticketing/door/[eventId].tsx — Phase 5: Sell at Door
//
// Authorized users: event promoter, door_sales staff, manager staff.
// Scanner-only staff and customers cannot access this screen.
// All authorization is enforced server-side by door_sale_cash RPC and
// create-door-card-checkout Edge Function.
//
// Cash economics:
//   - Customer pays EXACTLY the configured tier price (0% service fee).
//   - Promoter/staff physically collects the full cash amount.
//   - No platform receivable is created on cash sales.
//   - Door CARD sales retain the 5% + 5% fee model (Stripe processes the payment).
//
// Security:
//   - Client never controls price, fees, currency, inventory, or sold_by.
//   - Idempotency key prevents duplicate cash orders on double-tap.
//   - Offline sales blocked (network connectivity required).
//   - TICKETING_ENABLED feature flag guards all routes.
//
// Anonymous walk-up support:
//   - All attendee contact fields (name, email, phone) are fully optional.
//   - Zero-detail sales are supported — order and tickets created with NULL buyer.
//   - Email validated before submit if provided; phone validated via PhoneInput.
//   - buyer_name / buyer_email / buyer_phone stored in ticket_orders for future delivery.

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
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../../hooks/useAuth';
import { useCashDoorSale, useCardDoorSale, useDoorOrderTickets, useRecentCashOrders, useVoidCashOrder } from '../../../hooks/useDoorSales';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { getSupabaseClient } from '../../../lib/supabase';
import { formatMinorAmount, type DoorOrderTicket, type RecentCashOrder } from '../../../services/doorSalesService';
import { PhoneInput, validatePhone, parseE164 } from '../../../components/ui/PhoneInput';
import type { PublicTicketTier } from '../../../services/customerTicketingService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = 'door_cash' | 'door_card';

interface TierQuantity {
  tier: PublicTicketTier;
  quantity: number;
}

// All contact fields are optional. Sale proceeds with all-null contact.
interface ContactForm {
  name: string;
  email: string;
  phone: string; // E.164 or empty string
  emailError: string | null;
  phoneError: string | null;
}

const EMPTY_CONTACT: ContactForm = {
  name: '', email: '', phone: '', emailError: null, phoneError: null,
};

// ─── Load event data ──────────────────────────────────────────────────────────

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

// ─── Anonymous Walk-up QR Display Modal ──────────────────────────────────────

function QRTicketModal({
  visible,
  tickets,
  eventTitle,
  onClose,
}: {
  visible: boolean;
  tickets: DoorOrderTicket[];
  eventTitle: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => { if (visible) setCurrentIdx(0); }, [visible]);

  const ticket = tickets[currentIdx];
  const hasMultiple = tickets.length > 1;

  if (!ticket) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={qrModalStyles.overlay}>
        <View style={[qrModalStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
          <View style={qrModalStyles.handle} />

          <View style={qrModalStyles.warningBanner}>
            <MaterialIcons name="warning" size={16} color={Colors.gold} />
            <Text style={qrModalStyles.warningText}>
              Make sure the customer has their ticket before closing.
            </Text>
          </View>

          <Text style={qrModalStyles.eventTitle} numberOfLines={1}>{eventTitle}</Text>

          {hasMultiple && (
            <View style={qrModalStyles.counterRow}>
              <Pressable
                onPress={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
                style={({ pressed }) => [qrModalStyles.counterBtn, currentIdx === 0 && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}
                hitSlop={8}
              >
                <MaterialIcons name="chevron-left" size={22} color={Colors.textPrimary} />
              </Pressable>
              <Text style={qrModalStyles.counterText}>
                Ticket {currentIdx + 1} of {tickets.length}
              </Text>
              <Pressable
                onPress={() => setCurrentIdx((i) => Math.min(tickets.length - 1, i + 1))}
                disabled={currentIdx === tickets.length - 1}
                style={({ pressed }) => [qrModalStyles.counterBtn, currentIdx === tickets.length - 1 && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}
                hitSlop={8}
              >
                <MaterialIcons name="chevron-right" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>
          )}

          <View style={qrModalStyles.qrWrap}>
            {ticket.secure_token ? (
              <QRCode
                value={ticket.secure_token}
                size={200}
                color="#0A0A0A"
                backgroundColor="#F8F8F0"
              />
            ) : (
              <View style={qrModalStyles.qrPlaceholder}>
                <MaterialIcons name="check-circle" size={48} color={Colors.greenLight} />
                <Text style={qrModalStyles.qrPlaceholderText}>Already checked in</Text>
              </View>
            )}
          </View>

          <View style={qrModalStyles.infoRow}>
            <MaterialIcons name="person" size={14} color={Colors.textMuted} />
            <Text style={qrModalStyles.infoText}>{ticket.attendee_name}</Text>
          </View>
          <View style={qrModalStyles.infoRow}>
            <MaterialIcons name="confirmation-number" size={14} color={Colors.gold} />
            <Text style={[qrModalStyles.infoText, { color: Colors.gold }]}>{ticket.ticket_type_name}</Text>
          </View>
          <Text style={qrModalStyles.tokenId}>{ticket.ticket_id.slice(0, 8).toUpperCase()}</Text>
          <Text style={qrModalStyles.hintText}>Show this QR code at the event entrance</Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [qrModalStyles.closeBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={qrModalStyles.closeBtnText}>Close Ticket Viewer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const qrModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
    alignItems: 'center', gap: Spacing.md, maxHeight: '92%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, marginBottom: Spacing.xs },
  warningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}44`,
    alignSelf: 'stretch',
  },
  warningText: { flex: 1, fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold, lineHeight: 18 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  counterBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  counterText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, minWidth: 110, textAlign: 'center' },
  qrWrap: { backgroundColor: '#F8F8F0', padding: 12, borderRadius: Radius.md },
  qrPlaceholder: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  qrPlaceholderText: { fontSize: Typography.sm, color: Colors.greenLight, fontWeight: Typography.semibold },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  infoText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  tokenId: { fontSize: 11, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 2, textTransform: 'uppercase' },
  hintText: { fontSize: Typography.xs, color: Colors.textMuted },
  closeBtn: {
    alignSelf: 'stretch', backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, paddingVertical: Spacing.base,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  closeBtnText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
});

// ─── Sale Success Modal ───────────────────────────────────────────────────────

function SaleSuccessModal({
  visible,
  orderNumber,
  ticketsIssued,
  currency,
  totalMinor,
  sellAndCheckin,
  checkinOk,
  isAnonymous,
  hasBuyerEmail,
  hasBuyerPhone,
  onViewTickets,
  onClose,
}: {
  visible: boolean;
  orderNumber: string;
  ticketsIssued: number;
  currency: string;
  totalMinor: number;
  sellAndCheckin: boolean;
  checkinOk: boolean;
  isAnonymous: boolean;
  hasBuyerEmail: boolean;
  hasBuyerPhone: boolean;
  onViewTickets: () => void;
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
                {checkinOk
                  ? 'Checked in successfully'
                  : 'Sale succeeded — check-in failed. Ticket is valid for normal scanning.'}
              </Text>
            </View>
          )}

          {/* Contact delivery status — informational only, not sent yet */}
          {hasBuyerEmail && (
            <View style={successStyles.contactNote}>
              <MaterialIcons name="mail-outline" size={14} color={Colors.textMuted} />
              <Text style={successStyles.contactNoteText}>Email saved for ticket delivery</Text>
            </View>
          )}
          {hasBuyerPhone && (
            <View style={successStyles.contactNote}>
              <MaterialIcons name="phone-iphone" size={14} color={Colors.textMuted} />
              <Text style={successStyles.contactNoteText}>Phone saved for WhatsApp ticket delivery</Text>
            </View>
          )}

          {/* QR button — always shown so staff can display QR to any walk-up */}
          <Pressable
            onPress={onViewTickets}
            style={({ pressed }) => [successStyles.viewTicketsBtn, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="qr-code-2" size={18} color={Colors.gold} />
            <Text style={successStyles.viewTicketsBtnText}>Show Customer QR Code</Text>
            <MaterialIcons name="chevron-right" size={16} color={Colors.gold} />
          </Pressable>

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
  contactNote: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'stretch',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  contactNoteText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  viewTicketsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}44`,
    alignSelf: 'stretch',
  },
  viewTicketsBtnText: { flex: 1, fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
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
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [showContactFields, setShowContactFields] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('door_cash');
  const [sellAndCheckin, setSellAndCheckin] = useState(false);

  // Success state
  const [successVisible, setSuccessVisible] = useState(false);
  const [successData, setSuccessData] = useState<{
    orderNumber: string;
    orderId: string;
    ticketsIssued: number;
    totalMinor: number;
    sellAndCheckin: boolean;
    checkinOk: boolean;
    isAnonymous: boolean;
    hasBuyerEmail: boolean;
    hasBuyerPhone: boolean;
  } | null>(null);

  // Card checkout pending state
  const [cardPendingVisible, setCardPendingVisible] = useState(false);
  const [cardPendingOrderId, setCardPendingOrderId] = useState<string | null>(null);

  // QR display state
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const doorOrderTickets = useDoorOrderTickets();

  // Recent sales + void
  const recentOrders = useRecentCashOrders(eventId ?? '');
  const voidHook = useVoidCashOrder();
  const [voidTarget, setVoidTarget] = useState<RecentCashOrder | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidModalVisible, setVoidModalVisible] = useState(false);

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
    setTierQuantities(result.tiers.map((t) => ({ tier: t, quantity: 0 })));
    if (result.error) setLoadError(result.error);
    setLoadingTiers(false);
  }, [eventId]);

  const { load: loadRecentOrders } = recentOrders;
  useEffect(() => { load(); loadRecentOrders(); }, [load, loadRecentOrders]);

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

  // ── Contact validation ──────────────────────────────────────────────────────
  const validateContact = (): boolean => {
    let emailError: string | null = null;
    let phoneError: string | null = null;

    if (contact.email.trim() && !isValidEmail(contact.email)) {
      emailError = 'Enter a valid email address or leave it blank.';
    }

    if (contact.phone) {
      const parsed = parseE164(contact.phone);
      if (!validatePhone(parsed.country, parsed.national)) {
        phoneError = 'Enter a valid phone number or leave it blank.';
      }
    }

    if (emailError || phoneError) {
      setContact((c) => ({ ...c, emailError, phoneError }));
      return false;
    }
    return true;
  };

  // ── Derived buyer fields ────────────────────────────────────────────────────
  const buyerName  = contact.name.trim() || null;
  const buyerEmail = contact.email.trim() ? contact.email.trim().toLowerCase() : null;
  const buyerPhone = contact.phone || null;
  const attendeeName = contact.name.trim() || 'Walk-up Customer';

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

  // UI-only preview amounts — server recalculates authoritatively.
  const baseSubtotalMinor = selectedItems.reduce(
    (sum, tq) => sum + tq.tier.price_minor * tq.quantity, 0,
  );
  const customerFeeMinor   = paymentMethod === 'door_cash' ? 0 : Math.round(baseSubtotalMinor * 5 / 100);
  const customerTotalMinor = baseSubtotalMinor + customerFeeMinor;

  // ── Cash sale ───────────────────────────────────────────────────────────────
  const handleCashSale = async () => {
    if (isSubmittingRef.current) return;
    if (!hasSelection) return;
    if (!validateContact()) return;

    isSubmittingRef.current = true;

    const result = await cashHook.submit({
      items: selectedItems.map((tq) => ({ ticket_type_id: tq.tier.id, quantity: tq.quantity })),
      attendeeName,
      sellAndCheckin,
      buyerName,
      buyerEmail,
      buyerPhone,
    });

    isSubmittingRef.current = false;

    if (result.ok) {
      setSuccessData({
        orderNumber:    result.order_number ?? '',
        orderId:        result.order_id ?? '',
        ticketsIssued:  result.tickets_issued ?? selectedItems.reduce((s, tq) => s + tq.quantity, 0),
        totalMinor:     result.customer_total_minor ?? baseSubtotalMinor,
        sellAndCheckin: result.sell_and_checkin ?? sellAndCheckin,
        checkinOk:      result.checkin_ok ?? true,
        isAnonymous:    !buyerName && !buyerEmail && !buyerPhone,
        hasBuyerEmail:  !!buyerEmail,
        hasBuyerPhone:  !!buyerPhone,
      });
      setSuccessVisible(true);
    }
  };

  // ── Card sale ───────────────────────────────────────────────────────────────
  const handleCardSale = async () => {
    if (isSubmittingRef.current) return;
    if (!hasSelection) return;
    if (!validateContact()) return;
    if (currency === 'JMD') { cardHook.clearError(); return; }

    isSubmittingRef.current = true;

    const result = await cardHook.createCheckout({
      eventId: eventId ?? '',
      items: selectedItems.map((tq) => ({ ticket_type_id: tq.tier.id, quantity: tq.quantity })),
      attendeeName,
      buyerName,
      buyerEmail,
      buyerPhone,
    });

    isSubmittingRef.current = false;

    if (result.ok && result.checkout_url) {
      Linking.openURL(result.checkout_url);
      setCardPendingOrderId(result.order_id ?? null);
      setCardPendingVisible(true);
    }
  };

  // ── View QR after sale ──────────────────────────────────────────────────────
  const handleViewTickets = async () => {
    if (!successData?.orderId) return;
    await doorOrderTickets.load(successData.orderId);
    setQrModalVisible(true);
  };

  // ── Reset helpers ───────────────────────────────────────────────────────────
  const resetForm = () => {
    setContact(EMPTY_CONTACT);
    setShowContactFields(false);
    setSellAndCheckin(false);
    setTierQuantities((prev) => prev.map((tq) => ({ ...tq, quantity: 0 })));
  };

  const handleCardPendingClose = () => {
    setCardPendingVisible(false);
    setCardPendingOrderId(null);
    resetForm();
    cardHook.clearError();
    load();
    recentOrders.load();
  };

  const handleSuccessClose = () => {
    setSuccessVisible(false);
    setSuccessData(null);
    resetForm();
    doorOrderTickets.clear();
    setQrModalVisible(false);
    load();
    recentOrders.load();
  };

  const handleVoidPress = (order: RecentCashOrder) => {
    setVoidTarget(order);
    setVoidReason('');
    setVoidModalVisible(true);
  };

  const handleVoidConfirm = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    const result = await voidHook.voidOrder(voidTarget.id, voidReason.trim());
    if (result.ok) {
      recentOrders.markVoided(voidTarget.id);
      setVoidModalVisible(false);
      setVoidTarget(null);
      setVoidReason('');
    }
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

            {/* ── Recent Sales + Void ─────────────────────────────── */}
            {recentOrders.orders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Sales</Text>
                <View style={styles.card}>
                  {recentOrders.orders.map((order, i) => {
                    const voided = !!order.voided_at;
                    return (
                      <View
                        key={order.id}
                        style={[
                          styles.recentOrderRow,
                          i > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
                          voided && { opacity: 0.45 },
                        ]}
                      >
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={styles.recentOrderNum}>#{order.order_number}</Text>
                          <Text style={styles.recentOrderName} numberOfLines={1}>
                            {order.attendee_name} · {order.tickets_count} ticket{order.tickets_count !== 1 ? 's' : ''}
                          </Text>
                          <Text style={styles.recentOrderMeta}>
                            {formatMinorAmount(order.customer_total_minor, order.currency)}
                            {order.has_checkin ? '  ·  checked in' : ''}
                          </Text>
                        </View>
                        {voided ? (
                          <View style={styles.voidedBadge}>
                            <Text style={styles.voidedBadgeText}>Voided</Text>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => handleVoidPress(order)}
                            style={({ pressed }) => [styles.voidBtn, pressed && { opacity: 0.7 }]}
                            hitSlop={8}
                          >
                            <MaterialIcons name="undo" size={14} color={Colors.error} />
                            <Text style={styles.voidBtnText}>Void</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Select Tickets ──────────────────────────────────── */}
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

            {/* ── Attendee Details ────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attendee Details</Text>
              <View style={styles.card}>

                {/* Name — optional */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Name{' '}
                    <Text style={styles.fieldOptional}>(Optional)</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={contact.name}
                    onChangeText={(v) => setContact((c) => ({ ...c, name: v }))}
                    placeholder="Walk-up Customer"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Attendee name (optional)"
                    maxLength={120}
                  />
                </View>

                {/* Toggle email + phone */}
                <Pressable
                  onPress={() => setShowContactFields((v) => !v)}
                  style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <MaterialIcons
                      name={showContactFields ? 'contact-mail' : 'add-circle-outline'}
                      size={16}
                      color={Colors.textMuted}
                    />
                    <Text style={styles.toggleLabel}>
                      {showContactFields ? 'Hide contact info' : 'Add email / phone (optional)'}
                    </Text>
                  </View>
                  <MaterialIcons
                    name={showContactFields ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </Pressable>

                {showContactFields && (
                  <>
                    {/* Email */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>
                        Email{' '}
                        <Text style={styles.fieldOptional}>(Optional)</Text>
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          contact.emailError ? styles.inputError : null,
                        ]}
                        value={contact.email}
                        onChangeText={(v) => setContact((c) => ({ ...c, email: v, emailError: null }))}
                        placeholder="customer@example.com"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        returnKeyType="next"
                        autoCorrect={false}
                        accessibilityLabel="Attendee email (optional)"
                      />
                      {contact.emailError ? (
                        <View style={styles.fieldErrorRow}>
                          <MaterialIcons name="error-outline" size={12} color={Colors.error} />
                          <Text style={styles.fieldErrorText}>{contact.emailError}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Phone */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>
                        Phone{' '}
                        <Text style={styles.fieldOptional}>(Optional)</Text>
                      </Text>
                      <PhoneInput
                        value={contact.phone}
                        onChange={(e164) => setContact((c) => ({ ...c, phone: e164, phoneError: null }))}
                        error={contact.phoneError ?? undefined}
                        placeholder="876 000 0000"
                      />
                      <View style={styles.phoneHintRow}>
                        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                        <Text style={styles.phoneHintText}>
                          Stored for future WhatsApp ticket delivery. Leave blank if not needed.
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* ── Payment Method ──────────────────────────────────── */}
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
                  <Text style={styles.paymentCurrencyTag}>
                    {currency === 'JMD' ? 'JMD ✓' : 'USD ✓'}
                  </Text>
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

              {currency === 'JMD' && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                  <Text style={styles.infoText}>
                    JMD card payments are not available yet. Cash sales are fully supported for JMD events.
                  </Text>
                </View>
              )}

              {paymentMethod === 'door_card' && currency !== 'JMD' && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                  <Text style={styles.infoText}>
                    A Stripe checkout link will open. Share it with the customer to complete card payment. Ticket is issued after verified payment.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Sell & Check In (cash only) ─────────────────────── */}
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

            {/* ── Order Summary ───────────────────────────────────── */}
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

                  {paymentMethod === 'door_card' && customerFeeMinor > 0 && (
                    <View style={[styles.summaryRow, styles.summaryDivider]}>
                      <Text style={styles.summaryItem}>Service Fee (5%)</Text>
                      <Text style={styles.summaryAmount}>{formatMinorAmount(customerFeeMinor, currency)}</Text>
                    </View>
                  )}

                  <View style={[styles.summaryRow, paymentMethod === 'door_cash' && styles.summaryDivider]}>
                    <Text style={[styles.summaryItem, { fontWeight: Typography.bold, color: Colors.textPrimary }]}>
                      {paymentMethod === 'door_cash' ? 'Customer Pays (Cash)' : 'Customer Pays'}
                    </Text>
                    <Text style={[styles.summaryAmount, { color: Colors.gold, fontWeight: Typography.bold, fontSize: Typography.lg }]}>
                      {formatMinorAmount(customerTotalMinor, currency)}
                    </Text>
                  </View>

                  {paymentMethod === 'door_cash' && (
                    <View style={styles.cashNote}>
                      <MaterialIcons name="account-balance-wallet" size={13} color={Colors.greenLight} />
                      <Text style={styles.cashNoteText}>
                        Cash sales have no platform fee. You collect {formatMinorAmount(customerTotalMinor, currency)} and keep it all.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Sticky CTA ─────────────────────────────────────────── */}
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

      {/* ── Void Confirmation Modal ─────────────────────────────────── */}
      <Modal
        visible={voidModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVoidModalVisible(false)}
      >
        <View style={voidModalStyles.overlay}>
          <View style={voidModalStyles.card}>
            <MaterialIcons name="warning" size={32} color={Colors.error} />
            <Text style={voidModalStyles.title}>Void Order</Text>
            <Text style={voidModalStyles.body}>
              Order #{voidTarget?.order_number}{' '}—{' '}
              {formatMinorAmount(voidTarget?.customer_total_minor ?? 0, voidTarget?.currency ?? 'USD')}
            </Text>
            {voidTarget?.has_checkin ? (
              <View style={voidModalStyles.blockedRow}>
                <MaterialIcons name="block" size={14} color={Colors.error} />
                <Text style={voidModalStyles.blockedText}>
                  Cannot void — a ticket from this order has already been checked in.
                </Text>
              </View>
            ) : (
              <>
                <Text style={voidModalStyles.label}>Reason for void</Text>
                <TextInput
                  style={voidModalStyles.input}
                  value={voidReason}
                  onChangeText={setVoidReason}
                  placeholder="e.g. Customer cancelled, wrong tier..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  multiline
                  numberOfLines={2}
                />
                {voidHook.error ? (
                  <Text style={voidModalStyles.errorText}>{voidHook.error}</Text>
                ) : null}
                <View style={voidModalStyles.btnRow}>
                  <Pressable
                    onPress={() => { setVoidModalVisible(false); voidHook.clearError(); }}
                    style={({ pressed }) => [voidModalStyles.cancelBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={voidModalStyles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleVoidConfirm}
                    disabled={!voidReason.trim() || voidHook.submitting}
                    style={({ pressed }) => [
                      voidModalStyles.confirmBtn,
                      (!voidReason.trim() || voidHook.submitting) && { opacity: 0.4 },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {voidHook.submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={voidModalStyles.confirmBtnText}>Void Order</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
            {voidTarget?.has_checkin && (
              <Pressable
                onPress={() => setVoidModalVisible(false)}
                style={({ pressed }) => [voidModalStyles.cancelBtn, { alignSelf: 'stretch', alignItems: 'center' }, pressed && { opacity: 0.7 }]}
              >
                <Text style={voidModalStyles.cancelBtnText}>Close</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Card Checkout Pending ───────────────────────────────────── */}
      <Modal
        visible={cardPendingVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCardPendingClose}
      >
        <View style={successStyles.overlay}>
          <View style={successStyles.card}>
            <View style={[successStyles.iconWrap, { backgroundColor: 'rgba(33,150,243,0.15)', borderRadius: 40, overflow: 'hidden' }]}>
              <View style={[successStyles.iconGrad, { backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }]}>
                <MaterialIcons name="open-in-browser" size={40} color={Colors.info} />
              </View>
            </View>
            <Text style={successStyles.title}>Card Checkout Opened</Text>
            <Text style={[successStyles.orderNum, { textAlign: 'center', lineHeight: 20, color: Colors.textSecondary, fontFamily: undefined, fontSize: Typography.sm }]}>
              The Stripe checkout page has been opened.{`\n`}Ticket is issued automatically once the customer completes payment.
            </Text>
            {cardPendingOrderId ? (
              <View style={[successStyles.row, { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md }]}>
                <MaterialIcons name="receipt" size={14} color={Colors.textMuted} />
                <Text style={[successStyles.rowLabel, { fontSize: Typography.xs }]}>Order ID</Text>
                <Text style={[successStyles.rowValue, { fontSize: Typography.xs, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                  {cardPendingOrderId.slice(0, 12).toUpperCase()}
                </Text>
              </View>
            ) : null}
            <View style={[successStyles.row, { gap: Spacing.sm, backgroundColor: 'rgba(33,150,243,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.2)' }]}>
              <MaterialIcons name="info-outline" size={14} color={Colors.info} />
              <Text style={[styles.infoText, { flex: 1 }]}>The ticket dashboard will update once payment is confirmed by Stripe.</Text>
            </View>
            <Pressable
              onPress={handleCardPendingClose}
              style={({ pressed }) => [successStyles.btn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={successStyles.btnInner}>
                <Text style={successStyles.btnText}>Done — New Sale</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Sale Success Modal ──────────────────────────────────────── */}
      {successData && (
        <SaleSuccessModal
          visible={successVisible}
          orderNumber={successData.orderNumber}
          ticketsIssued={successData.ticketsIssued}
          currency={currency}
          totalMinor={successData.totalMinor}
          sellAndCheckin={successData.sellAndCheckin}
          checkinOk={successData.checkinOk}
          isAnonymous={successData.isAnonymous}
          hasBuyerEmail={successData.hasBuyerEmail}
          hasBuyerPhone={successData.hasBuyerPhone}
          onViewTickets={handleViewTickets}
          onClose={handleSuccessClose}
        />
      )}

      {/* ── QR Viewer ─────────────────────────────────────────────── */}
      <QRTicketModal
        visible={qrModalVisible}
        tickets={doorOrderTickets.result?.tickets ?? []}
        eventTitle={eventTitle}
        onClose={() => setQrModalVisible(false)}
      />
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
  fieldOptional: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.regular ?? '400' },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  inputError: { borderColor: Colors.error },
  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldErrorText: { fontSize: Typography.xs, color: Colors.error, flex: 1 },
  phoneHintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  phoneHintText: { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 15 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: Typography.sm, color: Colors.textMuted },

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
    backgroundColor: 'rgba(0,168,70,0.06)', borderRadius: Radius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: 'rgba(0,168,70,0.2)',
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

  // ── Recent Sales ─────────────────────────────────────────────
  recentOrderRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  recentOrderNum: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  recentOrderName: { fontSize: Typography.xs, color: Colors.textSecondary },
  recentOrderMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  voidBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  voidBtnText: { fontSize: Typography.xs, color: Colors.error, fontWeight: Typography.semibold },
  voidedBadge: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  voidedBadgeText: { fontSize: Typography.xs, color: Colors.textMuted },
});

const voidModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xl, width: '100%', maxWidth: 360,
    alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  body: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center' },
  label: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary, alignSelf: 'stretch' },
  input: {
    alignSelf: 'stretch',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
    minHeight: 64, textAlignVertical: 'top',
  },
  errorText: { fontSize: Typography.sm, color: Colors.error, alignSelf: 'stretch' },
  blockedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
    alignSelf: 'stretch',
  },
  blockedText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: Spacing.md, alignSelf: 'stretch', marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.base, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelBtnText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
  confirmBtn: {
    flex: 1, paddingVertical: Spacing.base, borderRadius: Radius.md,
    backgroundColor: Colors.error, alignItems: 'center',
  },
  confirmBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },
});
