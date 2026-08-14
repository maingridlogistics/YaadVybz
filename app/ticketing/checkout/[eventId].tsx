// app/ticketing/checkout/[eventId].tsx
// Phase 3b — Customer ticket checkout.
//
// MOBILE:  Native Stripe PaymentSheet when NATIVE_TICKET_PAYMENTS_ENABLED=true.
//          Falls back to hosted Stripe Checkout Session (WebBrowser) when false.
// WEBSITE: Always hosted Stripe Checkout Session.
//
// CLIENT TOTALS ARE INFORMATIONAL ONLY.
// Server is authoritative for all pricing and ticket issuance.

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Animated,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StripeProvider } from '../../../lib/stripe';
import { useAuth } from '../../../hooks/useAuth';
import { useEventTicketingStatus, useTicketCheckout, useNativeTicketCheckout } from '../../../hooks/useCustomerTicketing';
import {
  formatMinorAmount,
  CUSTOMER_TICKET_TERMS_CONTENT,
  type PublicTicketTier,
} from '../../../services/customerTicketingService';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED, NATIVE_TICKET_PAYMENTS_ENABLED } from '../../../constants/featureFlags';
import { LEGAL_URLS } from '../../../constants/legalUrls';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

// ─── Tier Card ────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  quantity,
  onIncrement,
  onDecrement,
}: {
  tier: PublicTicketTier;
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const available = tier.available;
  const isSoldOut = available === 0;
  const canAdd = quantity < Math.min(tier.max_per_order, available);
  const canRemove = quantity > 0;

  return (
    <View style={tierStyles.card}>
      <View style={tierStyles.header}>
        <View style={{ flex: 1, gap: Spacing.xs }}>
          <Text style={tierStyles.name}>{tier.name}</Text>
          {tier.description ? (
            <Text style={tierStyles.description}>{tier.description}</Text>
          ) : null}
          <View style={tierStyles.metaRow}>
            <Text style={tierStyles.price}>
              {formatMinorAmount(tier.price_minor, tier.currency)}
            </Text>
            {isSoldOut ? (
              <View style={tierStyles.soldOutBadge}>
                <Text style={tierStyles.soldOutText}>Sold Out</Text>
              </View>
            ) : (
              <Text style={tierStyles.availability}>
                {available} remaining
              </Text>
            )}
          </View>
          <Text style={tierStyles.perOrder}>
            {tier.min_per_order}–{tier.max_per_order} per order
          </Text>
        </View>

        <View style={tierStyles.stepper}>
          <Pressable
            onPress={onDecrement}
            disabled={!canRemove}
            style={({ pressed }) => [
              tierStyles.stepBtn,
              !canRemove && tierStyles.stepBtnDisabled,
              pressed && canRemove && { opacity: 0.7 },
            ]}
            hitSlop={8}
          >
            <MaterialIcons name="remove" size={18} color={canRemove ? Colors.gold : Colors.textMuted} />
          </Pressable>
          <Text style={tierStyles.quantity}>{quantity}</Text>
          <Pressable
            onPress={onIncrement}
            disabled={!canAdd}
            style={({ pressed }) => [
              tierStyles.stepBtn,
              !canAdd && tierStyles.stepBtnDisabled,
              pressed && canAdd && { opacity: 0.7 },
            ]}
            hitSlop={8}
          >
            <MaterialIcons name="add" size={18} color={canAdd ? Colors.gold : Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {quantity > 0 && (
        <View style={tierStyles.subtotalRow}>
          <Text style={tierStyles.subtotalLabel}>Subtotal ({quantity}×)</Text>
          <Text style={tierStyles.subtotalValue}>
            {formatMinorAmount(tier.price_minor * quantity, tier.currency)}
          </Text>
        </View>
      )}
    </View>
  );
}

const tierStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  name: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  description: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  price: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.gold },
  availability: { fontSize: Typography.xs, color: Colors.textMuted },
  perOrder: { fontSize: Typography.xs, color: Colors.textMuted },
  soldOutBadge: {
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.3)',
  },
  soldOutText: { fontSize: Typography.xs, color: Colors.error, fontWeight: Typography.semibold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 0 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  stepBtnDisabled: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.surfaceBorder },
  quantity: {
    fontSize: Typography.lg, fontWeight: Typography.black,
    color: Colors.textPrimary, minWidth: 28, textAlign: 'center',
  },
  subtotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  subtotalLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  subtotalValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
});

// ─── Terms Modal ──────────────────────────────────────────────────────────────

