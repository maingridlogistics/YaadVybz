/**
 * Promoter Mode — Compatibility Redirect
 *
 * The promoter portal is no longer a separate navigation shell.
 * All role features are accessed via Profile tab in the universal app.
 *
 * This layout redirect keeps deep links like /(promoter)/finance and
 * /(promoter)/ticketing working — the individual tab screens still exist
 * and are linked from the Profile → Promoter section.
 *
 * Direct navigation to /(promoter) root is redirected to /(tabs).
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

  // Render the tab shell so sub-screens (ticketing, finance, events, more) remain
  // navigable when pushed directly from Profile menu items.
  const tabBarStyle = {
    height: Platform.select({ ios: insets.bottom + 64, android: insets.bottom + 64, default: 72 }),
    paddingTop: 8,
    paddingBottom: Platform.select({ ios: insets.bottom + 8, android: insets.bottom + 8, default: 8 }),
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
          tabBarIcon: ({ color, size }) => <MaterialIcons name="dashboard" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="event" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ticketing"
        options={{
          title: 'Ticketing',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="confirmation-number" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="account-balance-wallet" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="apps" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
