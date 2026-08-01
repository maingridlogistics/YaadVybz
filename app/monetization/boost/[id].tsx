import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useEvents } from '../../../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { BOOST_PACKAGES, BoostPackage, formatDate, formatCount } from '../../../constants/data';

// ─── Boost analytics preview ──────────────────────────────────────────────────
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
  card: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
});

// ─── Package Card ─────────────────────────────────────────────────────────────
function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: BoostPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        pkgStyles.card,
        selected && pkgStyles.cardSelected,
        pressed && { opacity: 0.9 },
      ]}
    >
      {selected && (
        <LinearGradient
          colors={[`${Colors.gold}18`, `${Colors.gold}08`]}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {pkg.popular && (
        <View style={pkgStyles.popularBadge}>
          <MaterialIcons name="bolt" size={10} color={Colors.textOnGold} />
          <Text style={pkgStyles.popularText}>Popular</Text>
        </View>
      )}
      <View style={pkgStyles.row}>
        <View style={pkgStyles.durationBlock}>
          <View style={[pkgStyles.iconBg, selected && pkgStyles.iconBgSelected]}>
            <MaterialIcons name="rocket-launch" size={20} color={selected ? Colors.textOnGold : Colors.textMuted} />
          </View>
          <View>
            <Text style={pkgStyles.label}>{pkg.label}</Text>
            <Text style={pkgStyles.description}>{pkg.description}</Text>
          </View>
        </View>
        <View style={pkgStyles.priceBlock}>
          <Text style={[pkgStyles.price, selected && { color: Colors.gold }]}>${pkg.price}</Text>
          <Text style={pkgStyles.pricePer}>/{pkg.duration}</Text>
        </View>
      </View>
      <View style={pkgStyles.perksRow}>
        {[
          'Top of search results',
          `${pkg.days * 200} est. impressions`,
          'Boosted badge',
        ].map((perk) => (
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
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, marginBottom: Spacing.md,
    overflow: 'hidden', position: 'relative',
  },
  cardSelected: { borderColor: Colors.gold },
  popularBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  popularText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textOnGold },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, marginBottom: Spacing.md },
  durationBlock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  iconBg: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
  },
  iconBgSelected: { backgroundColor: Colors.gold },
  label: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  description: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  priceBlock: { alignItems: 'flex-end' },
  price: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary },
  pricePer: { fontSize: Typography.xs, color: Colors.textMuted },
  perksRow: { gap: 5 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perkText: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
});

