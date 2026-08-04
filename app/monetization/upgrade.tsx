import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  SubscriptionTier,
} from '../../constants/data';
import {
  createSubscriptionCheckout,
  createCustomerPortalSession,
  fetchSubscription,
  Subscription,
} from '../../services/subscriptionService';

type BillingCycle = 'monthly' | 'yearly';

// ─── Feature Row ──────────────────────────────────────────────────────────────
function FeatureRow({ text, included }: { text: string; included: boolean }) {
  return (
    <View style={featureStyles.row}>
      <MaterialIcons
        name={included ? 'check-circle' : 'lock'}
        size={14}
        color={included ? Colors.greenLight : Colors.textMuted}
      />
      <Text style={[featureStyles.text, !included && featureStyles.textMuted]}>
        {text}
      </Text>
    </View>
  );
}

function ComingSoonRow({ text }: { text: string }) {
  return (
    <View style={featureStyles.comingSoonRow}>
      <MaterialIcons name="lock" size={14} color={Colors.textMuted} />
      <Text style={featureStyles.comingSoonText}>{text}</Text>
      <View style={featureStyles.soonBadge}>
        <Text style={featureStyles.soonText}>SOON</Text>
      </View>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  text: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  textMuted: { color: Colors.textMuted },
  comingSoonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, opacity: 0.5 },
  comingSoonText: { flex: 1, fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  soonBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.surfaceBorder },
  soonText: { fontSize: 9, color: Colors.textMuted, fontWeight: Typography.bold, letterSpacing: 0.5 },
});

