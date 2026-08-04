import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

const LAUNCHED_KEY = '@vybzhub_launched';

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [launchChecked, setLaunchChecked] = useState(false);
  const [hasLaunchedBefore, setHasLaunchedBefore] = useState(false);
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
      easing: Easing.out(Easing.back(1.05)),
    });
    wordmarkOpacity.value = withDelay(
      300,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    );
  }, []);

  // Check first-launch flag
  useEffect(() => {
    AsyncStorage.getItem(LAUNCHED_KEY).then((val) => {
      setHasLaunchedBefore(val === 'true');
      setLaunchChecked(true);
    });
  }, []);

  // Route once auth + launch check are both resolved
  useEffect(() => {
    if (isLoading || !launchChecked) return;
    // Give the logo animation ~650 ms to play before navigating away
    const delay = setTimeout(() => setReadyToNavigate(true), 650);
    return () => clearTimeout(delay);
  }, [isLoading, launchChecked]);

  useEffect(() => {
    if (!readyToNavigate) return;
    if (user) {
      router.replace('/(tabs)');
    } else if (!hasLaunchedBefore) {
      AsyncStorage.setItem(LAUNCHED_KEY, 'true');
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [readyToNavigate, user, hasLaunchedBefore]);

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
    // Subtle glow
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
