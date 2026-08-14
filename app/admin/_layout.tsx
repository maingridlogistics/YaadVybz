/**
 * Admin Portal — Tab Shell
 * Strictly isolated from all attendee/promoter UI.
 * 5 tabs: Dashboard · Users · Events · Finance · More
 */

import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const isAdmin = user?.roles.includes('admin') ?? false;

  // Guard: only admin accounts may enter this route group.
  // Non-admins who land here (e.g., via deep-link) are redirected to their
  // appropriate home screen after auth resolves.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/onboarding' as any);
      return;
    }
    if (!isAdmin) {
      const isPromoter = user.roles.includes('promoter');
      router.replace(isPromoter ? '/(promoter)' as any : '/(tabs)' as any);
    }
  }, [isLoading, user, isAdmin, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  if (!isAdmin) {
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
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="people" size={size} color={color} />
          ),
        }}
      />
      /* push-test is an internal sub-screen, not a primary tab */
      <Tabs.Screen name="push-test" options={{ tabBarButton: () => null }} />
      {/* user/[userId] is a pushed detail screen, not a primary tab */}
      <Tabs.Screen name="user/[userId]" options={{ tabBarButton: () => null }} />
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
            <MaterialIcons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
