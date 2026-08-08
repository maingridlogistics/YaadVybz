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
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../hooks/useAuth';
import { useIAP } from '../../hooks/useIAP';
import { isAppleIAP, isGoogleIAP } from '../../constants/purchaseGate';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  SubscriptionTier,
  AppleSubscriptionProductId,
  GoogleSubscriptionProductId,
} from '../../constants/data';
import {
  createSubscriptionCheckout,
  createCustomerPortalSession,
  checkSubscriptionEligibility,
  SubscriptionEligibilityResponse,
} from '../../services/subscriptionService';

type BillingCycle = 'monthly' | 'yearly';

// ─── Provider display helpers ─────────────────────────────────────────────────
const PROVIDER_LABELS: Record<string, string> = {
  apple:  'Apple App Store',
  google: 'Google Play',
  stripe: 'Stripe (Web)',
  admin:  'Administrator',
};
const PROVIDER_ICONS: Record<string, string> = {
  apple:  'apple',
  google: 'android',
  stripe: 'credit-card',
  admin:  'admin-panel-settings',
};

// ─── Feature Row ──────────────────────────────────────────────────────────────
function FeatureRow({ text, included }: { text: string; included: boolean }) {
  return (
    <View style={featureStyles.row}>
      <MaterialIcons name={included ? 'check-circle' : 'lock'} size={14}
        color={included ? Colors.greenLight : Colors.textMuted} />
      <Text style={[featureStyles.text, !included && featureStyles.textMuted]}>{text}</Text>
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
  plan, billing, selected, current, onSelect, nativeLocalizedPrice, purchaseBlocked,
}: {
  plan: SubscriptionPlan;
  billing: BillingCycle;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
  nativeLocalizedPrice?: string | null;
  purchaseBlocked: boolean;
}) {
  const isFree = plan.tier === 'free';
  const monthlyPrice = billing === 'yearly'
    ? (plan.priceYearly / 12).toFixed(2)
    : plan.priceMonthly.toFixed(2);
  const displayPrice = nativeLocalizedPrice ?? `$${monthlyPrice}`;
  const monthlySavings = plan.priceMonthly > 0
    ? Math.round(100 - (plan.priceYearly / (plan.priceMonthly * 12)) * 100) : 0;

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
        <LinearGradient colors={[`${plan.color}12`, `${plan.color}04`]} style={StyleSheet.absoluteFillObject} />
      )}
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
              <Text style={[cardStyles.price, { color: plan.color }]}>{displayPrice}</Text>
              <Text style={cardStyles.pricePer}>/mo</Text>
              {billing === 'yearly' && !nativeLocalizedPrice && (
                <Text style={cardStyles.priceYearly}>${plan.priceYearly.toFixed(2)}/yr</Text>
              )}
            </>
          )}
        </View>
      </View>
      <View style={cardStyles.features}>
        {plan.features.map((f) => <FeatureRow key={f} text={f} included={true} />)}
        {plan.comingSoonFeatures?.map((f) => <ComingSoonRow key={f} text={f} />)}
      </View>
      <View style={[cardStyles.selectRow, selected && { borderTopColor: `${plan.color}33` }]}>
        <View style={[cardStyles.radio, selected && { borderColor: plan.color }]}>
          {selected && <View style={[cardStyles.radioDot, { backgroundColor: plan.color }]} />}
        </View>
        <Text style={[cardStyles.selectText, selected && { color: plan.color }]}>
          {current ? 'Your current plan' : selected ? 'Selected' : 'Select plan'}
        </Text>
        {billing === 'yearly' && !isFree && !nativeLocalizedPrice && (
          <View style={cardStyles.savingsBadge}>
            <Text style={cardStyles.savingsText}>Save {monthlySavings}%</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
const cardStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden', marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base, paddingBottom: Spacing.sm },
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
  features: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.md, gap: 0 },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  selectText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  savingsBadge: { backgroundColor: `${Colors.greenLight}18`, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  savingsText: { fontSize: 10, color: Colors.greenLight, fontWeight: Typography.bold },
});

