import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '../../../hooks/useAuth';
import { useIAP } from '../../../hooks/useIAP';
import { useEvents } from '../../../hooks/useEvents';
import { supabase } from '../../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { BOOST_PACKAGES, BoostPackage, formatDate, formatCount, AppleBoostProductId, GoogleBoostProductId } from '../../../constants/data';
import { isAppleIAP, isGoogleIAP } from '../../../constants/purchaseGate';
import { useBoostCredit as consumeBoostCredit } from '../../../services/subscriptionService';

const UPGRADE_PRICES: Record<string, Record<string, number>> = {
  three_day:  { seven_day: 2.00, until_event_end: 5.00 },
  seven_day:  { until_event_end: 3.00 },
};
const BOOST_TYPE_LABELS: Record<string, string> = {
  three_day: '3-Day Boost', seven_day: '7-Day Boost', until_event_end: 'Until Event Ends',
};

function BoostStat({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconWrap, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
});

function PackageCard({
  pkg, selected, onSelect, displayPrice, isUpgrade, nativeLocalizedPrice,
}: {
  pkg: BoostPackage; selected: boolean; onSelect: () => void;
  displayPrice: number; isUpgrade: boolean; nativeLocalizedPrice?: string | null;
}) {
  const estImpressions = pkg.id === 'until_event_end' ? '1,000+' : `${(pkg.days * 200).toLocaleString()} est.`;
  const priceLabel = nativeLocalizedPrice ?? `$${displayPrice.toFixed(2)}`;
  return (
    <Pressable onPress={onSelect} style={({ pressed }) => [pkgStyles.card, selected && pkgStyles.cardSelected, pressed && { opacity: 0.9 }]}>
      {selected && <LinearGradient colors={[`${Colors.gold}18`, `${Colors.gold}08`]} style={StyleSheet.absoluteFillObject} />}
      {pkg.popular && <View style={pkgStyles.badge}><MaterialIcons name="bolt" size={10} color={Colors.textOnGold} /><Text style={pkgStyles.badgeText}>Most Popular</Text></View>}
      {pkg.bestExposure && <View style={[pkgStyles.badge, { backgroundColor: '#9C27B0' }]}><MaterialIcons name="star" size={10} color="#fff" /><Text style={pkgStyles.badgeText}>Best Exposure</Text></View>}
      <View style={pkgStyles.row}>
        <View style={pkgStyles.durationBlock}>
          <View style={[pkgStyles.iconBg, selected && pkgStyles.iconBgSelected]}>
            <MaterialIcons name="rocket-launch" size={20} color={selected ? Colors.textOnGold : Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={pkgStyles.label}>{pkg.label}</Text>
            <Text style={pkgStyles.description}>{pkg.description}</Text>
          </View>
        </View>
        <View style={pkgStyles.priceBlock}>
          {isUpgrade && !nativeLocalizedPrice && <Text style={pkgStyles.upgradeLabel}>UPGRADE</Text>}
          <Text style={[pkgStyles.price, selected && { color: Colors.gold }]}>{priceLabel}</Text>
          {isUpgrade && !nativeLocalizedPrice && <Text style={pkgStyles.priceFull}>full ${pkg.price.toFixed(2)}</Text>}
        </View>
      </View>
      <View style={pkgStyles.perksRow}>
        {['Top of featured & browse results', `${estImpressions} impressions`, '⭐ Boosted badge on your card'].map((perk) => (
          <View key={perk} style={pkgStyles.perk}>
            <MaterialIcons name="check-circle" size={12} color={selected ? Colors.greenLight : Colors.textMuted} />
            <Text style={[pkgStyles.perkText, selected && { color: Colors.textSecondary }]}>{perk}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
const pkgStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, padding: Spacing.base, marginBottom: Spacing.md, overflow: 'hidden', position: 'relative' },
  cardSelected: { borderColor: Colors.gold },
  badge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  badgeText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textOnGold },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, marginBottom: Spacing.md },
  durationBlock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  iconBg: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconBgSelected: { backgroundColor: Colors.gold },
  label: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  description: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  priceBlock: { alignItems: 'flex-end' },
  upgradeLabel: { fontSize: 9, fontWeight: Typography.bold, color: Colors.greenLight, letterSpacing: 0.5 },
  price: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary },
  priceFull: { fontSize: 10, color: Colors.textMuted, textDecorationLine: 'line-through' },
  perksRow: { gap: 5 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perkText: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
});

export default function BoostEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();
  const { getEventById, refreshEvents, isLoading } = useEvents();
  const { boostProducts, isPurchasing, purchasingProductId, purchaseBoost } = useIAP();

  const [selectedPkg, setSelectedPkg] = useState<BoostPackage>(BOOST_PACKAGES[1]);
  const [processing, setProcessing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successIsFreeCredit, setSuccessIsFreeCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditProcessing, setCreditProcessing] = useState(false);
  const [creditSelectedPkg, setCreditSelectedPkg] = useState<BoostPackage>(BOOST_PACKAGES[1]);
  const [showCreditDurationPicker, setShowCreditDurationPicker] = useState(false);

  const event = getEventById(id ?? '');
  if (!event && !isLoading) {
    return (
      <View style={styles.notFound}><SafeAreaView edges={['top']} />
        <MaterialIcons name="event-busy" size={40} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}><Text style={styles.backLinkText}>Go Back</Text></Pressable>
      </View>
    );
  }
  if (!event) return null;

  const now = new Date();
  const isAlreadyBoosted = !!(event.boosted && (event.boostStatus ?? 'active') === 'active' &&
    (event.boostType === 'until_event_end' || !event.boostExpiresAt || new Date(event.boostExpiresAt) > now));
  const availablePackages = isAlreadyBoosted && event.boostType
    ? BOOST_PACKAGES.filter((pkg) => (UPGRADE_PRICES[event.boostType!] ?? {})[pkg.id] !== undefined)
    : BOOST_PACKAGES;
  const isUpgradeMode = isAlreadyBoosted && availablePackages.length > 0;
  const noUpgradeAvailable = isAlreadyBoosted && availablePackages.length === 0;

  const getDisplayPrice = (pkg: BoostPackage): number =>
    isAlreadyBoosted && event.boostType ? (UPGRADE_PRICES[event.boostType]?.[pkg.id] ?? pkg.price) : pkg.price;

  const getNativePrice = (pkg: BoostPackage): string | null => {
    if (!boostProducts.length) return null;
    const pid = isAppleIAP ? pkg.appleProductId : isGoogleIAP ? pkg.googleProductId : null;
    return pid ? (boostProducts.find((p) => p.productId === pid)?.localizedPrice ?? null) : null;
  };

  const handleUseCredit = async (pkg: BoostPackage) => {
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to use your boost credits.'); return; }
    setCreditProcessing(true); setError(null); setShowCreditDurationPicker(false);
    try {
      const result = await consumeBoostCredit(id ?? '', pkg.id as 'three_day' | 'seven_day' | 'until_event_end');
      if (!result.ok) { setError(result.error ?? 'Could not use boost credit. Please try again.'); return; }
      await refreshProfile(); await refreshEvents();
      setSuccessIsFreeCredit(true); setCreditSelectedPkg(pkg); setSuccess(true);
    } catch (e: any) { setError(e?.message ?? 'Unexpected error. Please try again.'); }
    finally { setCreditProcessing(false); }
  };

  const boostExpiryLabel = event.boostType === 'until_event_end'
    ? `Until event ends · ${formatDate(event.date)}`
    : event.boostExpiresAt
      ? `Expires ${new Date(event.boostExpiresAt).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : null;

  const handleAppleBoost = async () => {
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to boost your event.'); return; }
    if (!selectedPkg.appleProductId) { setError('This boost package is not available for Apple IAP.'); return; }
    setError(null);
    const result = await purchaseBoost(selectedPkg.appleProductId as AppleBoostProductId, user.id, id ?? '');
    if (result.ok) { await refreshProfile(); await refreshEvents(); setSuccessIsFreeCredit(false); setSuccess(true); }
    else if (result.error && result.error !== 'Purchase cancelled') setError(result.error);
  };

  const handleGoogleBoost = async () => {
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to boost your event.'); return; }
    if (!selectedPkg.googleProductId) { setError('This boost package is not available via Google Play.'); return; }
    setError(null);
    const result = await purchaseBoost(selectedPkg.googleProductId as GoogleBoostProductId, user.id, id ?? '');
    if (result.ok) { await refreshProfile(); await refreshEvents(); setSuccessIsFreeCredit(false); setSuccess(true); }
    else if (result.error && result.error !== 'Purchase cancelled') setError(result.error);
  };

  const handleStripeBoost = async () => {
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to boost your event.'); return; }
    setSuccessIsFreeCredit(false); setProcessing(true); setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-boost-checkout', {
        body: { event_id: id, boost_type: selectedPkg.id, platform: Platform.OS },
      });
      if (fnError) {
        let msg = fnError.message ?? 'Checkout creation failed';
        if (fnError instanceof FunctionsHttpError) { try { msg = (await fnError.context?.text()) || msg; } catch {} }
        setError(msg); setProcessing(false); return;
      }
      if (!data?.url) { setError('No checkout URL returned. Please try again.'); setProcessing(false); return; }
      const result = await WebBrowser.openAuthSessionAsync(data.url, 'vybzhub://');
      if (result.type === 'success' && result.url?.includes('boost-success')) {
        setProcessing(false); setPolling(true); await refreshEvents(); setPolling(false); setSuccess(true);
      } else { setProcessing(false); }
    } catch (err) { setError(`An error occurred: ${String(err)}`); setProcessing(false); }
  };

  const isNativeIAP = isAppleIAP || isGoogleIAP;
  const handleBoost = isAppleIAP ? handleAppleBoost : isGoogleIAP ? handleGoogleBoost : handleStripeBoost;
  const isBoostProcessing = isNativeIAP
    ? (isPurchasing && purchasingProductId === (isAppleIAP ? selectedPkg.appleProductId : selectedPkg.googleProductId))
    : processing;

  if (polling) {
    return (
      <View style={styles.pollingContainer}><SafeAreaView edges={['top']} />
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.pollingTitle}>Payment Confirmed</Text>
        <Text style={styles.pollingSub}>Your boost is activating — this takes just a moment.</Text>
      </View>
    );
  }

  if (success) {
    const activePkg = successIsFreeCredit ? creditSelectedPkg : selectedPkg;
    const durationLabel = activePkg.id === 'until_event_end' ? 'Until event ends' : `${activePkg.days} days`;
    return (
      <View style={styles.successContainer}><SafeAreaView edges={['top']} />
        <View style={styles.successContent}>
          <View style={styles.successIcon}><MaterialIcons name="rocket-launch" size={44} color={Colors.gold} /></View>
          <Text style={styles.successTitle}>{successIsFreeCredit ? 'Boost Activated!' : 'Payment Confirmed!'}</Text>
          {successIsFreeCredit ? (
            <View style={styles.creditUsedBadge}><MaterialIcons name="redeem" size={14} color={Colors.greenLight} /><Text style={styles.creditUsedText}>1 free boost credit used</Text></View>
          ) : null}
          <Text style={styles.successSub}>
            {event.title} will appear at the top of featured and browse results
            {activePkg.id === 'until_event_end' ? ' until your event ends' : ` for ${activePkg.days} days`}.
          </Text>
          <View style={styles.successStats}>
            <BoostStat icon="visibility" label="Est. Views" value={activePkg.id === 'until_event_end' ? '1,000+' : `${(activePkg.days * 200).toLocaleString()}+`} color={Colors.gold} />
            <BoostStat icon="trending-up" label="Duration" value={durationLabel} color={Colors.greenLight} />
            <BoostStat icon="people" label="Reach" value="Island-wide" color="#9C27B0" />
          </View>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.doneBtnInner}>
              <MaterialIcons name="check" size={18} color={Colors.textOnGold} /><Text style={styles.doneBtnText}>Done</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.topBarTitle} numberOfLines={1}>{isUpgradeMode ? 'Upgrade Boost' : 'Boost Event'}</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Free Credit Banner */}
        {(user?.remainingBoosts ?? 0) > 0 && !isAlreadyBoosted && !noUpgradeAvailable && (
          <View style={styles.creditBanner}>
            <LinearGradient colors={[`${Colors.greenLight}14`, `${Colors.greenLight}06`]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.creditBannerLeft}>
              <View style={styles.creditIconWrap}><MaterialIcons name="redeem" size={20} color={Colors.greenLight} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.creditBannerTitle}>You have free boost credits</Text>
                <Text style={styles.creditBannerSub}>{user!.remainingBoosts} credit{(user!.remainingBoosts ?? 0) !== 1 ? 's' : ''} remaining this month</Text>
              </View>
            </View>
            <Pressable onPress={() => setShowCreditDurationPicker(true)} disabled={creditProcessing}
              style={({ pressed }) => [styles.useFreeCreditBtn, pressed && { opacity: 0.85 }]}>
              <LinearGradient colors={[Colors.greenLight, Colors.greenLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.useFreeCreditBtnInner}>
                {creditProcessing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="rocket-launch" size={14} color="#fff" />}
                <Text style={styles.useFreeCreditBtnText}>{creditProcessing ? 'Activating...' : 'Use Free Boost'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* Credit Duration Picker */}
        {showCreditDurationPicker && (
          <View style={styles.creditPickerCard}>
            <View style={styles.creditPickerHeader}>
              <View style={styles.creditPickerIconWrap}><MaterialIcons name="redeem" size={18} color={Colors.greenLight} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.creditPickerTitle}>Choose Boost Duration</Text>
                <Text style={styles.creditPickerSub}>1 free credit will be used</Text>
              </View>
              <Pressable onPress={() => setShowCreditDurationPicker(false)} style={({ pressed }) => [styles.creditPickerClose, pressed && { opacity: 0.7 }]}>
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
            {BOOST_PACKAGES.map((pkg) => (
              <Pressable key={pkg.id} onPress={() => handleUseCredit(pkg)}
                style={({ pressed }) => [styles.creditDurationOption, creditSelectedPkg.id === pkg.id && styles.creditDurationOptionSelected, pressed && { opacity: 0.85 }]}>
                <View style={[styles.creditDurationIcon, creditSelectedPkg.id === pkg.id && styles.creditDurationIconSelected]}>
                  <MaterialIcons name="rocket-launch" size={16} color={creditSelectedPkg.id === pkg.id ? Colors.textOnGold : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.creditDurationLabel}>{pkg.label}</Text>
                  <Text style={styles.creditDurationDesc}>{pkg.description}</Text>
                </View>
                <View style={styles.creditFreePill}><Text style={styles.creditFreePillText}>FREE</Text></View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Event preview */}
        <View style={styles.eventPreview}>
          <Image source={{ uri: event.coverImage }} placeholder={require('../../../assets/images/icon.png')} style={styles.eventThumb} contentFit="cover" transition={200} />
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
            <View style={styles.eventMeta}>
              <MaterialIcons name="place" size={12} color={Colors.gold} /><Text style={styles.eventMetaText}>{event.parish}</Text>
              <View style={styles.dot} />
              <MaterialIcons name="event" size={12} color={Colors.textMuted} /><Text style={styles.eventMetaText}>{formatDate(event.date)}</Text>
            </View>
            <View style={styles.heatRow}><MaterialIcons name="people" size={12} color={Colors.textMuted} /><Text style={styles.heatText}>{formatCount(event.goingCount + event.interestedCount)} interested</Text></View>
          </View>
        </View>

        {isAlreadyBoosted && (
          <View style={styles.alreadyBoosted}>
            <MaterialIcons name="rocket-launch" size={16} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alreadyBoostedTitle}>{BOOST_TYPE_LABELS[event.boostType ?? ''] ?? 'Boost'} Active</Text>
              {boostExpiryLabel && <Text style={styles.alreadyBoostedSub}>{boostExpiryLabel}</Text>}
            </View>
            <View style={styles.impressionsBadge}>
              <MaterialIcons name="visibility" size={11} color={Colors.gold} />
              <Text style={styles.impressionsBadgeText}>{formatCount(event.boostImpressions ?? 0)} views</Text>
            </View>
          </View>
        )}

        {noUpgradeAvailable && (
          <View style={styles.maxBoostCard}>
            <MaterialIcons name="verified" size={22} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.maxBoostTitle}>Maximum Boost Active</Text>
              <Text style={styles.maxBoostSub}>Your event has the highest visibility boost — it runs until the event ends.</Text>
            </View>
          </View>
        )}

        {isUpgradeMode && <View style={styles.sectionHeader}><View style={styles.goldBar} /><Text style={styles.sectionTitle}>Upgrade Your Boost</Text></View>}

        {!noUpgradeAvailable && (
          <View style={styles.benefitsCard}>
            <View style={styles.goldBar} />
            <Text style={styles.benefitsTitle}>{isUpgradeMode ? 'Why upgrade?' : 'What boosting does'}</Text>
            {[
              { icon: 'star', text: 'Featured at the top of the home feed', color: '#FF9800' },
              { icon: 'arrow-upward', text: 'Pins your event to the top of Browse results', color: Colors.gold },
              { icon: 'bolt', text: '⭐ Boosted badge on your event card', color: Colors.greenLight },
              { icon: 'bar-chart', text: 'Real-time impression analytics', color: '#00BCD4' },
            ].map(({ icon, text, color }) => (
              <View key={text} style={styles.benefit}>
                <View style={[styles.benefitIcon, { backgroundColor: `${color}18` }]}><MaterialIcons name={icon as any} size={15} color={color} /></View>
                <Text style={styles.benefitText}>{text}</Text>
              </View>
            ))}
          </View>
        )}

        {!noUpgradeAvailable && (
          <>
            <View style={styles.sectionHeader}><View style={styles.goldBar} /><Text style={styles.sectionTitle}>{isUpgradeMode ? 'Select Upgrade' : 'Choose a Boost Package'}</Text></View>
            {availablePackages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} selected={selectedPkg.id === pkg.id} onSelect={() => setSelectedPkg(pkg)}
                displayPrice={getDisplayPrice(pkg)} isUpgrade={isUpgradeMode} nativeLocalizedPrice={getNativePrice(pkg)} />
            ))}
          </>
        )}

        {error ? (
          <View style={styles.errorCard}><MaterialIcons name="error-outline" size={16} color="#FF6B6B" /><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        {!isAlreadyBoosted && (user?.subscriptionTier ?? 'free') === 'free' && (user?.remainingBoosts ?? 0) === 0 && (
          <Pressable onPress={() => router.push('/monetization/upgrade' as any)} style={({ pressed }) => [styles.upsellCard, pressed && { opacity: 0.9 }]}>
            <LinearGradient colors={['#1A0E00', Colors.surface]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.upsellContent}>
              <MaterialIcons name="star" size={22} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.upsellTitle}>Get free boosts with Pro</Text>
                <Text style={styles.upsellSub}>Pro includes 2 Boost credits/cycle. Elite gets 6.</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
            </View>
          </Pressable>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {!noUpgradeAvailable && (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyLabel}>{isUpgradeMode ? `Upgrade to ${selectedPkg.label}` : selectedPkg.label}</Text>
            <Text style={styles.stickyPrice}>
              {isNativeIAP
                ? (getNativePrice(selectedPkg) ?? `$${getDisplayPrice(selectedPkg).toFixed(2)}`)
                : `$${getDisplayPrice(selectedPkg).toFixed(2)}${isUpgradeMode ? ' · upgrade price' : ` · ${selectedPkg.duration}`}`}
            </Text>
          </View>
          <Pressable onPress={handleBoost} disabled={isBoostProcessing}
            style={({ pressed }) => [styles.boostBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.boostBtnInner}>
              {isBoostProcessing
                ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                : <MaterialIcons name={isAppleIAP ? 'apple' : isGoogleIAP ? 'android' : 'rocket-launch'} size={16} color={Colors.textOnGold} />
              }
              <Text style={styles.boostBtnText}>
                {isBoostProcessing ? 'Purchasing...'
                  : isUpgradeMode ? 'Upgrade Now'
                  : isAppleIAP ? 'Buy with Apple'
                  : isGoogleIAP ? 'Buy with Google Play'
                  : 'Boost Now'}
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
  notFound: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundText: { fontSize: Typography.base, color: Colors.textMuted },
  backLink: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder },
  backLinkText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  pollingContainer: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  pollingTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  pollingSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  topBarTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base, gap: Spacing.md },
  eventPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  eventThumb: { width: 90, height: 90, flexShrink: 0 },
  eventInfo: { flex: 1, paddingVertical: Spacing.md, paddingRight: Spacing.md, gap: 4 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 22 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  eventMetaText: { fontSize: 11, color: Colors.textMuted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.surfaceBorder },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heatText: { fontSize: Typography.xs, color: Colors.textMuted },
  alreadyBoosted: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}44` },
  alreadyBoostedTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  alreadyBoostedSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  impressionsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,215,0,0.15)', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: `${Colors.gold}33` },
  impressionsBadgeText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  maxBoostCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.xl, padding: Spacing.base, borderWidth: 1.5, borderColor: Colors.gold },
  maxBoostTitle: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.gold },
  maxBoostSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 19 },
  benefitsCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.sm },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  benefitsTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,107,107,0.1)', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)' },
  errorText: { flex: 1, fontSize: Typography.sm, color: '#FF8888', lineHeight: 19 },
  upsellCard: { borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: `${Colors.gold}33` },
  upsellContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  upsellTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  upsellSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },
  stickyBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingTop: Spacing.md, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  stickyLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  stickyPrice: { fontSize: Typography.xs, color: Colors.gold, marginTop: 2 },
  boostBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  boostBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  boostBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  successContainer: { flex: 1, backgroundColor: Colors.background },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  successIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${Colors.gold}44` },
  successTitle: { fontSize: 26, fontWeight: Typography.black, color: Colors.textPrimary },
  successSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successStats: { flexDirection: 'row', gap: Spacing.sm, alignSelf: 'stretch' },
  doneBtn: { borderRadius: Radius.lg, overflow: 'hidden', alignSelf: 'stretch' },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  doneBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  creditUsedBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: `${Colors.greenLight}18`, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  creditUsedText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.bold },
  creditBanner: { borderRadius: Radius.xl, borderWidth: 1.5, borderColor: `${Colors.greenLight}44`, overflow: 'hidden', padding: Spacing.md, gap: Spacing.sm },
  creditBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  creditIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: `${Colors.greenLight}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  creditBannerTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.greenLight },
  creditBannerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  useFreeCreditBtn: { borderRadius: Radius.md, overflow: 'hidden' },
  useFreeCreditBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  useFreeCreditBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff' },
  creditPickerCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: `${Colors.greenLight}44`, padding: Spacing.base, gap: Spacing.md },
  creditPickerHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  creditPickerIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: `${Colors.greenLight}18`, alignItems: 'center', justifyContent: 'center' },
  creditPickerTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  creditPickerSub: { fontSize: Typography.xs, color: Colors.greenLight, marginTop: 1 },
  creditPickerClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  creditDurationOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  creditDurationOptionSelected: { borderColor: Colors.greenLight, backgroundColor: `${Colors.greenLight}10` },
  creditDurationIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  creditDurationIconSelected: { backgroundColor: Colors.greenLight },
  creditDurationLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  creditDurationDesc: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  creditFreePill: { backgroundColor: `${Colors.greenLight}18`, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  creditFreePillText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.greenLight, letterSpacing: 0.5 },
});
