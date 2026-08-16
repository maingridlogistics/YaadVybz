// ─── My Boosts Screen ───────────────────────────────────────────────────────
// Shows owner's Boost history: active, scheduled, expired, cancelled.
// Entry points: My Businesses card action | Business Profile owner action

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  fetchMyPromotions,
  formatPromotionStatus,
  getPlacementInfo,
  daysRemaining,
  BusinessPromotion,
  PromotionPlacement,
} from '../../services/businessPromotionService';
import { useAuth } from '../../hooks/useAuth';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const info = formatPromotionStatus(status as any);
  return (
    <View style={[sb.badge, { backgroundColor: `${info.color}1A`, borderColor: `${info.color}44` }]}>
      <MaterialIcons name={info.icon as any} size={11} color={info.color} />
      <Text style={[sb.text, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  text: { fontSize: 11, fontWeight: Typography.semibold },
});

// ─── Promotion Card ───────────────────────────────────────────────────────────
function PromotionCard({
  promotion,
  onPromoteAgain,
}: {
  promotion: BusinessPromotion;
  onPromoteAgain: () => void;
}) {
  const biz = promotion.businesses;
  const cat = biz?.business_categories;
  const placementInfo = getPlacementInfo(promotion.placement as PromotionPlacement);
  const remaining = daysRemaining(promotion.ends_at);
  const isActive = promotion.status === 'active';
  const isExpired = promotion.status === 'expired';

  const startStr = promotion.starts_at
    ? new Date(promotion.starts_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const endStr = promotion.ends_at
    ? new Date(promotion.ends_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={prc.card}>
      {/* Header */}
      <View style={prc.header}>
        <View style={prc.thumbWrap}>
          {biz?.logo_url ?? biz?.cover_url ? (
            <Image source={{ uri: (biz.logo_url ?? biz.cover_url)! }} style={prc.thumb} contentFit="cover" transition={200} />
          ) : (
            <View style={[prc.thumb, prc.thumbPlaceholder]}>
              <MaterialIcons name={(cat?.icon ?? 'storefront') as any} size={20} color={cat?.color ?? Colors.textMuted} />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={prc.bizName} numberOfLines={1}>{biz?.name ?? 'Business'}</Text>
          <View style={prc.placementRow}>
              <MaterialIcons name={placementInfo.icon as any} size={12} color={Colors.gold} />
              <Text style={prc.placementLabel}>
                {promotion.placement === 'boost' ? `${promotion.duration_days}-Day Boost` : placementInfo.label}
              </Text>
            </View>
        </View>
        <StatusBadge status={promotion.status} />
      </View>

      {/* Metrics */}
      {isActive && (
        <View style={prc.metricsRow}>
          <View style={prc.metric}>
            <MaterialIcons name="visibility" size={14} color={Colors.gold} />
            <Text style={prc.metricVal}>{promotion.impression_count.toLocaleString()}</Text>
            <Text style={prc.metricLabel}>Impressions</Text>
          </View>
          <View style={prc.metric}>
            <MaterialIcons name="touch-app" size={14} color={Colors.info} />
            <Text style={prc.metricVal}>{promotion.click_count.toLocaleString()}</Text>
            <Text style={prc.metricLabel}>Profile Opens</Text>
          </View>
          <View style={prc.metric}>
            <MaterialIcons name="schedule" size={14} color={Colors.greenLight} />
            <Text style={[prc.metricVal, { color: Colors.greenLight }]}>{remaining}</Text>
            <Text style={prc.metricLabel}>Days Left</Text>
          </View>
        </View>
      )}

      {/* Date range */}
      {(startStr || endStr) && (
        <View style={prc.dateRow}>
          <MaterialIcons name="calendar-today" size={12} color={Colors.textMuted} />
          <Text style={prc.dateText}>
            {startStr ?? '—'} → {endStr ?? '—'}
          </Text>
          {isActive && remaining > 0 && (
            <View style={prc.activeDot}>
              <View style={prc.activePulse} />
            </View>
          )}
        </View>
      )}

      {/* Promote Again (expired only) */}
      {isExpired && (
        <View style={prc.footer}>
          <Pressable
            onPress={onPromoteAgain}
            style={({ pressed }) => [prc.promoteAgainBtn, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="rocket-launch" size={14} color={Colors.gold} />
            <Text style={prc.promoteAgainText}>Boost Again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const prc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md },
  thumbWrap: { width: 48, height: 48, borderRadius: Radius.md, overflow: 'hidden', flexShrink: 0 },
  thumb: { width: 48, height: 48 },
  thumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  bizName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  placementRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  placementLabel: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  parishChip: { fontSize: Typography.xs, color: Colors.textMuted },
  metricsRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    gap: 0, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.md,
  },
  metric: { flex: 1, alignItems: 'center', gap: 3 },
  metricVal: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  metricLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
  },
  dateText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C85333', alignItems: 'center', justifyContent: 'center' },
  activePulse: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#00C853' },
  footer: { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  promoteAgainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base,
  },
  promoteAgainText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function MyPromotionsScreen() {
  const { businessId } = useLocalSearchParams<{ businessId?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [promotions, setPromotions] = useState<BusinessPromotion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchMyPromotions(businessId);
    setPromotions(data);
    setLoading(false);
  }, [businessId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeCount = promotions.filter((p) => p.status === 'active').length;

  if (!user) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Sign in required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.title}>My Boosts</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PromotionCard
              promotion={item}
              onPromoteAgain={() => {
                const bid = item.business_id;
                router.push(`/business/promote/${bid}` as any);
              }}
            />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            promotions.length > 0 ? (
              <View style={s.listHeader}>
                {activeCount > 0 ? (
                  <View style={s.activeBanner}>
                    <LinearGradient
                      colors={[`${Colors.gold}15`, `${Colors.gold}06`]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <MaterialIcons name="rocket-launch" size={18} color={Colors.gold} />
                    <Text style={s.activeBannerText}>
                      {activeCount} active boost{activeCount !== 1 ? 's' : ''} running
                    </Text>
                  </View>
                ) : null}
                <Text style={s.listHeaderText}>
                  {promotions.length} boost{promotions.length !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.center}>
              <View style={s.emptyIcon}>
                <MaterialIcons name="campaign" size={40} color={Colors.textMuted} />
              </View>
              <Text style={s.emptyTitle}>No boosts yet</Text>
              <Text style={s.emptySub}>
                Boost your business to reach more customers across Home, Explore, your Parish and Category.
              </Text>
              {businessId ? (
                <Pressable
                  onPress={() => router.push(`/business/promote/${businessId}` as any)}
                  style={({ pressed }) => [s.promoteBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.promoteBtnInner}>
                    <MaterialIcons name="rocket-launch" size={18} color={Colors.textOnGold} />
                    <Text style={s.promoteBtnText}>Boost Business</Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  title: { flex: 1, fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  list: { paddingTop: Spacing.md },
  listHeader: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.sm },
  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33`, overflow: 'hidden',
  },
  activeBannerText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  listHeaderText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  promoteBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  promoteBtnInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  promoteBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
