import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors } from '../constants/theme';

const LAUNCHED_KEY = '@vybzhub_launched';

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [launchChecked, setLaunchChecked] = useState(false);
  const [hasLaunchedBefore, setHasLaunchedBefore] = useState(false);

  // Check if the app has ever been launched before (one-time splash gate).
  useEffect(() => {
    AsyncStorage.getItem(LAUNCHED_KEY).then((val) => {
      setHasLaunchedBefore(val === 'true');
      setLaunchChecked(true);
    });
  }, []);

  useEffect(() => {
    if (isLoading || !launchChecked) return;

    if (user) {
      // Signed-in users always go straight to the app — never re-show onboarding.
      router.replace('/(tabs)');
    } else if (!hasLaunchedBefore) {
      // First-ever cold open → show onboarding slides.
      AsyncStorage.setItem(LAUNCHED_KEY, 'true');
      router.replace('/onboarding');
    } else {
      // Returning guest (not signed in) → go directly to tabs.
      router.replace('/(tabs)');
    }
  }, [isLoading, launchChecked, user, hasLaunchedBefore]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.gold} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