// ─── Cross-Provider Active Subscription Banner ────────────────────────────────
function CrossProviderBanner({
  activeSub,
  currentPlatformProvider,
}: {
  activeSub: NonNullable<SubscriptionEligibilityResponse['activeSubscription']>;
  currentPlatformProvider: 'apple' | 'google' | 'stripe';
}) {
  const planName = activeSub.plan === 'elite' ? 'Elite' : 'Promoter Pro';
  const planColor = activeSub.plan === 'elite' ? '#E91E63' : Colors.gold;
  const icon = PROVIDER_ICONS[activeSub.paymentProvider] ?? 'payment';
  const label = PROVIDER_LABELS[activeSub.paymentProvider] ?? activeSub.paymentProvider;
  const periodEndStr = activeSub.currentPeriodEnd
    ? new Date(activeSub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const statusColors: Record<string, string> = { active: Colors.greenLight, trialing: Colors.gold, past_due: '#FF9800', canceled: Colors.textMuted };
  const statusColor = statusColors[activeSub.status] ?? Colors.textMuted;

  const handleManage = () => {
    if (activeSub.paymentProvider === 'apple') {
      Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() =>
        Linking.openURL('https://apps.apple.com/account/subscriptions'));
    } else if (activeSub.paymentProvider === 'google') {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  return (
    <View style={crossStyles.card}>
      <LinearGradient colors={[`${planColor}14`, `${planColor}06`]} style={StyleSheet.absoluteFillObject} />
      <View style={crossStyles.headerRow}>
        <View style={[crossStyles.iconWrap, { backgroundColor: `${planColor}22` }]}>
          <MaterialIcons name="workspace-premium" size={20} color={planColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={crossStyles.planName}>{planName}</Text>
          <View style={crossStyles.statusRow}>
            <View style={[crossStyles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[crossStyles.statusLabel, { color: statusColor }]}>
              {activeSub.isBillingRetry ? 'Payment Retry' :
               activeSub.status === 'active' ? 'Active' :
               activeSub.status.charAt(0).toUpperCase() + activeSub.status.slice(1)}
            </Text>
          </View>
        </View>
        <View style={crossStyles.providerTag}>
          <MaterialIcons name={icon as any} size={11} color={Colors.textMuted} />
          <Text style={crossStyles.providerTagText}>{label}</Text>
        </View>
      </View>
      <View style={crossStyles.infoRow}>
        <MaterialIcons name="check-circle" size={14} color={Colors.greenLight} />
        <Text style={crossStyles.infoText}>
          Your {planName} features are active on this device.
          {periodEndStr ? ` Access through ${periodEndStr}.` : ''}
        </Text>
      </View>
      <View style={crossStyles.explainRow}>
        <MaterialIcons name="devices" size={14} color={Colors.textMuted} />
        <Text style={crossStyles.explainText}>
          Subscribed via {label}. You do not need to purchase again — your entitlement syncs across all devices automatically.
        </Text>
      </View>
      {activeSub.isBillingRetry && (
        <View style={crossStyles.warningRow}>
          <MaterialIcons name="warning" size={14} color="#FF9800" />
          <Text style={crossStyles.warningText}>
            Your payment is being retried. Please update your payment method through {label} to keep access.
          </Text>
        </View>
      )}
      {(activeSub.paymentProvider === 'apple' || activeSub.paymentProvider === 'google') && (
        <Pressable onPress={handleManage} style={({ pressed }) => [crossStyles.manageBtn, pressed && { opacity: 0.8 }]}>
          <MaterialIcons name="open-in-new" size={14} color={Colors.textOnGold} />
          <Text style={crossStyles.manageBtnText}>
            Manage in {activeSub.paymentProvider === 'apple' ? 'App Store' : 'Google Play'}
          </Text>
        </Pressable>
      )}
      {activeSub.paymentProvider === 'stripe' && (
        <View style={crossStyles.stripeNote}>
          <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
          <Text style={crossStyles.stripeNoteText}>Manage this subscription at vybzhub.com or contact support.</Text>
        </View>
      )}
    </View>
  );
}

const crossStyles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden', padding: Spacing.base, gap: Spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  providerTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.surfaceBorder },
  providerTagText: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.medium },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.greenLight, lineHeight: 18 },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  explainText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md, padding: Spacing.sm },
  warningText: { flex: 1, fontSize: Typography.xs, color: '#FF9800', lineHeight: 18 },
  manageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: 10 },
  manageBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  stripeNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm },
  stripeNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
});

