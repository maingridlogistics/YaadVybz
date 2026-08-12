import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Animated,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../hooks/useAuth';
import { PARISHES, EVENT_TYPES } from '../constants/data';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

const { width, height } = Dimensions.get('window');

// Key used to track that onboarding was already seen/skipped
const ONBOARDING_KEY = '@vybzhub_onboarded';

const SLIDES = [
  {
    image: require('../assets/images/onboarding1.jpg'),
    headline: 'Feel The\nVybz Hub',
    sub: 'Discover the hottest parties, concerts & events happening across Jamaica.',
  },
  {
    image: require('../assets/images/onboarding2.jpg'),
    headline: 'Your Island,\nYour Events',
    sub: 'From Negril to Port Antonio — find every fete, show, and beach splash near you.',
  },
  {
    image: require('../assets/images/onboarding3.jpg'),
    headline: 'Post, Promote\n& Sizzle',
    sub: 'Organizers and promoters can list events and reach thousands across the island.',
  },
];

// ─── Slide Carousel (steps 0-2) ───────────────────────────────────────────────
function SlideCarousel({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goToSlide = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentSlide(index);
  }, []);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      goToSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const slide = Math.round(e.nativeEvent.contentOffset.x / width);
        if (slide !== currentSlide && slide >= 0 && slide < SLIDES.length) {
          setCurrentSlide(slide);
        }
      },
    },
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Horizontally scrollable slides */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        decelerationRate="fast"
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={{ width, flex: 1 }}>
            <Image
              source={slide.image}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={0}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']}
              style={StyleSheet.absoluteFillObject}
            />
            <SafeAreaView style={styles.slideContent}>
              {/* Logo + Skip row */}
              <View style={styles.slideTopRow}>
                <View style={styles.logoRow}>
                  <View style={styles.logoDot} />
                  <Text style={styles.logoText}>VYBZ HUB</Text>
                </View>
                <Pressable
                  onPress={onSkip}
                  style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={12}
                >
                  <Text style={styles.skipBtnText}>Skip</Text>
                  <MaterialIcons name="arrow-forward" size={13} color="rgba(255,255,255,0.55)" />
                </Pressable>
              </View>

              {/* Bottom content */}
              <View style={styles.slideBottom}>
                {/* Page dots */}
                <View style={styles.dots}>
                  {SLIDES.map((_, i) => {
                    const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
                    const dotWidth = scrollX.interpolate({
                      inputRange,
                      outputRange: [6, 24, 6],
                      extrapolate: 'clamp',
                    });
                    const opacity = scrollX.interpolate({
                      inputRange,
                      outputRange: [0.35, 1, 0.35],
                      extrapolate: 'clamp',
                    });
                    return (
                      <Animated.View
                        key={i}
                        style={[
                          styles.dot,
                          { width: dotWidth, opacity },
                        ]}
                      />
                    );
                  })}
                </View>

                <Text style={styles.headline}>{slide.headline}</Text>
                <Text style={styles.sub}>{slide.sub}</Text>

                <Pressable
                  onPress={handleNext}
                  style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={[Colors.gold, Colors.goldDim]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.nextBtnInner}
                  >
                    <Text style={styles.nextBtnText}>
                      {index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
                    </Text>
                    <MaterialIcons name="arrow-forward" size={20} color={Colors.textOnGold} />
                  </LinearGradient>
                </Pressable>

                {index === SLIDES.length - 1 && (
                  <Pressable
                    onPress={() => onSkip()}
                    style={styles.alreadyAccountBtn}
                  >
                    <Text style={styles.alreadyAccountText}>I already have an account</Text>
                  </Pressable>
                )}

                <View style={styles.slideLegalRow}>
                  <Pressable onPress={() => Linking.openURL('https://vybzhub.com/privacy')} hitSlop={8}>
                    <Text style={styles.slideLegalLink}>Privacy Policy</Text>
                  </Pressable>
                  <Text style={styles.slideLegalDot}>·</Text>
                  <Pressable onPress={() => Linking.openURL('https://vybzhub.com/terms')} hitSlop={8}>
                    <Text style={styles.slideLegalLink}>Terms of Use</Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}

