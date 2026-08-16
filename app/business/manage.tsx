// ─── My Businesses — Owner management screen ──────────────────────────────────

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { fetchOwnedBusinesses, OwnedBusiness } from '../../services/businessService';
import { useAuth } from '../../hooks/useAuth';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: string }> = {
    pending:   { label: 'Pending Review', color: '#FF9800', icon: 'pending-actions' },
    live:      { label: 'Live',           color: '#00C853', icon: 'check-circle' },
    rejected:  { label: 'Rejected',       color: '#F44336', icon: 'cancel' },
    suspended: { label: 'Suspended',      color: '#9C27B0', icon: 'block' },
  };
  const info = map[status] ?? { label: status, color: Colors.textMuted, icon: 'info' };
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

// ─── Business card ────────────────────────────────────────────────────────────
function BizCard({ biz, onView, onEdit }: { biz: OwnedBusiness; onView: () => void; onEdit: () => void }) {
  const cat = biz.business_categories;
  const catColor = cat?.color ?? '#78909C';

  return (
    <View style={bc.card}>
      <Pressable onPress={onView} style={({ pressed }) => [bc.main, pressed && { opacity: 0.85 }]}>
        <View style={bc.thumbWrap}>
          {biz.logo_url ?? biz.cover_url ? (
            <Image source={{ uri: (biz.logo_url ?? biz.cover_url)! }} style={bc.thumb} contentFit="cover" transition={200} />
          ) : (
            <View style={[bc.thumb, bc.thumbPlaceholder]}>
              <MaterialIcons name={(cat?.icon ?? 'storefront') as any} size={26} color={catColor} />
            </View>
          )}
        </View>
        <View style={bc.body}>
          <View style={bc.nameRow}>
            <Text style={bc.name} numberOfLines={1}>{biz.name}</Text>
            {biz.verified && <MaterialIcons name="verified" size={14} color={Colors.gold} />}
          </View>
          <Text style={[bc.cat, { color: catColor }]} numberOfLines={1}>
            {cat?.label ?? 'Business'} · {biz.primary_parish}
          </Text>
          <StatusBadge status={biz.status} />
          {biz.status === 'rejected' && biz.rejection_reason ? (
            <Text style={bc.rejReason} numberOfLines={2}>
              Reason: {biz.rejection_reason}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={bc.actions}>
        <Pressable onPress={onView} style={({ pressed }) => [bc.actionBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="visibility" size={16} color={Colors.textSecondary} />
          <Text style={bc.actionText}>View</Text>
        </Pressable>
        <View style={bc.actionDivider} />
        <Pressable onPress={onEdit} style={({ pressed }) => [bc.actionBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="edit" size={16} color={Colors.gold} />
          <Text style={[bc.actionText, { color: Colors.gold }]}>Edit</Text>
        </Pressable>
      </View>
    </View>
  );
}
const bc = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, overflow: 'hidden' },
  main: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, gap: Spacing.md },
  thumbWrap: { width: 72, height: 72, borderRadius: Radius.md, overflow: 'hidden', flexShrink: 0 },
  thumb: { width: 72, height: 72 },
  thumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  cat: { fontSize: 12, fontWeight: Typography.medium },
  rejReason: { fontSize: 11, color: '#FF7777', lineHeight: 15, marginTop: 2 },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm },
  actionText: { fontSize: 12, color: Colors.textSecondary, fontWeight: Typography.semibold },
  actionDivider: { width: 1, backgroundColor: Colors.surfaceBorder },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ManageBusinessesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [businesses, setBusinesses] = useState<OwnedBusiness[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOwnedBusinesses();
    setBusinesses(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Sign in required</Text>
          <Pressable onPress={() => router.push('/auth' as any)} style={s.goldBtn}>
            <Text style={s.goldBtnText}>Sign In</Text>
          </Pressable>
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
          <Text style={s.title}>My Businesses</Text>
          <Pressable
            onPress={() => router.push('/business/create' as any)}
            style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="add" size={20} color={Colors.textOnGold} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <BizCard
              biz={item}
              onView={() => router.push(`/business/${item.id}` as any)}
              onEdit={() => router.push(`/business/edit/${item.id}` as any)}
            />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            businesses.length > 0 ? (
              <View style={s.listHeader}>
                <Text style={s.listHeaderText}>{businesses.length} business{businesses.length !== 1 ? 'es' : ''}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.center}>
              <View style={s.emptyIcon}>
                <MaterialIcons name="storefront" size={40} color={Colors.textMuted} />
              </View>
              <Text style={s.emptyTitle}>No businesses yet</Text>
              <Text style={s.emptySub}>List your business to connect with customers across Jamaica.</Text>
              <Pressable
                onPress={() => router.push('/business/create' as any)}
                style={({ pressed }) => [s.goldBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.goldBtnInner}>
                  <MaterialIcons name="add-business" size={18} color={Colors.textOnGold} />
                  <Text style={s.goldBtnText}>List Your Business</Text>
                </LinearGradient>
              </Pressable>
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
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  list: { paddingTop: Spacing.md },
  listHeader: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  listHeaderText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  goldBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  goldBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  goldBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
