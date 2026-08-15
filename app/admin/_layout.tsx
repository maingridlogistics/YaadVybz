/**
 * Admin Screens — Stack Layout
 *
 * Admin features are accessed via Profile tab → ADMIN section.
 * This layout renders admin screens as a plain stack — NO tab bar.
 *
 * Each screen provides its own header with a back button.
 * Non-admin access is blocked with a redirect to onboarding.
 */

import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';

export default function AdminLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const isAdmin = user?.roles.includes('admin') ?? false;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/onboarding' as any);
      return;
    }
    if (!isAdmin) {
      router.replace('/(tabs)' as any);
    }
  }, [isLoading, user, isAdmin, router]);

  if (isLoading || !isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  // Stack layout — no tab bar. Each screen handles its own header.
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
