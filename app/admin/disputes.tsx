/**
 * Admin Portal — Disputes
 * View payment disputes. Read-only — actions handled in Stripe Dashboard.
 * Admin-only. Accessed from Profile → Money → Disputes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatMinorAmount } from '../../services/customerTicketingService';

const STATUS_COLORS: Record<string, string> = {
  open: '#FF9800',
  needs_response: '#F44336',
  under_review: '#42A5F5',
  won: Colors.greenLight,
  lost: '#F44336',
  charge_refunded: '#9E9E9E',
  warning_closed: '#9E9E9E',
};

function humanStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function AdminDisputesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('payment_disputes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setDisputes(data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadDisputes(); }, []);

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

  const filtered = filter === 'all' ? disputes : disputes.filter((d) => d.status === filter);
  const actionableCount = disputes.filter((d) => d.status === 'open' || d.status === 'needs_response').length;
  const FILTER_OPTS = ['all', 'open', 'needs_response', 'under_review', 'won', 'lost'];

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="gavel" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Disputes</Text>
            <Text style={s.headerSub}>
              {actionableCount > 0 ? `${actionableCount} need${actionableCount !== 1 ? '' : 's'} attention` : 'Payment dispute records'}
            </Text>
          </View>
          {actionableCount > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{actionableCount}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Info banner */}
        <View style={s.infoBanner}>
          <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
          <Text style={s.infoBannerText}>This view is read-only. Submit evidence and manage dispute outcomes in your Stripe Dashboard.</Text>
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_OPTS.map((f) => {
            const isAct = filter === f;
            const c = f === 'all' ? Colors.gold : (STATUS_COLORS[f] ?? Colors.textMuted);
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[s.filterChip, isAct && { backgroundColor: `${c}22`, borderColor: `${c}77` }]}
              >
                <Text style={[s.filterChipText, isAct && { color: c }]}>{humanStatus(f === 'all' ? 'All' : f)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.xl }} />
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="gavel" size={40} color={Colors.greenLight} />
            <Text style={s.emptyTitle}>No disputes found</Text>
            <Text style={s.emptySub}>{filter === 'all' ? 'No payment disputes on record.' : `No disputes with status "${humanStatus(filter)}".`}</Text>
          </View>
        ) : (
          filtered.map((d: any) => {
            const dc = STATUS_COLORS[d.status] ?? Colors.textMuted;
            return (
              <View key={d.id} style={s.disputeRow}>
                <View style={[s.disputeStripe, { backgroundColor: dc }]} />
                <View style={s.disputeContent}>
                  <View style={s.disputeTopRow}>
                    <View style={[s.statusChip, { backgroundColor: `${dc}18`, borderColor: `${dc}44` }]}>
                      <Text style={[s.statusChipText, { color: dc }]}>{humanStatus(d.status ?? '')}</Text>
                    </View>
                    <Text style={s.disputeAmount}>{formatMinorAmount(d.amount_minor ?? 0, d.currency ?? 'USD')}</Text>
                  </View>
                  <Text style={s.disputeId} selectable>
                    {String(d.provider_dispute_id ?? '').slice(-16) || d.id?.slice(0, 16)}
                  </Text>
                  {d.reason ? (
                    <Text style={s.disputeReason}>{d.reason.replace(/_/g, ' ')}</Text>
                  ) : null}
                  {(d.status === 'needs_response' || d.status === 'open') && d.evidence_due_at ? (
                    <Text style={s.disputeDue}>
                      Evidence due: {new Date(d.evidence_due_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  ) : null}
                  <Text style={s.disputeMeta}>
                    {new Date(d.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  {d.financial_liability > 0 ? (
                    <Text style={s.disputeLiability}>
                      Platform liability: {formatMinorAmount(d.financial_liability, d.currency ?? 'USD')}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
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
  headerBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: Typography.black as any, color: '#fff' },
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
  disputeRow: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  disputeStripe: { width: 4, flexShrink: 0 },
  disputeContent: { flex: 1, padding: Spacing.md, gap: 4 },
  disputeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  statusChipText: { fontSize: 10, fontWeight: Typography.bold as any },
  disputeAmount: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  disputeId: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  disputeReason: { fontSize: Typography.xs, color: Colors.textSecondary, textTransform: 'capitalize' as any },
  disputeDue: { fontSize: Typography.xs, color: '#FF9800', fontWeight: Typography.medium as any },
  disputeMeta: { fontSize: 10, color: Colors.textMuted },
  disputeLiability: { fontSize: 10, color: '#FF5722', fontWeight: Typography.medium as any },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
