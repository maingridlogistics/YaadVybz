/**
 * Promoter Mode — Tab Shell
 * 5 tabs: Dashboard · Events · Ticketing · Finance · More
 */

import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { usePromoterMode } from '../../hooks/usePromoterMode';

export default function PromoterLayout() {
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  const { switchToAttendee } = usePromoterMode();
  const router = useRouter();

  const isPromoter = user?.roles.includes('promoter') ?? false;

  // Guard: redirect non-promoters ONLY after auth has fully resolved.
  // Do NOT redirect while authLoading=true — that would create a redirect
  // race where a valid promoter gets bounced to attendee mode before their
  // profile/roles arrive from Supabase.
  useEffect(() => {
    if (authLoading) return;          // wait for auth to settle
    if (!user) return;                // not logged in — auth flow handles this
    if (!isPromoter) {
      switchToAttendee();
      router.replace('/(tabs)' as any);
    }
  }, [authLoading, user, isPromoter, switchToAttendee, router]);

  // Show a loading state while auth resolves so tabs don't flash-render
  // with incomplete user data before the guard above can evaluate.
  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  const tabBarStyle = {
    height: Platform.select({
      ios: insets.bottom + 64,
      android: insets.bottom + 64,
      default: 72,
    }),
    paddingTop: 8,
    paddingBottom: Platform.select({
      ios: insets.bottom + 8,
      android: insets.bottom + 8,
      default: 8,
    }),
    paddingHorizontal: Spacing.base,
    backgroundColor: '#050F08',
    borderTopWidth: 1,
    borderTopColor: `${Colors.gold}22`,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: Typography.semibold as any, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="event" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ticketing"
        options={{
          title: 'Ticketing',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="confirmation-number" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="account-balance-wallet" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="apps" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
