/**
 * Admin More & Settings — Compatibility Redirect
 *
 * This hub has been retired. All functionality that previously lived here
 * has been promoted to direct-destination screens accessible from Profile:
 *
 *   Ads & Placements  → /admin/ads-management
 *   Event Settings    → /admin/event-settings
 *   Categories        → /admin/categories
 *   System Tools      → /admin/system-tools
 *   Push Test Lab     → /admin/push-test
 *
 * Any deep-links or old bookmarks that point to /admin/more are safely
 * redirected to the Profile tab where all Admin entry points now live.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function AdminMoreRedirect() {
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
