/**
 * Compatibility redirect — old Users multi-section hub route
 * Any legacy notification or deep-link that lands on /admin/users
 * is redirected based on the section param:
 *   ?section=deletions → /admin/account-deletion-requests
 *   default            → /admin/admin-users
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
export default function AdminUsersRedirect() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  if (section === 'deletions') {
    return <Redirect href={'/admin/account-deletion-requests' as any} />;
  }
  return <Redirect href={'/admin/admin-users' as any} />;
}
