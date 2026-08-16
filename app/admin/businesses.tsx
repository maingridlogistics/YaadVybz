// ─── Admin — Business Verification Queue ─────────────────────────────────────

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  adminFetchBusinesses,
  adminApproveBusiness,
  adminRejectBusiness,
  adminSuspendBusiness,
  adminVerifyBusiness,
  AdminBusinessRow,
} from '../../services/businessService';
import { useAuth } from '../../hooks/useAuth';

type StatusFilter = 'pending' | 'live' | 'rejected' | 'suspended';

const FILTERS: { key: StatusFilter; label: string; icon: string; color: string }[] = [
  { key: 'pending',   label: 'Pending',   icon: 'pending-actions', color: '#FF9800' },
  { key: 'live',      label: 'Live',      icon: 'check-circle',    color: '#00C853' },
  { key: 'rejected',  label: 'Rejected',  icon: 'cancel',          color: '#F44336' },
  { key: 'suspended', label: 'Suspended', icon: 'block',           color: '#9C27B0' },
];

function StatusBadge({ status }: { status: string }) {
  const info = FILTERS.find((f) => f.key === status) ?? { label: status, color: Colors.textMuted, icon: 'info' };
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

// ─── Business detail modal ─────────────────────────────────────────────────────
function BusinessDetailModal({
  biz,
  visible,
  onClose,
  onApprove,
  onReject,
  onSuspend,
  onVerify,
}: {
  biz: AdminBusinessRow | null;
  visible: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onSuspend: (id: string, reason: string) => void;
  onVerify: (id: string, v: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [rejectReason, setRejectReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [mode, setMode] = useState<'view' | 'reject' | 'suspend'>('view');

  if (!biz) return null;
  const cat = biz.business_categories;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[dm.container, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={dm.header}>
          <Pressable onPress={() => { onClose(); setMode('view'); }} style={dm.closeBtn} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={dm.headerTitle} numberOfLines={1}>{biz.name}</Text>
          <StatusBadge status={biz.status} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={dm.content}>
          {/* Cover */}
          {biz.cover_url && (
            <Image source={{ uri: biz.cover_url }} style={dm.cover} contentFit="cover" />
          )}

          {/* Basic info */}
          <View style={dm.infoBlock}>
            <Row label="Category" value={cat?.label ?? '—'} />
            <Row label="Owner ID" value={biz.owner_id.slice(0, 12) + '...'} />
            <Row label="Location Type" value={biz.location_type} />
            <Row label="Parish" value={biz.primary_parish} />
            <Row label="Town" value={biz.town || '—'} />
            <Row label="Phone" value={biz.phone || '—'} />
            <Row label="WhatsApp" value={biz.whatsapp || '—'} />
            <Row label="Website" value={biz.website || '—'} />
            <Row label="Instagram" value={biz.instagram || '—'} />
            <Row label="Created" value={new Date(biz.created_at).toLocaleDateString()} />
          </View>

          {/* Description */}
          {biz.description ? (
            <View style={dm.descBlock}>
              <Text style={dm.descLabel}>About</Text>
              <Text style={dm.descText}>{biz.description}</Text>
            </View>
          ) : null}

          {/* Rejection reason if exists */}
          {biz.rejection_reason ? (
            <View style={dm.rejBlock}>
              <MaterialIcons name="info" size={14} color="#FF7777" />
              <Text style={dm.rejText}>{biz.rejection_reason}</Text>
            </View>
          ) : null}

          {/* Reject input */}
          {mode === 'reject' && (
            <View style={dm.reasonBlock}>
              <Text style={dm.reasonLabel}>Rejection reason (shown to owner):</Text>
              <TextInput style={dm.reasonInput} value={rejectReason} onChangeText={setRejectReason} placeholder="Enter reason..." placeholderTextColor={Colors.textMuted} multiline />
              <View style={dm.reasonBtns}>
                <Pressable onPress={() => setMode('view')} style={dm.cancelBtn}>
                  <Text style={dm.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => { onReject(biz.id, rejectReason); setMode('view'); setRejectReason(''); }} style={dm.confirmRejectBtn}>
                  <Text style={dm.confirmRejectBtnText}>Confirm Reject</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Suspend input */}
          {mode === 'suspend' && (
            <View style={dm.reasonBlock}>
              <Text style={dm.reasonLabel}>Suspension reason (shown to owner):</Text>
              <TextInput style={dm.reasonInput} value={suspendReason} onChangeText={setSuspendReason} placeholder="Enter reason..." placeholderTextColor={Colors.textMuted} multiline />
              <View style={dm.reasonBtns}>
                <Pressable onPress={() => setMode('view')} style={dm.cancelBtn}>
                  <Text style={dm.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => { onSuspend(biz.id, suspendReason); setMode('view'); setSuspendReason(''); }} style={[dm.confirmRejectBtn, { backgroundColor: '#9C27B0' }]}>
                  <Text style={dm.confirmRejectBtnText}>Confirm Suspend</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Action buttons */}
          {mode === 'view' && (
            <View style={dm.actions}>
              {biz.status !== 'live' && (
                <Pressable onPress={() => onApprove(biz.id)} style={({ pressed }) => [dm.actionBtn, dm.approveBtn, pressed && { opacity: 0.8 }]}>
                  <MaterialIcons name="check-circle" size={16} color="#fff" />
                  <Text style={dm.actionBtnText}>Approve</Text>
                </Pressable>
              )}
              {biz.status !== 'rejected' && (
                <Pressable onPress={() => setMode('reject')} style={({ pressed }) => [dm.actionBtn, dm.rejectBtn, pressed && { opacity: 0.8 }]}>
                  <MaterialIcons name="cancel" size={16} color="#fff" />
                  <Text style={dm.actionBtnText}>Reject</Text>
                </Pressable>
              )}
              {biz.status === 'live' && (
                <Pressable onPress={() => setMode('suspend')} style={({ pressed }) => [dm.actionBtn, dm.suspendBtn, pressed && { opacity: 0.8 }]}>
                  <MaterialIcons name="block" size={16} color="#fff" />
                  <Text style={dm.actionBtnText}>Suspend</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => onVerify(biz.id, !biz.verified)}
                style={({ pressed }) => [dm.actionBtn, biz.verified ? dm.unverifyBtn : dm.verifyBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="verified" size={16} color="#fff" />
                <Text style={dm.actionBtnText}>{biz.verified ? 'Remove Verification' : 'Verify'}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={dm.row}>
      <Text style={dm.rowLabel}>{label}</Text>
      <Text style={dm.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const dm = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.sm },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: 60 },
  cover: { width: '100%', height: 160, borderRadius: Radius.lg },
  infoBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  rowLabel: { width: 90, fontSize: Typography.xs, color: Colors.textMuted },
  rowValue: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  descBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.surfaceBorder },
  descLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  descText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  rejBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  rejText: { flex: 1, fontSize: Typography.xs, color: '#FF7777', lineHeight: 17 },
  reasonBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.base, gap: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  reasonLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  reasonInput: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, color: Colors.textPrimary, minHeight: 80, borderWidth: 1, borderColor: Colors.surfaceBorder, textAlignVertical: 'top', fontSize: Typography.sm },
  reasonBtns: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelBtnText: { fontSize: Typography.sm, color: Colors.textSecondary },
  confirmRejectBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: '#F44336', borderRadius: Radius.md },
  confirmRejectBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, flexShrink: 0 },
  actionBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#fff' },
  approveBtn: { backgroundColor: '#00C853' },
  rejectBtn: { backgroundColor: '#F44336' },
  suspendBtn: { backgroundColor: '#9C27B0' },
  verifyBtn: { backgroundColor: Colors.gold },
  unverifyBtn: { backgroundColor: Colors.textMuted },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function AdminBusinessesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [filterStatus, setFilterStatus] = useState<StatusFilter>('pending');
  const [businesses, setBusinesses] = useState<AdminBusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBiz, setSelectedBiz] = useState<AdminBusinessRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await adminFetchBusinesses(filterStatus);
    setBusinesses(data);
    setLoading(false);
  }, [filterStatus]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleApprove = async (id: string) => {
    const { error } = await adminApproveBusiness(id);
    if (error) { Alert.alert('Error', error); return; }
    setSelectedBiz(null);
    load();
  };

  const handleReject = async (id: string, reason: string) => {
    const { error } = await adminRejectBusiness(id, reason);
    if (error) { Alert.alert('Error', error); return; }
    setSelectedBiz(null);
    load();
  };

  const handleSuspend = async (id: string, reason: string) => {
    const { error } = await adminSuspendBusiness(id, reason);
    if (error) { Alert.alert('Error', error); return; }
    setSelectedBiz(null);
    load();
  };

  const handleVerify = async (id: string, verified: boolean) => {
    const { error } = await adminVerifyBusiness(id, verified);
    if (error) { Alert.alert('Error', error); return; }
    setBusinesses((prev) => prev.map((b) => b.id === id ? { ...b, verified } : b));
    if (selectedBiz?.id === id) setSelectedBiz((prev) => prev ? { ...prev, verified } : null);
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
          <Text style={s.title}>Business Queue</Text>
          <View style={{ width: 36 }} />
        </View>
        {/* Status filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterStrip}>
          {FILTERS.map((f) => {
            const active = filterStatus === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilterStatus(f.key)}
                style={[s.filterChip, active && { backgroundColor: f.color, borderColor: f.color }]}>
                <MaterialIcons name={f.icon as any} size={13} color={active ? '#fff' : f.color} />
                <Text style={[s.filterChipText, active && { color: '#fff', fontWeight: Typography.bold }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => {
            const cat = item.business_categories;
            return (
              <Pressable onPress={() => setSelectedBiz(item)} style={({ pressed }) => [s.bizCard, pressed && { opacity: 0.85 }]}>
                {item.logo_url && (
                  <Image source={{ uri: item.logo_url }} style={s.bizThumb} contentFit="cover" />
                )}
                {!item.logo_url && (
                  <View style={[s.bizThumb, s.bizThumbPlaceholder]}>
                    <MaterialIcons name={(cat?.icon ?? 'storefront') as any} size={22} color={cat?.color ?? '#78909C'} />
                  </View>
                )}
                <View style={s.bizBody}>
                  <View style={s.bizNameRow}>
                    <Text style={s.bizName} numberOfLines={1}>{item.name}</Text>
                    {item.verified && <MaterialIcons name="verified" size={13} color={Colors.gold} />}
                  </View>
                  <Text style={[s.bizCat, { color: cat?.color ?? '#78909C' }]} numberOfLines={1}>
                    {cat?.label ?? '—'} · {item.primary_parish}
                  </Text>
                  <StatusBadge status={item.status} />
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              </Pressable>
            );
          }}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={s.listHeader}>{businesses.length} {filterStatus} business{businesses.length !== 1 ? 'es' : ''}</Text>
          }
          ListEmptyComponent={
            <View style={s.center}>
              <MaterialIcons name="storefront" size={40} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>No {filterStatus} businesses</Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      )}

      <BusinessDetailModal
        biz={selectedBiz}
        visible={!!selectedBiz}
        onClose={() => setSelectedBiz(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onSuspend={handleSuspend}
        onVerify={handleVerify}
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
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  filterChipText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  list: { paddingTop: Spacing.xs },
  listHeader: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, marginTop: Spacing.sm },
  bizCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md, backgroundColor: Colors.background },
  bizThumb: { width: 56, height: 56, borderRadius: Radius.md, flexShrink: 0 },
  bizThumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  bizBody: { flex: 1, gap: 4 },
  bizNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bizName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  bizCat: { fontSize: 12, fontWeight: Typography.medium },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
});
