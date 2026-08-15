/**
 * Compatibility redirect — old Finance hub route
 * Any legacy notification or deep-link that lands on /admin/finance
 * is redirected to the Profile admin section.
 * Section-based sub-routes now have their own dedicated pages.
 */
import { Redirect } from 'expo-router';
export default function AdminFinanceRedirect() {
  return <Redirect href={'/(tabs)/profile' as any} />;
}
