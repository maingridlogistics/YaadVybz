import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors } from '../constants/theme';

export default function Index() {
  const { user, isLoading, isOnboarded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isOnboarded) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [isLoading, user, isOnboarded]);

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
