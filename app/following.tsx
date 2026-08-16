/**
 * Following Screen
 * Shows all promoters the current user follows.
 * Accessed directly from Profile → My Vybz → Following.
 *
 * Data sources:
 *  - WHO is followed: followedPromoterIds from AuthContext (follows table)
 *  - PROFILE DATA:    get_public_promoter_profiles() RPC — returns only
 *                     public-safe fields (id, name, avatar_url,
 *                     verified_promoter, home_parish). Promoters remain
 *                     visible even with zero events.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PublicPromoterProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  verified_promoter: boolean;
  home_parish: string | null;
}

// ─── Promoter Row ──────────────────────────────────────────────────────────────
function PromoterRow({
  profile,
  onPress,
  onUnfollow,
}: {
  profile: PublicPromoterProfile & { displayName: string };
  onPress: () => void;
  onUnfollow: () => void;
}) {
  const initial = (profile.displayName || 'P')[0].toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.promoterRow, pressed && { opacity: 0.85 }]}
    >
      {/* Avatar */}
      {profile.avatar_url ? (
        <Image
          source={{ uri: profile.avatar_url }}
          style={styles.avatar}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{initial}</Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.promoterInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.promoterName} numberOfLines={1}>{profile.displayName}</Text>
        </View>
        {profile.home_parish ? (
          <Text style={styles.promoterSub}>
            <MaterialIcons name="place" size={10} color={Colors.textMuted} /> {profile.home_parish}
          </Text>
        ) : (
          <Text style={styles.promoterSub}>Promoter on Vybz Hub</Text>
        )}
      </View>

      {/* Unfollow */}
      <Pressable
        onPress={onUnfollow}
        hitSlop={8}
        style={({ pressed }) => [styles.unfollowBtn, pressed && { opacity: 0.7 }]}
      >
        <MaterialIcons name="person-remove" size={16} color={Colors.textMuted} />
        <Text style={styles.unfollowText}>Unfollow</Text>
      </Pressable>
    </Pressable>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function FollowingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, followedPromoterIds, toggleFollow } = useAuth();
  const [search, setSearch] = useState('');
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);

  // ── Real promoter profile data from restricted RPC ────────────────────────
  const [profileMap, setProfileMap] = useState<Record<string, PublicPromoterProfile>>({});
  const [profilesLoading, setProfilesLoading] = useState(false);

  useEffect(() => {
    if (!user || followedPromoterIds.length === 0) {
      setProfileMap({});
      return;
    }
    setProfilesLoading(true);
    supabase
      .rpc('get_public_promoter_profiles', { p_promoter_ids: followedPromoterIds })
      .then(({ data, error }) => {
        if (!error && data) {
          const map: Record<string, PublicPromoterProfile> = {};
          (data as PublicPromoterProfile[]).forEach((p) => { map[p.id] = p; });
          setProfileMap(map);
        }
        setProfilesLoading(false);
      });
  }, [user, followedPromoterIds]);

  // ── Build display list — every followed promoter ID appears, even with no
  //    profile data (fallback to placeholder until RPC resolves). ─────────────
  const following = useMemo(() => {
    return followedPromoterIds.map((id) => {
      const p = profileMap[id];
      return {
        id,
        name: p?.name ?? null,
        displayName: p?.name ?? 'Promoter',
        avatar_url: p?.avatar_url ?? null,
        verified_promoter: p?.verified_promoter ?? false,
        home_parish: p?.home_parish ?? null,
      };
    });
  }, [followedPromoterIds, profileMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return following;
    const q = search.toLowerCase().trim();
    return following.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [following, search]);

  const handleUnfollow = useCallback(async (promoterId: string) => {
    setUnfollowingId(promoterId);
    try {
      await toggleFollow(promoterId);
    } finally {
      setUnfollowingId(null);
    }
  }, [toggleFollow]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Following</Text>
            <Text style={styles.headerSub}>
              {following.length > 0
                ? `${following.length} promoter${following.length !== 1 ? 's' : ''}`
                : 'No promoters followed yet'}
            </Text>
          </View>
          {profilesLoading && (
            <ActivityIndicator size="small" color={Colors.gold} style={{ marginRight: Spacing.xs }} />
          )}
        </View>

        {/* Search — only shown when there is someone to search */}
        {following.length > 0 && (
          <View style={styles.searchRow}>
            <MaterialIcons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search promoters..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              accessibilityLabel="Search followed promoters"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>

      {/* ── Guest gate ──────────────────────────────────────────────────────── */}
      {!user ? (
        <View style={styles.gateWrap}>
          <MaterialIcons name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Sign In to See Following</Text>
          <Pressable
            onPress={() => router.push('/auth' as any)}
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.ctaBtnInner}>
              <Text style={styles.ctaBtnText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>

      /* ── Empty state ─────────────────────────────────────────────────────── */
      ) : following.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="people-outline" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Not Following Anyone Yet</Text>
          <Text style={styles.emptySub}>
            Follow promoters to get updates when they post new events.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.ctaBtnInner}>
              <MaterialIcons name="search" size={18} color={Colors.textOnGold} />
              <Text style={styles.ctaBtnText}>Browse Events</Text>
            </LinearGradient>
          </Pressable>
        </View>

      /* ── List ────────────────────────────────────────────────────────────── */
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyFilter}>
              <MaterialIcons name="search-off" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyFilterText}>No promoters match your search.</Text>
            </View>
          ) : (
            filtered.map((p) => (
              <View key={p.id} style={styles.rowWrapper}>
                {unfollowingId === p.id ? (
                  <View style={[styles.promoterRow, { justifyContent: 'center' }]}>
                    <ActivityIndicator size="small" color={Colors.gold} />
                  </View>
                ) : (
                  <PromoterRow
                    profile={p}
                    onPress={() => router.push(`/promoter/${p.id}` as any)}
                    onUnfollow={() => handleUnfollow(p.id)}
                  />
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 44,
    marginHorizontal: Spacing.base, marginVertical: Spacing.md,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.xs },
  rowWrapper: {},

  promoterRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    minHeight: 68,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, flexShrink: 0 },
  avatarFallback: {
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: `${Colors.gold}44`,
  },
  avatarLetter: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.gold },

  promoterInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  promoterName: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary, flexShrink: 1 },
  promoterSub: { fontSize: Typography.xs, color: Colors.textMuted },

  unfollowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  unfollowText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },

  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  emptyFilter: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.sm },
  emptyFilterText: { fontSize: Typography.sm, color: Colors.textMuted },

  ctaBtn: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs },
  ctaBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  ctaBtnText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },
});