function CustomerTermsModal({
  visible,
  onAccept,
  onClose,
  accepting,
}: {
  visible: boolean;
  onAccept: () => void;
  onClose: () => void;
  accepting: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[
          termsModalStyles.sheet,
          { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) },
        ]}>
          <View style={termsModalStyles.handle} />
          <Text style={termsModalStyles.title}>Ticket Purchase Terms</Text>
          <Text style={[termsModalStyles.sub, { color: '#FF9800' }]}>
            PLACEHOLDER — Replace with attorney-approved legal copy before launch.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
            {CUSTOMER_TICKET_TERMS_CONTENT.map((s, i) => (
              <View key={i} style={{ marginBottom: Spacing.md }}>
                <Text style={termsModalStyles.termHead}>{s.heading}</Text>
                <Text style={termsModalStyles.termBody}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={onAccept}
            disabled={accepting}
            style={({ pressed }) => [termsModalStyles.acceptBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={termsModalStyles.acceptBtnInner}
            >
              {accepting
                ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                : <>
                  <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
                  <Text style={termsModalStyles.acceptBtnText}>I Agree &amp; Continue</Text>
                </>}
            </LinearGradient>
          </Pressable>
          <View style={termsLinkRow.row}>
            <Pressable onPress={() => Linking.openURL(LEGAL_URLS.ticketTerms)} hitSlop={8}>
              <Text style={termsLinkRow.link}>Full Ticket Terms</Text>
            </Pressable>
            <Text style={termsLinkRow.sep}>·</Text>
            <Pressable onPress={() => Linking.openURL(LEGAL_URLS.refundPolicy)} hitSlop={8}>
              <Text style={termsLinkRow.link}>Refund Policy</Text>
            </Pressable>
            <Text style={termsLinkRow.sep}>·</Text>
            <Pressable onPress={() => Linking.openURL(LEGAL_URLS.transferPolicy)} hitSlop={8}>
              <Text style={termsLinkRow.link}>Transfer Policy</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: Spacing.sm }, pressed && { opacity: 0.7 }]}
          >
            <Text style={{ color: Colors.textMuted, fontSize: Typography.base, textDecorationLine: 'underline' }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const termsLinkRow = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
  link: { fontSize: 11, color: Colors.gold, textDecorationLine: 'underline' },
  sep: { fontSize: 11, color: Colors.textMuted },
});

const termsModalStyles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  sub: { fontSize: Typography.sm },
  termHead: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  termBody: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  acceptBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  acceptBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  acceptBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Inner screen (consumes hooks) ───────────────────────────────────────────

function CheckoutScreenInner({
  eventId,
  eventTitle,
  eventDate,
  useNative,
}: {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  useNative: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { status, loading: statusLoading, error: statusError, reload } = useEventTicketingStatus(
    eventId,
    eventDate,
  );

  // Native PaymentSheet hook (used when NATIVE_TICKET_PAYMENTS_ENABLED && mobile)
  const native = useNativeTicketCheckout(eventId, user?.id ?? '');

  // Hosted Checkout Session hook (fallback)
  const hosted = useTicketCheckout(eventId, user?.id ?? '');

  // Shared state depending on path
  const quantities    = useNative ? native.quantities    : hosted.quantities;
  const setQuantity   = useNative ? native.setQuantity   : hosted.setQuantity;
  const totalItems    = useNative ? native.totalItems    : hosted.totalItems;
  const termsAccepted = useNative ? native.termsAccepted : hosted.termsAccepted;
  const termsLoading  = useNative ? native.termsLoading  : hosted.termsLoading;
  const acceptTerms   = useNative ? native.acceptTerms   : hosted.acceptTerms;

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('');

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  const baseTotalMinor = status?.tiers.reduce((sum, tier) => {
    const qty = quantities[tier.id] ?? 0;
    return sum + tier.price_minor * qty;
  }, 0) ?? 0;
  const displayFeeMinor   = Math.round(baseTotalMinor * 5 / 100);
  const displayTotalMinor = baseTotalMinor + displayFeeMinor;
  const currency          = status?.currency ?? 'USD';

  // ── Native PaymentSheet flow ──────────────────────────────────────────────
  const handleNativeCheckout = async () => {
    if (totalItems === 0) { triggerToast('Please select at least one ticket.'); return; }
    setCheckoutError(null);

    if (!termsAccepted) { setShowTermsModal(true); return; }
    await proceedNative();
  };

  const proceedNative = async () => {
    const result = await native.startCheckout();
    if (result.status === 'succeeded') {
      router.replace({
        pathname: '/ticketing/order/[orderId]',
        params: { orderId: result.order_id ?? '' },
      } as any);
    } else if (result.status === 'cancelled') {
      // User dismissed — no error shown, reservation expires naturally
    } else if (result.status === 'failed') {
      setCheckoutError(result.error ?? 'Payment was not completed. Please try again.');
    }
  };

  const handleAcceptTermsNative = async () => {
    setAcceptingTerms(true);
    const ok = await acceptTerms();
    setAcceptingTerms(false);
    if (ok) {
      setShowTermsModal(false);
      await proceedNative();
    } else {
      setCheckoutError('Could not record terms acceptance. Please try again.');
    }
  };

  // ── Hosted Checkout Session flow ──────────────────────────────────────────
  const handleHostedCheckout = async () => {
    if (totalItems === 0) { triggerToast('Please select at least one ticket.'); return; }
    setCheckoutError(null);
    if (!termsAccepted) { setShowTermsModal(true); return; }
    await proceedHosted();
  };

  const proceedHosted = async () => {
    const res = await hosted.checkout();
    if (!res.ok) {
      setCheckoutError(res.error ?? 'Checkout failed. Please try again.');
      return;
    }
    if (res.checkout_url) {
      const result = await WebBrowser.openAuthSessionAsync(res.checkout_url, 'vybzhub://ticket-success');
      if (result.type === 'success') {
        router.replace({
          pathname: '/ticketing/order/[orderId]',
          params: { orderId: res.order_id ?? '' },
        } as any);
      } else {
        setCheckoutError('Checkout was cancelled. Your reservation will expire in 33 minutes.');
      }
    }
  };

  const handleAcceptTermsHosted = async () => {
    setAcceptingTerms(true);
    const ok = await acceptTerms();
    setAcceptingTerms(false);
    if (ok) {
      setShowTermsModal(false);
      await proceedHosted();
    } else {
      setCheckoutError('Could not record terms acceptance. Please try again.');
    }
  };

  const handleCheckout   = useNative ? handleNativeCheckout   : handleHostedCheckout;
  const handleAcceptTerms = useNative ? handleAcceptTermsNative : handleAcceptTermsHosted;
  const isCheckingOut    = useNative ? native.isLoading : hosted.checkingOut;

  return (
    <View style={styles.container}>
      {/* Toast */}
      <Animated.View
        style={[styles.toast, { opacity: toastOpacity, top: insets.top + Spacing.md }]}
        pointerEvents="none"
      >
        <MaterialIcons name="info" size={16} color={Colors.textOnGold} />
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

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
            <Text style={styles.headerTitle}>Buy Tickets</Text>
            {eventTitle ? <Text style={styles.headerSub} numberOfLines={1}>{eventTitle}</Text> : null}
          </View>
        </View>
      </SafeAreaView>

      {/* Body */}
      {statusLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : statusError ? (
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Failed to load tickets</Text>
          <Text style={styles.centeredSub}>{statusError}</Text>
          <Pressable onPress={reload} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : !status?.enabled || status.tiers.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="confirmation-number" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>No tickets available</Text>
          <Text style={styles.centeredSub}>Check back later for ticket information.</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(220, insets.bottom + 200) },
            ]}
          >
            {/* Tiers */}
            <Text style={styles.sectionTitle}>Select Tickets</Text>
            <View style={styles.tiersWrap}>
              {status.tiers.map((tier) => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  quantity={quantities[tier.id] ?? 0}
                  onIncrement={() => setQuantity(tier.id, Math.min((quantities[tier.id] ?? 0) + 1, Math.min(tier.max_per_order, tier.available)))}
                  onDecrement={() => setQuantity(tier.id, Math.max(0, (quantities[tier.id] ?? 0) - 1))}
                />
              ))}
            </View>

            {/* Price breakdown */}
            {totalItems > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Order Summary</Text>
                <Text style={styles.summaryDisclaimer}>
                  Prices shown are estimated. Final amounts are confirmed server-side at checkout.
                </Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal ({totalItems} ticket{totalItems !== 1 ? 's' : ''})</Text>
                  <Text style={styles.summaryValue}>{formatMinorAmount(baseTotalMinor, currency)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Service fee (5%)</Text>
                  <Text style={styles.summaryValue}>{formatMinorAmount(displayFeeMinor, currency)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotal]}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalValue}>{formatMinorAmount(displayTotalMinor, currency)}</Text>
                </View>
              </View>
            )}

            {/* Terms status */}
            {!termsLoading && (
              <Pressable
                onPress={() => !termsAccepted && setShowTermsModal(true)}
                style={({ pressed }) => [
                  styles.termsRow,
                  termsAccepted && styles.termsRowAccepted,
                  pressed && !termsAccepted && { opacity: 0.8 },
                ]}
              >
                <MaterialIcons
                  name={termsAccepted ? 'check-circle' : 'gavel'}
                  size={16}
                  color={termsAccepted ? Colors.greenLight : Colors.textMuted}
                />
                <Text style={[styles.termsText, termsAccepted && styles.termsTextAccepted]}>
                  {termsAccepted ? 'Ticket terms accepted' : 'Review and accept ticket terms'}
                </Text>
                {!termsAccepted && (
                  <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                )}
              </Pressable>
            )}

            {/* Error */}
            {checkoutError ? (
              <View style={styles.errorCard}>
                <MaterialIcons name="error-outline" size={16} color={Colors.error} />
                <Text style={styles.errorText}>{checkoutError}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Sticky checkout bar */}
          <View style={[styles.checkoutBar, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.md) }]}>
            {totalItems > 0 && (
              <View style={styles.checkoutBarTotal}>
                <Text style={styles.checkoutBarTotalLabel}>Total</Text>
                <Text style={styles.checkoutBarTotalValue}>{formatMinorAmount(displayTotalMinor, currency)}</Text>
              </View>
            )}
            <Pressable
              onPress={handleCheckout}
              disabled={isCheckingOut || totalItems === 0}
              style={({ pressed }) => [
                styles.checkoutBtn,
                (isCheckingOut || totalItems === 0) && styles.checkoutBtnDisabled,
                pressed && totalItems > 0 && !isCheckingOut && { opacity: 0.88 },
              ]}
            >
              {isCheckingOut ? (
                <ActivityIndicator color={Colors.textOnGold} size="small" />
              ) : (
                <>
                  <MaterialIcons
                    name="lock"
                    size={16}
                    color={totalItems > 0 ? Colors.textOnGold : Colors.textMuted}
                  />
                  <Text style={[styles.checkoutBtnText, totalItems === 0 && styles.checkoutBtnTextDisabled]}>
                    {totalItems === 0
                      ? 'Select Tickets'
                      : `Continue to Payment — ${totalItems} ticket${totalItems !== 1 ? 's' : ''}`}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </>
      )}

      {/* Terms modal */}
      <CustomerTermsModal
        visible={showTermsModal}
        onAccept={handleAcceptTerms}
        onClose={() => setShowTermsModal(false)}
        accepting={acceptingTerms}
      />
    </View>
  );
}

