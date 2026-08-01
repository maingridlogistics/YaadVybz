import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  SubscriptionTier,
} from '../../constants/data';

type BillingCycle = 'monthly' | 'yearly';

// ─── Feature Row ──────────────────────────────────────────────────────────────
function FeatureRow({ text, included }: { text: string; included: boolean }) {
  return (
    <View style={featureStyles.row}>
      <View style={[featureStyles.icon, included ? featureStyles.iconOn : featureStyles.iconOff]}>
        <MaterialIcons
          name={included ? 'check' : 'close'}
          size={13}
          color={included ? Colors.greenLight : Colors.textMuted}
        />
      </View>
      <Text style={[featureStyles.text, !included && featureStyles.textOff]}>{text}</Text>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  icon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  iconOn: { backgroundColor: `${Colors.greenLight}20` },
  iconOff: { backgroundColor: Colors.surfaceElevated },
  text: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  textOff: { color: Colors.textMuted, textDecorationLine: 'line-through' },
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
  const price = billing === 'yearly'
    ? (plan.priceYearly / 12).toFixed(2)
    : plan.priceMonthly.toFixed(2);
  const isFree = plan.tier === 'free';

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        planStyles.card,
        selected && { borderColor: plan.color, borderWidth: 2 },
        pressed && { opacity: 0.9 },
      ]}
    >
      {selected && (
        <LinearGradient
          colors={[`${plan.color}14`, `${plan.color}06`]}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Popular badge */}
      {plan.highlight && (
        <View style={[planStyles.badge, { backgroundColor: plan.color }]}>
          <Text style={planStyles.badgeText}>{plan.highlight}</Text>
        </View>
      )}

      {/* Header */}
      <View style={planStyles.header}>
        <View style={[planStyles.iconBg, { backgroundColor: `${plan.color}22` }]}>
          <MaterialIcons name={plan.icon as any} size={22} color={plan.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={planStyles.name}>{plan.name}</Text>
          {current && (
            <View style={planStyles.currentTag}>
              <Text style={planStyles.currentTagText}>Current Plan</Text>
            </View>
          )}
        </View>
        <View style={planStyles.priceBlock}>
          {isFree ? (
            <Text style={[planStyles.price, { color: plan.color }]}>Free</Text>
          ) : (
            <>
              <Text style={[planStyles.price, { color: plan.color }]}>${price}</Text>
              <Text style={planStyles.priceSub}>/mo</Text>
            </>
          )}
          {billing === 'yearly' && !isFree && (
            <Text style={planStyles.yearlyNote}>billed yearly</Text>
          )}
        </View>
      </View>

      {/* Features */}
      <View style={planStyles.features}>
        {plan.features.map((f) => (
          <FeatureRow key={f} text={f} included={true} />
        ))}
      </View>

      {/* Select indicator */}
      <View style={[planStyles.selectRow, selected && { borderTopColor: `${plan.color}33` }]}>
        <View style={[planStyles.radio, selected && { borderColor: plan.color }]}>
          {selected && <View style={[planStyles.radioDot, { backgroundColor: plan.color }]} />}
        </View>
        <Text style={[planStyles.selectText, selected && { color: plan.color }]}>
          {current ? 'Your current plan' : selected ? 'Selected' : 'Select this plan'}
        </Text>
      </View>
    </Pressable>
  );
}

const planStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', position: 'relative',
    marginBottom: Spacing.md,
  },
  badge: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, zIndex: 1,
  },
  badgeText: { fontSize: 10, fontWeight: Typography.bold, color: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base, paddingBottom: Spacing.md,
  },
  iconBg: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  currentTag: {
    alignSelf: 'flex-start', marginTop: 3,
    backgroundColor: Colors.greenSurface, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: `${Colors.greenLight}33`,
  },
  currentTagText: { fontSize: 10, color: Colors.greenLight, fontWeight: Typography.bold },
  priceBlock: { alignItems: 'flex-end', gap: 1 },
  price: { fontSize: 22, fontWeight: Typography.black },
  priceSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: -2 },
  yearlyNote: { fontSize: 9, color: Colors.textMuted },
  features: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
    paddingTop: Spacing.md,
    gap: 2,
  },
  selectRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  selectText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
});

