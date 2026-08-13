import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { usePromoterMode } from '../hooks/usePromoterMode';
import { Colors } from '../constants/theme';

export default function Index() {
  const { user, isLoading } = useAuth();
  const { activeView, isPromoterModeReady } = usePromoterMode();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (isLoading || !isPromoterModeReady) return;
    if (didRedirect.current) return;
    didRedirect.current = true;
    if (user) {
      const isPromoter = user.roles.includes('promoter');
      if (isPromoter && activeView === 'promoter') {
        router.replace('/promoter-dashboard' as any);
      } else {
        router.replace('/(tabs)' as any);
      }
    } else {
      router.replace('/onboarding' as any);
    }
  }, [isLoading, isPromoterModeReady, user, activeView, router]);

  // Safety fallback: if AuthContext takes more than 4 seconds, force redirect to onboarding.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!didRedirect.current) {
        didRedirect.current = true;
        router.replace('/onboarding' as any);
      }
    }, 4000);
    return () => clearTimeout(timer);
  // router is stable from expo-router, timer only runs once on mount
   
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.gold} />
    </View>
  );
}
