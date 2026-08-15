/**
 * Admin Screens — Compatibility Shell
 *
 * The admin portal is no longer a separate app-level navigation shell.
 * Admin features are accessed via Profile tab → ADMIN section in the universal app.
 *
 * This layout keeps all existing admin sub-screens accessible when pushed
 * directly from Profile menu items (e.g., /admin/users, /admin/events).
 *
 * Non-admin access is blocked with a redirect to onboarding.
 */

import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
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

  const tabBarStyle = {
    height: Platform.select({ ios: insets.bottom + 64, android: insets.bottom + 64, default: 72 }),
    paddingTop: 8,
    paddingBottom: Platform.select({ ios: insets.bottom + 8, android: insets.bottom + 8, default: 8 }),
    paddingHorizontal: Spacing.base,
    backgroundColor: '#050A12',
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
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="push-test" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="user/[userId]" options={{ tabBarButton: () => null }} />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="event" size={size} color={color} />,
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
          tabBarIcon: ({ color, size }) => <MaterialIcons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
