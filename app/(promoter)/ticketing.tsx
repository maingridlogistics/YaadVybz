/**
 * Promoter Ticketing — Compatibility Redirect
 *
 * This route is kept alive so existing deep links, push notifications,
 * and emails that target /(promoter)/ticketing continue to work.
 *
 * The primary ticketing entry point is now:
 *   Profile → Ticket Setup / Ticket Tiers / Ticket Dashboard / Attendees / etc.
 *   (smart-routed directly to the per-event screen with no intermediate portal)
 *
 * Any direct navigation here redirects to Profile so the user can pick
 * the specific ticketing action they need.
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function PromoterTicketingRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Replace instead of push so the back button doesn't loop here
    router.replace('/(tabs)/profile' as any);
  }, [router]);

  return null;
}
