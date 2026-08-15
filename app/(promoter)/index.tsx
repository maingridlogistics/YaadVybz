/**
 * Promoter Dashboard — Compatibility Redirect
 *
 * The old promoter dashboard landing page is retired.
 * All promoter features are now accessed via Profile tab → PROMOTER section.
 *
 * This file only exists to handle any deep links or old bookmarks that point
 * to /(promoter). It immediately redirects to the unified Profile tab.
 *
 * Feature screens (ticketing, finance, events, more) are NOT affected —
 * they remain fully accessible from Profile → Promoter menu.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function PromoterDashboardRedirect() {
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