// ─── Same-Provider Manage Cards ───────────────────────────────────────────────
function StripeManageCard({ eligibility, onManage, isLoading }: {
  eligibility: SubscriptionEligibilityResponse;
  onManage: () => void;
  isLoading: boolean;
}) {
  const sub = eligibility.activeSubscription!;
  const planName = sub.plan === 'elite' ? 'Elite' : 'Promoter Pro';
  const planColor = sub.plan === 'elite' ? '#E91E63' : Colors.gold;
  const nextRenewal = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const statusColors: Record<string, string> = { active: Colors.greenLight, trialing: Colors.gold, past_due: '#FF9800', canceled: Colors.textMuted };
  const statusColor = statusColors[sub.status] ?? Colors.textMuted;
  return (
    <View style={manageStyles.card}>
      <LinearGradient colors={[`${planColor}12`, `${planColor}04`]} style={StyleSheet.absoluteFillObject} />
      <View style={manageStyles.top}>
        <View style={[manageStyles.iconWrap, { backgroundColor: `${planColor}22` }]}><MaterialIcons name="workspace-premium" size={22} color={planColor} /></View>
        <View style={{ flex: 1 }}>
          <Text style={manageStyles.planName}>{planName}</Text>
          <View style={manageStyles.statusRow}><View style={[manageStyles.statusDot, { backgroundColor: statusColor }]} /><Text style={[manageStyles.statusText, { color: statusColor }]}>{sub.cancelAtPeriodEnd ? 'Cancels at period end' : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}</Text></View>
        </View>
        <View style={manageStyles.cycleTag}><Text style={manageStyles.cycleText}>{sub.billingCycle}</Text></View>
      </View>
      {nextRenewal && <View style={manageStyles.renewalRow}><MaterialIcons name="autorenew" size={13} color={Colors.textMuted} /><Text style={manageStyles.renewalText}>{sub.cancelAtPeriodEnd ? `Access until ${nextRenewal}` : `Renews ${nextRenewal}`}</Text></View>}
      <Pressable onPress={onManage} disabled={isLoading} style={({ pressed }) => [manageStyles.btn, pressed && { opacity: 0.8 }, isLoading && { opacity: 0.6 }]}>
        {isLoading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <MaterialIcons name="open-in-new" size={16} color={Colors.textOnGold} />}
        <Text style={manageStyles.btnText}>{isLoading ? 'Opening...' : 'Manage Subscription'}</Text>
      </Pressable>
      <Text style={manageStyles.portalNote}>Upgrade, downgrade, cancel, or update payment via Stripe portal</Text>
    </View>
  );
}

