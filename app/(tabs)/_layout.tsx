import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';

function PostTabButton({ onPress, accessibilityState }: any) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.postBtn, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.postBtnInner}>
        <MaterialIcons name="add" size={28} color={Colors.textOnGold} />
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { passwordRecoveryMode, user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;
  const { getPendingEvents, getFlaggedEvents } = useEvents();
  const adminBadge = isAdmin
    ? (getPendingEvents().length + getFlaggedEvents().length) || undefined
    : undefined;

  // If a password-reset deep link fires while the user is already in the app,
  // redirect them to the auth screen to complete the flow.
  useEffect(() => {
    if (passwordRecoveryMode) {
      router.push('/auth' as any);
    }
  }, [passwordRecoveryMode, router]);

  const tabBarStyle = {
    height: Platform.select({ ios: insets.bottom + 64, android: insets.bottom + 64, default: 72 }),
    paddingTop: 8,
    paddingBottom: Platform.select({ ios: insets.bottom + 8, android: insets.bottom + 8, default: 8 }),
    paddingHorizontal: Spacing.base,
    backgroundColor: '#0D0D0D',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: '',
          // Admin users cannot post events — collapse the Post tab item so
          // the remaining 4 tabs fill the bar equally.
          tabBarButton: isAdmin ? () => null : (props) => <PostTabButton {...props} />,
          tabBarItemStyle: isAdmin ? { display: 'none', width: 0, overflow: 'hidden' } : undefined,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarBadge: adminBadge,
          tabBarBadgeStyle: { backgroundColor: '#F44336', fontSize: 10, minWidth: 17, height: 17 },
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={isAdmin ? 'admin-panel-settings' : 'person'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  postBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  postBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
  },
});
