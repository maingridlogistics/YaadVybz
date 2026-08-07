import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { sendTestEmail, sendTestPush, testSmtpConnection } from '../../services/emailService';
import type { FcmResultEntry, TestPushResult, SmtpProbeResult } from '../../services/emailService';
import {
  fetchAllPlacementsAdmin,
  fetchAdCountsByPlacement,
  togglePlacementEnabled,
  insertPlacement,
  AdPlacement,
} from '../../services/adsService';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { useCategories } from '../../hooks/useCategories';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, formatCount, Event } from '../../constants/data';

type AdminTab = 'queue' | 'flagged' | 'analytics' | 'categories' | 'settings' | 'ads' | 'boosts' | 'deletions';

const BOOST_TYPE_LABELS: Record<string, string> = {
  three_day: '3-Day',
  seven_day: '7-Day',
  until_event_end: 'Until Event Ends',
};

// ─── Constants for Event Type editor ─────────────────────────────────────────
const ICON_OPTIONS = [
  'local-bar', 'celebration', 'speaker', 'beach-access', 'nightlife', 'mic',
  'flag', 'museum', 'people', 'emoji-events', 'work', 'lock',
  'star', 'music-note', 'sports', 'restaurant', 'camera-alt', 'festival',
  'waves', 'directions-run', 'business', 'event', 'brush', 'theater-comedy',
];

const COLOR_OPTIONS = [
  '#FF6B35', '#E91E63', '#FF9800', '#00BCD4', '#9C27B0', '#5C6BC0',
  '#F44336', '#27AE60', '#00897B', '#1565C0', '#607D8B', '#795548',
  '#FFD700', '#FF5722', '#4CAF50', '#2196F3',
];

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: {
  icon: string; label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconWrap, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub ? <Text style={statStyles.sub}>{sub}</Text> : null}
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, alignItems: 'center', gap: Spacing.xs, minWidth: 80 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  sub: { fontSize: 10, color: Colors.gold, fontWeight: Typography.medium, textAlign: 'center' },
});