function AppleManageCard({ eligibility }: { eligibility: SubscriptionEligibilityResponse }) {
  const sub = eligibility.activeSubscription!;
  const planName = sub.plan === 'elite' ? 'Elite' : 'Promoter Pro';
  const planColor = sub.plan === 'elite' ? '#E91E63' : Colors.gold;
  const nextRenewal = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const statusColors: Record<string, string> = { active: Colors.greenLight, trialing: Colors.gold, past_due: '#FF9800', canceled: Colors.textMuted };
  const statusColor = statusColors[sub.status] ?? Colors.textMuted;
  return (
    <View style={manageStyles.card}>
      <LinearGradient colors={[`${planColor}12`, `${planColor}04`]} style={StyleSheet.absoluteFillObject} />
      <View style={manageStyles.top}>
        <View style={[manageStyles.iconWrap, { backgroundColor: `${planColor}22` }]}><MaterialIcons name="workspace-premium" size={22} color={planColor} /></View>
        <View style={{ flex: 1 }}>
          <Text style={manageStyles.planName}>{planName}</Text>
          <View style={manageStyles.statusRow}><View style={[manageStyles.statusDot, { backgroundColor: statusColor }]} /><Text style={[manageStyles.statusText, { color: statusColor }]}>{sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}</Text></View>
        </View>
        <View style={[manageStyles.cycleTag, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}><MaterialIcons name="apple" size={12} color={Colors.textMuted} /><Text style={manageStyles.cycleText}>App Store</Text></View>
      </View>
      {nextRenewal && <View style={manageStyles.renewalRow}><MaterialIcons name="autorenew" size={13} color={Colors.textMuted} /><Text style={manageStyles.renewalText}>Renews {nextRenewal}</Text></View>}
      <Pressable onPress={() => Linking.openURL('itms-apps://apps.apple.com/account/subscriptions')} style={({ pressed }) => [manageStyles.btn, pressed && { opacity: 0.8 }]}>
        <MaterialIcons name="settings" size={16} color={Colors.textOnGold} />
        <Text style={manageStyles.btnText}>Manage in App Store Settings</Text>
      </Pressable>
      <Text style={manageStyles.portalNote}>Upgrade, downgrade, or cancel via Apple App Store subscription settings</Text>
    </View>
  );
}

function GoogleManageCard({ eligibility }: { eligibility: SubscriptionEligibilityResponse }) {
  const sub = eligibility.activeSubscription!;
  const planName = sub.plan === 'elite' ? 'Elite' : 'Promoter Pro';
  const planColor = sub.plan === 'elite' ? '#E91E63' : Colors.gold;
  const nextRenewal = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const statusColors: Record<string, string> = { active: Colors.greenLight, trialing: Colors.gold, past_due: '#FF9800', canceled: Colors.textMuted };
  const statusColor = statusColors[sub.status] ?? Colors.textMuted;
  return (
    <View style={manageStyles.card}>
      <LinearGradient colors={[`${planColor}12`, `${planColor}04`]} style={StyleSheet.absoluteFillObject} />
      <View style={manageStyles.top}>
        <View style={[manageStyles.iconWrap, { backgroundColor: `${planColor}22` }]}><MaterialIcons name="workspace-premium" size={22} color={planColor} /></View>
        <View style={{ flex: 1 }}>
          <Text style={manageStyles.planName}>{planName}</Text>
          <View style={manageStyles.statusRow}><View style={[manageStyles.statusDot, { backgroundColor: statusColor }]} /><Text style={[manageStyles.statusText, { color: statusColor }]}>{sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}</Text></View>
        </View>
        <View style={[manageStyles.cycleTag, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}><MaterialIcons name="android" size={12} color={Colors.textMuted} /><Text style={manageStyles.cycleText}>Google Play</Text></View>
      </View>
      {nextRenewal && <View style={manageStyles.renewalRow}><MaterialIcons name="autorenew" size={13} color={Colors.textMuted} /><Text style={manageStyles.renewalText}>Renews {nextRenewal}</Text></View>}
      <Pressable onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')} style={({ pressed }) => [manageStyles.btn, pressed && { opacity: 0.8 }]}>
        <MaterialIcons name="settings" size={16} color={Colors.textOnGold} />
        <Text style={manageStyles.btnText}>Manage in Google Play</Text>
      </Pressable>
      <Text style={manageStyles.portalNote}>Upgrade, downgrade, or cancel via Google Play subscription settings</Text>
    </View>
  );
}

const manageStyles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden', padding: Spacing.base, gap: Spacing.sm },
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
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: Spacing.md },
  btnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  portalNote: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
});

// ─── Processing Banner ────────────────────────────────────────────────────────
function ProcessingBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View style={procStyles.banner}>
      <MaterialIcons name="hourglass-empty" size={20} color={Colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={procStyles.title}>Subscription being activated…</Text>
        <Text style={procStyles.sub}>Your plan will update within seconds once payment confirms.</Text>
      </View>
      <Pressable onPress={onRefresh} style={({ pressed }) => [procStyles.btn, pressed && { opacity: 0.7 }]}>
        <MaterialIcons name="refresh" size={18} color={Colors.gold} />
      </Pressable>
    </View>
  );
}
const procStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33` },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  sub: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 16, marginTop: 2 },
  btn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33` },
});