// ─── Mock Payment Modal ───────────────────────────────────────────────────────
function PaymentModal({
  visible,
  plan,
  billing,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  plan: SubscriptionPlan | null;
  billing: BillingCycle;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [cardNum, setCardNum] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [processing, setProcessing] = useState(false);

  const formatCard = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const handlePay = async () => {
    if (!cardNum || !expiry || !cvv || !name) {
      Alert.alert('Missing Info', 'Please fill in all payment fields.');
      return;
    }
    setProcessing(true);
    // Simulate payment processing delay
    await new Promise((r) => setTimeout(r, 1800));
    setProcessing(false);
    onConfirm();
  };

  const price = plan
    ? billing === 'yearly'
      ? plan.priceYearly.toFixed(2)
      : plan.priceMonthly.toFixed(2)
    : '0.00';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={payStyles.overlay} onPress={onClose}>
        <Pressable style={payStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={payStyles.handle} />

          <Text style={payStyles.title}>Complete Purchase</Text>

          {/* Order summary */}
          {plan && (
            <View style={payStyles.summary}>
              <View style={[payStyles.summaryIcon, { backgroundColor: `${plan.color}22` }]}>
                <MaterialIcons name={plan.icon as any} size={20} color={plan.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={payStyles.summaryPlan}>{plan.name}</Text>
                <Text style={payStyles.summaryBilling}>{billing === 'yearly' ? 'Annual billing' : 'Monthly billing'}</Text>
              </View>
              <Text style={[payStyles.summaryPrice, { color: plan.color }]}>${price}</Text>
            </View>
          )}

          {/* Card fields */}
          <View style={payStyles.fields}>
            <Text style={payStyles.fieldLabel}>Cardholder Name</Text>
            <View style={payStyles.inputRow}>
              <MaterialIcons name="person" size={16} color={Colors.textMuted} />
              <TextInput
                style={payStyles.input}
                placeholder="John Smith"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                accessibilityLabel="Cardholder name"
              />
            </View>

            <Text style={payStyles.fieldLabel}>Card Number</Text>
            <View style={payStyles.inputRow}>
              <MaterialIcons name="credit-card" size={16} color={Colors.textMuted} />
              <TextInput
                style={payStyles.input}
                placeholder="4242 4242 4242 4242"
                placeholderTextColor={Colors.textMuted}
                value={cardNum}
                onChangeText={(v) => setCardNum(formatCard(v))}
                keyboardType="numeric"
                accessibilityLabel="Card number"
              />
            </View>

            <View style={payStyles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={payStyles.fieldLabel}>Expiry</Text>
                <View style={payStyles.inputRow}>
                  <TextInput
                    style={payStyles.input}
                    placeholder="MM/YY"
                    placeholderTextColor={Colors.textMuted}
                    value={expiry}
                    onChangeText={(v) => setExpiry(formatExpiry(v))}
                    keyboardType="numeric"
                    accessibilityLabel="Card expiry"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={payStyles.fieldLabel}>CVV</Text>
                <View style={payStyles.inputRow}>
                  <TextInput
                    style={payStyles.input}
                    placeholder="123"
                    placeholderTextColor={Colors.textMuted}
                    value={cvv}
                    onChangeText={(v) => setCvv(v.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="numeric"
                    secureTextEntry
                    accessibilityLabel="CVV"
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={payStyles.notice}>
            <MaterialIcons name="lock" size={13} color={Colors.textMuted} />
            <Text style={payStyles.noticeText}>
              This is a demo. No real charges will be made.
            </Text>
          </View>

          <Pressable
            onPress={handlePay}
            disabled={processing}
            style={({ pressed }) => [payStyles.payBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={payStyles.payBtnInner}>
              {processing ? (
                <Text style={payStyles.payBtnText}>Processing...</Text>
              ) : (
                <>
                  <MaterialIcons name="lock" size={16} color={Colors.textOnGold} />
                  <Text style={payStyles.payBtnText}>Pay ${price}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const payStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.base, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  summaryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  summaryPlan: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  summaryBilling: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  summaryPrice: { fontSize: Typography.lg, fontWeight: Typography.black },
  fields: { gap: Spacing.sm },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48,
  },
  input: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  noticeText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  payBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  payBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  payBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Main Upgrade Screen ──────────────────────────────────────────────────────
export default function UpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, upgradePlan } = useAuth();

  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(
    user?.subscriptionTier ?? 'free'
  );
  const [showPayment, setShowPayment] = useState(false);

  const currentTier: SubscriptionTier = user?.subscriptionTier ?? 'free';
  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier) ?? null;

  const yearlySavings = selectedPlan && selectedPlan.tier !== 'free'
    ? ((selectedPlan.priceMonthly * 12) - selectedPlan.priceYearly).toFixed(0)
    : null;

  const handleUpgrade = () => {
    if (selectedTier === currentTier) {
      Alert.alert('Already on this plan', 'You are already subscribed to this plan.');
      return;
    }
    if (selectedTier === 'free') {
      Alert.alert(
        'Downgrade to Free',
        'Are you sure? You will lose all Pro/Elite features.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Downgrade',
            style: 'destructive',
            onPress: async () => {
              await upgradePlan('free');
              router.back();
            },
          },
        ]
      );
      return;
    }
    setShowPayment(true);
  };

  const handlePaymentConfirmed = async () => {
    setShowPayment(false);
    await upgradePlan(selectedTier);
    Alert.alert(
      'Welcome to ' + selectedPlan?.name + '!',
      'Your plan has been upgraded. All features are now active.',
      [{ text: 'Get Started', onPress: () => router.back() }]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Upgrade Plan</Text>
            <Text style={styles.topBarSub}>
              Current: <Text style={{ color: Colors.gold }}>{currentTier === 'free' ? 'Free' : currentTier === 'pro' ? 'Promoter Pro' : 'Elite'}</Text>
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={styles.hero}>
          <LinearGradient
            colors={['#0A1F10', '#071508']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroIcon}>
            <MaterialIcons name="rocket-launch" size={36} color={Colors.gold} />
          </View>
          <Text style={styles.heroTitle}>Grow Your Reach</Text>
          <Text style={styles.heroSub}>
            Unlock more posts, analytics, and premium placements to reach thousands across Jamaica.
          </Text>
        </View>

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
                  <Text style={styles.saveBadgeText}>Save 25%</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

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

        {/* Feature comparison note */}
        <View style={styles.note}>
          <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            All plans include access to browse, RSVP, and save events. Upgrade for promoter tools and advanced features.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={styles.stickyInfo}>
          <Text style={styles.stickyPlan}>
            {SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier)?.name}
          </Text>
          {selectedTier !== 'free' && (
            <Text style={styles.stickyPrice}>
              {billing === 'yearly'
                ? `$${((SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier)?.priceYearly ?? 0) / 12).toFixed(2)}/mo`
                : `$${(SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier)?.priceMonthly ?? 0).toFixed(2)}/mo`}
            </Text>
          )}
        </View>
        <Pressable
          onPress={handleUpgrade}
          disabled={selectedTier === currentTier}
          style={({ pressed }) => [
            styles.upgradeBtn,
            selectedTier === currentTier && { opacity: 0.45 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.upgradeBtnInner}>
            <MaterialIcons name="arrow-upward" size={16} color={Colors.textOnGold} />
            <Text style={styles.upgradeBtnText}>
              {selectedTier === currentTier
                ? 'Current Plan'
                : selectedTier === 'free'
                ? 'Downgrade to Free'
                : `Upgrade to ${SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier)?.name}`}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Payment modal */}
      <PaymentModal
        visible={showPayment}
        plan={selectedPlan}
        billing={billing}
        onConfirm={handlePaymentConfirmed}
        onClose={() => setShowPayment(false)}
      />
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

  content: { padding: Spacing.base, gap: Spacing.md },

  hero: {
    borderRadius: Radius.xl, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.md, overflow: 'hidden',
    borderWidth: 1, borderColor: `${Colors.gold}22`,
  },
  heroIcon: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  heroTitle: { fontSize: 24, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  heroSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  billingToggle: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 3,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  billingBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.sm, borderRadius: Radius.sm,
  },
  billingBtnActive: { backgroundColor: Colors.gold },
  billingText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  billingTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  saveBadge: {
    backgroundColor: Colors.greenLight, paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: Radius.full,
  },
  saveBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: '#fff' },

  note: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  noteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },

  stickyBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  stickyInfo: { flex: 1 },
  stickyPlan: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  stickyPrice: { fontSize: Typography.xs, color: Colors.gold, marginTop: 2 },
  upgradeBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  upgradeBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  upgradeBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
});
