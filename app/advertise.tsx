import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

// ─── Data ─────────────────────────────────────────────────────────────────────
const AD_SIZES = [
  {
    id: 'rectangle',
    icon: 'crop-landscape',
    name: 'Banner',
    dimensions: '320 × 80 px',
    description: 'Full-width horizontal strip shown inline between content sections. High visibility, low intrusion.',
    placements: ['Home Feed', 'Browse Feed', 'Post-Event Confirmation'],
    best: 'Brand awareness & promotions',
  },
  {
    id: 'square',
    icon: 'crop-square',
    name: 'Square Card',
    dimensions: '320 × 320 px',
    description: 'Large square format displayed in featured sections. Maximum visual impact for campaign launches.',
    placements: ['Featured Section', 'Event Detail Side Panel'],
    best: 'Product launches & events',
  },
];

const PRICING_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'USD $49',
    period: '/ week',
    color: '#42A5F5',
    icon: 'star-border',
    features: [
      '1 ad placement of your choice',
      'Up to 2 active creatives',
      'Banner or Square format',
      'Basic performance report',
    ],
    cta: 'Get Started',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 'USD $129',
    period: '/ week',
    color: Colors.gold,
    icon: 'rocket-launch',
    featured: true,
    features: [
      '3 placements across the app',
      'Up to 5 active creatives',
      'Both Banner & Square formats',
      'Weekly analytics report',
      'Priority placement rotation',
    ],
    cta: 'Start Growth Plan',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    color: '#E91E63',
    icon: 'business',
    features: [
      'Unlimited placements',
      'Dedicated account manager',
      'Custom creative guidelines',
      'Real-time dashboard access',
      'Co-branded campaigns',
      'Monthly strategy calls',
    ],
    cta: 'Contact Sales',
  },
];

const BENEFITS = [
  { icon: 'people', title: 'Targeted Audience', desc: 'Reach event-goers and nightlife enthusiasts actively browsing Jamaica\'s top events.' },
  { icon: 'place', title: 'Parish-Level Reach', desc: 'Ads shown across all 14 parishes. Pinpoint your ideal demographic by location.' },
  { icon: 'trending-up', title: 'High Engagement', desc: 'Users spend quality time discovering events — your ad is seen in a high-intent context.' },
  { icon: 'devices', title: 'iOS & Android', desc: 'Native mobile ad formats that look beautiful on every device.' },
];

const FAQS = [
  {
    q: 'What file formats do you accept for ad creatives?',
    a: 'We accept JPEG, PNG, and WebP images. Maximum file size is 5 MB. We recommend high-resolution assets (at least 2× the display size).',
  },
  {
    q: 'How quickly will my ad go live?',
    a: 'After submission and payment confirmation, ads are typically reviewed and activated within 1 business day.',
  },
  {
    q: 'Can I change my creative mid-campaign?',
    a: 'Yes. You can submit updated creatives at any time. Changes go live within 24 hours of review.',
  },
  {
    q: 'Is there a minimum campaign length?',
    a: 'The minimum campaign length is one week. Monthly packages are available at a discounted rate.',
  },
  {
    q: 'How do I track my ad performance?',
    a: 'Impression and click-through data is included in weekly reports for Growth plans and above. Enterprise clients get real-time dashboard access.',
  },
];

// ─── Components ────────────────────────────────────────────────────────────────
function BenefitCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={benefitStyles.card}>
      <View style={benefitStyles.iconWrap}>
        <MaterialIcons name={icon as any} size={22} color={Colors.gold} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={benefitStyles.title}>{title}</Text>
        <Text style={benefitStyles.desc}>{desc}</Text>
      </View>
    </View>
  );
}
const benefitStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    flexShrink: 0,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  desc: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
});