// ─── Main Upgrade Screen ──────────────────────────────────────────────────────
export default function UpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const { subscriptionProducts, isLoadingProducts, isPurchasing, isRestoring,
    purchasingProductId, purchaseSubscription, restorePurchases } = useIAP();

  const currentTier: SubscriptionTier = user?.subscriptionTier ?? 'free';

  const currentPlatformProvider: 'apple' | 'google' | 'stripe' =
    Platform.OS === 'ios' ? 'apple' :
    Platform.OS === 'android' ? 'google' : 'stripe';

  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(currentTier);
  const [eligibility, setEligibility] = useState<SubscriptionEligibilityResponse | null>(null);
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(true);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [checkoutReturned, setCheckoutReturned] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingReturnRef = useRef(false);

  const loadEligibility = useCallback(async () => {
    setIsLoadingEligibility(true);
    const { data } = await checkSubscriptionEligibility(currentPlatformProvider);
    if (data) setEligibility(data);
    setIsLoadingEligibility(false);
  }, [currentPlatformProvider]);

  useEffect(() => { loadEligibility(); }, [loadEligibility]);
  useEffect(() => { return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }; }, []);

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!awaitingReturnRef.current) return;
      if (!url.startsWith('vybzhub://subscription') && !url.startsWith('vybzhub://auth')) return;
      awaitingReturnRef.current = false;
      if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
      if (url.startsWith('vybzhub://subscription-cancel')) { setCheckoutReturned(false); return; }
      setCheckoutReturned(true);
      Promise.all([refreshProfile(), loadEligibility()]).then(() => setCheckoutReturned(false));
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [refreshProfile, loadEligibility]);

  const activeSub = eligibility?.activeSubscription ?? null;
  const hasActivePaidSub = eligibility?.hasActivePaidSubscription ?? false;
  const purchaseEligible = eligibility?.eligible ?? !hasActivePaidSub;
  const isSameProviderActive = activeSub?.isSameProvider ?? false;
  const isCrossProviderActive = hasActivePaidSub && !isSameProviderActive;
  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier) ?? null;
  const selectedPlanIsCurrentTier = selectedTier === currentTier;

  // Localized price from native IAP (Apple or Google)
  const getLocalizedPrice = useCallback((plan: SubscriptionPlan): string | null => {
    if (!subscriptionProducts.length) return null;
    const pid = isAppleIAP
      ? (billing === 'yearly' ? plan.appleProductIdYearly : plan.appleProductIdMonthly)
      : isGoogleIAP
      ? (billing === 'yearly' ? plan.googleProductIdYearly : plan.googleProductIdMonthly)
      : null;
    if (!pid) return null;
    return subscriptionProducts.find((p) => p.productId === pid)?.localizedPrice ?? null;
  }, [subscriptionProducts, billing]);

  const handleManageSubscription = useCallback(async () => {
    setIsLoadingPortal(true);
    try {
      const { url, error } = await createCustomerPortalSession();
      if (error) { Alert.alert('Error', error); return; }
      if (url) {
        awaitingReturnRef.current = true;
        await WebBrowser.openBrowserAsync(url);
        if (awaitingReturnRef.current) {
          awaitingReturnRef.current = false;
          setCheckoutReturned(true);
          refreshTimer.current = setTimeout(async () => {
            await Promise.all([refreshProfile(), loadEligibility()]);
            setCheckoutReturned(false);
          }, 3000);
        }
      }
    } finally { setIsLoadingPortal(false); }
  }, [refreshProfile, loadEligibility]);

  const handleAppleSubscribe = useCallback(async () => {
    if (!selectedTier || selectedTier === 'free') return;
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to subscribe.'); return; }
    if (!purchaseEligible) { Alert.alert('Subscription Active', eligibility?.reason ?? 'You already have an active subscription.'); return; }
    const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier);
    if (!plan) return;
    const appleProductId = billing === 'yearly' ? plan.appleProductIdYearly : plan.appleProductIdMonthly;
    if (!appleProductId) { Alert.alert('Not Available', 'This plan is not available for in-app purchase.'); return; }
    const result = await purchaseSubscription(appleProductId as AppleSubscriptionProductId, user.id);
    if (result.ok) {
      await Promise.all([refreshProfile(), loadEligibility()]);
      Alert.alert('Subscribed!', `You are now on ${selectedTier === 'elite' ? 'Elite' : 'Promoter Pro'}. Your promoter access is active.`, [{ text: 'Done' }]);
    } else if (result.error && result.error !== 'Purchase cancelled') {
      if (result.error.includes('active') && result.error.includes('subscription')) await loadEligibility();
      Alert.alert('Purchase Failed', result.error);
    }
  }, [selectedTier, billing, user, purchaseEligible, eligibility, purchaseSubscription, refreshProfile, loadEligibility]);

  const handleRestorePurchases = useCallback(async () => {
    if (!user) return;
    const result = await restorePurchases(user.id);
    if (result.ok) {
      await Promise.all([refreshProfile(), loadEligibility()]);
      if (result.restoredTier) {
        Alert.alert('Restored!', `Your ${result.restoredTier === 'elite' ? 'Elite' : 'Promoter Pro'} subscription has been restored.`);
      } else {
        Alert.alert('No Active Subscriptions', 'No active subscriptions were found to restore.');
      }
    } else {
      Alert.alert('Restore Failed', result.error ?? 'Could not restore purchases. Please try again.');
    }
  }, [user, restorePurchases, refreshProfile, loadEligibility]);

  const handleGoogleSubscribe = useCallback(async () => {
    if (!selectedTier || selectedTier === 'free') return;
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to subscribe.'); return; }
    if (!purchaseEligible) { Alert.alert('Subscription Active', eligibility?.reason ?? 'You already have an active subscription.'); return; }
    const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier);
    if (!plan) return;
    const googleProductId = billing === 'yearly' ? plan.googleProductIdYearly : plan.googleProductIdMonthly;
    if (!googleProductId) { Alert.alert('Not Available', 'This plan is not available via Google Play.'); return; }
    const result = await purchaseSubscription(googleProductId as GoogleSubscriptionProductId, user.id);
    if (result.ok) {
      await Promise.all([refreshProfile(), loadEligibility()]);
      Alert.alert('Subscribed!', `You are now on ${selectedTier === 'elite' ? 'Elite' : 'Promoter Pro'}. Your promoter access is active.`, [{ text: 'Done' }]);
    } else if (result.error && result.error !== 'Purchase cancelled') {
      if (result.error.includes('active') && result.error.includes('subscription')) await loadEligibility();
      Alert.alert('Purchase Failed', result.error);
    }
  }, [selectedTier, billing, user, purchaseEligible, eligibility, purchaseSubscription, refreshProfile, loadEligibility]);

  const handleGoogleRestore = useCallback(async () => {
    if (!user) return;
    const r = await restorePurchases(user.id);
    if (r.ok) {
      await Promise.all([refreshProfile(), loadEligibility()]);
      if (r.restoredTier) Alert.alert('Restored!', `Your ${r.restoredTier === 'elite' ? 'Elite' : 'Promoter Pro'} subscription has been restored.`);
      else Alert.alert('No Active Subscriptions', 'No active Google Play subscriptions were found.');
    } else Alert.alert('Restore Failed', r.error ?? 'Could not restore purchases. Please try again.');
  }, [user, restorePurchases, refreshProfile, loadEligibility]);

  const handleStripeSubscribe = useCallback(async () => {
    if (!selectedTier || selectedTier === 'free') {
      if (hasActivePaidSub && isSameProviderActive) { handleManageSubscription(); return; }
      Alert.alert('Free Plan', 'You are already on the free plan.');
      return;
    }
    if (!purchaseEligible) {
      if (isSameProviderActive && activeSub?.stripeSubscriptionId !== null) { handleManageSubscription(); return; }
      Alert.alert('Subscription Active', eligibility?.reason ?? 'You already have an active subscription.');
      return;
    }
    setIsLoadingCheckout(true);
    try {
      const { url, redirectToPortal, error } = await createSubscriptionCheckout(selectedTier as 'pro' | 'elite', billing);
      if (error) { await loadEligibility(); Alert.alert('Subscription Error', error); return; }
      if (redirectToPortal) { await handleManageSubscription(); return; }
      if (url) {
        awaitingReturnRef.current = true;
        await WebBrowser.openBrowserAsync(url);
        if (awaitingReturnRef.current) {
          awaitingReturnRef.current = false;
          setCheckoutReturned(true);
          refreshTimer.current = setTimeout(async () => {
            await Promise.all([refreshProfile(), loadEligibility()]);
            setCheckoutReturned(false);
          }, 3000);
        }
      }
    } finally { setIsLoadingCheckout(false); }
  }, [selectedTier, billing, hasActivePaidSub, isSameProviderActive, purchaseEligible,
      activeSub, eligibility, handleManageSubscription, refreshProfile, loadEligibility]);

  const handleCta = isAppleIAP ? handleAppleSubscribe : isGoogleIAP ? handleGoogleSubscribe : handleStripeSubscribe;
  const isCtaLoading = (isAppleIAP || isGoogleIAP) ? isPurchasing : isLoadingCheckout;

  const getCtaLabel = () => {
    if (isCtaLoading) return (isAppleIAP || isGoogleIAP) ? 'Purchasing…' : 'Opening Stripe…';
    if (!purchaseEligible) {
      if (isSameProviderActive) {
        if (isAppleIAP) return 'Manage in App Store';
        if (isGoogleIAP) return 'Manage in Google Play';
        return 'Manage Subscription';
      }
      return 'Subscription Active';
    }
    if (selectedTier === 'free') return hasActivePaidSub ? 'Manage Subscription' : 'Current Plan';
    if (selectedPlanIsCurrentTier && hasActivePaidSub) {
      if (isAppleIAP) return 'Manage in App Store';
      if (isGoogleIAP) return 'Manage in Google Play';
      return 'Manage Subscription';
    }
    if (selectedPlanIsCurrentTier) return 'Current Plan';
    if (isAppleIAP) return 'Subscribe with Apple';
    if (isGoogleIAP) return 'Subscribe with Google Play';
    return `Subscribe to ${selectedPlan?.name ?? ''}`;
  };

  const ctaDisabled =
    isLoadingEligibility || isCtaLoading || isRestoring || isLoadingProducts ||
    (!purchaseEligible && isCrossProviderActive) ||
    (selectedPlanIsCurrentTier && !hasActivePaidSub && selectedTier === 'free');

  const monthlySavingsLabel = selectedPlan && selectedPlan.priceMonthly > 0
    ? `$${((selectedPlan.priceMonthly * 12) - selectedPlan.priceYearly).toFixed(0)} saved/yr` : null;

  const showAppleManageCard  = isAppleIAP  && hasActivePaidSub && isSameProviderActive && eligibility !== null;
  const showGoogleManageCard = isGoogleIAP && hasActivePaidSub && isSameProviderActive && eligibility !== null;
  const showStripeManageCard = !isAppleIAP && !isGoogleIAP && currentPlatformProvider === 'stripe' && hasActivePaidSub && isSameProviderActive && eligibility !== null;
  const isNativeIAP = isAppleIAP || isGoogleIAP;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Choose Your Plan</Text>
            <Text style={styles.topBarSub}>
              {hasActivePaidSub
                ? `${currentTier === 'elite' ? 'Elite' : 'Promoter Pro'} · ${activeSub ? PROVIDER_LABELS[activeSub.paymentProvider] ?? activeSub.paymentProvider : ''}`
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
        {checkoutReturned && (
          <ProcessingBanner onRefresh={async () => { await Promise.all([refreshProfile(), loadEligibility()]); setCheckoutReturned(false); }} />
        )}
        {isLoadingEligibility && (
          <View style={styles.loadingRow}><ActivityIndicator size="small" color={Colors.gold} /><Text style={styles.loadingText}>Checking subscription status…</Text></View>
        )}

        {!isLoadingEligibility && isCrossProviderActive && activeSub && (
          <CrossProviderBanner activeSub={activeSub} currentPlatformProvider={currentPlatformProvider} />
        )}
        {!isLoadingEligibility && showAppleManageCard && eligibility && (<AppleManageCard eligibility={eligibility} />)}
        {!isLoadingEligibility && showGoogleManageCard && eligibility && (<GoogleManageCard eligibility={eligibility} />)}
        {!isLoadingEligibility && showStripeManageCard && eligibility && (
          <StripeManageCard eligibility={eligibility} onManage={handleManageSubscription} isLoading={isLoadingPortal} />
        )}

        {isNativeIAP && isLoadingProducts && !hasActivePaidSub && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.gold} />
            <Text style={styles.loadingText}>{isAppleIAP ? 'Loading prices from App Store…' : 'Loading prices from Google Play…'}</Text>
          </View>
        )}

        {!isCrossProviderActive && (
          <>
            <View style={styles.billingToggle}>
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <Pressable key={cycle} onPress={() => setBilling(cycle)}
                  style={[styles.billingBtn, billing === cycle && styles.billingBtnActive]}>
                  <Text style={[styles.billingText, billing === cycle && styles.billingTextActive]}>
                    {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                  </Text>
                  {cycle === 'yearly' && <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>{isNativeIAP ? 'Save 25%' : '25% off'}</Text></View>}
                </Pressable>
              ))}
            </View>
            {!isNativeIAP && billing === 'yearly' && monthlySavingsLabel && selectedTier !== 'free' && (
              <View style={styles.savingsCallout}>
                <MaterialIcons name="savings" size={14} color={Colors.greenLight} />
                <Text style={styles.savingsCalloutText}>{monthlySavingsLabel} compared to monthly billing</Text>
              </View>
            )}
          </>
        )}

        {SUBSCRIPTION_PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billing={billing}
            selected={selectedTier === plan.tier}
            current={currentTier === plan.tier}
            onSelect={() => { if (!isCrossProviderActive) setSelectedTier(plan.tier); }}
            nativeLocalizedPrice={getLocalizedPrice(plan)}
            purchaseBlocked={isCrossProviderActive}
          />
        ))}

        {user && (user.remainingBoosts ?? 0) > 0 && (
          <View style={styles.boostCreditsRow}>
            <MaterialIcons name="rocket-launch" size={14} color={Colors.gold} />
            <Text style={styles.boostCreditsText}>
              You have {user.remainingBoosts} free boost credit{(user.remainingBoosts ?? 0) !== 1 ? 's' : ''} remaining this month
            </Text>
          </View>
        )}

        {/* Platform subscription disclosure (required by App Store & Google Play) */}
        {isNativeIAP && !isCrossProviderActive && (
          <View style={styles.appleDisclosure}>
            <Text style={styles.appleDisclosureText}>
              {isAppleIAP
                ? 'Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Apple ID account settings. Payment is charged to your Apple ID at confirmation of purchase.'
                : 'Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Google Play account settings under Subscriptions.'}
            </Text>
          </View>
        )}

        <View style={styles.secureRow}>
          <MaterialIcons name="lock" size={13} color={Colors.textMuted} />
          <Text style={styles.secureText}>
            {isAppleIAP ? 'Secure payments via Apple · Cancel anytime in App Store Settings'
              : isGoogleIAP ? 'Secure payments via Google Play · Cancel anytime in Play Store'
              : 'Secure payments by Stripe · Cancel anytime · Plans activate instantly'}
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {!isCrossProviderActive && (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.stickyInfo}>
            <Text style={styles.stickyPlan}>{selectedPlan?.name ?? ''}</Text>
            {selectedTier !== 'free' && (
              <Text style={styles.stickyPrice}>
                {isNativeIAP
                  ? (getLocalizedPrice(selectedPlan!) ?? (billing === 'yearly'
                      ? `$${((selectedPlan?.priceYearly ?? 0) / 12).toFixed(2)}/mo`
                      : `$${(selectedPlan?.priceMonthly ?? 0).toFixed(2)}/mo`))
                  : (billing === 'yearly'
                      ? `$${((selectedPlan?.priceYearly ?? 0) / 12).toFixed(2)}/mo · $${(selectedPlan?.priceYearly ?? 0).toFixed(2)}/yr`
                      : `$${(selectedPlan?.priceMonthly ?? 0).toFixed(2)}/mo`)}
              </Text>
            )}
          </View>
          <View style={styles.ctaGroup}>
            <Pressable onPress={handleCta} disabled={ctaDisabled}
              style={({ pressed }) => [styles.ctaBtn, ctaDisabled && { opacity: 0.45 }, pressed && !ctaDisabled && { opacity: 0.85 }]}>
              <LinearGradient
                colors={selectedTier === 'elite' ? ['#E91E63', '#AD1457'] : [Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.ctaBtnInner}
              >
                {isCtaLoading || isLoadingEligibility
                  ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                  : <MaterialIcons name={selectedTier === 'free' ? 'check' : isAppleIAP ? 'apple' : isGoogleIAP ? 'android' : 'rocket-launch'} size={16} color={Colors.textOnGold} />
                }
                <Text style={styles.ctaBtnText}>{getCtaLabel()}</Text>
              </LinearGradient>
            </Pressable>
            {/* Restore Purchases — required by Apple & Google Play guidelines */}
            {isNativeIAP && !hasActivePaidSub && (
              <Pressable onPress={isAppleIAP ? handleRestorePurchases : handleGoogleRestore} disabled={isRestoring}
                style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.7 }, isRestoring && { opacity: 0.5 }]}
                hitSlop={8}>
                {isRestoring
                  ? <ActivityIndicator size="small" color={Colors.textMuted} />
                  : <Text style={styles.restoreBtnText}>Restore Purchases</Text>}
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  verifiedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  verifiedTagText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  content: { padding: Spacing.base, gap: Spacing.md },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.sm },
  loadingText: { fontSize: Typography.xs, color: Colors.textMuted },
  billingToggle: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 3, borderWidth: 1, borderColor: Colors.surfaceBorder },
  billingBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 10, borderRadius: Radius.sm },
  billingBtnActive: { backgroundColor: Colors.gold },
  billingText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  billingTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  saveBadge: { backgroundColor: Colors.greenLight, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  saveBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: '#fff' },
  savingsCallout: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: `${Colors.greenLight}12`, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: `${Colors.greenLight}30` },
  savingsCalloutText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.semibold },
  boostCreditsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.goldSurface, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: `${Colors.gold}33` },
  boostCreditsText: { flex: 1, fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  appleDisclosure: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  appleDisclosureText: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, textAlign: 'center' },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, justifyContent: 'center', paddingVertical: Spacing.sm },
  secureText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  stickyBar: { paddingHorizontal: Spacing.base, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.sm },
  stickyInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stickyPlan: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  stickyPrice: { fontSize: Typography.xs, color: Colors.gold },
  ctaGroup: { gap: Spacing.sm },
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  ctaBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  restoreBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  restoreBtnText: { fontSize: Typography.xs, color: Colors.textMuted, textDecorationLine: 'underline' },
});
