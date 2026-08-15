/**
 * Admin Portal — Ticket Orders
 * View and search all ticket orders across the platform.
 * Admin-only. Accessed from Profile → Money → Ticket Orders.
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
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatMinorAmount } from '../../services/customerTicketingService';

const PAGE_SIZE = 40;

const STATUS_COLORS: Record<string, string> = {
  paid: Colors.greenLight,
  pending: '#FF9800',
  failed: '#F44336',
  refunded: '#9E9E9E',
  voided: '#607D8B',
};
const PROVIDER_COLORS: Record<string, string> = {
  stripe: '#635BFF',
  apple: Colors.textSecondary,
  google: Colors.greenLight,
};

function TicketOrderRow({ order }: { order: any }) {
  const sc = STATUS_COLORS[order.payment_status] ?? Colors.textMuted;
  const pc = PROVIDER_COLORS[order.payment_provider] ?? Colors.textMuted;
  const date = order.paid_at
    ? new Date(order.paid_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: '2-digit' })
    : new Date(order.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: '2-digit' });

  return (
    <View style={s.orderRow}>
      <View style={s.orderLeft}>
        <Text style={s.orderAmount}>
          {formatMinorAmount(order.customer_total_minor ?? order.base_subtotal_minor ?? 0, order.currency ?? 'USD')}
        </Text>
        <Text style={s.orderMeta} numberOfLines={1}>
          {order.buyer_name || order.buyer_email || 'Anonymous'} · #{order.order_number ?? order.id?.slice(0, 8)}
        </Text>
        <View style={s.orderBadgeRow}>
          <View style={[s.statusChip, { backgroundColor: `${sc}18`, borderColor: `${sc}44` }]}>
            <View style={[s.statusDot, { backgroundColor: sc }]} />
            <Text style={[s.statusText, { color: sc }]}>{order.payment_status}</Text>
          </View>
          <View style={[s.providerChip, { backgroundColor: `${pc}18`, borderColor: `${pc}44` }]}>
            <Text style={[s.providerText, { color: pc }]}>{order.payment_provider ?? 'stripe'}</Text>
          </View>
          {order.sale_source === 'door_cash' && (
            <View style={[s.providerChip, { backgroundColor: `${Colors.gold}18`, borderColor: `${Colors.gold}44` }]}>
              <Text style={[s.providerText, { color: Colors.gold }]}>Door</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={s.orderDate}>{date}</Text>
    </View>
  );
}

export default function TicketOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [orders, setOrders] = useState<any[]>([]);
  const safeBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('paid');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadOrders = useCallback(async (pageNum = 0, status = statusFilter, q = search, append = false) => {
    setLoading(true);
    try {
      let query = supabase
        .from('ticket_orders')
        .select('id, order_number, buyer_id, buyer_name, buyer_email, event_id, currency, base_subtotal_minor, customer_total_minor, promoter_proceeds_minor, payment_status, payment_provider, paid_at, created_at, sale_source')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (status !== 'all') query = query.eq('payment_status', status);
      if (q.trim().length >= 2) {
        query = query.or(`order_number.ilike.%${q.trim()}%,buyer_email.ilike.%${q.trim()}%,buyer_name.ilike.%${q.trim()}%`);
      }

      const { data } = await query;
      const rows = data ?? [];
      setHasMore(rows.length === PAGE_SIZE);
      setPage(pageNum);
      if (append) setOrders((prev) => [...prev, ...rows]);
      else setOrders(rows);
    } catch {}
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { loadOrders(0); }, []);

  if (!isAdmin) {
    return (
      <View style={s.gate}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={s.gateText}>Admin access required.</Text>
        <Pressable onPress={() => router.back()} style={s.gateBtn}>
          <Text style={s.gateBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const STATUS_OPTS = ['paid', 'pending', 'failed', 'refunded', 'all'];

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={safeBack} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="confirmation-number" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Ticket Orders</Text>
            <Text style={s.headerSub}>Platform-wide ticket transaction ledger</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Info */}
        <View style={s.infoBanner}>
          <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
          <Text style={s.infoBannerText}>Showing ticket orders. Use filters and search to find specific transactions.</Text>
        </View>

        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {STATUS_OPTS.map((st) => {
            const isAct = statusFilter === st;
            const c = STATUS_COLORS[st] ?? Colors.gold;
            return (
              <Pressable
                key={st}
                onPress={() => { setStatusFilter(st); loadOrders(0, st, search); }}
                style={[s.filterChip, isAct && { backgroundColor: `${c}22`, borderColor: `${c}77` }]}
              >
                <Text style={[s.filterChipText, isAct && { color: c }]}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search */}
        <View style={s.searchRow}>
          <MaterialIcons name="search" size={15} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by order #, email, name..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => loadOrders(0, statusFilter, search)}
            returnKeyType="search"
            accessibilityLabel="Search ticket orders"
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(''); loadOrders(0, statusFilter, ''); }} hitSlop={8}>
              <MaterialIcons name="close" size={14} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {loading && page === 0 ? (
          <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.xl }} />
        ) : orders.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="confirmation-number" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No ticket orders found</Text>
            <Text style={s.emptySub}>Try a different filter or search term.</Text>
          </View>
        ) : (
          <>
            <Text style={s.resultCount}>{orders.length}{hasMore ? '+' : ''} orders</Text>
            {orders.map((order) => <TicketOrderRow key={order.id} order={order} />)}
            {hasMore && (
              <Pressable
                onPress={() => loadOrders(page + 1, statusFilter, search, true)}
                disabled={loading}
                style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.7 }, loading && { opacity: 0.5 }]}
              >
                {loading
                  ? <ActivityIndicator size="small" color={Colors.gold} />
                  : (<><MaterialIcons name="expand-more" size={16} color={Colors.gold} /><Text style={s.loadMoreText}>Load More</Text></>)
                }
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
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  body: { padding: Spacing.base, gap: Spacing.sm },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
  },
  infoBannerText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  filterChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md, height: 44,
  },
  searchInput: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted },
  orderRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  orderLeft: { flex: 1, gap: 3 },
  orderAmount: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  orderMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  orderBadgeRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 2 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 9, fontWeight: Typography.bold as any },
  providerChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  providerText: { fontSize: 9, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },
  orderDate: { fontSize: Typography.xs, color: Colors.textMuted, flexShrink: 0, marginLeft: Spacing.sm, marginTop: 2 },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, borderColor: `${Colors.gold}44`, backgroundColor: Colors.goldSurface,
  },
  loadMoreText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