// ─── Plan Card ────────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  billing,
  selected,
  current,
  onSelect,
}: {
  plan: SubscriptionPlan;
  billing: BillingCycle;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const monthlyPrice = billing === 'yearly'
    ? (plan.priceYearly / 12).toFixed(2)
    : plan.priceMonthly.toFixed(2);
  const isFree = plan.tier === 'free';
  const yearlyTotal = plan.priceYearly.toFixed(2);
  const monthlySavings = plan.priceMonthly > 0
    ? Math.round(100 - (plan.priceYearly / (plan.priceMonthly * 12)) * 100)
    : 0;

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        cardStyles.card,
        selected && { borderColor: plan.color, borderWidth: 2 },
        pressed && { opacity: 0.93 },
      ]}
    >
      {selected && (
        <LinearGradient
          colors={[`${plan.color}12`, `${plan.color}04`]}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Header */}
      <View style={cardStyles.header}>
        <View style={[cardStyles.iconBg, { backgroundColor: `${plan.color}20` }]}>
          <MaterialIcons name={plan.icon as any} size={20} color={plan.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={cardStyles.nameLine}>
            <Text style={cardStyles.name}>{plan.name}</Text>
            {plan.highlight && (
              <View style={[cardStyles.highlightBadge, { backgroundColor: plan.color }]}>
                <Text style={cardStyles.highlightText}>{plan.highlight}</Text>
              </View>
            )}
            {current && (
              <View style={cardStyles.currentBadge}>
                <MaterialIcons name="check" size={10} color={Colors.greenLight} />
                <Text style={cardStyles.currentText}>Active</Text>
              </View>
            )}
          </View>
          <Text style={cardStyles.tagline}>{plan.tagline}</Text>
        </View>
        <View style={cardStyles.priceCol}>
          {isFree ? (
            <Text style={[cardStyles.price, { color: plan.color }]}>Free</Text>
          ) : (
            <>
              <Text style={[cardStyles.price, { color: plan.color }]}>${monthlyPrice}</Text>
              <Text style={cardStyles.pricePer}>/mo</Text>
              {billing === 'yearly' && (
                <Text style={cardStyles.priceYearly}>${yearlyTotal}/yr</Text>
              )}
            </>
          )}
        </View>
      </View>

      {/* Features */}
      <View style={cardStyles.features}>
        {plan.features.map((f) => (
          <FeatureRow key={f} text={f} included={true} />
        ))}
        {plan.comingSoonFeatures?.map((f) => (
          <ComingSoonRow key={f} text={f} />
        ))}
      </View>

      {/* Selection indicator */}
      <View style={[cardStyles.selectRow, selected && { borderTopColor: `${plan.color}33` }]}>
        <View style={[cardStyles.radio, selected && { borderColor: plan.color }]}>
          {selected && <View style={[cardStyles.radioDot, { backgroundColor: plan.color }]} />}
        </View>
        <Text style={[cardStyles.selectText, selected && { color: plan.color }]}>
          {current ? 'Your current plan' : selected ? 'Selected' : 'Select plan'}
        </Text>
        {billing === 'yearly' && !isFree && (
          <View style={cardStyles.savingsBadge}>
            <Text style={cardStyles.savingsText}>Save {monthlySavings}%</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    padding: Spacing.base, paddingBottom: Spacing.sm,
  },
  iconBg: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  name: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  highlightBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  highlightText: { fontSize: 9, fontWeight: Typography.bold, color: '#fff' },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${Colors.greenLight}18`, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  currentText: { fontSize: 9, color: Colors.greenLight, fontWeight: Typography.bold },
  tagline: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  priceCol: { alignItems: 'flex-end', flexShrink: 0 },
  price: { fontSize: 20, fontWeight: Typography.black, lineHeight: 24 },
  pricePer: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: -2 },
  priceYearly: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  features: {
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.md,
    gap: 0,
  },
  selectRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  selectText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  savingsBadge: { backgroundColor: `${Colors.greenLight}18`, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  savingsText: { fontSize: 10, color: Colors.greenLight, fontWeight: Typography.bold },
});

// ─── Manage Subscription Card ─────────────────────────────────────────────────
function ManageCard({
  subscription,
  onManage,
  isLoading,
}: {
  subscription: Subscription;
  onManage: () => void;
  isLoading: boolean;
}) {
  const planName = subscription.plan === 'elite' ? 'Elite' : 'Promoter Pro';
  const planColor = subscription.plan === 'elite' ? '#E91E63' : Colors.gold;
  const nextRenewal = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const isCanceling = subscription.cancelAtPeriodEnd;

  const statusColors: Record<string, string> = {
    active: Colors.greenLight,
    trialing: Colors.gold,
    past_due: '#FF9800',
    canceled: Colors.textMuted,
    unpaid: '#FF6B6B',
  };
  const statusColor = statusColors[subscription.status] ?? Colors.textMuted;

  return (
    <View style={manageStyles.card}>
      <LinearGradient colors={[`${planColor}12`, `${planColor}04`]} style={StyleSheet.absoluteFillObject} />
      <View style={manageStyles.top}>
        <View style={[manageStyles.iconWrap, { backgroundColor: `${planColor}22` }]}>
          <MaterialIcons name="workspace-premium" size={22} color={planColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={manageStyles.planName}>{planName}</Text>
          <View style={manageStyles.statusRow}>
            <View style={[manageStyles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[manageStyles.statusText, { color: statusColor }]}>
              {isCanceling ? 'Cancels at period end' : subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
            </Text>
          </View>
        </View>
        <View style={manageStyles.cycleTag}>
          <Text style={manageStyles.cycleText}>{subscription.billingCycle}</Text>
        </View>
      </View>
      {nextRenewal && (
        <View style={manageStyles.renewalRow}>
          <MaterialIcons name="autorenew" size={13} color={Colors.textMuted} />
          <Text style={manageStyles.renewalText}>
            {isCanceling ? `Access until ${nextRenewal}` : `Renews ${nextRenewal}`}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onManage}
        disabled={isLoading}
        style={({ pressed }) => [manageStyles.btn, pressed && { opacity: 0.8 }, isLoading && { opacity: 0.6 }]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.textOnGold} />
        ) : (
          <MaterialIcons name="open-in-new" size={16} color={Colors.textOnGold} />
        )}
        <Text style={manageStyles.btnText}>
          {isLoading ? 'Opening...' : 'Manage Subscription'}
        </Text>
      </Pressable>
      <Text style={manageStyles.portalNote}>
        Upgrade, downgrade, cancel, or update payment method via Stripe portal
      </Text>
    </View>
  );
}

const manageStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', padding: Spacing.base, gap: Spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  cycleTag: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cycleText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium, textTransform: 'capitalize' },
  renewalRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  renewalText: { fontSize: Typography.xs, color: Colors.textMuted },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: Spacing.md,
  },
  btnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  portalNote: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
});

// ─── Post-Checkout Return Banner ──────────────────────────────────────────────
function ProcessingBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View style={processingStyles.banner}>
      <MaterialIcons name="hourglass-empty" size={20} color={Colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={processingStyles.title}>Subscription being activated…</Text>
        <Text style={processingStyles.sub}>Your plan will update within a few seconds once Stripe confirms the payment.</Text>
      </View>
      <Pressable onPress={onRefresh} style={({ pressed }) => [processingStyles.refreshBtn, pressed && { opacity: 0.7 }]}>
        <MaterialIcons name="refresh" size={18} color={Colors.gold} />
      </Pressable>
    </View>
  );
}

const processingStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  sub: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 16, marginTop: 2 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33` },
});

