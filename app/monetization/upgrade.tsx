
// Vybz Hub Pro — Lifetime Upgrade Screen
// One-time $49.99 non-consumable purchase. No subscriptions.

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useIAP } from '../../hooks/useIAP';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { LIFETIME_PRO_PLAN } from '../../constants/data';

// ─── Feature Row ──────────────────────────────────────────────────────────────
function FeatureRow({ text }: { text: string }) {
  return (
    <View style={featureStyles.row}>
      <View style={featureStyles.iconWrap}>
        <MaterialIcons name="check" size={13} color={Colors.textOnGold} />
      </View>
      <Text style={featureStyles.text}>{text}</Text>
    </View>
  );
}
const featureStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: 5 },
  iconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  text: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function UpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const {
    proProduct,
    isLoadingProducts,
    isPurchasing,
    isRestoring,
    purchaseProLifetime,
    restorePurchases,
  } = useIAP();

  // ── Derive current state ──────────────────────────────────────────────────
  // Use server-authoritative boolean fields for display.
  // isPro / isElite are DISPLAY ONLY — identical feature access in both cases.
  const isElite = user?.adminElite === true;
  const isPro   = !isElite && (user?.lifetimeProOwned === true || user?.subscriptionTier === 'pro');

  const localizedPrice = proProduct?.localizedPrice ?? `$${LIFETIME_PRO_PLAN.price.toFixed(2)}`;

  // ── Purchase handler ──────────────────────────────────────────────────────
  const handleUpgrade = useCallback(async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to purchase Vybz Hub Pro.');
      return;
    }
    if (isPro || isElite) {
      Alert.alert('Already Unlocked', 'You already have Pro or Elite access.');
      return;
    }
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS Only', 'Pro purchases are currently available on iOS only.');
      return;
    }

    const result = await purchaseProLifetime(user.id);

    if (result.ok) {
      await refreshProfile();
      Alert.alert(
        'Welcome to Pro! 🎉',
        'Your lifetime Pro access has been activated. Enjoy all Pro features.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } else if (result.error && result.error !== 'Purchase cancelled') {
      const isAlreadyOwned =
        result.error.toLowerCase().includes('already') ||
        result.error.toLowerCase().includes('owned');
      if (isAlreadyOwned) {
        await refreshProfile();
        return;
      }
      Alert.alert('Purchase Failed', result.error);
    }
  }, [user, isPro, isElite, purchaseProLifetime, refreshProfile, router]);

  // ── Restore handler ───────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!user) return;
    const result = await restorePurchases(user.id);
    if (result.ok) {
      await refreshProfile();
      if (result.restoredTier) {
        Alert.alert('Restored!', 'Your lifetime Pro access has been restored.');
      } else {
        Alert.alert('Nothing to Restore', 'No lifetime Pro purchase was found on this Apple ID.');
      }
    } else {
      Alert.alert('Restore Failed', result.error ?? 'Could not restore purchases. Please try again.');
    }
  }, [user, restorePurchases, refreshProfile]);

  // ── Tier display ──────────────────────────────────────────────────────────
  const renderCurrentStatus = () => {
    if (isElite) {
      return (
        <View style={styles.statusCard}>
          <LinearGradient colors={['rgba(233,30,99,0.12)', 'rgba(233,30,99,0.04)']} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.statusIconWrap, { backgroundColor: 'rgba(233,30,99,0.18)' }]}>
            <MaterialIcons name="star" size={22} color="#E91E63" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: '#E91E63' }]}>Elite</Text>
            <Text style={styles.statusSub}>Lifetime access granted by Vybz Hub</Text>
          </View>
          <MaterialIcons name="check-circle" size={20} color="#E91E63" />
        </View>
      );
    }
    if (isPro) {
      return (
        <View style={styles.statusCard}>
          <LinearGradient colors={[`${Colors.gold}18`, `${Colors.gold}06`]} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.statusIconWrap, { backgroundColor: Colors.goldSurface }]}>
            <MaterialIcons name="workspace-premium" size={22} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: Colors.gold }]}>Pro — Lifetime Access</Text>
            <Text style={styles.statusSub}>Permanently unlocked</Text>
          </View>
          <MaterialIcons name="check-circle" size={20} color={Colors.gold} />
        </View>
      );
    }
    return null;
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
            <Text style={styles.topBarTitle}>Vybz Hub Pro</Text>
            <Text style={styles.topBarSub}>One-time purchase · Lifetime access</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Current status banner */}
        {renderCurrentStatus()}

        {/* Hero card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[`${Colors.gold}16`, `${Colors.gold}06`, 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroTop}>
            <View style={styles.heroIconWrap}>
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.heroIconGrad}>
                <MaterialIcons name="workspace-premium" size={32} color={Colors.textOnGold} />
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{LIFETIME_PRO_PLAN.name}</Text>
              <Text style={styles.heroTagline}>{LIFETIME_PRO_PLAN.tagline}</Text>
            </View>
            <View style={styles.priceWrap}>
              {isLoadingProducts ? (
                <ActivityIndicator size="small" color={Colors.gold} />
              ) : (
                <>
                  <Text style={styles.priceAmount}>{localizedPrice}</Text>
                  <Text style={styles.priceNote}>one-time</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.featuresWrap}>
            {LIFETIME_PRO_PLAN.features.map((f) => (
              <FeatureRow key={f} text={f} />
            ))}
          </View>
        </View>

        {/* Active posts explainer */}
        <View style={styles.explainerCard}>
          <MaterialIcons name="info-outline" size={16} color={Colors.gold} />
          <Text style={styles.explainerText}>
            Up to 10 simultaneously active Events + Businesses. Drafts and deleted posts do not count against your limit.
          </Text>
        </View>

        {/* Boost explainer */}
        <View style={styles.explainerCard}>
          <MaterialIcons name="rocket-launch" size={16} color={Colors.gold} />
          <Text style={styles.explainerText}>
            10 included 3-day Boosts refresh every calendar month. Unused credits do not roll over.
          </Text>
        </View>

        <View style={styles.secureRow}>
          <MaterialIcons name="lock" size={13} color={Colors.textMuted} />
          <Text style={styles.secureText}>
            Secure payment via Apple · One-time purchase · No subscriptions
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky CTA */}
      {!isPro && !isElite && (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 8 }]}>
          <Pressable
            onPress={handleUpgrade}
            disabled={isPurchasing || isLoadingProducts}
            style={({ pressed }) => [
              styles.ctaBtn,
              (isPurchasing || isLoadingProducts) && { opacity: 0.5 },
              pressed && !(isPurchasing || isLoadingProducts) && { opacity: 0.88 },
            ]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaBtnInner}
            >
              {isPurchasing ? (
                <ActivityIndicator size="small" color={Colors.textOnGold} />
              ) : (
                <MaterialIcons name="apple" size={18} color={Colors.textOnGold} />
              )}
              <Text style={styles.ctaBtnText}>
                {isPurchasing
                  ? 'Purchasing…'
                  : `Upgrade to Pro — ${localizedPrice}`}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.7 }, isRestoring && { opacity: 0.5 }]}
            hitSlop={8}
          >
            {isRestoring
              ? <ActivityIndicator size="small" color={Colors.textMuted} />
              : <Text style={styles.restoreBtnText}>Restore Purchases</Text>}
          </Pressable>
        </View>
      )}

      {/* Already Pro/Elite: show a done button */}
      {(isPro || isElite) && (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={isElite ? ['#E91E63', '#AD1457'] : [Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaBtnInner}
            >
              <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
              <Text style={styles.ctaBtnText}>
                {isElite ? 'Elite Access Active' : 'Pro Access Active'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
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
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  content: { padding: Spacing.base, gap: Spacing.md },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', padding: Spacing.base,
  },
  statusIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusTitle: { fontSize: Typography.md, fontWeight: Typography.black as any },
  statusSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  heroCard: {
    borderRadius: Radius.xl, borderWidth: 1.5, borderColor: `${Colors.gold}44`,
    overflow: 'hidden', padding: Spacing.base,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  heroIconWrap: { borderRadius: 28, overflow: 'hidden', flexShrink: 0 },
  heroIconGrad: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  heroTagline: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  priceWrap: { alignItems: 'flex-end', flexShrink: 0, minWidth: 70 },
  priceAmount: { fontSize: 22, fontWeight: Typography.black as any, color: Colors.gold, lineHeight: 26 },
  priceNote: { fontSize: Typography.xs, color: Colors.textMuted },

  divider: { height: 1, backgroundColor: Colors.surfaceBorder, marginVertical: Spacing.md },

  featuresWrap: { gap: 2 },

  explainerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  explainerText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  secureRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    justifyContent: 'center', paddingVertical: Spacing.sm,
  },
  secureText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  stickyBar: {
    paddingHorizontal: Spacing.base, paddingTop: 12,
    backgroundColor: Colors.background, borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder, gap: Spacing.sm,
  },
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  ctaBtnText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  restoreBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  restoreBtnText: { fontSize: Typography.xs, color: Colors.textMuted, textDecorationLine: 'underline' },
});
