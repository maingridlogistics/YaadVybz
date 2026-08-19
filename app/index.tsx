import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { usePromoterMode } from '../hooks/usePromoterMode';
import { Colors } from '../constants/theme';

/**
 * Determines whether a user needs to complete their profile.
 * A profile is considered incomplete when:
 *   - name is blank/default, OR
 *   - homeParish is not set
 *
 * Applied to ALL users (WhatsApp, email, Google, Apple).
 * Email users who just registered will be redirected here after confirming
 * their email to set username + parish.
 */
function needsProfileCompletion(user: any): boolean {
  if (!user) return false;
  const hasName = user.name && user.name.trim() !== '' && user.name !== 'Viber';
  const hasParish = user.homeParish && user.homeParish.trim() !== '';
  return !hasName || !hasParish;
}

export default function Index() {
  const { user, isLoading } = useAuth();
  const { isPromoterModeReady } = usePromoterMode();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (isLoading || !isPromoterModeReady) return;
    if (didRedirect.current) return;
    didRedirect.current = true;
    if (user) {
      if (needsProfileCompletion(user)) {
        // WhatsApp new user — must complete profile before entering the app
        router.replace('/complete-profile' as any);
      } else {
        // All authenticated users use the universal tab navigation.
        // Role-specific features (promoter/admin) are accessed via the Profile tab.
        router.replace('/(tabs)' as any);
      }
    } else {
      router.replace('/onboarding' as any);
    }
  }, [isLoading, isPromoterModeReady, user, router]);

  // Safety fallback: if AuthContext takes more than 4 seconds, force redirect to onboarding.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!didRedirect.current) {
        didRedirect.current = true;
        router.replace('/onboarding' as any);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.gold} />
    </View>
  );
}