// ─── Event Queue Row ────────────────────────────────────────────────────────────
function QueueRow({ event, onApprove, onReject, onNavigate, actionLabel, actionColor, onAction }: {
  event: Event; onApprove?: () => void; onReject?: () => void; onNavigate: () => void;
  actionLabel?: string; actionColor?: string; onAction?: () => void;
}) {
  return (
    <Pressable onPress={onNavigate} style={({ pressed }) => [queueStyles.row, pressed && { opacity: 0.9 }]}>
      <Image source={{ uri: event.coverImage }} style={queueStyles.thumb} contentFit="cover" transition={200} />
      <View style={queueStyles.info}>
        <Text style={queueStyles.title} numberOfLines={1}>{event.title}</Text>
        <Text style={queueStyles.meta} numberOfLines={1}>{event.promoterName} · {event.parish}</Text>
        <Text style={queueStyles.date}>{formatDate(event.date)}</Text>
        {event.flagReason ? <Text style={queueStyles.flagReason} numberOfLines={1}>Flag: {event.flagReason}</Text> : null}
      </View>
      <View style={queueStyles.actions}>
        {onApprove ? (
          <Pressable onPress={onApprove} style={({ pressed }) => [queueStyles.approveBtn, pressed && { opacity: 0.8 }]}>
            <MaterialIcons name="check" size={16} color="#fff" />
          </Pressable>
        ) : null}
        {onReject ? (
          <Pressable onPress={onReject} style={({ pressed }) => [queueStyles.rejectBtn, pressed && { opacity: 0.8 }]}>
            <MaterialIcons name="close" size={16} color="#fff" />
          </Pressable>
        ) : null}
        {onAction && actionLabel ? (
          <Pressable onPress={onAction} style={({ pressed }) => [queueStyles.actionBtn, { backgroundColor: actionColor ?? Colors.gold }, pressed && { opacity: 0.8 }]}>
            <Text style={queueStyles.actionBtnText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
const queueStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: Radius.md, flexShrink: 0 },
  info: { flex: 1, gap: 2 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  meta: { fontSize: Typography.xs, color: Colors.textMuted },
  date: { fontSize: Typography.xs, color: Colors.gold },
  flagReason: { fontSize: 10, color: '#FF6B6B', marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.xs, flexShrink: 0 },
  approveBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  actionBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
});

// ─── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({ visible, onClose, onConfirm }: {
  visible: boolean; onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={rejectStyles.overlay} onPress={onClose}>
        <Pressable style={rejectStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={rejectStyles.handle} />
          <Text style={rejectStyles.title}>Reject Event</Text>
          <Text style={rejectStyles.fieldLabel}>Reason (optional)</Text>
          <TextInput style={rejectStyles.input} value={reason} onChangeText={setReason} placeholder="e.g. Incomplete information, inappropriate content..." placeholderTextColor={Colors.textMuted} multiline numberOfLines={3} textAlignVertical="top" accessibilityLabel="Rejection reason" />
          <View style={rejectStyles.btnRow}>
            <Pressable onPress={onClose} style={rejectStyles.cancelBtn}><Text style={rejectStyles.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={() => { onConfirm(reason); setReason(''); }} style={({ pressed }) => [rejectStyles.confirmBtn, pressed && { opacity: 0.85 }]}>
              <Text style={rejectStyles.confirmText}>Reject</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const rejectStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.base, paddingBottom: Spacing.xxl, borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  title: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, color: Colors.textPrimary, fontSize: Typography.base, minHeight: 80, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold },
  confirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: '#F44336', borderRadius: Radius.md },
  confirmText: { color: '#fff', fontWeight: Typography.bold },
});

// ─── Type Form Modal ───────────────────────────────────────────────────────────
function TypeFormModal({ visible, initialValues, onSave, onClose, isEditing }: {
  visible: boolean;
  initialValues?: { label: string; icon: string; color: string };
  onSave: (values: { label: string; icon: string; color: string }) => void;
  onClose: () => void;
  isEditing: boolean;
}) {
  const [label, setLabel] = useState(initialValues?.label ?? '');
  const [icon, setIcon] = useState(initialValues?.icon ?? ICON_OPTIONS[0]);
  const [color, setColor] = useState(initialValues?.color ?? COLOR_OPTIONS[0]);

  React.useEffect(() => {
    if (visible) {
      setLabel(initialValues?.label ?? '');
      setIcon(initialValues?.icon ?? ICON_OPTIONS[0]);
      setColor(initialValues?.color ?? COLOR_OPTIONS[0]);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={tfStyles.overlay} onPress={onClose}>
        <Pressable style={tfStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={tfStyles.handle} />
          <Text style={tfStyles.sheetTitle}>{isEditing ? 'Edit Event Type' : 'Add Event Type'}</Text>

          <Text style={tfStyles.fieldLabel}>Type Name *</Text>
          <TextInput style={tfStyles.input} value={label} onChangeText={setLabel} placeholder="e.g. Fashion Shows" placeholderTextColor={Colors.textMuted} accessibilityLabel="Event type name" />

          <Text style={tfStyles.fieldLabel}>Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tfStyles.iconRow}>
            {ICON_OPTIONS.map((ic) => (
              <Pressable key={ic} onPress={() => setIcon(ic)} style={[tfStyles.iconOpt, icon === ic && { borderColor: color, backgroundColor: `${color}20` }]}>
                <MaterialIcons name={ic as any} size={22} color={icon === ic ? color : Colors.textMuted} />
              </Pressable>
            ))}
          </ScrollView>

          <Text style={tfStyles.fieldLabel}>Color</Text>
          <View style={tfStyles.colorGrid}>
            {COLOR_OPTIONS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[tfStyles.colorDot, { backgroundColor: c }, color === c && tfStyles.colorDotSelected]} />
            ))}
          </View>

          <View style={[tfStyles.preview, { borderColor: `${color}55`, backgroundColor: `${color}10` }]}>
            <MaterialIcons name={icon as any} size={20} color={color} />
            <Text style={[tfStyles.previewLabel, { color }]}>{label || 'Preview'}</Text>
          </View>

          <View style={tfStyles.btns}>
            <Pressable onPress={onClose} style={tfStyles.cancelBtn}><Text style={tfStyles.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={() => { if (label.trim()) onSave({ label: label.trim(), icon, color }); }} style={[tfStyles.saveBtn, !label.trim() && { opacity: 0.4 }]} disabled={!label.trim()}>
              <Text style={tfStyles.saveText}>{isEditing ? 'Save Changes' : 'Add Type'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const tfStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.base, paddingBottom: Spacing.xxl, gap: Spacing.md, maxHeight: '90%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  sheetTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md, height: 50, color: Colors.textPrimary, fontSize: Typography.base },
  iconRow: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  iconOpt: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  previewLabel: { fontSize: Typography.sm, fontWeight: Typography.bold },
  btns: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold },
  saveBtn: { flex: 2, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.gold, borderRadius: Radius.md },
  saveText: { color: Colors.textOnGold, fontWeight: Typography.bold },
});

// ─── Main Admin Screen ─────────────────────────────────────────────────────────
type AdminScreenProps = {
  embedded?: boolean;
  requestedTab?: string | null;
  onTabConsumed?: () => void;
};

export default function AdminScreen({ embedded = false, requestedTab, onTabConsumed }: AdminScreenProps) {
  const router = useRouter();
  const { user, requireEventApproval, setRequireEventApproval, signOut } = useAuth();
  const { allEvents, events, getPendingEvents, getFlaggedEvents, approveEvent, rejectEvent, getBoostedEvents, boostEvent, removeBoost } = useEvents();
  const { addNotification, unreadCount } = useNotifications();
  const { parishes, eventTypes, addParish, removeParish, addEventType, editEventType, removeEventType, resetToDefaults } = useCategories();

  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [testEmailDetail, setTestEmailDetail] = useState('');
  const [testPushState, setTestPushState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [testPushResults, setTestPushResults] = useState<TestPushResult | null>(null);
  const [testSmtpState, setTestSmtpState] = useState<'idle' | 'testing' | 'ok' | 'slow' | 'fail'>('idle');
  const [testSmtpResult, setTestSmtpResult] = useState<SmtpProbeResult | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  // Ads state
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);
  const [adCounts, setAdCounts] = useState<Record<string, number>>({});
  const [adsLoading, setAdsLoading] = useState(false);
  const [showNewPlacementModal, setShowNewPlacementModal] = useState(false);
  const [newPlacementName, setNewPlacementName] = useState('');
  // Boosts tab state
  const [subStats, setSubStats] = useState<{ pro: number; elite: number; canceled: number; pastDue: number } | null>(null);
  const [subStatsLoading, setSubStatsLoading] = useState(false);
  const [boostPurchases, setBoostPurchases] = useState<any[]>([]);
  const [showGrantBoostModal, setShowGrantBoostModal] = useState(false);
  const [grantBoostSearch, setGrantBoostSearch] = useState('');
  const [grantBoostEventId, setGrantBoostEventId] = useState('');
  const [grantBoostType, setGrantBoostType] = useState('');
  const [newPlacementSize, setNewPlacementSize] = useState<'rectangle' | 'square'>('rectangle');

  // Deletions tab state
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [deletionLoading, setDeletionLoading] = useState(false);

  // Grant Subscription state
  const [showGrantSubModal, setShowGrantSubModal] = useState(false);
  const [grantSubSearch, setGrantSubSearch] = useState('');
  const [grantSubResults, setGrantSubResults] = useState<any[]>([]);
  const [grantSubLoading, setGrantSubLoading] = useState(false);
  const [grantSubUserId, setGrantSubUserId] = useState('');
  const [grantSubUserName, setGrantSubUserName] = useState('');
  const [grantSubTier, setGrantSubTier] = useState<'pro' | 'elite' | ''>('');
  const [grantSubSaving, setGrantSubSaving] = useState(false);

  // Categories CRUD state
  const [showAddParish, setShowAddParish] = useState(false);
  const [addParishInput, setAddParishInput] = useState('');
  const [typeModal, setTypeModal] = useState<{
    visible: boolean; editId: string | null; label: string; icon: string; color: string;
  }>({ visible: false, editId: null, label: '', icon: 'local-bar', color: '#FF6B35' });

  const isAdmin = user?.roles.includes('admin') ?? false;

  // When a cross-screen nav signal requests a specific tab (e.g. from the
  // admin gate in post.tsx), switch to it once and notify the parent.
  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab as AdminTab);
      onTabConsumed?.();
    }
  }, [requestedTab]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => {});
          router.replace('/onboarding');
        },
      },
    ]);
  };

  // Load placements when ads tab becomes active
  useEffect(() => {
    if (activeTab !== 'ads') return;
    setAdsLoading(true);
    Promise.all([fetchAllPlacementsAdmin(), fetchAdCountsByPlacement()]).then(([placements, counts]) => {
      setAdPlacements(placements);
      setAdCounts(counts);
      setAdsLoading(false);
    });
  }, [activeTab]);

  const handleToggleAdPlacement = useCallback(async (placement: AdPlacement) => {
    const next = !placement.enabled;
    await togglePlacementEnabled(placement.id, next);
    setAdPlacements((prev) => prev.map((p) => p.id === placement.id ? { ...p, enabled: next } : p));
  }, []);

  const handleCreatePlacement = useCallback(async () => {
    if (!newPlacementName.trim()) return;
    const { data } = await insertPlacement(newPlacementName.trim(), newPlacementSize);
    if (data) {
      setAdPlacements((prev) => [...prev, data as AdPlacement]);
      setNewPlacementName('');
      setNewPlacementSize('rectangle');
      setShowNewPlacementModal(false);
    }
  }, [newPlacementName, newPlacementSize]);
  const loadBoosts = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('boost_purchases')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setBoostPurchases(data);
    } catch {}
  }, []);

  const loadDeletionRequests = useCallback(async () => {
    setDeletionLoading(true);
    try {
      const { data } = await supabase
        .from('account_deletion_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setDeletionRequests(data);
    } catch (_) {}
    setDeletionLoading(false);
  }, []);

  const handleApproveDeletion = useCallback((req: any) => {
    Alert.alert(
      'Approve Deletion',
      `Permanently delete the account for "${req.user_name ?? req.user_email ?? 'this user'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const { error } = await supabase.functions.invoke('delete-account', {
                body: { request_id: req.id },
                headers: { Authorization: `Bearer ${session?.access_token}` },
              });
              if (error) throw new Error(error.message);
              loadDeletionRequests();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to approve deletion. Please try again.');
            }
          },
        },
      ],
    );
  }, [loadDeletionRequests]);

  const handleRejectDeletion = useCallback(async (req: any) => {
    try {
      await supabase
        .from('account_deletion_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id ?? null,
        })
        .eq('id', req.id);
      loadDeletionRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to reject request.');
    }
  }, [loadDeletionRequests, user?.id]);

  const searchGrantSubUsers = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setGrantSubResults([]); return; }
    setGrantSubLoading(true);
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, email, subscription_tier')
        .or(`name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%`)
        .limit(8);
      setGrantSubResults(data ?? []);
    } catch (_) { setGrantSubResults([]); }
    setGrantSubLoading(false);
  }, []);

  const handleGrantSubscription = useCallback(async () => {
    if (!grantSubUserId || !grantSubTier) return;
    setGrantSubSaving(true);
    try {
      // Lifetime = far-future expiry; no Stripe involvement
      const lifetimeExpiry = '2099-12-31T23:59:59Z';
      const boostAllowance = grantSubTier === 'elite' ? 5 : 2;
      const { error } = await supabase
        .from('user_profiles')
        .update({
          subscription_tier: grantSubTier,
          subscription_status: 'active',
          current_period_end: lifetimeExpiry,
          verified_promoter: true,
          monthly_boost_allowance: boostAllowance,
          remaining_boosts: boostAllowance,
        })
        .eq('id', grantSubUserId);
      if (error) throw new Error(error.message);
      Alert.alert(
        'Plan Granted',
        `${grantSubUserName} has been granted lifetime ${grantSubTier.charAt(0).toUpperCase() + grantSubTier.slice(1)}.`,
      );
      setShowGrantSubModal(false);
      setGrantSubSearch('');
      setGrantSubResults([]);
      setGrantSubUserId('');
      setGrantSubUserName('');
      setGrantSubTier('');
      loadSubStats();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to grant plan. Please try again.');
    }
    setGrantSubSaving(false);
  }, [grantSubUserId, grantSubTier, grantSubUserName, loadSubStats]);

  const loadSubStats = useCallback(async () => {
    setSubStatsLoading(true);
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan, status');
      if (data) {
        const active = data.filter((r) => r.status === 'active' || r.status === 'trialing');
        setSubStats({
          pro: active.filter((r) => r.plan === 'pro').length,
          elite: active.filter((r) => r.plan === 'elite').length,
          canceled: data.filter((r) => r.status === 'canceled').length,
          pastDue: data.filter((r) => r.status === 'past_due').length,
        });
      }
    } catch (_) {}
    setSubStatsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab !== 'boosts') return;
    loadBoosts();
  }, [activeTab, loadBoosts]);

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    loadSubStats();
  }, [activeTab, loadSubStats]);

  useEffect(() => {
    if (activeTab !== 'deletions') return;
    loadDeletionRequests();
  }, [activeTab, loadDeletionRequests]);

  const pendingEvents = getPendingEvents();
  const flaggedEvents = getFlaggedEvents();

  // Analytics — use dynamic parishes/eventTypes so custom entries appear
  const parishCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parishes.forEach((p) => { counts[p] = 0; });
    events.forEach((e) => { if (counts[e.parish] !== undefined) counts[e.parish]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [events, parishes]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    eventTypes.forEach((t) => { counts[t.id] = 0; });
    events.forEach((e) => { e.eventTypes.forEach((et) => { if (counts[et] !== undefined) counts[et]++; }); });
    return eventTypes.map((t) => ({ ...t, count: counts[t.id] ?? 0 })).sort((a, b) => b.count - a.count);
  }, [events, eventTypes]);

  const totalGoing = events.reduce((s, e) => s + e.goingCount, 0);
  const totalInterested = events.reduce((s, e) => s + e.interestedCount, 0);

  const handleApprove = (id: string) => {
    approveEvent(id);
    addNotification({ type: 'event_approved', title: 'Event Approved', body: 'Your event listing has been approved and is now live.', eventId: id });
  };

  const handleRejectConfirm = (reason: string) => {
    if (!rejectTarget) return;
    rejectEvent(rejectTarget, reason);
    addNotification({ type: 'event_rejected', title: 'Event Rejected', body: reason ? `Reason: ${reason}` : 'Your event listing was rejected by a moderator.', eventId: rejectTarget });
    setRejectTarget(null);
  };

  const handleUnflag = (id: string) => approveEvent(id);
  const handleRemove = (id: string) => {
    Alert.alert('Remove Event', 'This will reject and remove the event from public listings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => rejectEvent(id, 'Removed by admin') },
    ]);
  };

  // ── Gate ──────────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View style={styles.gate}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gateContent}>
          <View style={styles.gateIcon}><MaterialIcons name="lock" size={44} color={Colors.textMuted} /></View>
          <Text style={styles.gateTitle}>Admin Access Required</Text>
          <Text style={styles.gateSub}>This panel is restricted to administrators. Admin access cannot be self-assigned — it must be granted by an existing administrator via the Supabase dashboard.</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}><Text style={styles.backLinkText}>Go Back</Text></Pressable>
        </View>
      </View>
    );
  }

  const pendingDeletionCount = deletionRequests.filter((r) => r.status === 'pending').length;

  const TABS: { key: AdminTab; icon: string; label: string; badge?: number }[] = [
    { key: 'queue',      icon: 'pending',              label: 'Queue',      badge: pendingEvents.length },
    { key: 'flagged',    icon: 'flag',                 label: 'Flagged',    badge: flaggedEvents.length },
    { key: 'analytics',  icon: 'bar-chart',            label: 'Analytics' },
    { key: 'categories', icon: 'category',             label: 'Categories' },
    { key: 'settings',   icon: 'settings',             label: 'Settings' },
    { key: 'ads',        icon: 'campaign',             label: 'Ads' },
    { key: 'boosts',     icon: 'rocket-launch',        label: 'Boosts' },
    { key: 'deletions',  icon: 'delete-forever',       label: 'Deletions',  badge: pendingDeletionCount },
  ];

  const renderContent = () => {
    switch (activeTab) {

      // ── Queue ──────────────────────────────────────────────────────────────
      case 'queue':
        return (
          <View>
            {requireEventApproval ? (
              <View style={styles.moderationBanner}>
                <MaterialIcons name="pending-actions" size={15} color="#FF9800" />
                <Text style={styles.moderationBannerText}>Moderation is ON — new events require approval before going live</Text>
              </View>
            ) : (
              <View style={[styles.moderationBanner, styles.moderationBannerOff]}>
                <MaterialIcons name="bolt" size={15} color={Colors.greenLight} />
                <Text style={[styles.moderationBannerText, { color: Colors.greenLight }]}>Auto-publish is ON — new events go live immediately</Text>
              </View>
            )}
            {pendingEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="done-all" size={40} color={Colors.greenLight} />
                <Text style={styles.emptyTitle}>Queue is Clear</Text>
                <Text style={styles.emptySub}>{requireEventApproval ? 'No events pending review right now.' : 'Enable moderation in Settings to use this queue.'}</Text>
              </View>
            ) : (
              pendingEvents.map((event) => (
                <QueueRow key={event.id} event={event} onNavigate={() => router.push(`/event/${event.id}` as any)} onApprove={() => handleApprove(event.id)} onReject={() => setRejectTarget(event.id)} />
              ))
            )}
          </View>
        );

      // ── Flagged ────────────────────────────────────────────────────────────
      case 'flagged':
        return (
          <View>
            {flaggedEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="verified-user" size={40} color={Colors.greenLight} />
                <Text style={styles.emptyTitle}>No Flagged Events</Text>
                <Text style={styles.emptySub}>All listings look good.</Text>
              </View>
            ) : (
              flaggedEvents.map((event) => (
                <QueueRow key={event.id} event={event} onNavigate={() => router.push(`/event/${event.id}` as any)} onAction={() => handleUnflag(event.id)} actionLabel="Unflag" actionColor={Colors.greenLight} onReject={() => handleRemove(event.id)} />
              ))
            )}
          </View>
        );

      // ── Analytics ──────────────────────────────────────────────────────────
      case 'analytics':
        return (
          <View>
            {/* Subscription Analytics */}
            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Subscriptions</Text>
              <Pressable
                onPress={() => { setGrantSubSearch(''); setGrantSubResults([]); setGrantSubUserId(''); setGrantSubUserName(''); setGrantSubTier(''); setShowGrantSubModal(true); }}
                style={[catStyles.addBtn, { marginRight: Spacing.xs }]}
              >
                <MaterialIcons name="card-giftcard" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>Grant</Text>
              </Pressable>
              <Pressable onPress={loadSubStats} style={catStyles.addBtn}>
                <MaterialIcons name="refresh" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>{subStatsLoading ? '...' : 'Refresh'}</Text>
              </Pressable>
            </View>
            {subStats ? (
              <>
                <View style={styles.statsGrid}>
                  <StatCard
                    icon="campaign"
                    label="Pro Active"
                    value={subStats.pro}
                    color={Colors.gold}
                    sub={subStats.pro > 0 ? `$${(subStats.pro * 9.99).toFixed(2)}/mo est.` : undefined}
                  />
                  <StatCard
                    icon="star"
                    label="Elite Active"
                    value={subStats.elite}
                    color="#E91E63"
                    sub={subStats.elite > 0 ? `$${(subStats.elite * 24.99).toFixed(2)}/mo est.` : undefined}
                  />
                </View>
                <View style={[styles.statsGrid, { marginTop: Spacing.sm }]}>
                  <StatCard
                    icon="paid"
                    label="Est. MRR"
                    value={`$${((subStats.pro * 9.99) + (subStats.elite * 24.99)).toFixed(2)}`}
                    color={Colors.greenLight}
                  />
                  {subStats.pastDue > 0 && (
                    <StatCard
                      icon="warning"
                      label="Past Due"
                      value={subStats.pastDue}
                      color="#FF9800"
                    />
                  )}
                  {subStats.canceled > 0 && (
                    <StatCard
                      icon="cancel"
                      label="Canceled"
                      value={subStats.canceled}
                      color={Colors.textMuted}
                    />
                  )}
                </View>
                {/* Tier distribution bar */}
                {(subStats.pro + subStats.elite) > 0 && (() => {
                  const total = subStats.pro + subStats.elite;
                  const proPct = Math.round((subStats.pro / total) * 100);
                  const elitePct = 100 - proPct;
                  return (
                    <View style={subAnalyticsStyles.barWrap}>
                      <View style={subAnalyticsStyles.barTrack}>
                        {subStats.pro > 0 && (
                          <View style={[subAnalyticsStyles.barSegment, { flex: subStats.pro, backgroundColor: Colors.gold }]} />
                        )}
                        {subStats.elite > 0 && (
                          <View style={[subAnalyticsStyles.barSegment, { flex: subStats.elite, backgroundColor: '#E91E63' }]} />
                        )}
                      </View>
                      <View style={subAnalyticsStyles.barLegend}>
                        <View style={subAnalyticsStyles.legendItem}>
                          <View style={[subAnalyticsStyles.legendDot, { backgroundColor: Colors.gold }]} />
                          <Text style={subAnalyticsStyles.legendText}>Pro {proPct}%</Text>
                        </View>
                        <View style={subAnalyticsStyles.legendItem}>
                          <View style={[subAnalyticsStyles.legendDot, { backgroundColor: '#E91E63' }]} />
                          <Text style={subAnalyticsStyles.legendText}>Elite {elitePct}%</Text>
                        </View>
                        <Text style={subAnalyticsStyles.legendTotal}>{total} paid subscribers</Text>
                      </View>
                    </View>
                  );
                })()}
              </>
            ) : (
              <View style={[styles.emptyState, { paddingVertical: Spacing.lg }]}>
                <MaterialIcons name="subscriptions" size={32} color={Colors.textMuted} />
                <Text style={styles.emptySub}>{subStatsLoading ? 'Loading...' : 'No subscription data yet.'}</Text>
              </View>
            )}

            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Overview</Text>
            </View>
            <View style={styles.statsGrid}>
              <StatCard icon="event" label="Live Events" value={events.length} color={Colors.gold} />
              <StatCard icon="check-circle" label="Going" value={formatCount(totalGoing)} color={Colors.greenLight} />
              <StatCard icon="star" label="Interested" value={formatCount(totalInterested)} color="#FF9800" />
              <StatCard icon="flag" label="Flagged" value={flaggedEvents.length} color="#F44336" sub={pendingEvents.length > 0 ? `${pendingEvents.length} pending` : undefined} />
            </View>
            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Events by Parish</Text>
            </View>
            {parishCounts.slice(0, 8).map(([parish, count], idx) => {
              const maxCount = parishCounts[0]?.[1] ?? 1;
              const pct = (count / maxCount) * 100;
              return (
                <View key={parish} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>{parish}</Text>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: idx === 0 ? Colors.gold : Colors.green }]} /></View>
                  <Text style={styles.barValue}>{count}</Text>
                </View>
              );
            })}
            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Events by Type</Text>
            </View>
            {typeCounts.slice(0, 6).filter((t) => t.count > 0).map((type) => {
              const maxCount = typeCounts[0]?.count ?? 1;
              const pct = (type.count / maxCount) * 100;
              return (
                <View key={type.id} style={styles.barRow}>
                  <MaterialIcons name={type.icon as any} size={13} color={type.color} style={{ width: 16 }} />
                  <Text style={[styles.barLabel, { flex: 1.5 }]} numberOfLines={1}>{type.label}</Text>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: type.color }]} /></View>
                  <Text style={styles.barValue}>{type.count}</Text>
                </View>
              );
            })}
          </View>
        );

      // ── Categories (editable) ──────────────────────────────────────────────
      case 'categories':
        return (
          <View>
            {/* Parishes */}
            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Parishes ({parishes.length})</Text>
              <Pressable onPress={() => { setShowAddParish(true); setAddParishInput(''); }} style={catStyles.addBtn}>
                <MaterialIcons name="add" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>Add</Text>
              </Pressable>
            </View>

            {showAddParish && (
              <View style={catStyles.addParishRow}>
                <TextInput
                  style={catStyles.addParishInput}
                  value={addParishInput}
                  onChangeText={setAddParishInput}
                  placeholder="Parish name..."
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  accessibilityLabel="New parish name"
                  onSubmitEditing={() => {
                    if (addParishInput.trim()) addParish(addParishInput.trim());
                    setShowAddParish(false); setAddParishInput('');
                  }}
                />
                <Pressable
                  onPress={() => { if (addParishInput.trim()) addParish(addParishInput.trim()); setShowAddParish(false); setAddParishInput(''); }}
                  style={catStyles.saveChipBtn}
                >
                  <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
                </Pressable>
                <Pressable onPress={() => { setShowAddParish(false); setAddParishInput(''); }} style={catStyles.cancelChipBtn}>
                  <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            )}

            <View style={catStyles.chipsWrap}>
              {parishes.map((parish) => (
                <View key={parish} style={catStyles.editableChip}>
                  <MaterialIcons name="place" size={11} color={Colors.gold} />
                  <Text style={catStyles.chipText}>{parish}</Text>
                  <Pressable
                    onPress={() => Alert.alert('Remove Parish', `Remove "${parish}" from the list?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => removeParish(parish) },
                    ])}
                    hitSlop={6}
                    style={catStyles.chipDeleteBtn}
                  >
                    <MaterialIcons name="close" size={11} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Event Types */}
            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Event Types ({eventTypes.length})</Text>
              <Pressable
                onPress={() => setTypeModal({ visible: true, editId: null, label: '', icon: 'local-bar', color: '#FF6B35' })}
                style={catStyles.addBtn}
              >
                <MaterialIcons name="add" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>Add</Text>
              </Pressable>
            </View>

            {eventTypes.map((type) => (
              <View key={type.id} style={catStyles.typeRow}>
                <View style={[catStyles.typeIcon, { backgroundColor: `${type.color}20` }]}>
                  <MaterialIcons name={type.icon as any} size={18} color={type.color} />
                </View>
                <Text style={catStyles.typeLabel} numberOfLines={1}>{type.label}</Text>
                <View style={[catStyles.colorDot, { backgroundColor: type.color }]} />
                <Pressable
                  onPress={() => setTypeModal({ visible: true, editId: type.id, label: type.label, icon: type.icon, color: type.color })}
                  style={catStyles.typeActionBtn}
                  hitSlop={6}
                >
                  <MaterialIcons name="edit" size={15} color={Colors.gold} />
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert('Delete Type', `Delete "${type.label}"? Events using this type keep their existing tag.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeEventType(type.id) },
                  ])}
                  style={catStyles.typeActionBtn}
                  hitSlop={6}
                >
                  <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
                </Pressable>
              </View>
            ))}

            {/* Reset */}
            <Pressable
              onPress={() => Alert.alert('Reset to Defaults', 'Restore all parishes and event types to the original defaults? Custom entries will be lost.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: resetToDefaults },
              ])}
              style={catStyles.resetBtn}
            >
              <MaterialIcons name="restore" size={15} color={Colors.error} />
              <Text style={catStyles.resetBtnText}>Reset All to Defaults</Text>
            </Pressable>

            {/* Type form modal */}
            <TypeFormModal
              visible={typeModal.visible}
              initialValues={typeModal.editId ? { label: typeModal.label, icon: typeModal.icon, color: typeModal.color } : undefined}
              isEditing={typeModal.editId !== null}
              onSave={(values) => {
                if (typeModal.editId) {
                  editEventType(typeModal.editId, values);
                } else {
                  addEventType(values);
                }
                setTypeModal((prev) => ({ ...prev, visible: false }));
              }}
              onClose={() => setTypeModal((prev) => ({ ...prev, visible: false }))}
            />
          </View>
        );

      // ── Settings ───────────────────────────────────────────────────────────
      case 'settings':
        return (
          <View>
            {/* Email Test */}
            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Email System</Text>
            </View>
            <View style={settingStyles.card}>
              <View style={settingStyles.cardTop}>
                <View style={settingStyles.iconWrap}>
                  <MaterialIcons name="email" size={22} color={Colors.gold} />
                </View>
                <View style={settingStyles.textBlock}>
                  <Text style={settingStyles.settingTitle}>Test Email Delivery</Text>
                  <Text style={settingStyles.settingSub}>
                    Sends a test email to your account address to verify SMTP / Postal is configured correctly.
                  </Text>
                </View>
              </View>
              {testEmailState !== 'idle' && (
                <View style={[
                  settingStyles.statusPill,
                  testEmailState === 'ok' ? settingStyles.statusOff :
                  testEmailState === 'fail' ? { backgroundColor: 'rgba(255,68,68,0.08)' } :
                  settingStyles.statusOn,
                ]}>
                  <MaterialIcons
                    name={testEmailState === 'sending' ? 'hourglass-empty' : testEmailState === 'ok' ? 'check-circle' : 'error-outline'}
                    size={13}
                    color={testEmailState === 'ok' ? Colors.greenLight : testEmailState === 'fail' ? '#FF6B6B' : '#FF9800'}
                  />
                  <Text style={[settingStyles.statusText, {
                    color: testEmailState === 'ok' ? Colors.greenLight : testEmailState === 'fail' ? '#FF6B6B' : '#FF9800',
                  }]}>
                    {testEmailState === 'sending' ? 'Sending test email...' : testEmailDetail}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={async () => {
                  setTestEmailState('sending');
                  setTestEmailDetail('');
                  const { ok, detail } = await sendTestEmail();
                  setTestEmailState(ok ? 'ok' : 'fail');
                  setTestEmailDetail(detail);
                }}
                disabled={testEmailState === 'sending'}
                style={({ pressed }) => [settingStyles.testEmailBtn, pressed && { opacity: 0.8 }, testEmailState === 'sending' && { opacity: 0.5 }]}
              >
                <MaterialIcons name="send" size={15} color={Colors.textOnGold} />
                <Text style={settingStyles.testEmailBtnText}>
                  {testEmailState === 'sending' ? 'Sending...' : 'Send Test Email'}
                </Text>
              </Pressable>
            </View>

            {/* SMTP Handshake Probe */}
            <View style={settingStyles.card}>
              <View style={settingStyles.cardTop}>
                <View style={settingStyles.iconWrap}>
                  <MaterialIcons name="wifi-tethering" size={22} color={Colors.gold} />
                </View>
                <View style={settingStyles.textBlock}>
                  <Text style={settingStyles.settingTitle}>Test SMTP Handshake</Text>
                  <Text style={settingStyles.settingSub}>
                    Performs a full TCP → EHLO → STARTTLS → AUTH against the mail server. Detects latency before users encounter 504 on password reset (Supabase Auth timeout: 10s).
                  </Text>
                </View>
              </View>

              {testSmtpResult !== null ? (
                <View style={smtpStyles.resultWrap}>
                  {/* Total time banner */}
                  <View style={[smtpStyles.totalBanner, {
                    backgroundColor: (!testSmtpResult.ok || testSmtpResult.totalMs >= 8000)
                      ? 'rgba(255,107,107,0.08)'
                      : testSmtpResult.totalMs >= 3000
                        ? 'rgba(255,152,0,0.08)'
                        : `${Colors.greenLight}08`,
                    borderColor: ((!testSmtpResult.ok || testSmtpResult.totalMs >= 8000)
                      ? '#FF6B6B'
                      : testSmtpResult.totalMs >= 3000
                        ? '#FF9800'
                        : Colors.greenLight) + '44',
                  }]}>
                    <MaterialIcons
                      name={(!testSmtpResult.ok
                        ? 'error-outline'
                        : testSmtpResult.totalMs >= 8000
                          ? 'warning'
                          : testSmtpResult.totalMs >= 3000
                            ? 'access-time'
                            : 'check-circle') as any}
                      size={14}
                      color={(!testSmtpResult.ok || testSmtpResult.totalMs >= 8000)
                        ? '#FF6B6B'
                        : testSmtpResult.totalMs >= 3000
                          ? '#FF9800'
                          : Colors.greenLight}
                    />
                    <Text style={[smtpStyles.totalText, {
                      color: (!testSmtpResult.ok || testSmtpResult.totalMs >= 8000)
                        ? '#FF6B6B'
                        : testSmtpResult.totalMs >= 3000
                          ? '#FF9800'
                          : Colors.greenLight,
                    }]}>
                      {testSmtpResult.ok
                        ? `${testSmtpResult.totalMs}ms · ${
                            testSmtpResult.totalMs >= 8000
                              ? 'Critical — exceeds 10s Auth limit'
                              : testSmtpResult.totalMs >= 3000
                                ? 'Slow — close to timeout'
                                : 'Healthy'
                          }`
                        : `Failed at phase: ${testSmtpResult.phase}`}
                    </Text>
                  </View>

                  {/* Phase breakdown */}
                  {(testSmtpResult.phases.tcpMs > -1 || testSmtpResult.phases.bannerMs > -1) ? (
                    <View style={smtpStyles.phasesWrap}>
                      {[
                        { label: 'TCP', value: testSmtpResult.phases.tcpMs },
                        { label: 'Banner', value: testSmtpResult.phases.bannerMs },
                        { label: 'EHLO', value: testSmtpResult.phases.ehloMs },
                        { label: 'TLS', value: testSmtpResult.phases.tlsMs },
                        { label: 'AUTH', value: testSmtpResult.phases.authMs },
                      ]
                        .filter((p) => p.value !== null && (p.value as number) > -1)
                        .map(({ label, value }) => (
                          <View key={label} style={smtpStyles.phaseItem}>
                            <Text style={smtpStyles.phaseLabel}>{label}</Text>
                            <Text style={[smtpStyles.phaseValue, {
                              color: (value as number) >= 3000
                                ? '#FF6B6B'
                                : (value as number) >= 1000
                                  ? '#FF9800'
                                  : Colors.textSecondary,
                            }]}>
                              {value}ms
                            </Text>
                          </View>
                        ))}
                    </View>
                  ) : null}

                  {/* Error detail */}
                  {testSmtpResult.error ? (
                    <View style={smtpStyles.errorRow}>
                      <MaterialIcons name="error-outline" size={12} color="#FF6B6B" />
                      <Text style={smtpStyles.errorText} numberOfLines={4}>{testSmtpResult.error}</Text>
                    </View>
                  ) : null}

                  {/* Proximity-to-timeout warning */}
                  {testSmtpResult.ok && testSmtpResult.totalMs >= 3000 ? (
                    <View style={smtpStyles.warnRow}>
                      <MaterialIcons name="info-outline" size={12} color="#FF9800" />
                      <Text style={smtpStyles.warnText}>
                        At {(testSmtpResult.totalMs / 1000).toFixed(1)}s, some password reset requests will exceed Supabase Auth{"'s"} 10s deadline intermittently under SMTP load.
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                onPress={async () => {
                  setTestSmtpState('testing');
                  setTestSmtpResult(null);
                  const result = await testSmtpConnection();
                  const s: 'ok' | 'slow' | 'fail' = (!result.ok || result.totalMs >= 8000)
                    ? 'fail'
                    : result.totalMs >= 3000
                      ? 'slow'
                      : 'ok';
                  setTestSmtpState(s);
                  setTestSmtpResult(result);
                }}
                disabled={testSmtpState === 'testing'}
                style={({ pressed }) => [
                  settingStyles.testEmailBtn,
                  pressed && { opacity: 0.8 },
                  testSmtpState === 'testing' && { opacity: 0.5 },
                  testSmtpState === 'slow' && { backgroundColor: '#E65100' },
                  testSmtpState === 'fail' && { backgroundColor: '#C62828' },
                ]}
              >
                <MaterialIcons
                  name={(testSmtpState === 'ok'
                    ? 'check'
                    : testSmtpState === 'fail'
                      ? 'error-outline'
                      : testSmtpState === 'slow'
                        ? 'warning'
                        : 'wifi-tethering') as any}
                  size={15}
                  color={Colors.textOnGold}
                />
                <Text style={settingStyles.testEmailBtnText}>
                  {testSmtpState === 'testing'
                    ? 'Probing SMTP…'
                    : testSmtpState === 'ok'
                      ? 'Healthy — Tap to Re-test'
                      : testSmtpState === 'slow'
                        ? 'Slow — Tap to Re-test'
                        : testSmtpState === 'fail'
                          ? 'Failed — Tap to Re-test'
                          : 'Test SMTP Connection'}
                </Text>
              </Pressable>
            </View>

            {/* Push Test */}
            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Push Notifications</Text>
            </View>
            <View style={settingStyles.card}>
              <View style={settingStyles.cardTop}>
                <View style={settingStyles.iconWrap}>
                  <MaterialIcons name="notifications-active" size={22} color={Colors.gold} />
                </View>
                <View style={settingStyles.textBlock}>
                  <Text style={settingStyles.settingTitle}>Test Push Delivery</Text>
                  <Text style={settingStyles.settingSub}>
                    Sends a test push to this device only, bypassing user preferences. Shows raw FCM response per token so you can verify the direct FCM path without watching Supabase logs.
                  </Text>
                </View>
              </View>

              {testPushResults !== null && (
                <View style={pushTestStyles.resultsWrap}>
                  {/* Token registry row */}
                  {testPushResults.tokenInfo.length > 0 && (
                    <View style={pushTestStyles.tokenSummaryRow}>
                      <MaterialIcons name="devices" size={12} color={Colors.textMuted} />
                      <Text style={pushTestStyles.tokenSummaryText}>
                        {testPushResults.tokenInfo.map((t) => `${t.id} (${t.token_type})`).join('  ·  ')}
                      </Text>
                    </View>
                  )}

                  {testPushResults.tokenInfo.length === 0 ? (
                    <View style={[pushTestStyles.noteRow, { borderColor: 'rgba(255,107,107,0.3)', backgroundColor: 'rgba(255,107,107,0.06)' }]}>
                      <MaterialIcons name="error-outline" size={14} color="#FF6B6B" />
                      <Text style={[pushTestStyles.noteText, { color: '#FF6B6B' }]}>
                        No push tokens found. Install on a physical device and grant notification permission first.
                      </Text>
                    </View>
                  ) : testPushResults.fcmResults.length === 0 ? (
                    <View style={pushTestStyles.noteRow}>
                      <MaterialIcons name="phone-iphone" size={14} color={Colors.gold} />
                      <Text style={pushTestStyles.noteText}>
                        Sent via Expo push service (iOS APNs) — no FCM receipt. Check if notification appeared on device.
                      </Text>
                    </View>
                  ) : (
                    testPushResults.fcmResults.map((r: FcmResultEntry, i: number) => (
                      <View
                        key={i}
                        style={[
                          pushTestStyles.fcmCard,
                          r.status === 'sent' ? pushTestStyles.fcmCardSent
                          : r.status === 'stale' ? pushTestStyles.fcmCardStale
                          : pushTestStyles.fcmCardError,
                        ]}
                      >
                        <View style={pushTestStyles.fcmCardHeader}>
                          <View style={[pushTestStyles.statusDot, {
                            backgroundColor:
                              r.status === 'sent' ? Colors.greenLight
                              : r.status === 'stale' ? '#FF9800'
                              : '#FF6B6B',
                          }]} />
                          <Text style={pushTestStyles.tokenIdText}>Token {r.tokenId}</Text>
                          <Text style={[
                            pushTestStyles.statusChip,
                            {
                              color: r.status === 'sent' ? Colors.greenLight : r.status === 'stale' ? '#FF9800' : '#FF6B6B',
                              borderColor: r.status === 'sent' ? `${Colors.greenLight}44` : r.status === 'stale' ? '#FF980044' : '#FF6B6B44',
                            },
                          ]}>
                            {r.status.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={pushTestStyles.fcmField}>HTTP {r.httpStatus}</Text>
                        {r.fcmMessageName ? (
                          <Text style={pushTestStyles.fcmField} numberOfLines={2}>{r.fcmMessageName}</Text>
                        ) : null}
                        {r.errorCode ? (
                          <Text style={[pushTestStyles.fcmField, { color: '#FF9800' }]}>{r.errorCode}</Text>
                        ) : null}
                        {r.tokenRemoved ? (
                          <Text style={[pushTestStyles.fcmField, { color: '#FF6B6B' }]}>Token removed (stale)</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              )}

              <Pressable
                onPress={async () => {
                  setTestPushState('sending');
                  setTestPushResults(null);
                  const result = await sendTestPush();
                  setTestPushState(result.ok ? 'ok' : 'fail');
                  setTestPushResults(result);
                }}
                disabled={testPushState === 'sending'}
                style={({ pressed }) => [settingStyles.testEmailBtn, pressed && { opacity: 0.8 }, testPushState === 'sending' && { opacity: 0.5 }]}
              >
                <MaterialIcons
                  name={testPushState === 'ok' ? 'check' : testPushState === 'fail' ? 'refresh' : 'send'}
                  size={15}
                  color={Colors.textOnGold}
                />
                <Text style={settingStyles.testEmailBtnText}>
                  {testPushState === 'sending' ? 'Sending...' : testPushState === 'ok' ? 'Push Sent — Tap to Resend' : testPushState === 'fail' ? 'Retry Test Push' : 'Send Test Push'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Moderation Settings</Text>
            </View>
            <View style={settingStyles.card}>
              <View style={settingStyles.cardTop}>
                <View style={settingStyles.iconWrap}>
                  <MaterialIcons name="pending-actions" size={22} color={requireEventApproval ? Colors.gold : Colors.textMuted} />
                </View>
                <View style={settingStyles.textBlock}>
                  <Text style={settingStyles.settingTitle}>Require Event Approval</Text>
                  <Text style={settingStyles.settingSub}>
                    When ON, new events are created as{' '}
                    <Text style={{ color: '#FF9800', fontWeight: '700' }}>Pending</Text>{' '}
                    and must be approved before appearing in Browse, Search, and Map.
                  </Text>
                </View>
                <Switch value={requireEventApproval} onValueChange={(v) => setRequireEventApproval(v)} trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }} thumbColor={requireEventApproval ? Colors.textOnGold : Colors.textMuted} />
              </View>
              <View style={[settingStyles.statusPill, requireEventApproval ? settingStyles.statusOn : settingStyles.statusOff]}>
                <MaterialIcons name={requireEventApproval ? 'pending-actions' : 'bolt'} size={13} color={requireEventApproval ? '#FF9800' : Colors.greenLight} />
                <Text style={[settingStyles.statusText, { color: requireEventApproval ? '#FF9800' : Colors.greenLight }]}>
                  {requireEventApproval ? 'Moderation ON — new events require approval' : 'Auto-publish ON — new events go live immediately'}
                </Text>
              </View>
            </View>
            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>How It Works</Text>
            </View>
            {([
              { icon: 'edit', title: 'Promoter posts an event', desc: requireEventApproval ? 'Event saved as Pending — hidden from public until reviewed' : 'Event saved as Live — immediately visible to all users', color: requireEventApproval ? '#FF9800' : Colors.greenLight },
              { icon: 'pending-actions', title: 'Admin reviews the Queue tab', desc: 'Approve to make it live, or reject with an optional reason', color: Colors.gold },
              { icon: 'check-circle', title: 'Approved event goes live', desc: 'Appears in Browse, Search, Map, and all event feeds', color: Colors.greenLight },
            ] as { icon: string; title: string; desc: string; color: string }[]).map((step, i) => (
              <View key={i} style={settingStyles.stepRow}>
                <View style={[settingStyles.stepIcon, { backgroundColor: `${step.color}20` }]}>
                  <MaterialIcons name={step.icon as any} size={18} color={step.color} />
                </View>
                <View style={settingStyles.stepText}>
                  <Text style={settingStyles.stepTitle}>{step.title}</Text>
                  <Text style={settingStyles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        );

      // ── Ads ──────────────────────────────────────────────────────────────────────────────
      case 'ads':
        return (
          <View>
            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Ad Placements ({adPlacements.length})</Text>
              <Pressable
                onPress={() => setShowNewPlacementModal(true)}
                style={catStyles.addBtn}
              >
                <MaterialIcons name="add" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>New</Text>
              </Pressable>
            </View>

            {adsLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptySub}>Loading placements...</Text>
              </View>
            ) : adPlacements.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="campaign" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Placements</Text>
                <Text style={styles.emptySub}>Create a placement to start serving ads in the app.</Text>
              </View>
            ) : (
              adPlacements.map((placement) => {
                const count = adCounts[placement.id] ?? 0;
                return (
                  <Pressable
                    key={placement.id}
                    onPress={() => router.push(`/admin/ads/${placement.id}` as any)}
                    style={({ pressed }) => [adsStyles.placementCard, pressed && { opacity: 0.9 }]}
                  >
                    <View style={adsStyles.placementLeft}>
                      <View style={[adsStyles.sizeIcon, { backgroundColor: placement.size === 'rectangle' ? `${Colors.gold}18` : '#9C27B018' }]}>
                        <MaterialIcons
                          name={placement.size === 'rectangle' ? 'crop-landscape' : 'crop-square'}
                          size={18}
                          color={placement.size === 'rectangle' ? Colors.gold : '#9C27B0'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={adsStyles.placementName}>{placement.name}</Text>
                        <Text style={adsStyles.placementMeta}>
                          {placement.size} · {count} ad{count !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={adsStyles.placementRight}>
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); handleToggleAdPlacement(placement); }}
                        style={[adsStyles.enablePill, { backgroundColor: placement.enabled ? `${Colors.greenLight}15` : `${Colors.textMuted}12` }]}
                        hitSlop={8}
                      >
                        <View style={[adsStyles.enableDot, { backgroundColor: placement.enabled ? Colors.greenLight : Colors.textMuted }]} />
                        <Text style={[adsStyles.enableText, { color: placement.enabled ? Colors.greenLight : Colors.textMuted }]}>
                          {placement.enabled ? 'Live' : 'Off'}
                        </Text>
                      </Pressable>
                      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
                    </View>
                  </Pressable>
                );
              })
            )}

            {/* New Placement Modal */}
            <Modal visible={showNewPlacementModal} transparent animationType="slide" onRequestClose={() => setShowNewPlacementModal(false)}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <Pressable style={rejectStyles.overlay} onPress={() => setShowNewPlacementModal(false)}>
                <Pressable style={rejectStyles.sheet} onPress={(e) => e.stopPropagation()}>
                  <View style={rejectStyles.handle} />
                  <Text style={rejectStyles.title}>New Ad Placement</Text>
                  <Text style={rejectStyles.fieldLabel}>Placement Name *</Text>
                  <TextInput
                    style={rejectStyles.input}
                    value={newPlacementName}
                    onChangeText={setNewPlacementName}
                    placeholder="e.g. Home Feed"
                    placeholderTextColor={Colors.textMuted}
                    accessibilityLabel="Placement name"
                    autoFocus
                  />
                  <Text style={rejectStyles.fieldLabel}>Size</Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                    {(['rectangle', 'square'] as const).map((sz) => (
                      <Pressable
                        key={sz}
                        onPress={() => setNewPlacementSize(sz)}
                        style={[adsStyles.sizeOptBtn, newPlacementSize === sz && adsStyles.sizeOptBtnActive]}
                      >
                        <MaterialIcons
                          name={sz === 'rectangle' ? 'crop-landscape' : 'crop-square'}
                          size={18}
                          color={newPlacementSize === sz ? Colors.textOnGold : Colors.textMuted}
                        />
                        <Text style={[adsStyles.sizeOptText, newPlacementSize === sz && { color: Colors.textOnGold }]}>
                          {sz === 'rectangle' ? 'Rectangle' : 'Square'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={rejectStyles.btnRow}>
                    <Pressable onPress={() => setShowNewPlacementModal(false)} style={rejectStyles.cancelBtn}>
                      <Text style={rejectStyles.cancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCreatePlacement}
                      disabled={!newPlacementName.trim()}
                      style={[rejectStyles.confirmBtn, !newPlacementName.trim() && { opacity: 0.4 }]}
                    >
                      <Text style={rejectStyles.confirmText}>Create</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Pressable>
              </KeyboardAvoidingView>
            </Modal>
          </View>
        );

      case 'boosts': {
        const activeBoostedEvents = getBoostedEvents();
        const totalRevenue = boostPurchases.reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);
        return (
          <View>
            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Boost Overview</Text>
              <Pressable onPress={loadBoosts} style={catStyles.addBtn}>
                <MaterialIcons name="refresh" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>Refresh</Text>
              </Pressable>
            </View>
            <View style={styles.statsGrid}>
              <StatCard icon="rocket-launch" label="Active" value={activeBoostedEvents.length} color={Colors.gold} />
              <StatCard icon="paid" label="Revenue" value={`$${(totalRevenue / 100).toFixed(2)}`} color={Colors.greenLight} />
              <StatCard icon="history" label="Purchases" value={boostPurchases.length} color="#9C27B0" />
            </View>

            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Active Boosts ({activeBoostedEvents.length})</Text>
              <Pressable onPress={() => { setGrantBoostSearch(''); setGrantBoostEventId(''); setGrantBoostType(''); setShowGrantBoostModal(true); }} style={catStyles.addBtn}>
                <MaterialIcons name="add" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>Grant</Text>
              </Pressable>
            </View>

            {activeBoostedEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="rocket-launch" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Active Boosts</Text>
                <Text style={styles.emptySub}>Grant a complimentary boost to promote any event.</Text>
              </View>
            ) : (
              activeBoostedEvents.map((evt) => (
                <View key={evt.id} style={boostAdminStyles.row}>
                  <Image source={{ uri: evt.coverImage }} placeholder={require('../../assets/images/icon.png')} style={boostAdminStyles.thumb} contentFit="cover" transition={200} />
                  <View style={boostAdminStyles.info}>
                    <Text style={boostAdminStyles.title} numberOfLines={1}>{evt.title}</Text>
                    <View style={boostAdminStyles.typePill}>
                      <Text style={boostAdminStyles.typePillText}>{BOOST_TYPE_LABELS[evt.boostType ?? ''] ?? evt.boostType ?? 'Boosted'}</Text>
                    </View>
                    <Text style={boostAdminStyles.expiry}>
                      {evt.boostType === 'until_event_end' ? `Until event ends` : evt.boostExpiresAt ? `Expires ${new Date(evt.boostExpiresAt).toLocaleDateString()}` : 'Active'}
                    </Text>
                  </View>
                  <View style={boostAdminStyles.actions}>
                    <Pressable onPress={() => router.push(`/event/${evt.id}` as any)} style={boostAdminStyles.viewBtn} hitSlop={8}>
                      <MaterialIcons name="open-in-new" size={15} color={Colors.gold} />
                    </Pressable>
                    <Pressable
                      onPress={() => Alert.alert('Remove Boost', `Remove boost from "${evt.title}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: async () => { await removeBoost(evt.id); loadBoosts(); } },
                      ])}
                      style={boostAdminStyles.removeBtn}
                      hitSlop={8}
                    >
                      <MaterialIcons name="remove-circle-outline" size={15} color="#FF6B6B" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <View style={[styles.statSectionHeader, { marginTop: Spacing.lg }]}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Purchase History ({boostPurchases.length})</Text>
            </View>

            {boostPurchases.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Purchases Yet</Text>
                <Text style={styles.emptySub}>Boost purchases appear here after Stripe confirms payment.</Text>
              </View>
            ) : (
              boostPurchases.slice(0, 25).map((purchase: any, index: number) => (
                <View key={purchase.id ?? index} style={boostAdminStyles.purchaseRow}>
                  <View style={[boostAdminStyles.purchaseIcon, { backgroundColor: `${Colors.gold}18` }]}>
                    <MaterialIcons name="rocket-launch" size={16} color={Colors.gold} />
                  </View>
                  <View style={boostAdminStyles.purchaseInfo}>
                    <Text style={boostAdminStyles.purchaseType}>{BOOST_TYPE_LABELS[purchase.boost_type] ?? purchase.boost_type}</Text>
                    <Text style={boostAdminStyles.purchaseMeta} numberOfLines={1}>
                      {purchase.stripe_checkout_session ? `Session: ...${String(purchase.stripe_checkout_session).slice(-8)}` : 'N/A'}
                    </Text>
                    <Text style={boostAdminStyles.purchaseDate}>
                      {purchase.completed_at ? new Date(purchase.completed_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending'}
                    </Text>
                  </View>
                  <View style={boostAdminStyles.purchaseRight}>
                    <Text style={boostAdminStyles.purchaseAmount}>${((purchase.amount ?? 0) / 100).toFixed(2)}</Text>
                    <View style={[boostAdminStyles.statusPill, { backgroundColor: purchase.status === 'completed' ? `${Colors.greenLight}20` : 'rgba(255,152,0,0.2)' }]}>
                      <Text style={[boostAdminStyles.statusText, { color: purchase.status === 'completed' ? Colors.greenLight : '#FF9800' }]}>
                        {purchase.status ?? 'pending'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* Grant Boost Modal */}
            <Modal visible={showGrantBoostModal} transparent animationType="slide" onRequestClose={() => setShowGrantBoostModal(false)}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <Pressable style={rejectStyles.overlay} onPress={() => setShowGrantBoostModal(false)}>
                  <Pressable style={rejectStyles.sheet} onPress={(e) => e.stopPropagation()}>
                    <View style={rejectStyles.handle} />
                    <Text style={rejectStyles.title}>Grant Complimentary Boost</Text>
                    <Text style={rejectStyles.fieldLabel}>Search Event *</Text>
                    <TextInput
                      style={rejectStyles.input}
                      value={grantBoostSearch}
                      onChangeText={(v) => { setGrantBoostSearch(v); setGrantBoostEventId(''); }}
                      placeholder="Type event title..."
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                      accessibilityLabel="Event search for boost grant"
                    />
                    {grantBoostSearch.length >= 2 && !grantBoostEventId && (
                      <View style={boostGrantStyles.results}>
                        {events.filter((e) => e.title.toLowerCase().includes(grantBoostSearch.toLowerCase())).slice(0, 5).map((e) => (
                          <Pressable key={e.id} onPress={() => { setGrantBoostEventId(e.id); setGrantBoostSearch(e.title); }} style={boostGrantStyles.option}>
                            <Text style={boostGrantStyles.optionTitle} numberOfLines={1}>{e.title}</Text>
                            <Text style={boostGrantStyles.optionMeta}>{e.parish}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <Text style={[rejectStyles.fieldLabel, { marginTop: Spacing.md }]}>Boost Type *</Text>
                    <View style={boostGrantStyles.typeRow}>
                      {(['three_day', 'seven_day', 'until_event_end'] as const).map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => setGrantBoostType(t)}
                          style={[boostGrantStyles.typeChip, grantBoostType === t && boostGrantStyles.typeChipSelected]}
                        >
                          <Text style={[boostGrantStyles.typeChipText, grantBoostType === t && { color: Colors.textOnGold }]}>
                            {t === 'three_day' ? '3-Day' : t === 'seven_day' ? '7-Day' : 'Until End'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={rejectStyles.btnRow}>
                      <Pressable onPress={() => setShowGrantBoostModal(false)} style={rejectStyles.cancelBtn}>
                        <Text style={rejectStyles.cancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (grantBoostEventId && grantBoostType) {
                            boostEvent(grantBoostEventId, grantBoostType);
                            setShowGrantBoostModal(false);
                            // Refresh purchase list after a short delay to allow DB write
                            setTimeout(loadBoosts, 800);
                          }
                        }}
                        disabled={!grantBoostEventId || !grantBoostType}
                        style={[rejectStyles.confirmBtn, (!grantBoostEventId || !grantBoostType) && { opacity: 0.4 }]}
                      >
                        <Text style={rejectStyles.confirmText}>Grant Boost</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </KeyboardAvoidingView>
            </Modal>
          </View>
        );
      }
      // ── Deletions ─────────────────────────────────────────────────────────
      case 'deletions':
        return (
          <View>
            <View style={styles.statSectionHeader}>
              <View style={styles.goldBar} />
              <Text style={[styles.statSectionTitle, { flex: 1 }]}>Account Deletion Requests ({deletionRequests.length})</Text>
              <Pressable onPress={loadDeletionRequests} style={catStyles.addBtn}>
                <MaterialIcons name="refresh" size={14} color={Colors.gold} />
                <Text style={catStyles.addBtnText}>{deletionLoading ? '...' : 'Refresh'}</Text>
              </Pressable>
            </View>

            {/* Info banner */}
            <View style={delStyles.infoBanner}>
              <MaterialIcons name="info-outline" size={14} color="#42A5F5" />
              <Text style={delStyles.infoText}>
                Approving a request permanently deletes the account and all associated data (events, RSVPs, boosts). This cannot be undone.
              </Text>
            </View>

            {deletionRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="delete-sweep" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Deletion Requests</Text>
                <Text style={styles.emptySub}>Account deletion requests submitted by users will appear here.</Text>
              </View>
            ) : (
              deletionRequests.map((req) => (
                <View key={req.id} style={delStyles.row}>
                  <View style={delStyles.avatar}>
                    <Text style={delStyles.avatarLetter}>
                      {(req.user_name ?? req.user_email ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={delStyles.info}>
                    <Text style={delStyles.name}>{req.user_name || 'Unknown'}</Text>
                    <Text style={delStyles.email} numberOfLines={1}>{req.user_email ?? '—'}</Text>
                    {req.reason ? (
                      <Text style={delStyles.reason} numberOfLines={2}>"{req.reason}"</Text>
                    ) : null}
                    <Text style={delStyles.date}>
                      {new Date(req.created_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={delStyles.actions}>
                    {req.status === 'pending' ? (
                      <>
                        <Pressable
                          onPress={() => handleApproveDeletion(req)}
                          style={({ pressed }) => [delStyles.approveBtn, pressed && { opacity: 0.8 }]}
                          hitSlop={4}
                        >
                          <MaterialIcons name="check" size={13} color="#fff" />
                          <Text style={delStyles.approveBtnText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleRejectDeletion(req)}
                          style={({ pressed }) => [delStyles.rejectBtn, pressed && { opacity: 0.8 }]}
                          hitSlop={4}
                        >
                          <MaterialIcons name="close" size={15} color={Colors.textMuted} />
                        </Pressable>
                      </>
                    ) : (
                      <View style={[delStyles.statusPill, { backgroundColor: req.status === 'approved' ? `${Colors.greenLight}18` : 'rgba(255,152,0,0.15)' }]}>
                        <Text style={[delStyles.statusText, { color: req.status === 'approved' ? Colors.greenLight : '#FF9800' }]}>
                          {req.status === 'approved' ? 'Deleted' : 'Rejected'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          {!embedded ? (
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Admin Panel</Text>
            <Text style={styles.topBarSub}>{events.length} live · {pendingEvents.length} pending · {flaggedEvents.length} flagged</Text>
          </View>
          <View style={styles.adminBadge}>
            <MaterialIcons name="admin-panel-settings" size={14} color={Colors.gold} />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
          {embedded ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Pressable
                onPress={() => router.push('/notifications' as any)}
                style={({ pressed }) => [embeddedStyles.bellBtn, pressed && { opacity: 0.8 }]}
                hitSlop={8}
              >
                <MaterialIcons name="notifications" size={20} color={Colors.textPrimary} />
                {unreadCount > 0 && (
                  <View style={embeddedStyles.bellBadge}>
                    <Text style={embeddedStyles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={handleSignOut}
                style={({ pressed }) => [{ padding: Spacing.xs }, pressed && { opacity: 0.7 }]}
                hitSlop={8}
              >
                <MaterialIcons name="logout" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow} style={styles.tabScroll}>
          {TABS.map((tab) => (
            <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}>
              <MaterialIcons name={tab.icon as any} size={14} color={activeTab === tab.key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>{tab.label}</Text>
              {tab.badge !== undefined && tab.badge > 0 ? (
                <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>{tab.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {renderContent()}
        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>

      {/* Grant Lifetime Plan Modal */}
      <Modal visible={showGrantSubModal} transparent animationType="slide" onRequestClose={() => setShowGrantSubModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={rejectStyles.overlay} onPress={() => setShowGrantSubModal(false)}>
            <Pressable style={rejectStyles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={rejectStyles.handle} />
              <Text style={rejectStyles.title}>Grant Lifetime Plan</Text>
              <View style={grantSubStyles.infoBanner}>
                <MaterialIcons name="info-outline" size={13} color="#42A5F5" />
                <Text style={grantSubStyles.infoText}>Assigned plans are lifetime (no expiry). The user will be marked as Verified Promoter and receive monthly boost credits.</Text>
              </View>
              <Text style={rejectStyles.fieldLabel}>Search User *</Text>
              <TextInput
                style={rejectStyles.input}
                value={grantSubSearch}
                onChangeText={(v) => { setGrantSubSearch(v); setGrantSubUserId(''); setGrantSubUserName(''); searchGrantSubUsers(v); }}
                placeholder="Name or email address..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search user for plan grant"
              />
              {grantSubLoading && (
                <Text style={grantSubStyles.loadingText}>Searching...</Text>
              )}
              {!grantSubUserId && grantSubResults.length > 0 && (
                <View style={grantSubStyles.results}>
                  {grantSubResults.map((u) => (
                    <Pressable
                      key={u.id}
                      onPress={() => { setGrantSubUserId(u.id); setGrantSubUserName(u.name || u.email || 'User'); setGrantSubSearch(u.name || u.email || ''); setGrantSubResults([]); }}
                      style={({ pressed }) => [grantSubStyles.resultRow, pressed && { opacity: 0.8 }]}
                    >
                      <View style={grantSubStyles.resultAvatar}>
                        <Text style={grantSubStyles.resultAvatarLetter}>{(u.name || u.email || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={grantSubStyles.resultName} numberOfLines={1}>{u.name || '—'}</Text>
                        <Text style={grantSubStyles.resultEmail} numberOfLines={1}>{u.email || '—'}</Text>
                      </View>
                      <View style={[grantSubStyles.tierBadge, { backgroundColor: u.subscription_tier === 'elite' ? '#E91E6320' : u.subscription_tier === 'pro' ? `${Colors.gold}20` : Colors.surfaceElevated }]}>
                        <Text style={[grantSubStyles.tierBadgeText, { color: u.subscription_tier === 'elite' ? '#E91E63' : u.subscription_tier === 'pro' ? Colors.gold : Colors.textMuted }]}>
                          {u.subscription_tier ?? 'free'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              {grantSubUserId ? (
                <View style={grantSubStyles.selectedUser}>
                  <MaterialIcons name="check-circle" size={15} color={Colors.greenLight} />
                  <Text style={grantSubStyles.selectedUserText} numberOfLines={1}>{grantSubUserName}</Text>
                  <Pressable onPress={() => { setGrantSubUserId(''); setGrantSubUserName(''); setGrantSubSearch(''); }} hitSlop={8}>
                    <MaterialIcons name="close" size={15} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ) : null}
              <Text style={[rejectStyles.fieldLabel, { marginTop: Spacing.md }]}>Plan *</Text>
              <View style={grantSubStyles.tierRow}>
                {(['pro', 'elite'] as const).map((tier) => (
                  <Pressable
                    key={tier}
                    onPress={() => setGrantSubTier(tier)}
                    style={[grantSubStyles.tierChip, grantSubTier === tier && (tier === 'elite' ? grantSubStyles.tierChipElite : grantSubStyles.tierChipPro)]}
                  >
                    <MaterialIcons
                      name={tier === 'elite' ? 'star' : 'campaign'}
                      size={16}
                      color={grantSubTier === tier ? '#fff' : Colors.textMuted}
                    />
                    <View>
                      <Text style={[grantSubStyles.tierChipLabel, grantSubTier === tier && { color: '#fff' }]}>
                        {tier === 'pro' ? 'Pro' : 'Elite'}
                      </Text>
                      <Text style={[grantSubStyles.tierChipSub, grantSubTier === tier && { color: 'rgba(255,255,255,0.75)' }]}>
                        {tier === 'pro' ? '2 boosts/mo' : '5 boosts/mo'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              <View style={rejectStyles.btnRow}>
                <Pressable onPress={() => setShowGrantSubModal(false)} style={rejectStyles.cancelBtn}>
                  <Text style={rejectStyles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleGrantSubscription}
                  disabled={!grantSubUserId || !grantSubTier || grantSubSaving}
                  style={[rejectStyles.confirmBtn, { backgroundColor: Colors.gold }, (!grantSubUserId || !grantSubTier || grantSubSaving) && { opacity: 0.4 }]}
                >
                  <Text style={[rejectStyles.confirmText, { color: Colors.textOnGold }]}>
                    {grantSubSaving ? 'Saving...' : 'Grant Plan'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <RejectModal visible={rejectTarget !== null} onClose={() => setRejectTarget(null)} onConfirm={handleRejectConfirm} />
    </View>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gate: { flex: 1, backgroundColor: Colors.background },
  gateContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.md },
  gateIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  gateTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  gateSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { fontSize: Typography.base, color: Colors.textMuted },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  adminBadgeText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  tabScroll: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tabRow: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm, flexDirection: 'row' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeActive: { backgroundColor: 'rgba(0,0,0,0.25)' },
  tabBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: '#fff' },
  tabBadgeTextActive: { color: Colors.textOnGold },
  content: { padding: Spacing.base },
  moderationBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)', marginBottom: Spacing.md },
  moderationBannerOff: { backgroundColor: `${Colors.greenLight}12`, borderColor: `${Colors.greenLight}30` },
  moderationBannerText: { flex: 1, fontSize: Typography.xs, color: '#FF9800', fontWeight: Typography.semibold },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  statSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  statSectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  barLabel: { fontSize: Typography.xs, color: Colors.textSecondary, width: 90 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.surfaceElevated, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { fontSize: Typography.xs, color: Colors.textMuted, width: 24, textAlign: 'right' },
});

// ─── Categories Styles ────────────────────────────────────────────────────────
const catStyles = StyleSheet.create({
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 5, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  addBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  addParishRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gold, padding: Spacing.sm, overflow: 'hidden' },
  addParishInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, height: 40 },
  saveChipBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  cancelChipBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  editableChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder },
  chipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  chipDeleteBtn: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  typeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeLabel: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  colorDot: { width: 18, height: 18, borderRadius: 9, flexShrink: 0 },
  typeActionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  resetBtnText: { fontSize: Typography.sm, color: Colors.error, fontWeight: Typography.semibold },
});

// ─── Ads Styles ──────────────────────────────────────────────────────────────
const adsStyles = StyleSheet.create({
  placementCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  placementLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  sizeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  placementName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  placementMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  placementRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  enablePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  enableDot: { width: 7, height: 7, borderRadius: 3.5 },
  enableText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  sizeOptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  sizeOptBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  sizeOptText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textMuted },
});
const boostAdminStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: Radius.md, flexShrink: 0 },
  info: { flex: 1, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  typePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`, alignSelf: 'flex-start' },
  typePillText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold },
  expiry: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actions: { flexDirection: 'row', gap: Spacing.xs },
  viewBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,107,107,0.12)', alignItems: 'center', justifyContent: 'center' },
  purchaseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  purchaseIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  purchaseInfo: { flex: 1, gap: 2 },
  purchaseType: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  purchaseMeta: { fontSize: 10, color: Colors.textMuted },
  purchaseDate: { fontSize: 10, color: Colors.gold },
  purchaseRight: { alignItems: 'flex-end', gap: 4 },
  purchaseAmount: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  statusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  statusText: { fontSize: 10, fontWeight: Typography.bold },
});

const boostGrantStyles = StyleSheet.create({
  results: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: 160, overflow: 'hidden' },
  option: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  optionTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  optionMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeChip: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  typeChipSelected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  typeChipText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textMuted },
});

const pushTestStyles = StyleSheet.create({
  resultsWrap: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tokenSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tokenSummaryText: {
    flex: 1,
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  noteText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  fcmCard: {
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 4,
  },
  fcmCardSent: {
    backgroundColor: `${Colors.greenLight}08`,
    borderColor: `${Colors.greenLight}33`,
  },
  fcmCardStale: {
    backgroundColor: 'rgba(255,152,0,0.06)',
    borderColor: 'rgba(255,152,0,0.28)',
  },
  fcmCardError: {
    backgroundColor: 'rgba(255,107,107,0.06)',
    borderColor: 'rgba(255,107,107,0.28)',
  },
  fcmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  tokenIdText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusChip: {
    fontSize: 9,
    fontWeight: Typography.bold as any,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fcmField: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginLeft: 16,
    lineHeight: 15,
  },
});

// ─── SMTP Probe Styles ───────────────────────────────────────────────────────────────
const smtpStyles = StyleSheet.create({
  resultWrap: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  totalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1,
  },
  totalText: { flex: 1, fontSize: Typography.xs, fontWeight: '600', lineHeight: 16 },
  phasesWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  phaseItem: { alignItems: 'center', gap: 3, minWidth: 52 },
  phaseLabel: {
    fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.5, fontWeight: '600',
  },
  phaseValue: {
    fontSize: Typography.xs, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    padding: Spacing.sm, backgroundColor: 'rgba(255,107,107,0.06)',
    borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,107,107,0.25)',
  },
  errorText: {
    flex: 1, fontSize: 11, color: '#FF6B6B', lineHeight: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  warnRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    padding: Spacing.sm, backgroundColor: 'rgba(255,152,0,0.06)',
    borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.25)',
  },
  warnText: { flex: 1, fontSize: 11, color: '#FF9800', lineHeight: 15 },
});

const subAnalyticsStyles = StyleSheet.create({
  barWrap: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginTop: Spacing.sm, gap: Spacing.sm,
  },
  barTrack: {
    flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
  },
  barSegment: { height: '100%' },
  barLegend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  legendTotal: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: 'auto' },
});

// ─── Deletion Request Styles ─────────────────────────────────────────────────
const delStyles = StyleSheet.create({
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
    marginBottom: Spacing.md,
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(239,83,80,0.15)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(239,83,80,0.3)', flexShrink: 0,
  },
  avatarLetter: { fontSize: Typography.md, fontWeight: Typography.black, color: '#EF5350' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  email: { fontSize: Typography.xs, color: Colors.textMuted },
  reason: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  date: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'column', gap: Spacing.xs, flexShrink: 0, alignItems: 'flex-end' },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    backgroundColor: '#F44336', borderRadius: Radius.md,
  },
  approveBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
  rejectBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
  },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.bold },
});

const settingStyles = StyleSheet.create({  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden', marginBottom: Spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  iconWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, gap: 4 },
  settingTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  settingSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  statusOn: { backgroundColor: 'rgba(255,152,0,0.08)' },
  statusOff: { backgroundColor: `${Colors.greenLight}10` },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  stepIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  stepDesc: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },
  testEmailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    margin: Spacing.md, marginTop: 0, padding: Spacing.md,
    backgroundColor: Colors.gold, borderRadius: Radius.md,
  },
  testEmailBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
});

const grantSubStyles = StyleSheet.create({
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)',
    marginBottom: Spacing.xs,
  },
  infoText: { flex: 1, fontSize: 11, color: '#90CAF9', lineHeight: 16 },
  loadingText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.xs },
  results: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: 220, overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  resultAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: `${Colors.gold}20`, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0,
  },
  resultAvatarLetter: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  resultName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  resultEmail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  tierBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  tierBadgeText: { fontSize: 10, fontWeight: Typography.bold, textTransform: 'uppercase' },
  selectedUser: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: `${Colors.greenLight}10`, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: `${Colors.greenLight}33`,
  },
  selectedUserText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.greenLight },
  tierRow: { flexDirection: 'row', gap: Spacing.md },
  tierChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  tierChipPro: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tierChipElite: { backgroundColor: '#E91E63', borderColor: '#E91E63' },
  tierChipLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted },
  tierChipSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
});

const embeddedStyles = StyleSheet.create({
  bellBtn: { position: 'relative', padding: Spacing.xs },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },
});
