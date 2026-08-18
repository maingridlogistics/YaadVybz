import React, { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { CreateTypeSheet } from '../../components/create/CreateTypeSheet';

// ─── Create Tab Button (floating gold circle) ─────────────────────────────────
function CreateTabButton({ onPress }: any) {
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

// ─── Universal Tab Layout — same for ALL roles ────────────────────────────────
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { passwordRecoveryMode } = useAuth();
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  // If a password-reset deep link fires while the user is in the app,
  // redirect to auth to complete the flow.
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
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
          tabBarButton: (props) => (
            <CreateTabButton
              {...props}
              onPress={() => setShowCreateSheet(true)}
            />
          ),
        }}
      />

      {/* Create type selector — shown above the tab bar */}
      <CreateTypeSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        onSelectEvent={() => {
          setShowCreateSheet(false);
          router.push('/(tabs)/post' as any);
        }}
        onSelectBusiness={() => {
          setShowCreateSheet(false);
          router.push('/business/create' as any);
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
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
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
