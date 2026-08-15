/**
 * Promoter Mode — Stack Layout
 *
 * The promoter features are accessed via Profile tab → PROMOTER section.
 * This layout renders promoter screens as a plain stack — NO tab bar.
 *
 * Each screen provides its own header with a back button.
 * Deep links (/(promoter)/ticketing, /(promoter)/finance, etc.) continue to work.
 */

import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { usePromoterMode } from '../../hooks/usePromoterMode';

export default function PromoterLayout() {
  const { user, isLoading: authLoading } = useAuth();
  const { switchToAttendee } = usePromoterMode();
  const router = useRouter();

  const isPromoter = user?.roles.includes('promoter') ?? false;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/onboarding' as any);
      return;
    }
    if (!isPromoter) {
      switchToAttendee();
      router.replace('/(tabs)' as any);
    }
  }, [authLoading, user, isPromoter, switchToAttendee, router]);

  if (authLoading) {
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