// ─── Root screen — wraps with StripeProvider on mobile native path ─────────────

export default function TicketCheckoutScreen() {
  const router = useRouter();
  const { eventId, title: rawTitle, date: rawDate } =
    useLocalSearchParams<{ eventId: string; title?: string; date?: string }>();

  const eventTitle = rawTitle ? decodeURIComponent(rawTitle) : '';
  const eventDate  = rawDate ?? '';

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Determine whether to use native PaymentSheet:
  //   - Feature flag must be enabled
  //   - Must be a native (non-web) platform
  const useNative = NATIVE_TICKET_PAYMENTS_ENABLED && Platform.OS !== 'web';

  const inner = (
    <CheckoutScreenInner
      eventId={eventId ?? ''}
      eventTitle={eventTitle}
      eventDate={eventDate}
      useNative={useNative}
    />
  );

  // Native path: wrap with StripeProvider so PaymentSheet can initialize.
  // The publishable key is client-safe — never the secret key.
  // Web/fallback path: no StripeProvider needed (hosted Checkout opens in browser).
  if (useNative && STRIPE_PUBLISHABLE_KEY) {
    return (
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="vybzhub">
        {inner}
      </StripeProvider>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  centeredTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  centeredSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center' },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },
  retryBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  retryBtnText: { color: Colors.gold, fontWeight: Typography.semibold, fontSize: Typography.sm },

  toast: {
    position: 'absolute', left: Spacing.base, right: Spacing.base, zIndex: 999,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  toastText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold, flex: 1 },

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
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  scrollContent: { padding: Spacing.base, gap: Spacing.lg },

  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  tiersWrap: { gap: Spacing.md },

  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.md,
  },
  summaryTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  summaryDisclaimer: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  summaryValue: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  summaryTotal: {
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, marginTop: Spacing.xs,
  },
  summaryTotalLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  summaryTotalValue: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.gold },

  termsRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  termsRowAccepted: { borderColor: `${Colors.greenLight}33`, backgroundColor: `${Colors.greenLight}08` },
  termsText: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted },
  termsTextAccepted: { color: Colors.greenLight },

  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  checkoutBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
    paddingTop: Spacing.md, paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 12,
  },
  checkoutBarTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xs },
  checkoutBarTotalLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  checkoutBarTotalValue: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.gold },
  checkoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingVertical: Spacing.base + 2,
    minHeight: 52,
  },
  checkoutBtnDisabled: { backgroundColor: Colors.surfaceElevated },
  checkoutBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  checkoutBtnTextDisabled: { color: Colors.textMuted },
});
