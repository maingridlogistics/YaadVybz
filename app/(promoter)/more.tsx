/**
 * Promoter More — Compatibility Redirect
 *
 * This route is kept alive so existing deep links, push notifications,
 * and emails that target /(promoter)/more continue to work.
 *
 * All promoter settings, operations, marketing, and account actions
 * are now accessible directly from:
 *   Profile → PROMOTER section (individual menu rows)
 *
 * Any direct navigation here redirects to Profile.
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function PromoterMoreRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(tabs)/profile' as any);
  }, [router]);

  return null;
}
