import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { PARISHES, EVENT_TYPES } from '../constants/data';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

const { width, height } = Dimensions.get('window');

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

export default function Onboarding() {
  const [step, setStep] = useState(0); // 0-2: slides, 3: parish, 4: interests
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

  const handleNext = async () => {
    if (step < 2) {
      setStep(step + 1);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else {
      // Complete onboarding
      await completeOnboarding(selectedParish, selectedInterests);
      router.replace('/(tabs)');
    }
  };

  const canProceed =
    step < 3 || (step === 3 ? selectedParish !== '' : selectedInterests.length > 0);

  if (step <= 2) {
    const slide = SLIDES[step];
    return (
      <View style={styles.slideContainer}>
        <Image
          source={slide.image}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={400}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
          style={StyleSheet.absoluteFillObject}
        />

        <SafeAreaView style={styles.slideContent}>
          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.logoDot} />
            <Text style={styles.logoText}>VYBZ HUB</Text>
          </View>

          {/* Dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* Content */}
          <View style={styles.slideBottom}>
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
                  {step === 2 ? 'Get Started' : 'Next'}
                </Text>
                <MaterialIcons name="arrow-forward" size={20} color={Colors.textOnGold} />
              </LinearGradient>
            </Pressable>

            {step === 2 && (
              <Pressable
                onPress={() => router.replace('/(tabs)')}
                style={styles.skipBtn}
              >
                <Text style={styles.skipText}>I already have an account</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (step === 3) {
    return (
      <View style={[styles.pickerContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.pickerHeader}>
          <Pressable onPress={() => setStep(2)}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.pickerStep}>2 of 3</Text>
        </View>

        <Text style={styles.pickerTitle}>Where in Jamaica{'\n'}are you based?</Text>
        <Text style={styles.pickerSub}>
          We'll show you events closest to your home parish first.
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
          onPress={handleNext}
          disabled={!canProceed}
          style={({ pressed }) => [styles.continueBtn, !canProceed && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
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
      </View>
    );
  }

  // Step 4: interests
  return (
    <View style={[styles.pickerContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.pickerHeader}>
        <Pressable onPress={() => setStep(3)}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.pickerStep}>3 of 3</Text>
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
        onPress={handleNext}
        disabled={!canProceed}
        style={({ pressed }) => [styles.continueBtn, !canProceed && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
      >
        <LinearGradient
          colors={[Colors.gold, Colors.goldDim]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.continueBtnInner}
        >
          <Text style={styles.continueBtnText}>Let's Go!</Text>
          <MaterialIcons name="celebration" size={20} color={Colors.textOnGold} />
        </LinearGradient>
      </Pressable>
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.base,
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
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 'auto',
    marginBottom: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.gold,
  },
  slideBottom: {
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
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
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
  pickerStep: {
    fontSize: Typography.sm,
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
