/**
 * Compatibility redirect — old Events hub route
 * Any legacy notification or deep-link that lands on /admin/events
 * is redirected to the Profile admin section.
 * Section-based sub-routes now have their own dedicated pages:
 *   /admin/event-queue, /admin/flagged-events, /admin/all-events
 */
import { Redirect } from 'expo-router';
export default function AdminEventsRedirect() {
  return <Redirect href={'/(tabs)/profile' as any} />;
}