// ─── Main Boost Screen ─────────────────────────────────────────────────────────
export default function BoostEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getEventById, boostEvent } = useEvents();

  const [selectedPkg, setSelectedPkg] = useState<BoostPackage>(BOOST_PACKAGES[1]); // default 7-day
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const event = getEventById(id ?? '');

  if (!event) {
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="event-busy" size={40} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isAlreadyBoosted = event.boosted;
  const boostExpiry = event.boostExpiresAt
    ? new Date(event.boostExpiresAt).toLocaleDateString('en-JM', { month: 'short', day: 'numeric' })
    : null;

  const handleBoost = async () => {
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1400)); // simulate payment
    boostEvent(event.id, selectedPkg.days);
    setProcessing(false);
    setSuccess(true);
  };

  if (success) {
    return (
      <View style={styles.successContainer}>
        <SafeAreaView edges={['top']} />
        <View style={styles.successContent}>
          <View style={styles.successIcon}>
            <MaterialIcons name="rocket-launch" size={44} color={Colors.gold} />
          </View>
          <Text style={styles.successTitle}>Event Boosted!</Text>
          <Text style={styles.successSub}>
            {event.title} will appear at the top of browse results and search for the next {selectedPkg.days} day{selectedPkg.days !== 1 ? 's' : ''}.
          </Text>
          <View style={styles.successStats}>
            <BoostStat icon="visibility" label="Est. Views" value={`${(selectedPkg.days * 200).toLocaleString()}+`} color={Colors.gold} />
            <BoostStat icon="trending-up" label="Duration" value={selectedPkg.duration} color={Colors.greenLight} />
            <BoostStat icon="people" label="Reach" value="Island-wide" color="#9C27B0" />
          </View>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.doneBtnInner}>
              <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
              <Text style={styles.doneBtnText}>Done</Text>
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
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.topBarTitle} numberOfLines={1}>Boost Event</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Event preview card */}
        <View style={styles.eventPreview}>
          <Image source={{ uri: event.coverImage }} style={styles.eventThumb} contentFit="cover" transition={200} />
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
            <View style={styles.eventMeta}>
              <MaterialIcons name="place" size={12} color={Colors.gold} />
              <Text style={styles.eventMetaText}>{event.parish}</Text>
              <View style={styles.dot} />
              <MaterialIcons name="event" size={12} color={Colors.textMuted} />
              <Text style={styles.eventMetaText}>{formatDate(event.date)}</Text>
            </View>
            <View style={styles.heatRow}>
              <MaterialIcons name="people" size={12} color={Colors.textMuted} />
              <Text style={styles.heatText}>{formatCount(event.goingCount + event.interestedCount)} interested</Text>
            </View>
          </View>
        </View>

        {/* Already boosted notice */}
        {isAlreadyBoosted && (
          <View style={styles.alreadyBoosted}>
            <MaterialIcons name="rocket-launch" size={16} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alreadyBoostedTitle}>Currently Boosted</Text>
              {boostExpiry && (
                <Text style={styles.alreadyBoostedSub}>Boost expires {boostExpiry}</Text>
              )}
            </View>
            <View style={styles.impressionsBadge}>
              <MaterialIcons name="visibility" size={11} color={Colors.gold} />
              <Text style={styles.impressionsBadgeText}>{formatCount(event.boostImpressions ?? 0)} views</Text>
            </View>
          </View>
        )}

        {/* What boosting does */}
        <View style={styles.benefitsCard}>
          <View style={styles.goldBar} />
          <Text style={styles.benefitsTitle}>What boosting does</Text>
          {[
            { icon: 'arrow-upward', text: 'Pins your event to the top of Browse results', color: Colors.gold },
            { icon: 'search', text: 'Priority placement in Search and Map views', color: '#00BCD4' },
            { icon: 'bolt', text: 'Boosted badge on your event card', color: '#FF9800' },
            { icon: 'bar-chart', text: 'Track impressions in real-time analytics', color: Colors.greenLight },
          ].map(({ icon, text, color }) => (
            <View key={text} style={styles.benefit}>
              <View style={[styles.benefitIcon, { backgroundColor: `${color}18` }]}>
                <MaterialIcons name={icon as any} size={15} color={color} />
              </View>
              <Text style={styles.benefitText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Package selection */}
        <View style={styles.sectionHeader}>
          <View style={styles.goldBar} />
          <Text style={styles.sectionTitle}>Choose a Boost Package</Text>
        </View>

        {BOOST_PACKAGES.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            selected={selectedPkg.id === pkg.id}
            onSelect={() => setSelectedPkg(pkg)}
          />
        ))}

        {/* Pro plan upsell */}
        {(user?.subscriptionTier ?? 'free') === 'free' && (
          <Pressable
            onPress={() => router.push('/monetization/upgrade' as any)}
            style={({ pressed }) => [styles.upsellCard, pressed && { opacity: 0.9 }]}
          >
            <LinearGradient colors={['#1A0E00', Colors.surface]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.upsellContent}>
              <MaterialIcons name="star" size={22} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.upsellTitle}>Get free boosts with Pro</Text>
                <Text style={styles.upsellSub}>Promoter Pro includes 1 free boost/month. Elite gets 5.</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
            </View>
          </Pressable>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky pay button */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.stickyLabel}>{selectedPkg.label}</Text>
          <Text style={styles.stickyPrice}>${selectedPkg.price} — {selectedPkg.duration}</Text>
        </View>
        <Pressable
          onPress={handleBoost}
          disabled={processing}
          style={({ pressed }) => [styles.boostBtn, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.boostBtnInner}>
            <MaterialIcons name="rocket-launch" size={16} color={Colors.textOnGold} />
            <Text style={styles.boostBtnText}>
              {processing ? 'Processing...' : isAlreadyBoosted ? 'Extend Boost' : 'Boost Now'}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  notFound: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundText: { fontSize: Typography.base, color: Colors.textMuted },
  backLink: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder },
  backLinkText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  topBarTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1, textAlign: 'center' },

  content: { padding: Spacing.base, gap: Spacing.md },

  eventPreview: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  eventThumb: { width: 90, height: 90, flexShrink: 0 },
  eventInfo: { flex: 1, paddingVertical: Spacing.md, paddingRight: Spacing.md, gap: 4 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 22 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  eventMetaText: { fontSize: 11, color: Colors.textMuted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.surfaceBorder },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heatText: { fontSize: Typography.xs, color: Colors.textMuted },

  alreadyBoosted: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  alreadyBoostedTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  alreadyBoostedSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  impressionsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,215,0,0.15)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  impressionsBadgeText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  benefitsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: Spacing.sm,
  },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  benefitsTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  upsellCard: {
    borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  upsellContent: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  upsellTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  upsellSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },

  stickyBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  stickyLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  stickyPrice: { fontSize: Typography.xs, color: Colors.gold, marginTop: 2 },
  boostBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  boostBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  boostBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Success
  successContainer: { flex: 1, backgroundColor: Colors.background },
  successContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.lg,
  },
  successIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  successTitle: { fontSize: 26, fontWeight: Typography.black, color: Colors.textPrimary },
  successSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successStats: { flexDirection: 'row', gap: Spacing.sm, alignSelf: 'stretch' },
  doneBtn: { borderRadius: Radius.lg, overflow: 'hidden', alignSelf: 'stretch' },
  doneBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  doneBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
