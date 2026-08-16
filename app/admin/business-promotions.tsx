// ─── Admin — Business Boosts Management ─────────────────────────────────────
// Admin oversight: view all business boosts, grant comps, cancel active boosts.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, TextInput, Modal, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  BusinessPromotion,
  PromotionStatus,
  formatPromotionStatus,
  getPlacementInfo,
  daysRemaining,
  PromotionPlacement,
} from '../../services/businessPromotionService';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

type StatusFilter = PromotionStatus | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string; color: string }[] = [
  { key: 'all',             label: 'All',      color: Colors.gold       },
  { key: 'active',          label: 'Active',   color: '#00C853'         },
  { key: 'pending_payment', label: 'Pending',  color: '#FF9800'         },
  { key: 'expired',         label: 'Expired',  color: '#78909C'         },
  { key: 'cancelled',       label: 'Cancelled',color: '#F44336'         },
];

// ─── Fetch all promotions (admin) ─────────────────────────────────────────────
async function adminFetchPromotions(status: StatusFilter): Promise<BusinessPromotion[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('business_promotions')
    .select(`
      *,
      businesses (
        name, logo_url, cover_url, primary_parish,
        business_categories ( label, icon, color )
      )
    `)
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.error('[adminPromotions] fetch error:', error.message);
    return [];
  }
  return (data ?? []) as BusinessPromotion[];
}

