/**
 * Admin Portal — Subscriptions
 * View subscription records across all providers. Read-only.
 * Admin-only. Accessed from Profile → Money → Subscriptions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const PROVIDER_COLORS: Record<string, string> = {
  apple: Colors.textSecondary,
  stripe: '#635BFF',
  google: Colors.greenLight,
  admin: Colors.gold,
};
const STATUS_COLORS: Record<string, string> = {
  active: Colors.greenLight,
  trialing: Colors.gold,
  past_due: '#FF9800',
  canceled: Colors.textMuted,
  revoked: '#F44336',
};

function SubRow({ sub }: { sub: any }) {
  const pColor = PROVIDER_COLORS[sub.payment_provider] ?? Colors.textMuted;
  const sColor = STATUS_COLORS[sub.status] ?? Colors.textMuted;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const created = sub.created_at
    ? new Date(sub.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={s.subRow}>
      <View style={[s.providerDot, { backgroundColor: pColor }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.subTopRow}>
          <Text style={s.subPlan}>
            {sub.plan === 'elite' ? 'Elite' : sub.plan === 'pro' ? 'Pro' : sub.plan ?? '—'}
          </Text>
          <View style={[s.providerChip, { backgroundColor: `${pColor}18`, borderColor: `${pColor}44` }]}>
            <Text style={[s.providerTag, { color: pColor }]}>
              {sub.payment_provider === 'admin' ? 'Admin Grant' : sub.payment_provider ?? 'stripe'}
            </Text>
          </View>
          <Text style={[s.statusText, { color: sColor }]}>{sub.status}</Text>
          {sub.environment === 'sandbox' && (
            <Text style={[s.statusText, { color: '#FF9800' }]}>sandbox</Text>
          )}
        </View>
        <Text style={s.subMeta}>{sub.billing_cycle ?? '—'}</Text>
        {periodEnd ? (
          <Text style={s.subMeta}>
            {sub.status === 'active' || sub.status === 'trialing' ? `Renews ${periodEnd}` : `Period ended ${periodEnd}`}
          </Text>
        ) : null}
        {created ? <Text style={s.subMeta}>Created {created}</Text> : null}
      </View>
      <View style={[s.statusDot, { backgroundColor: sColor }]} />
    </View>
  );
}

export default function AdminSubscriptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const safeBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any);

  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState('all');

  const loadSubs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, user_id, plan, status, payment_provider, billing_cycle, current_period_end, cancel_at_period_end, original_transaction_id, stripe_subscription_id, provider_product_id, environment, created_at, auto_renew_status')
        .order('created_at', { ascending: false })
        .limit(200);
      setSubs(data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadSubs(); }, [loadSubs]);

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

  const filtered = providerFilter === 'all' ? subs : subs.filter((s) => s.payment_provider === providerFilter);
  const PROVIDER_OPTS = ['all', 'apple', 'stripe', 'google', 'admin'];

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={safeBack} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="subscriptions" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Subscriptions</Text>
            <Text style={s.headerSub}>{subs.length > 0 ? `${subs.length} records` : 'Subscription ledger'}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Info banner */}
        <View style={s.infoBanner}>
          <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
          <Text style={s.infoBannerText}>Read-only subscription ledger across all providers. To grant or modify a subscription, use the User Detail screen.</Text>
        </View>

        {/* Provider filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {PROVIDER_OPTS.map((p) => {
            const isAct = providerFilter === p;
            const c = PROVIDER_COLORS[p] ?? Colors.gold;
            return (
              <Pressable
                key={p}
                onPress={() => setProviderFilter(p)}
                style={[s.filterChip, isAct && { backgroundColor: `${c}22`, borderColor: `${c}77` }]}
              >
                <Text style={[s.filterChipText, isAct && { color: c }]}>
                  {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                  {p !== 'all' ? ` (${subs.filter((s) => s.payment_provider === p).length})` : ` (${subs.length})`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.xl }} />
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="subscriptions" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No subscription records</Text>
            <Text style={s.emptySub}>{providerFilter !== 'all' ? `No ${providerFilter} subscriptions found.` : 'No subscriptions on record.'}</Text>
          </View>
        ) : (
          filtered.map((sub) => <SubRow key={sub.id} sub={sub} />)
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
  subRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  providerDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3, flexShrink: 0 },
  subTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  subPlan: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  providerChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  providerTag: { fontSize: 9, fontWeight: Typography.bold as any, textTransform: 'uppercase' as any },
  statusText: { fontSize: 9, fontWeight: Typography.medium as any },
  subMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
