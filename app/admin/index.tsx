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
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { sendTestEmail } from '../../services/emailService';
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
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, formatCount, Event } from '../../constants/data';

type AdminTab = 'queue' | 'flagged' | 'analytics' | 'categories' | 'settings' | 'ads';

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
export default function AdminScreen() {
  const router = useRouter();
  const { user, requireEventApproval, setRequireEventApproval } = useAuth();
  const { allEvents, events, getPendingEvents, getFlaggedEvents, approveEvent, rejectEvent } = useEvents();
  const { addNotification } = useNotifications();
  const { parishes, eventTypes, addParish, removeParish, addEventType, editEventType, removeEventType, resetToDefaults } = useCategories();

  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [testEmailDetail, setTestEmailDetail] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  // Ads state
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);
  const [adCounts, setAdCounts] = useState<Record<string, number>>({});
  const [adsLoading, setAdsLoading] = useState(false);
  const [showNewPlacementModal, setShowNewPlacementModal] = useState(false);
  const [newPlacementName, setNewPlacementName] = useState('');
  const [newPlacementSize, setNewPlacementSize] = useState<'rectangle' | 'square'>('rectangle');

  // Categories CRUD state
  const [showAddParish, setShowAddParish] = useState(false);
  const [addParishInput, setAddParishInput] = useState('');
  const [typeModal, setTypeModal] = useState<{
    visible: boolean; editId: string | null; label: string; icon: string; color: string;
  }>({ visible: false, editId: null, label: '', icon: 'local-bar', color: '#FF6B35' });

  const isAdmin = user?.roles.includes('admin') ?? false;

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

  const TABS: { key: AdminTab; icon: string; label: string; badge?: number }[] = [
    { key: 'queue',      icon: 'pending',              label: 'Queue',      badge: pendingEvents.length },
    { key: 'flagged',    icon: 'flag',                 label: 'Flagged',    badge: flaggedEvents.length },
    { key: 'analytics',  icon: 'bar-chart',            label: 'Analytics' },
    { key: 'categories', icon: 'category',             label: 'Categories' },
    { key: 'settings',   icon: 'settings',             label: 'Settings' },
    { key: 'ads',        icon: 'campaign',             label: 'Ads' },
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
            <View style={styles.statSectionHeader}>
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
            </Modal>
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
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Admin Panel</Text>
            <Text style={styles.topBarSub}>{events.length} live · {pendingEvents.length} pending · {flaggedEvents.length} flagged</Text>
          </View>
          <View style={styles.adminBadge}>
            <MaterialIcons name="admin-panel-settings" size={14} color={Colors.gold} />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
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
const settingStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden', marginBottom: Spacing.md },
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
