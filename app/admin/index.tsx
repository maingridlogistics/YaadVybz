/**
 * Admin Dashboard — Compatibility Redirect
 *
 * The old admin dashboard landing page is retired.
 * All admin features are now accessed via Profile tab → ADMIN section.
 *
 * This file only exists to handle any deep links, push notifications, or old
 * bookmarks that point to /admin. It immediately redirects to the Profile tab.
 *
 * Feature screens (users, events, finance, more, ads, push-test) are NOT
 * affected — they remain fully accessible from Profile → Admin menu.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function AdminDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(tabs)/profile' as any);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.gold} />
    </View>
  );
}
