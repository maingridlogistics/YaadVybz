// ─── Promote Business Screen ──────────────────────────────────────────────────
// Owner flow: choose placement → choose duration → purchase
//
// Placement options: home | explore | parish | category
// Duration/pricing: loaded from business_promotion_products table
// Payment: Apple IAP (iOS) | Stripe Checkout (web/Android fallback)
//
// SECURITY:
//   • Only shows for live businesses the authenticated user owns
//   • Promotion activation is server-side only — client cannot self-activate
//   • Business must remain live; eligibility checked before purchase

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import {
  fetchPromotionProducts,
  fetchPromoEligibility,
  createPendingPromotion,
  getPlacementInfo,
  PromotionProduct,
  PromotionPlacement,
  EligiblePromoContext,
} from '../../../services/businessPromotionService';
import { getSupabaseClient } from '../../../lib/supabase';
import { isAppleIAP } from '../../../constants/purchaseGate';
import { purchaseAppleBusinessPromotion } from '../../../services/iapService.native';
import { useIAP } from '../../../hooks/useIAP';
import { useAuth } from '../../../hooks/useAuth';

// ─── Placement Card ───────────────────────────────────────────────────────────
function PlacementCard({
  placement,
  selected,
  onSelect,
}: {
  placement: PromotionPlacement;
  selected: boolean;
  onSelect: () => void;
}) {
  const info = getPlacementInfo(placement);
  const descMap: Record<string, string> = {
    home:     'Reach people browsing the Vybz Hub Home feed.',
    explore:  'Appear in the Businesses discovery experience.',
    parish:   'Get highlighted at the top of your eligible Parish page.',
    category: 'Get highlighted at the top of your Business category.',
  };

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [pc.card, selected && pc.cardSelected, pressed && { opacity: 0.9 }]}
    >
      {selected && (
        <LinearGradient
          colors={[`${Colors.gold}15`, `${Colors.gold}06`]}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      <View style={pc.iconWrap}>
        <View style={[pc.iconBg, selected && pc.iconBgSelected]}>
          <MaterialIcons
            name={info.icon as any}
            size={22}
            color={selected ? Colors.textOnGold : Colors.textMuted}
          />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={pc.label}>{info.label}</Text>
        <Text style={pc.desc}>{descMap[placement]}</Text>
      </View>
      <MaterialIcons
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={20}
        color={selected ? Colors.gold : Colors.textMuted}
      />
    </Pressable>
  );
}

const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, overflow: 'hidden', position: 'relative',
  },
  cardSelected: { borderColor: Colors.gold },
  iconWrap: {},
  iconBg: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBgSelected: { backgroundColor: Colors.gold },
  label: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  desc: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 3, lineHeight: 18 },
});

// ─── Duration / Price Card ────────────────────────────────────────────────────
function DurationCard({
  product,
  selected,
  onSelect,
  nativePrice,
}: {
  product: PromotionProduct;
  selected: boolean;
  onSelect: () => void;
  nativePrice?: string | null;
}) {
  const displayPrice = nativePrice ?? `$${(product.amount_usd / 100).toFixed(2)}`;
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [dc.card, selected && dc.cardSelected, pressed && { opacity: 0.9 }]}
    >
      {selected && (
        <LinearGradient
          colors={[`${Colors.gold}15`, `${Colors.gold}06`]}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={dc.label}>{product.duration_days} Days</Text>
        <Text style={dc.desc}>{product.description}</Text>
      </View>
      <View style={dc.priceBlock}>
        <Text style={[dc.price, selected && { color: Colors.gold }]}>{displayPrice}</Text>
      </View>
      <MaterialIcons
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={20}
        color={selected ? Colors.gold : Colors.textMuted}
      />
    </Pressable>
  );
}

const dc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, overflow: 'hidden', position: 'relative',
  },
  cardSelected: { borderColor: Colors.gold },
  label: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  desc: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  priceBlock: { alignItems: 'flex-end', flexShrink: 0 },
  price: { fontSize: 20, fontWeight: Typography.black, color: Colors.textPrimary },
});

