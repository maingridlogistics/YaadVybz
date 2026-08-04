import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [readyToNavigate, setReadyToNavigate] = useState(false);

  // Animation values
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.88);
  const wordmarkOpacity = useSharedValue(0);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
  }));

  // Kick off the entrance animation immediately on mount
  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
    logoScale.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.quad),
    });
    wordmarkOpacity.value = withDelay(
      300,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    );
  }, []);

  // Route once auth resolves — give the splash animation ~650 ms to play first
  useEffect(() => {
    if (isLoading) return;
    const delay = setTimeout(() => setReadyToNavigate(true), 650);
    return () => clearTimeout(delay);
  }, [isLoading]);

  useEffect(() => {
    if (!readyToNavigate) return;
    if (user) {
      router.replace('/(tabs)');
    } else {
      // Always send unauthenticated users to onboarding.
      // The onboarding screen has "I already have an account" → tabs, so
      // returning users who don't want to sign in can still browse.
      router.replace('/onboarding');
    }
  }, [readyToNavigate, user]);

  return (
    <View style={styles.container}>
      {/* Icon */}
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          contentFit="contain"
          transition={0}
        />
      </Animated.View>

      {/* Wordmark below icon */}
      <Animated.Text style={[styles.wordmark, wordmarkStyle]}>
        VYBZ<Animated.Text style={styles.wordmarkAccent}>HUB</Animated.Text>
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  logo: {
    width: 120,
    height: 120,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#FFFFFF',
  },
  wordmarkAccent: {
    color: '#FFD700',
  },
});