// ─── Main Onboarding Component ────────────────────────────────────────────────
export default function Onboarding() {
  const [step, setStep] = useState(0); // 0: slides, 1: parish, 2: interests
  const [selectedParish, setSelectedParish] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const { completeOnboarding } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Mark onboarding done and go to auth screen
  const handleSkip = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    router.replace('/auth' as any);
  };

  const handleSlidesComplete = () => {
    setStep(1);
  };

  const handleParishNext = () => {
    setStep(2);
  };

  const handleFinish = async () => {
    await completeOnboarding(selectedParish, selectedInterests);
    router.replace('/(tabs)' as any);
  };

  const canProceedParish = selectedParish !== '';
  const canProceedInterests = selectedInterests.length > 0;

  // ── Step 0: Slide carousel ────────────────────────────────────────────────
  if (step === 0) {
    return (
      <View style={styles.slideContainer}>
        <SlideCarousel onComplete={handleSlidesComplete} onSkip={handleSkip} />
      </View>
    );
  }

  // ── Step 1: Parish picker ─────────────────────────────────────────────────
  if (step === 1) {
    return (
      <View style={[styles.pickerContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.pickerHeader}>
          <Pressable onPress={() => setStep(0)} hitSlop={12}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Pressable onPress={handleSkip} style={styles.pickerSkipBtn} hitSlop={12}>
            <Text style={styles.pickerSkipText}>Skip</Text>
          </Pressable>
        </View>

        <Text style={styles.pickerTitle}>Where in Jamaica{'\n'}are you based?</Text>
        <Text style={styles.pickerSub}>
          We will show you events closest to your home parish first.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.parishGrid}>
          {PARISHES.map((parish) => (
            <Pressable
              key={parish}
              onPress={() => setSelectedParish(parish)}
              style={({ pressed }) => [
                styles.parishChip,
                selectedParish === parish && styles.parishChipActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialIcons
                name="place"
                size={14}
                color={selectedParish === parish ? Colors.textOnGold : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.parishChipText,
                  selectedParish === parish && styles.parishChipTextActive,
                ]}
              >
                {parish}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={handleParishNext}
          disabled={!canProceedParish}
          style={({ pressed }) => [
            styles.continueBtn,
            !canProceedParish && { opacity: 0.4 },
            pressed && { opacity: 0.8 },
          ]}
        >
          <LinearGradient
            colors={[Colors.gold, Colors.goldDim]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueBtnInner}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
            <MaterialIcons name="arrow-forward" size={20} color={Colors.textOnGold} />
          </LinearGradient>
        </Pressable>

        <View style={styles.pickerLegalRow}>
          <Pressable onPress={() => Linking.openURL('https://vybzhub.com/privacy')} hitSlop={8}>
            <Text style={styles.pickerLegalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.pickerLegalDot}>·</Text>
          <Pressable onPress={() => Linking.openURL('https://vybzhub.com/terms')} hitSlop={8}>
            <Text style={styles.pickerLegalLink}>Terms of Use</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Step 2: Interests picker ──────────────────────────────────────────────
  return (
    <View style={[styles.pickerContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.pickerHeader}>
        <Pressable onPress={() => setStep(1)} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Pressable onPress={handleSkip} style={styles.pickerSkipBtn} hitSlop={12}>
          <Text style={styles.pickerSkipText}>Skip</Text>
        </Pressable>
      </View>

      <Text style={styles.pickerTitle}>What events{'\n'}move you?</Text>
      <Text style={styles.pickerSub}>Pick all that apply. We will personalize your feed.</Text>

      <View style={styles.interestsGrid}>
        {EVENT_TYPES.map((type) => {
          const isSelected = selectedInterests.includes(type.id);
          return (
            <Pressable
              key={type.id}
              onPress={() => toggleInterest(type.id)}
              style={({ pressed }) => [
                styles.interestCard,
                isSelected && [styles.interestCardActive, { borderColor: type.color }],
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.interestIcon, { backgroundColor: `${type.color}22` }]}>
                <MaterialIcons name={type.icon as any} size={28} color={type.color} />
              </View>
              <Text style={styles.interestLabel}>{type.label}</Text>
              {isSelected && (
                <View style={[styles.interestCheck, { backgroundColor: type.color }]}>
                  <MaterialIcons name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={handleFinish}
        disabled={!canProceedInterests}
        style={({ pressed }) => [
          styles.continueBtn,
          !canProceedInterests && { opacity: 0.4 },
          pressed && { opacity: 0.8 },
        ]}
      >
        <LinearGradient
          colors={[Colors.gold, Colors.goldDim]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.continueBtnInner}
        >
          <Text style={styles.continueBtnText}>{"Let's Go!"}</Text>
          <MaterialIcons name="celebration" size={20} color={Colors.textOnGold} />
        </LinearGradient>
      </Pressable>

      <View style={styles.pickerLegalRow}>
        <Pressable onPress={() => Linking.openURL('https://vybzhub.com/privacy')} hitSlop={8}>
          <Text style={styles.pickerLegalLink}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.pickerLegalDot}>·</Text>
        <Pressable onPress={() => Linking.openURL('https://vybzhub.com/terms')} hitSlop={8}>
          <Text style={styles.pickerLegalLink}>Terms of Use</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  slideContent: {
    flex: 1,
    paddingHorizontal: Spacing.base,
  },
  slideTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.base,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
  },
  logoText: {
    fontSize: Typography.sm,
    fontWeight: Typography.black,
    color: Colors.gold,
    letterSpacing: 3,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  skipBtnText: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: Typography.medium,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },
  slideBottom: {
    marginTop: 'auto',
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  headline: {
    fontSize: width > 375 ? 42 : 36,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    lineHeight: width > 375 ? 48 : 42,
  },
  sub: {
    fontSize: Typography.base,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 24,
  },
  nextBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  nextBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.xl,
  },
  nextBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
  alreadyAccountBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  alreadyAccountText: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
  },
  slideLegalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  slideLegalLink: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textDecorationLine: 'underline',
  },
  slideLegalDot: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
  },

  // Picker screens
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.base,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.base,
  },
  pickerSkipBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pickerSkipText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
  },
  pickerTitle: {
    fontSize: 30,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    lineHeight: 38,
  },
  pickerSub: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },

  // Parish grid
  parishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  parishChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  parishChipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  parishChipText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  parishChipTextActive: {
    color: Colors.textOnGold,
    fontWeight: Typography.bold,
  },

  // Interests
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    flex: 1,
  },
  interestCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  interestCardActive: {
    backgroundColor: Colors.surfaceElevated,
  },
  interestIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  interestCheck: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Legal footer for picker screens
  pickerLegalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  pickerLegalLink: {
    fontSize: 11,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  pickerLegalDot: {
    fontSize: 11,
    color: Colors.textMuted,
  },

  // Continue button
  continueBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  continueBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  continueBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
});