function SizeCard({ size }: { size: typeof AD_SIZES[0] }) {
  return (
    <View style={sizeStyles.card}>
      <View style={sizeStyles.header}>
        <View style={sizeStyles.iconWrap}>
          <MaterialIcons name={size.icon as any} size={22} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sizeStyles.name}>{size.name}</Text>
          <Text style={sizeStyles.dims}>{size.dimensions}</Text>
        </View>
      </View>
      <Text style={sizeStyles.desc}>{size.description}</Text>
      <View style={sizeStyles.row}>
        <MaterialIcons name="place" size={12} color={Colors.textMuted} />
        <Text style={sizeStyles.meta}>Placements: {size.placements.join(', ')}</Text>
      </View>
      <View style={[sizeStyles.bestTag]}>
        <MaterialIcons name="check-circle" size={12} color={Colors.greenLight} />
        <Text style={sizeStyles.bestText}>Best for: {size.best}</Text>
      </View>
    </View>
  );
}
const sizeStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    flexShrink: 0,
  },
  name: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  dims: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  desc: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  bestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${Colors.greenLight}12`,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: `${Colors.greenLight}30`,
    alignSelf: 'flex-start',
  },
  bestText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.semibold as any },
});

function PricingCard({ tier, onContact }: { tier: typeof PRICING_TIERS[0]; onContact: () => void }) {
  return (
    <View style={[pricingStyles.card, tier.featured && pricingStyles.cardFeatured]}>
      {tier.featured && (
        <View style={pricingStyles.popularBadge}>
          <MaterialIcons name="star" size={11} color={Colors.textOnGold} />
          <Text style={pricingStyles.popularText}>Most Popular</Text>
        </View>
      )}
      <View style={pricingStyles.header}>
        <View style={[pricingStyles.iconWrap, { backgroundColor: `${tier.color}18` }]}>
          <MaterialIcons name={tier.icon as any} size={20} color={tier.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pricingStyles.name}>{tier.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text style={[pricingStyles.price, { color: tier.color }]}>{tier.price}</Text>
            {tier.period ? <Text style={pricingStyles.period}>{tier.period}</Text> : null}
          </View>
        </View>
      </View>
      <View style={pricingStyles.featureList}>
        {tier.features.map((f) => (
          <View key={f} style={pricingStyles.featureRow}>
            <MaterialIcons name="check" size={14} color={tier.color} />
            <Text style={pricingStyles.featureText}>{f}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onContact}
        style={({ pressed }) => [
          pricingStyles.ctaBtn,
          tier.featured && pricingStyles.ctaBtnFeatured,
          pressed && { opacity: 0.85 },
        ]}
      >
        {tier.featured ? (
          <LinearGradient
            colors={[Colors.gold, Colors.goldDim]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={pricingStyles.ctaBtnInner}
          >
            <Text style={[pricingStyles.ctaText, { color: Colors.textOnGold }]}>{tier.cta}</Text>
            <MaterialIcons name="arrow-forward" size={15} color={Colors.textOnGold} />
          </LinearGradient>
        ) : (
          <View style={[pricingStyles.ctaBtnInner, { backgroundColor: `${tier.color}18`, borderRadius: Radius.lg }]}>
            <Text style={[pricingStyles.ctaText, { color: tier.color }]}>{tier.cta}</Text>
            <MaterialIcons name="arrow-forward" size={15} color={tier.color} />
          </View>
        )}
      </Pressable>
    </View>
  );
}
const pricingStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    gap: Spacing.md,
    position: 'relative',
  },
  cardFeatured: {
    borderColor: `${Colors.gold}77`,
    borderWidth: 2,
    backgroundColor: `${Colors.gold}06`,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  popularText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: Colors.textOnGold },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  price: { fontSize: 22, fontWeight: Typography.black as any },
  period: { fontSize: Typography.sm, color: Colors.textMuted },
  featureList: { gap: Spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  featureText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnFeatured: {},
  ctaBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  ctaText: { fontSize: Typography.base, fontWeight: Typography.bold as any },
});

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={({ pressed }) => [faqStyles.item, pressed && { opacity: 0.85 }]}
    >
      <View style={faqStyles.row}>
        <Text style={faqStyles.question}>{q}</Text>
        <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={Colors.textMuted} />
      </View>
      {open && <Text style={faqStyles.answer}>{a}</Text>}
    </Pressable>
  );
}
const faqStyles = StyleSheet.create({
  item: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  question: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary, lineHeight: 20 },
  answer: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
});

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={headStyles.wrap}>
      <View style={headStyles.bar} />
      <View style={{ flex: 1 }}>
        <Text style={headStyles.title}>{title}</Text>
        {sub ? <Text style={headStyles.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}
const headStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
  bar: { width: 3, height: 22, borderRadius: 2, backgroundColor: Colors.gold, marginTop: 2, flexShrink: 0 },
  title: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  sub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 3, lineHeight: 18 },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function AdvertiseScreen() {
  const router = useRouter();

  const handleContact = (tier?: string) => {
    const subject = tier
      ? `Advertise on Vybz Hub — ${tier} Plan Inquiry`
      : 'Advertise on Vybz Hub — General Inquiry';
    Linking.openURL(
      `mailto:ads@vybzhub.com?subject=${encodeURIComponent(subject)}`
    ).catch(() => {
      Linking.openURL('mailto:contact@vybzhub.com').catch(() => {});
    });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Advertise with Us</Text>
            <Text style={styles.headerSub}>Reach event-goers across Jamaica</Text>
          </View>
          <View style={styles.headerBadge}>
            <MaterialIcons name="campaign" size={13} color={Colors.textOnGold} />
            <Text style={styles.headerBadgeText}>Ads</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Hero ── */}
        <LinearGradient
          colors={[`${Colors.gold}18`, Colors.background]}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.heroIconGrad}>
              <MaterialIcons name="campaign" size={40} color={Colors.textOnGold} />
            </LinearGradient>
          </View>
          <Text style={styles.heroTitle}>Grow Your Brand{'\n'}with Vybz Hub</Text>
          <Text style={styles.heroSub}>
            Connect with thousands of music lovers, partygoers, and event enthusiasts actively discovering Jamaica{"'s"} hottest events.
          </Text>
          <View style={styles.heroStats}>
            {[
              { value: '10K+', label: 'Monthly Users' },
              { value: '14', label: 'Parishes' },
              { value: '500+', label: 'Events/Month' },
            ].map(({ value, label }) => (
              <View key={label} style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{value}</Text>
                <Text style={styles.heroStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => handleContact()}
            style={({ pressed }) => [styles.heroCta, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroCtaInner}
            >
              <MaterialIcons name="email" size={16} color={Colors.textOnGold} />
              <Text style={styles.heroCtaText}>Get in Touch</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>

        {/* ── Why Advertise ── */}
        <View style={styles.section}>
          <SectionHead title="Why Vybz Hub?" sub="What makes advertising with us effective." />
          <View style={styles.benefitGrid}>
            {BENEFITS.map((b) => <BenefitCard key={b.title} {...b} />)}
          </View>
        </View>

        {/* ── Ad Formats ── */}
        <View style={styles.section}>
          <SectionHead title="Ad Formats" sub="Two flexible formats to suit any campaign goal." />
          <View style={styles.sizeGrid}>
            {AD_SIZES.map((s) => <SizeCard key={s.id} size={s} />)}
          </View>
        </View>

        {/* ── Pricing ── */}
        <View style={styles.section}>
          <SectionHead title="Pricing Plans" sub="Transparent weekly rates. No hidden fees." />
          <View style={styles.pricingGrid}>
            {PRICING_TIERS.map((tier) => (
              <PricingCard
                key={tier.id}
                tier={tier}
                onContact={() => handleContact(tier.name)}
              />
            ))}
          </View>
          <View style={styles.pricingNote}>
            <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.pricingNoteText}>
              All prices in USD. Monthly packages available at 15% discount. Custom parish-targeting available on Growth and Enterprise plans.
            </Text>
          </View>
        </View>

        {/* ── How It Works ── */}
        <View style={styles.section}>
          <SectionHead title="How It Works" />
          {[
            { step: '1', icon: 'email', title: 'Reach Out', desc: 'Contact us with your brand details and campaign goals. We\'ll respond within 1 business day.' },
            { step: '2', icon: 'image', title: 'Submit Creatives', desc: 'Send your ad images (JPEG/PNG/WebP, max 5 MB). Our team reviews for quality and compliance.' },
            { step: '3', icon: 'payment', title: 'Make Payment', desc: 'Secure payment via bank transfer or card. Campaign activates within 24 hours of clearance.' },
            { step: '4', icon: 'bar-chart', title: 'Track Results', desc: 'Receive weekly impression and click reports. Adjust creatives anytime during the campaign.' },
          ].map(({ step, icon, title, desc }) => (
            <View key={step} style={styles.howStep}>
              <View style={styles.howStepNum}>
                <Text style={styles.howStepNumText}>{step}</Text>
              </View>
              <View style={styles.howStepIcon}>
                <MaterialIcons name={icon as any} size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.howStepTitle}>{title}</Text>
                <Text style={styles.howStepDesc}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── FAQ ── */}
        <View style={styles.section}>
          <SectionHead title="Frequently Asked Questions" />
          <View style={styles.faqList}>
            {FAQS.map((faq) => <FaqItem key={faq.q} {...faq} />)}
          </View>
        </View>

        {/* ── CTA Banner ── */}
        <View style={styles.ctaBanner}>
          <LinearGradient
            colors={[`${Colors.gold}22`, `${Colors.gold}08`]}
            style={styles.ctaBannerInner}
          >
            <MaterialIcons name="campaign" size={32} color={Colors.gold} />
            <Text style={styles.ctaBannerTitle}>Ready to Advertise?</Text>
            <Text style={styles.ctaBannerSub}>
              Email us and a member of our team will respond within 1 business day to discuss your campaign.
            </Text>
            <Pressable
              onPress={() => handleContact()}
              style={({ pressed }) => [styles.ctaBannerBtn, pressed && { opacity: 0.88 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBannerBtnInner}
              >
                <MaterialIcons name="email" size={16} color={Colors.textOnGold} />
                <Text style={styles.ctaBannerBtnText}>ads@vybzhub.com</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  headerBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  scroll: { paddingBottom: Spacing.base },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    marginBottom: Spacing.base,
  },
  heroIconWrap: {
    borderRadius: 44,
    overflow: 'hidden',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  heroIconGrad: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  heroTitle: {
    fontSize: 28, fontWeight: Typography.black as any,
    color: Colors.textPrimary, textAlign: 'center', lineHeight: 36,
  },
  heroSub: {
    fontSize: Typography.base, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 24,
  },
  heroStats: { flexDirection: 'row', gap: Spacing.xl, alignSelf: 'stretch', justifyContent: 'center' },
  heroStat: { alignItems: 'center', gap: 3 },
  heroStatValue: { fontSize: 22, fontWeight: Typography.black as any, color: Colors.gold },
  heroStatLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroCta: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden' },
  heroCtaInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  heroCtaText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.xl },
  benefitGrid: { gap: Spacing.sm },
  sizeGrid: { gap: Spacing.md },
  pricingGrid: { gap: Spacing.xl, paddingTop: Spacing.lg },

  pricingNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, marginTop: Spacing.md,
  },
  pricingNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  // How it works
  howStep: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  howStepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 2,
  },
  howStepNumText: { fontSize: 11, fontWeight: Typography.black as any, color: Colors.textOnGold },
  howStepIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
    flexShrink: 0,
  },
  howStepTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  howStepDesc: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19, marginTop: 3 },

  faqList: { gap: Spacing.sm },

  // CTA banner
  ctaBanner: { marginHorizontal: Spacing.base, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: `${Colors.gold}44` },
  ctaBannerInner: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  ctaBannerTitle: { fontSize: Typography.xl, fontWeight: Typography.black as any, color: Colors.textPrimary },
  ctaBannerSub: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  ctaBannerBtn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBannerBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  ctaBannerBtnText: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textOnGold },
});