// ─── Parish Picker ────────────────────────────────────────────────────────────
function ParishPicker({
  parishes,
  selected,
  onSelect,
}: {
  parishes: string[];
  selected: string | null;
  onSelect: (p: string) => void;
}) {
  return (
    <View style={pp.wrap}>
      <Text style={pp.label}>Choose Parish</Text>
      <Text style={pp.sublabel}>Your eligible parishes from your primary location and service areas.</Text>
      <View style={pp.grid}>
        {parishes.map((p) => (
          <Pressable
            key={p}
            onPress={() => onSelect(p)}
            style={({ pressed }) => [
              pp.chip,
              selected === p && pp.chipSelected,
              pressed && { opacity: 0.8 },
            ]}
          >
            <MaterialIcons
              name="place"
              size={12}
              color={selected === p ? Colors.textOnGold : Colors.textMuted}
            />
            <Text style={[pp.chipText, selected === p && pp.chipTextSelected]}>{p}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const pp = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  label: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  sublabel: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, minHeight: 36,
  },
  chipSelected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold },
  chipTextSelected: { color: Colors.textOnGold },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

const PLACEMENTS: PromotionPlacement[] = ['home', 'explore', 'parish', 'category'];

type FlowStep = 'placement' | 'duration' | 'confirm' | 'verifying' | 'success';

export default function PromoteBusinessScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { boostProducts } = useIAP();

  // Eligibility
  const [eligibility, setEligibility] = useState<EligiblePromoContext | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [businessName, setBusinessName] = useState('');
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);

  // Flow state
  const [step, setStep] = useState<FlowStep>('placement');
  const [selectedPlacement, setSelectedPlacement] = useState<PromotionPlacement>('home');
  const [selectedParish, setSelectedParish] = useState<string | null>(null);
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PromotionProduct | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load eligibility + business info
  useEffect(() => {
    if (!businessId) return;
    setEligibilityLoading(true);

    const supabase = getSupabaseClient();
    Promise.all([
      fetchPromoEligibility(businessId),
      supabase
        .from('businesses')
        .select('name, logo_url, cover_url')
        .eq('id', businessId)
        .maybeSingle(),
    ]).then(([elig, bizResult]) => {
      setEligibility(elig);
      if (bizResult.data) {
        setBusinessName(bizResult.data.name ?? '');
        setBusinessLogo(bizResult.data.logo_url ?? bizResult.data.cover_url ?? null);
      }
      setEligibilityLoading(false);
    }).catch(() => {
      setEligibilityLoading(false);
    });
  }, [businessId]);

  // Load products when placement is selected
  const loadProducts = useCallback(async (placement: PromotionPlacement) => {
    setProductsLoading(true);
    setSelectedProduct(null);
    const prods = await fetchPromotionProducts(placement);
    setProducts(prods);
    if (prods.length > 0) setSelectedProduct(prods[0]);
    setProductsLoading(false);
  }, []);

  const handlePlacementNext = useCallback(async () => {
    if (selectedPlacement === 'parish' && !selectedParish) {
      setError('Please choose a parish for Parish promotion.');
      return;
    }
    setError(null);
    await loadProducts(selectedPlacement);
    setStep('duration');
  }, [selectedPlacement, selectedParish, loadProducts]);

  // Native price lookup
  const getNativePrice = (product: PromotionProduct): string | null => {
    if (!isAppleIAP || !product.apple_product_id || !boostProducts.length) return null;
    return boostProducts.find((p) => p.productId === product.apple_product_id)?.localizedPrice ?? null;
  };

  // Purchase
  const handlePurchase = useCallback(async () => {
    if (!selectedProduct || !user) return;
    setError(null);
    setPurchasing(true);

    try {
      // 1. Create pending promotion record
      const { promotionId, error: createErr } = await createPendingPromotion({
        businessId: businessId!,
        productId: selectedProduct.id,
        placement: selectedPlacement,
        parish: selectedPlacement === 'parish' ? selectedParish! : undefined,
        durationDays: selectedProduct.duration_days,
        amountUsd: selectedProduct.amount_usd,
      });

      if (createErr || !promotionId) {
        setError(createErr ?? 'Could not create promotion. Please try again.');
        setPurchasing(false);
        return;
      }

      if (isAppleIAP && selectedProduct.apple_product_id) {
        // ── Apple IAP path ─────────────────────────────────────────────────
        const result = await purchaseAppleBusinessPromotion(
          selectedProduct.apple_product_id,
          user.id,
          promotionId,
        );

        if (result.ok) {
          setStep('success');
        } else if (result.error && result.error !== 'Purchase cancelled') {
          setError(result.error);
          setStep('confirm');
        } else {
          setStep('confirm');
        }
      } else {
        // ── Stripe Checkout (web/Android fallback) ─────────────────────────
        setStep('verifying');
        const supabase = getSupabaseClient();
        const { data, error: fnErr } = await supabase.functions.invoke('create-biz-promotion-checkout', {
          body: {
            promotion_id: promotionId,
            product_id: selectedProduct.id,
            platform: Platform.OS,
          },
        });

        if (fnErr) {
          let msg = fnErr.message ?? 'Checkout failed';
          if (fnErr instanceof FunctionsHttpError) {
            try { msg = (await fnErr.context?.text()) || msg; } catch {}
          }
          setError(msg);
          setStep('confirm');
          setPurchasing(false);
          return;
        }

        if (!data?.url) {
          setError('No checkout URL. Please try again.');
          setStep('confirm');
          setPurchasing(false);
          return;
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, 'vybzhub://');
        if (result.type === 'success' && result.url?.includes('promo-success')) {
          setStep('success');
        } else {
          setStep('confirm');
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error. Please try again.');
      setStep('confirm');
    } finally {
      setPurchasing(false);
    }
  }, [selectedProduct, user, businessId, selectedPlacement, selectedParish]);

  // ── Loading / Ineligible ──────────────────────────────────────────────────
  if (eligibilityLoading) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      </View>
    );
  }

  if (!eligibility) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={s.topBar}>
            <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={s.topBarTitle}>Promote Business</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
        <View style={s.center}>
          <MaterialIcons name="block" size={48} color={Colors.textMuted} />
          <Text style={s.ineligibleTitle}>Not Eligible</Text>
          <Text style={s.ineligibleSub}>
            Only live, approved businesses can purchase promotional placements.
          </Text>
          <Pressable onPress={() => router.back()} style={s.goldBtnSm}>
            <Text style={s.goldBtnSmText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    const placementInfo = getPlacementInfo(selectedPlacement);
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.successContent}>
          <View style={s.successIcon}>
            <MaterialIcons name="rocket-launch" size={44} color={Colors.gold} />
          </View>
          <Text style={s.successTitle}>Promotion Active!</Text>
          <Text style={s.successSub}>
            {businessName} is now featured in{' '}
            <Text style={{ color: Colors.gold }}>{placementInfo.label}</Text>
            {selectedParish ? ` · ${selectedParish}` : ''}.
          </Text>
          <View style={s.successStats}>
            <View style={s.successStat}>
              <MaterialIcons name={placementInfo.icon as any} size={20} color={Colors.gold} />
              <Text style={s.successStatLabel}>{placementInfo.label}</Text>
            </View>
            <View style={s.successStat}>
              <MaterialIcons name="schedule" size={20} color={Colors.greenLight} />
              <Text style={s.successStatLabel}>{selectedProduct?.duration_days} days</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push(`/business/my-promotions?businessId=${businessId}` as any)}
            style={s.doneBtn}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.doneBtnInner}>
              <MaterialIcons name="bar-chart" size={18} color={Colors.textOnGold} />
              <Text style={s.doneBtnText}>View My Promotions</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.back()} style={s.backLink}>
            <Text style={s.backLinkText}>Back to Business</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Verifying ─────────────────────────────────────────────────────────────
  if (step === 'verifying') {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={s.verifyingTitle}>Verifying Purchase...</Text>
          <Text style={s.verifyingSub}>Please wait while we confirm your payment.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => {
              if (step === 'duration') setStep('placement');
              else if (step === 'confirm') setStep('duration');
              else router.back();
            }}
            style={s.backBtn}
            hitSlop={8}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.topBarTitle}>Promote Business</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

        {/* Business preview */}
        <View style={s.bizPreview}>
          <View style={s.bizThumbWrap}>
            {businessLogo ? (
              <Image source={{ uri: businessLogo }} style={s.bizThumb} contentFit="cover" transition={200} />
            ) : (
              <View style={[s.bizThumb, s.bizThumbPlaceholder]}>
                <MaterialIcons name="storefront" size={22} color={Colors.textMuted} />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bizName} numberOfLines={1}>{businessName}</Text>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>Live</Text>
            </View>
          </View>
        </View>

        {/* Step: Placement */}
        {step === 'placement' && (
          <>
            <View style={s.stepHeader}>
              <Text style={s.stepTitle}>Choose a Placement</Text>
              <Text style={s.stepSub}>Select where you want your business to be featured.</Text>
            </View>

            <View style={s.cards}>
              {PLACEMENTS.map((placement) => (
                <PlacementCard
                  key={placement}
                  placement={placement}
                  selected={selectedPlacement === placement}
                  onSelect={() => {
                    setSelectedPlacement(placement);
                    setSelectedParish(null);
                  }}
                />
              ))}
            </View>

            {selectedPlacement === 'parish' && eligibility.parishes.length > 0 && (
              <View style={s.parishPicker}>
                <ParishPicker
                  parishes={eligibility.parishes}
                  selected={selectedParish}
                  onSelect={setSelectedParish}
                />
              </View>
            )}

            {selectedPlacement === 'category' && (
              <View style={s.categoryNote}>
                <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                <Text style={s.categoryNoteText}>
                  Your promotion will appear in the{' '}
                  <Text style={{ color: Colors.gold }}>{eligibility.category_label}</Text>{' '}
                  category — your actual Business category.
                </Text>
              </View>
            )}

            {error ? (
              <View style={s.errorCard}>
                <MaterialIcons name="error-outline" size={14} color="#FF6B6B" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* Step: Duration */}
        {step === 'duration' && (
          <>
            <View style={s.stepHeader}>
              <Text style={s.stepTitle}>Choose Duration</Text>
              <Text style={s.stepSub}>
                {getPlacementInfo(selectedPlacement).label}
                {selectedParish ? ` · ${selectedParish}` : ''}
                {selectedPlacement === 'category' ? ` · ${eligibility.category_label}` : ''}
              </Text>
            </View>

            {productsLoading ? (
              <View style={s.productsLoader}>
                <ActivityIndicator size="small" color={Colors.gold} />
                <Text style={s.loaderText}>Loading packages...</Text>
              </View>
            ) : products.length === 0 ? (
              <View style={s.productsLoader}>
                <MaterialIcons name="inventory" size={32} color={Colors.textMuted} />
                <Text style={s.loaderText}>No packages available right now.</Text>
              </View>
            ) : (
              <View style={s.cards}>
                {products.map((product) => (
                  <DurationCard
                    key={product.id}
                    product={product}
                    selected={selectedProduct?.id === product.id}
                    onSelect={() => setSelectedProduct(product)}
                    nativePrice={getNativePrice(product)}
                  />
                ))}
              </View>
            )}

            {/* What you get */}
            <View style={s.benefitsCard}>
              <Text style={s.benefitsTitle}>What you get</Text>
              {[
                { icon: 'star', text: `Prominently featured in ${getPlacementInfo(selectedPlacement).label}`, color: Colors.gold },
                { icon: 'campaign', text: 'Clear "Promoted" label — transparent to users', color: '#9C27B0' },
                { icon: 'bar-chart', text: 'Basic impression and click analytics', color: Colors.info },
                { icon: 'gpp-good', text: 'Privacy protections preserved — no location leakage', color: Colors.greenLight },
              ].map(({ icon, text, color }) => (
                <View key={text} style={s.benefitRow}>
                  <View style={[s.benefitIcon, { backgroundColor: `${color}18` }]}>
                    <MaterialIcons name={icon as any} size={14} color={color} />
                  </View>
                  <Text style={s.benefitText}>{text}</Text>
                </View>
              ))}
            </View>

            {error ? (
              <View style={s.errorCard}>
                <MaterialIcons name="error-outline" size={14} color="#FF6B6B" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Dev/Test price notice */}
            <View style={s.testNotice}>
              <MaterialIcons name="science" size={13} color={Colors.textMuted} />
              <Text style={s.testNoticeText}>
                Prices shown are development/test values. Production pricing will be set before launch.
              </Text>
            </View>
          </>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && selectedProduct && (
          <>
            <View style={s.stepHeader}>
              <Text style={s.stepTitle}>Confirm Promotion</Text>
            </View>

            <View style={s.confirmCard}>
              <View style={s.confirmRow}>
                <MaterialIcons name={getPlacementInfo(selectedPlacement).icon as any} size={18} color={Colors.gold} />
                <Text style={s.confirmLabel}>Placement</Text>
                <Text style={s.confirmValue}>{getPlacementInfo(selectedPlacement).label}</Text>
              </View>
              {selectedParish ? (
                <View style={s.confirmRow}>
                  <MaterialIcons name="place" size={18} color={Colors.gold} />
                  <Text style={s.confirmLabel}>Parish</Text>
                  <Text style={s.confirmValue}>{selectedParish}</Text>
                </View>
              ) : null}
              {selectedPlacement === 'category' ? (
                <View style={s.confirmRow}>
                  <MaterialIcons name="category" size={18} color={Colors.gold} />
                  <Text style={s.confirmLabel}>Category</Text>
                  <Text style={s.confirmValue}>{eligibility.category_label}</Text>
                </View>
              ) : null}
              <View style={s.confirmRow}>
                <MaterialIcons name="schedule" size={18} color={Colors.gold} />
                <Text style={s.confirmLabel}>Duration</Text>
                <Text style={s.confirmValue}>{selectedProduct.duration_days} days</Text>
              </View>
              <View style={[s.confirmRow, s.confirmRowLast]}>
                <MaterialIcons name="receipt" size={18} color={Colors.gold} />
                <Text style={s.confirmLabel}>Price</Text>
                <Text style={[s.confirmValue, { color: Colors.gold }]}>
                  {getNativePrice(selectedProduct) ?? `$${(selectedProduct.amount_usd / 100).toFixed(2)}`}
                </Text>
              </View>
            </View>

            <View style={s.disclaimerCard}>
              <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
              <Text style={s.disclaimerText}>
                Promotion activates immediately after payment verification.
                Your listing must remain Live to continue displaying in paid placements.
                V1 promotions are fixed-duration — no auto-renewal.
              </Text>
            </View>

            {error ? (
              <View style={s.errorCard}>
                <MaterialIcons name="error-outline" size={14} color="#FF6B6B" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[s.stickyBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        {step === 'placement' && (
          <Pressable
            onPress={handlePlacementNext}
            style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.ctaBtnInner}>
              <Text style={s.ctaBtnText}>Next: Choose Duration</Text>
              <MaterialIcons name="arrow-forward" size={18} color={Colors.textOnGold} />
            </LinearGradient>
          </Pressable>
        )}

        {step === 'duration' && selectedProduct && (
          <View style={s.durationStickyRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.stickyPriceLabel}>{selectedProduct.duration_days} days</Text>
              <Text style={s.stickyPrice}>
                {getNativePrice(selectedProduct) ?? `$${(selectedProduct.amount_usd / 100).toFixed(2)}`}
              </Text>
            </View>
            <Pressable
              onPress={() => { setError(null); setStep('confirm'); }}
              disabled={productsLoading}
              style={({ pressed }) => [s.ctaBtn, { flex: 2 }, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.ctaBtnInner}>
                <Text style={s.ctaBtnText}>Review Order</Text>
                <MaterialIcons name="arrow-forward" size={18} color={Colors.textOnGold} />
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {step === 'confirm' && selectedProduct && (
          <Pressable
            onPress={handlePurchase}
            disabled={purchasing}
            style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.ctaBtnInner}>
              {purchasing ? (
                <ActivityIndicator size="small" color={Colors.textOnGold} />
              ) : (
                <MaterialIcons
                  name={isAppleIAP ? 'apple' : 'payment'}
                  size={18}
                  color={Colors.textOnGold}
                />
              )}
              <Text style={s.ctaBtnText}>
                {purchasing
                  ? 'Processing...'
                  : isAppleIAP
                  ? 'Buy with Apple'
                  : 'Complete Purchase'}
              </Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: { padding: Spacing.base, gap: Spacing.lg },

  bizPreview: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  bizThumbWrap: { width: 52, height: 52, borderRadius: Radius.md, overflow: 'hidden', flexShrink: 0 },
  bizThumb: { width: 52, height: 52 },
  bizThumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  bizName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00C853' },
  liveText: { fontSize: Typography.xs, color: '#00C853', fontWeight: Typography.semibold },

  stepHeader: { gap: 4 },
  stepTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  stepSub: { fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20 },

  cards: { gap: Spacing.md },

  parishPicker: { marginTop: Spacing.sm },
  categoryNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: `${Colors.info}10`, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.info}28`,
  },
  categoryNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,107,107,0.1)', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: '#FF8888', lineHeight: 19 },

  productsLoader: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  loaderText: { fontSize: Typography.sm, color: Colors.textMuted },

  benefitsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.sm,
  },
  benefitsTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 19 },

  testNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  testNoticeText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 17, fontStyle: 'italic' },

  confirmCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  confirmRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  confirmRowLast: { borderBottomWidth: 0 },
  confirmLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted },
  confirmValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },

  disclaimerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 17 },

  stickyBar: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  ctaBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  durationStickyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stickyPriceLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  stickyPrice: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.gold },

  ineligibleTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  ineligibleSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  goldBtnSm: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  goldBtnSmText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  successIcon: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.goldSurface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  successTitle: { fontSize: 26, fontWeight: Typography.black, color: Colors.textPrimary },
  successSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successStats: { flexDirection: 'row', gap: Spacing.lg },
  successStat: { alignItems: 'center', gap: Spacing.sm },
  successStatLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  doneBtn: { borderRadius: Radius.lg, overflow: 'hidden', alignSelf: 'stretch' },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  doneBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
  verifyingTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  verifyingSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