// ─── Main Upgrade Screen ──────────────────────────────────────────────────────
export default function UpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile, subscriptionStatus } = useAuth();

  const currentTier: SubscriptionTier = user?.subscriptionTier ?? 'free';
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(currentTier);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoadingSub, setIsLoadingSub] = useState(true);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [checkoutReturned, setCheckoutReturned] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the app is waiting for a deep-link return from Stripe / Portal.
  // Set true before opening WebBrowser; Linking listener clears it and cancels the
  // 3s fallback timer if the URL arrives first.
  const awaitingReturnRef = useRef(false);

  // Load subscription details
  useEffect(() => {
    fetchSubscription()
      .then((sub) => setSubscription(sub))
      .finally(() => setIsLoadingSub(false));
  }, [user?.subscriptionTier]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, []);

  // ── Deep link listener — instant refresh when Stripe redirects back ─────────
  // success_url  → onspaceapp://subscription-success?session_id=…
  // cancel_url   → onspaceapp://subscription-cancel
  // portal return → onspaceapp://auth  (shared app scheme root)
  // When the URL fires before the 3s fallback timer, the timer is cancelled and
  // a profile + subscription refresh happens immediately.
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!awaitingReturnRef.current) return;
      const isReturn =
        url.startsWith('onspaceapp://subscription') ||
        url.startsWith('onspaceapp://auth');
      if (!isReturn) return;

      awaitingReturnRef.current = false;
      // Cancel 3s fallback — deep link arrived first
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }

      if (url.startsWith('onspaceapp://subscription-cancel')) {
        // User cancelled checkout — clear the banner without refreshing
        setCheckoutReturned(false);
        return;
      }

      // Success or portal return — refresh immediately
      setCheckoutReturned(true);
      refreshProfile().then(async () => {
        const sub = await fetchSubscription();
        setSubscription(sub);
        setCheckoutReturned(false);
      });
    };

    const linkingSub = Linking.addEventListener('url', handleUrl);
    return () => linkingSub.remove();
  }, [refreshProfile]);

  const hasActivePaidSub = subscription !== null
    && ['active', 'trialing', 'past_due'].includes(subscription.status)
    && subscription.plan !== 'free';

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier) ?? null;
  const selectedPlanIsCurrentTier = selectedTier === currentTier;

  // ── Open Customer Portal ──────────────────────────────────────────────────
  const handleManageSubscription = useCallback(async () => {
    setIsLoadingPortal(true);
    try {
      const { url, error } = await createCustomerPortalSession();
      if (error) {
        Alert.alert('Error', error);
        return;
      }
      if (url) {
        awaitingReturnRef.current = true;
        await WebBrowser.openBrowserAsync(url);
        // Start 3s fallback only if the deep-link listener has not already
        // handled the return (it clears awaitingReturnRef when it fires).
        if (awaitingReturnRef.current) {
          awaitingReturnRef.current = false;
          setCheckoutReturned(true);
          refreshTimer.current = setTimeout(async () => {
            await refreshProfile();
            const sub = await fetchSubscription();
            setSubscription(sub);
            setCheckoutReturned(false);
          }, 3000);
        }
      }
    } finally {
      setIsLoadingPortal(false);
    }
  }, [refreshProfile]);

  // ── Subscribe ────────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    if (!selectedTier || selectedTier === 'free') {
      if (hasActivePaidSub) {
        handleManageSubscription();
      } else {
        Alert.alert('Free Plan', 'You are already on the free plan.');
      }
      return;
    }

    if (selectedPlanIsCurrentTier && !hasActivePaidSub) {
      return; // Nothing to do
    }

    setIsLoadingCheckout(true);
    try {
      const { url, redirectToPortal, error } = await createSubscriptionCheckout(
        selectedTier as 'pro' | 'elite',
        billing
      );

      if (error) {
        Alert.alert('Checkout Error', error);
        return;
      }

      if (redirectToPortal) {
        // Has active subscription — use portal for plan changes
        await handleManageSubscription();
        return;
      }

      if (url) {
        awaitingReturnRef.current = true;
        await WebBrowser.openBrowserAsync(url);
        // Start 3s fallback only if the deep-link listener has not already
        // handled the return (it clears awaitingReturnRef when it fires).
        if (awaitingReturnRef.current) {
          awaitingReturnRef.current = false;
          setCheckoutReturned(true);
          refreshTimer.current = setTimeout(async () => {
            await refreshProfile();
            const sub = await fetchSubscription();
            setSubscription(sub);
            setCheckoutReturned(false);
          }, 3000);
        }
      }
    } finally {
      setIsLoadingCheckout(false);
    }
  }, [selectedTier, billing, hasActivePaidSub, selectedPlanIsCurrentTier, handleManageSubscription, refreshProfile]);

  // ── CTA label ────────────────────────────────────────────────────────────
  const getCtaLabel = () => {
    if (isLoadingCheckout) return 'Opening Stripe…';
    if (selectedTier === 'free') return hasActivePaidSub ? 'Manage Subscription' : 'Current Plan';
    if (selectedPlanIsCurrentTier && hasActivePaidSub) return 'Manage Subscription';
    if (selectedPlanIsCurrentTier) return 'Current Plan';
    if (hasActivePaidSub) return `Switch to ${selectedPlan?.name ?? ''}`;
    return `Subscribe to ${selectedPlan?.name ?? ''}`;
  };

  const ctaDisabled = (selectedPlanIsCurrentTier && !hasActivePaidSub && selectedTier === 'free') || isLoadingCheckout;

  const monthlySavingsLabel = selectedPlan && selectedPlan.priceMonthly > 0
    ? `$${((selectedPlan.priceMonthly * 12) - selectedPlan.priceYearly).toFixed(0)} saved/yr`
    : null;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Choose Your Plan</Text>
            <Text style={styles.topBarSub}>
              {hasActivePaidSub
                ? `Currently on ${currentTier === 'elite' ? 'Elite' : 'Promoter Pro'}`
                : 'Free plan · Upgrade anytime'}
            </Text>
          </View>
          {hasActivePaidSub && user?.verifiedPromoter && (
            <View style={styles.verifiedTag}>
              <MaterialIcons name="verified" size={14} color={Colors.gold} />
              <Text style={styles.verifiedTagText}>Verified</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Processing banner shown after returning from Stripe */}
        {checkoutReturned && (
          <ProcessingBanner onRefresh={async () => {
            await refreshProfile();
            const sub = await fetchSubscription();
            setSubscription(sub);
            setCheckoutReturned(false);
          }} />
        )}

        {/* Manage subscription card for existing subscribers */}
        {!isLoadingSub && hasActivePaidSub && subscription && (
          <ManageCard
            subscription={subscription}
            onManage={handleManageSubscription}
            isLoading={isLoadingPortal}
          />
        )}

        {/* Billing toggle */}
        <View style={styles.billingToggle}>
          {(['monthly', 'yearly'] as const).map((cycle) => (
            <Pressable
              key={cycle}
              onPress={() => setBilling(cycle)}
              style={[styles.billingBtn, billing === cycle && styles.billingBtnActive]}
            >
              <Text style={[styles.billingText, billing === cycle && styles.billingTextActive]}>
                {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
              </Text>
              {cycle === 'yearly' && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>25% off</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Yearly savings indicator */}
        {billing === 'yearly' && monthlySavingsLabel && selectedTier !== 'free' && (
          <View style={styles.savingsCallout}>
            <MaterialIcons name="savings" size={14} color={Colors.greenLight} />
            <Text style={styles.savingsCalloutText}>
              {monthlySavingsLabel} compared to monthly billing
            </Text>
          </View>
        )}

        {/* Plan cards */}
        {SUBSCRIPTION_PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billing={billing}
            selected={selectedTier === plan.tier}
            current={currentTier === plan.tier}
            onSelect={() => setSelectedTier(plan.tier)}
          />
        ))}

        {/* Boost credits info */}
        {user && (user.remainingBoosts ?? 0) > 0 && (
          <View style={styles.boostCreditsRow}>
            <MaterialIcons name="rocket-launch" size={14} color={Colors.gold} />
            <Text style={styles.boostCreditsText}>
              You have {user.remainingBoosts} free boost credit{(user.remainingBoosts ?? 0) !== 1 ? 's' : ''} remaining this month
            </Text>
          </View>
        )}

        {/* Security note */}
        <View style={styles.secureRow}>
          <MaterialIcons name="lock" size={13} color={Colors.textMuted} />
          <Text style={styles.secureText}>
            Secure payments by Stripe · Cancel anytime · Plans activate instantly
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.stickyInfo}>
          <Text style={styles.stickyPlan}>{selectedPlan?.name ?? ''}</Text>
          {selectedTier !== 'free' && (
            <Text style={styles.stickyPrice}>
              {billing === 'yearly'
                ? `$${((selectedPlan?.priceYearly ?? 0) / 12).toFixed(2)}/mo · $${(selectedPlan?.priceYearly ?? 0).toFixed(2)}/yr`
                : `$${(selectedPlan?.priceMonthly ?? 0).toFixed(2)}/mo`}
            </Text>
          )}
        </View>
        <Pressable
          onPress={handleSubscribe}
          disabled={ctaDisabled}
          style={({ pressed }) => [
            styles.ctaBtn,
            ctaDisabled && { opacity: 0.45 },
            pressed && !ctaDisabled && { opacity: 0.85 },
          ]}
        >
          <LinearGradient
            colors={selectedTier === 'elite' ? ['#E91E63', '#AD1457'] : [Colors.gold, Colors.goldDim]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaBtnInner}
          >
            {isLoadingCheckout ? (
              <ActivityIndicator size="small" color={Colors.textOnGold} />
            ) : (
              <MaterialIcons
                name={selectedTier === 'free' ? 'check' : 'rocket-launch'}
                size={16}
                color={Colors.textOnGold}
              />
            )}
            <Text style={styles.ctaBtnText}>{getCtaLabel()}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  verifiedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  verifiedTagText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  content: { padding: Spacing.base, gap: Spacing.md },

  billingToggle: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 3,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  billingBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: 10, borderRadius: Radius.sm,
  },
  billingBtnActive: { backgroundColor: Colors.gold },
  billingText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  billingTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  saveBadge: { backgroundColor: Colors.greenLight, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  saveBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: '#fff' },

  savingsCallout: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: `${Colors.greenLight}12`, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderWidth: 1, borderColor: `${Colors.greenLight}30`,
  },
  savingsCalloutText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.semibold },

  boostCreditsRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  boostCreditsText: { flex: 1, fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  secureRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    justifyContent: 'center', paddingVertical: Spacing.sm,
  },
  secureText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  stickyBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  stickyInfo: { flex: 1 },
  stickyPlan: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  stickyPrice: { fontSize: Typography.xs, color: Colors.gold, marginTop: 2 },
  ctaBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  ctaBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
});
