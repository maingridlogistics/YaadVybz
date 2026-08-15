/**
 * Admin Portal — Users (dedicated)
 * Search, filter, and inspect user accounts. No deletion requests here.
 * Admin-only. Accessed from Profile → People → Users.
 *
 * Legacy compat: ?section=deletions redirects to /admin/account-deletion-requests
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type RoleFilter = 'all' | 'attendee' | 'promoter' | 'admin';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  subscription_tier: string;
  verified_promoter: boolean;
  joined_at: string | null;
}

const PAGE_SIZE = 60;

function UserCard({ user: u, onPress }: { user: UserRow; onPress: () => void }) {
  const isAdm = u.roles.includes('admin');
  const isPro = u.roles.includes('promoter');
  const tierColor = u.subscription_tier === 'elite' ? '#E91E63' : u.subscription_tier === 'pro' ? Colors.gold : Colors.textMuted;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.userCard, pressed && { opacity: 0.88 }]}>
      <View style={[s.avatar, isAdm ? s.avatarAdmin : isPro ? s.avatarPromoter : s.avatarAttendee]}>
        <Text style={s.avatarLetter}>{(u.name || u.email || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={s.userInfo}>
        <View style={s.nameRow}>
          <Text style={s.userName} numberOfLines={1}>{u.name || '—'}</Text>
          {u.verified_promoter && <MaterialIcons name="verified" size={14} color={Colors.gold} />}
        </View>
        <Text style={s.userEmail} numberOfLines={1}>{u.email || '—'}</Text>
        <View style={s.badgeRow}>
          {u.roles.map((role) => (
            <View key={role} style={[s.roleBadge, role === 'admin' ? s.badgeAdmin : role === 'promoter' ? s.badgePromoter : s.badgeAttendee]}>
              <Text style={[s.roleBadgeText, { color: role === 'admin' ? Colors.gold : role === 'promoter' ? '#7C4DFF' : Colors.greenLight }]}>
                {role}
              </Text>
            </View>
          ))}
          {u.subscription_tier !== 'free' && (
            <View style={[s.roleBadge, { backgroundColor: `${tierColor}18`, borderColor: `${tierColor}44` }]}>
              <Text style={[s.roleBadgeText, { color: tierColor }]}>{u.subscription_tier}</Text>
            </View>
          )}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: adminUser } = useAuth();
  const isAdmin = adminUser?.roles.includes('admin') ?? false;

  // Legacy deep-link compat: /admin/users?section=deletions → dedicated page
  const { section } = useLocalSearchParams<{ section?: string }>();
  if (section === 'deletions') {
    return <Redirect href={'/admin/account-deletion-requests' as any} />;
  }

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadUsers = useCallback(async (q: string, role: RoleFilter, pageNum = 0, append = false) => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_profiles')
        .select('id, name, email, roles, subscription_tier, verified_promoter, joined_at')
        .order('joined_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (q.trim().length >= 2) {
        query = query.or(`name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`);
      }
      if (role === 'admin') query = query.contains('roles', ['admin']);
      else if (role === 'promoter') query = query.contains('roles', ['promoter']);
      else if (role === 'attendee') query = query.contains('roles', ['attendee']);

      const { data } = await query;
      const rows = (data ?? []) as UserRow[];
      setHasMore(rows.length === PAGE_SIZE);
      setPage(pageNum);
      if (append) setUsers((prev) => [...prev, ...rows]);
      else setUsers(rows);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers('', 'all', 0, false); }, []);
  useEffect(() => { loadUsers(search, roleFilter, 0, false); }, [roleFilter]);

  if (!isAdmin) {
    return (
      <View style={s.gate}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={s.gateText}>Admin access required.</Text>
        <Pressable onPress={() => router.back()} style={s.gateBtn}><Text style={s.gateBtnText}>Go Back</Text></Pressable>
      </View>
    );
  }

  const ROLE_COLORS: Record<string, string> = { all: Colors.gold, attendee: Colors.greenLight, promoter: '#7C4DFF', admin: '#F44336' };

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="people" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Users</Text>
            <Text style={s.headerSub}>Search and manage platform accounts</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}>
        {/* Search */}
        <View style={s.searchRow}>
          <MaterialIcons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => loadUsers(search, roleFilter, 0, false)}
            returnKeyType="search"
            accessibilityLabel="Search users"
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(''); loadUsers('', roleFilter, 0, false); }} hitSlop={8}>
              <MaterialIcons name="close" size={15} color={Colors.textMuted} />
            </Pressable>
          )}
          <Pressable onPress={() => loadUsers(search, roleFilter, 0, false)} style={s.searchBtn} hitSlop={4}>
            <Text style={s.searchBtnText}>Search</Text>
          </Pressable>
        </View>

        {/* Role filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {(['all', 'attendee', 'promoter', 'admin'] as RoleFilter[]).map((role) => {
            const isAct = roleFilter === role;
            const rc = ROLE_COLORS[role];
            return (
              <Pressable
                key={role}
                onPress={() => setRoleFilter(role)}
                style={[s.filterChip, isAct && { backgroundColor: `${rc}22`, borderColor: `${rc}77` }]}
              >
                <Text style={[s.filterChipText, isAct && { color: rc }]}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading && users.length === 0 ? (
          <View style={s.centered}><ActivityIndicator color={Colors.gold} /></View>
        ) : users.length === 0 ? (
          <View style={s.centered}>
            <MaterialIcons name="person-search" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No users found</Text>
            <Text style={s.emptySub}>Try a different search term or filter.</Text>
          </View>
        ) : (
          <>
            <Text style={s.resultCount}>{users.length}{hasMore ? '+' : ''} result{users.length !== 1 ? 's' : ''}</Text>
            {users.map((u) => (
              <UserCard key={u.id} user={u} onPress={() => router.push(`/admin/user/${u.id}` as any)} />
            ))}
            {hasMore && (
              <Pressable
                onPress={() => loadUsers(search, roleFilter, page + 1, true)}
                disabled={loading}
                style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.7 }, loading && { opacity: 0.5 }]}
              >
                {loading ? <ActivityIndicator size="small" color={Colors.gold} /> : (<><MaterialIcons name="expand-more" size={16} color={Colors.gold} /><Text style={s.loadMoreText}>Load More</Text></>)}
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gate: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  gateText: { fontSize: Typography.base, color: Colors.textMuted },
  gateBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  gateBtnText: { color: Colors.gold, fontWeight: Typography.semibold as any },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  body: { padding: Spacing.base, gap: Spacing.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  searchBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  searchBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  filterChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted },
  centered: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, borderColor: `${Colors.gold}44`, backgroundColor: Colors.goldSurface, marginTop: Spacing.sm,
  },
  loadMoreText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarAdmin: { backgroundColor: Colors.goldSurface, borderWidth: 1.5, borderColor: `${Colors.gold}44` },
  avatarPromoter: { backgroundColor: 'rgba(124,77,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(124,77,255,0.44)' },
  avatarAttendee: { backgroundColor: Colors.greenSurface, borderWidth: 1.5, borderColor: `${Colors.greenLight}44` },
  avatarLetter: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  userName: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  userEmail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  badgeAdmin: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` },
  badgePromoter: { backgroundColor: 'rgba(124,77,255,0.18)', borderColor: 'rgba(124,77,255,0.44)' },
  badgeAttendee: { backgroundColor: Colors.greenSurface, borderColor: `${Colors.greenLight}44` },
  roleBadgeText: { fontSize: 9, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },
});