async function adminCancelPromotion(promotionId: string, reason: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('admin_cancel_business_promotion', {
    p_promotion_id: promotionId,
    p_reason: reason,
  });
  return error?.message ?? null;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const info = formatPromotionStatus(status as PromotionStatus);
  return (
    <View style={[sb.badge, { backgroundColor: `${info.color}1A`, borderColor: `${info.color}44` }]}>
      <MaterialIcons name={info.icon as any} size={10} color={info.color} />
      <Text style={[sb.text, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: Typography.bold },
});

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function PromotionDetailModal({
  promotion,
  visible,
  onClose,
  onCancel,
}: {
  promotion: BusinessPromotion | null;
  visible: boolean;
  onClose: () => void;
  onCancel: (id: string, reason: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelInput, setShowCancelInput] = useState(false);

  if (!promotion) return null;
  const biz = promotion.businesses;
  const pi = getPlacementInfo(promotion.placement as PromotionPlacement);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[dm.container, { paddingBottom: insets.bottom }]}>
        <View style={dm.header}>
          <Pressable onPress={() => { onClose(); setShowCancelInput(false); setCancelReason(''); }} style={dm.closeBtn} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={dm.headerTitle} numberOfLines={1}>Boost Detail</Text>
          <StatusBadge status={promotion.status} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={dm.content}>
          {biz?.logo_url || biz?.cover_url ? (
            <Image source={{ uri: (biz.logo_url ?? biz.cover_url)! }} style={dm.logo} contentFit="cover" />
          ) : null}

          <View style={dm.infoBlock}>
            {[
              { label: 'Business',   value: biz?.name ?? '—'               },
              { label: 'Owner ID',   value: promotion.owner_id.slice(0,16)  },
              { label: 'Placement',  value: pi.label                        },
              { label: 'Parish',     value: promotion.parish ?? '—'         },
              { label: 'Duration',   value: `${promotion.duration_days} days` },
              { label: 'Starts',     value: promotion.starts_at ? new Date(promotion.starts_at).toLocaleDateString() : '—' },
              { label: 'Ends',       value: promotion.ends_at   ? new Date(promotion.ends_at).toLocaleDateString()   : '—' },
              { label: 'Days Left',  value: String(daysRemaining(promotion.ends_at))                                        },
              { label: 'Provider',   value: promotion.payment_provider ?? '—'                                               },
              { label: 'Amount',     value: `$${(promotion.amount / 100).toFixed(2)} ${promotion.currency.toUpperCase()}`   },
              { label: 'Impressions',value: String(promotion.impression_count) },
              { label: 'Clicks',     value: String(promotion.click_count)      },
              { label: 'Created',    value: new Date(promotion.created_at).toLocaleDateString() },
            ].map(({ label, value }) => (
              <View key={label} style={dm.row}>
                <Text style={dm.rowLabel}>{label}</Text>
                <Text style={dm.rowValue} numberOfLines={1}>{value}</Text>
              </View>
            ))}
          </View>

          {showCancelInput ? (
            <View style={dm.cancelBlock}>
              <Text style={dm.cancelLabel}>Cancellation reason:</Text>
              <TextInput
                style={dm.cancelInput}
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Enter reason..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <View style={dm.cancelBtns}>
                <Pressable onPress={() => setShowCancelInput(false)} style={dm.cancelBackBtn}>
                  <Text style={dm.cancelBackText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onCancel(promotion.id, cancelReason);
                    setShowCancelInput(false);
                    setCancelReason('');
                  }}
                  style={dm.confirmCancelBtn}
                >
                  <Text style={dm.confirmCancelText}>Confirm Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            promotion.status === 'active' ? (
              <Pressable
                onPress={() => setShowCancelInput(true)}
                style={({ pressed }) => [dm.dangerBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="cancel" size={16} color="#fff" />
                <Text style={dm.dangerBtnText}>Cancel Boost</Text>
              </Pressable>
            ) : null
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.sm },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 60 },
  logo: { width: 80, height: 80, borderRadius: Radius.md },
  infoBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  rowLabel: { width: 90, fontSize: Typography.xs, color: Colors.textMuted },
  rowValue: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  cancelBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.base, gap: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  cancelInput: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, color: Colors.textPrimary, minHeight: 80, borderWidth: 1, borderColor: Colors.surfaceBorder, textAlignVertical: 'top', fontSize: Typography.sm },
  cancelBtns: { flexDirection: 'row', gap: Spacing.sm },
  cancelBackBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelBackText: { fontSize: Typography.sm, color: Colors.textSecondary },
  confirmCancelBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: '#F44336', borderRadius: Radius.md },
  confirmCancelText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: '#F44336', borderRadius: Radius.lg, paddingVertical: Spacing.md },
  dangerBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminBusinessPromotionsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [filterStatus, setFilterStatus] = useState<StatusFilter>('active');
  const [promotions, setPromotions] = useState<BusinessPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BusinessPromotion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await adminFetchPromotions(filterStatus);
    setPromotions(data);
    setLoading(false);
  }, [filterStatus]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCancel = async (id: string, reason: string) => {
    const err = await adminCancelPromotion(id, reason);
    if (err) { Alert.alert('Error', err); return; }
    setSelected(null);
    load();
  };

  if (!user?.roles.includes('admin')) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Admin access required</Text>
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
          <Text style={s.title}>Business Boosts</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterStrip}>
          {STATUS_FILTERS.map((f) => {
            const active = filterStatus === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilterStatus(f.key)}
                style={[s.filterChip, active && { backgroundColor: f.color, borderColor: f.color }]}
              >
                <Text style={[s.filterChipText, active && { color: '#fff', fontWeight: Typography.bold }]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => {
            const biz = item.businesses;
            const pi = getPlacementInfo(item.placement as PromotionPlacement);
            const remaining = daysRemaining(item.ends_at);
            return (
              <Pressable
                onPress={() => setSelected(item)}
                style={({ pressed }) => [s.promoCard, pressed && { opacity: 0.85 }]}
              >
                {biz?.logo_url ? (
                  <Image source={{ uri: biz.logo_url }} style={s.promoThumb} contentFit="cover" />
                ) : (
                  <View style={[s.promoThumb, s.promoThumbPh]}>
                    <MaterialIcons name="storefront" size={20} color={Colors.textMuted} />
                  </View>
                )}
                <View style={s.promoBody}>
                  <Text style={s.promoName} numberOfLines={1}>{biz?.name ?? '—'}</Text>
                    <View style={s.promoMeta}>
                    <MaterialIcons name={pi.icon as any} size={11} color={Colors.gold} />
                    <Text style={s.promoMetaText}>
                      {item.placement === 'boost' ? `${item.duration_days}-Day Boost` : pi.label}
                    </Text>
                    {item.parish ? <Text style={s.promoMetaText}>· {item.parish}</Text> : null}
                    <Text style={s.promoMetaText}>· {item.duration_days}d</Text>
                  </View>
                  <View style={s.promoRow}>
                    <StatusBadge status={item.status} />
                    {item.status === 'active' && remaining > 0 ? (
                      <Text style={s.remainingText}>{remaining}d left</Text>
                    ) : null}
                  </View>
                </View>
                <View style={s.promoRight}>
                  <Text style={s.promoAmount}>${(item.amount / 100).toFixed(2)}</Text>
                  <Text style={s.promoProvider}>{item.payment_provider ?? '—'}</Text>
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={s.listHeader}>
              {promotions.length} boost{promotions.length !== 1 ? 's' : ''}
            </Text>
          }
          ListEmptyComponent={
            <View style={s.center}>
              <MaterialIcons name="campaign" size={40} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>No {filterStatus === 'all' ? '' : filterStatus} boosts</Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      )}

      <PromotionDetailModal
        promotion={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        onCancel={handleCancel}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  title: { flex: 1, fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  filterStrip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  filterChipText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  list: { paddingTop: Spacing.xs },
  listHeader: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, marginTop: Spacing.sm },
  promoCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md, backgroundColor: Colors.background },
  promoThumb: { width: 52, height: 52, borderRadius: Radius.md, flexShrink: 0 },
  promoThumbPh: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  promoBody: { flex: 1, gap: 4 },
  promoName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  promoMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  promoMetaText: { fontSize: Typography.xs, color: Colors.textMuted },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  remainingText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.semibold },
  promoRight: { alignItems: 'flex-end', gap: 2 },
  promoAmount: { fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.textPrimary },
  promoProvider: { fontSize: Typography.xs, color: Colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
});
