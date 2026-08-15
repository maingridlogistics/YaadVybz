/**
 * Admin Portal — Ads Management
 * Direct entry point for ad placement management.
 * Lists all ad placements, allows create / toggle, and navigates to placement detail.
 * Admin-only. Accessed from Profile → MODERATION → Ads.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchAllPlacementsAdmin,
  fetchAdCountsByPlacement,
  togglePlacementEnabled,
  insertPlacement,
  AdPlacement,
} from '../../services/adsService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export default function AdsManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [adCounts, setAdCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState<'rectangle' | 'square'>('rectangle');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([fetchAllPlacementsAdmin(), fetchAdCountsByPlacement()]);
      setPlacements(p);
      setAdCounts(c);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const handleToggle = async (placement: AdPlacement) => {
    const next = !placement.enabled;
    await togglePlacementEnabled(placement.id, next);
    setPlacements((prev) => prev.map((p) => p.id === placement.id ? { ...p, enabled: next } : p));
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await insertPlacement(newName.trim(), newSize);
      if (data) {
        setPlacements((prev) => [...prev, data as AdPlacement]);
        setAdCounts((prev) => ({ ...prev, [(data as AdPlacement).id]: 0 }));
      }
      setNewName('');
      setNewSize('rectangle');
      setShowNewModal(false);
    } catch {
      Alert.alert('Error', 'Failed to create placement.');
    }
    setCreating(false);
  };

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="campaign" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Ads & Placements</Text>
            <Text style={s.headerSub}>Manage ad placements and creatives</Text>
          </View>
          <Pressable onPress={() => setShowNewModal(true)} style={s.addBtn} hitSlop={8}>
            <MaterialIcons name="add" size={20} color={Colors.gold} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Info card */}
        <View style={s.infoCard}>
          <MaterialIcons name="info-outline" size={14} color="#42A5F5" />
          <Text style={s.infoText}>
            Each placement defines a slot in the app (e.g. Home Feed). Ads within a placement rotate on a configurable interval. Tap a placement to manage its ads.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xxl }} />
        ) : placements.length === 0 ? (
          <View style={s.empty}>
            <MaterialIcons name="campaign" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No Ad Placements</Text>
            <Text style={s.emptySub}>Create a placement to start serving ads in the app.</Text>
            <Pressable onPress={() => setShowNewModal(true)} style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]}>
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.createBtnInner}>
                <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
                <Text style={s.createBtnText}>Create First Placement</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.countLabel}>{placements.length} placement{placements.length !== 1 ? 's' : ''}</Text>
            {placements.map((placement) => {
              const count = adCounts[placement.id] ?? 0;
              return (
                <Pressable
                  key={placement.id}
                  onPress={() => router.push(`/admin/ads/${placement.id}` as any)}
                  style={({ pressed }) => [s.placementCard, pressed && { opacity: 0.88 }]}
                >
                  <View style={[s.sizeIcon, { backgroundColor: placement.size === 'rectangle' ? `${Colors.gold}18` : '#9C27B018' }]}>
                    <MaterialIcons
                      name={placement.size === 'rectangle' ? 'crop-landscape' : 'crop-square'}
                      size={18}
                      color={placement.size === 'rectangle' ? Colors.gold : '#9C27B0'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.placementName}>{placement.name}</Text>
                    <Text style={s.placementMeta}>
                      {placement.size} · {count} ad{count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); handleToggle(placement); }}
                    style={[s.liveToggle, { backgroundColor: placement.enabled ? `${Colors.greenLight}15` : `${Colors.textMuted}12` }]}
                    hitSlop={8}
                  >
                    <View style={[s.liveDot, { backgroundColor: placement.enabled ? Colors.greenLight : Colors.textMuted }]} />
                    <Text style={[s.liveText, { color: placement.enabled ? Colors.greenLight : Colors.textMuted }]}>
                      {placement.enabled ? 'Live' : 'Off'}
                    </Text>
                  </Pressable>
                  <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })}

            {/* New placement button */}
            <Pressable
              onPress={() => setShowNewModal(true)}
              style={({ pressed }) => [s.newPlacementBtn, pressed && { opacity: 0.85 }]}
            >
              <MaterialIcons name="add-circle-outline" size={16} color={Colors.gold} />
              <Text style={s.newPlacementBtnText}>New Placement</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Create placement modal */}
      <Modal visible={showNewModal} transparent animationType="slide" onRequestClose={() => !creating && setShowNewModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => !creating && setShowNewModal(false)}>
            <Pressable style={[s.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
              <View style={s.handle} />
              <Text style={s.modalTitle}>New Ad Placement</Text>

              <Text style={s.fieldLabel}>Placement Name *</Text>
              <TextInput
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Home Feed, Event Detail Banner"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                accessibilityLabel="Placement name"
              />

              <Text style={s.fieldLabel}>Size</Text>
              <View style={s.sizeRow}>
                {(['rectangle', 'square'] as const).map((sz) => (
                  <Pressable
                    key={sz}
                    onPress={() => setNewSize(sz)}
                    style={[s.sizeBtn, newSize === sz && s.sizeBtnActive]}
                  >
                    <MaterialIcons
                      name={sz === 'rectangle' ? 'crop-landscape' : 'crop-square'}
                      size={16}
                      color={newSize === sz ? Colors.textOnGold : Colors.textMuted}
                    />
                    <Text style={[s.sizeBtnText, newSize === sz && { color: Colors.textOnGold }]}>
                      {sz === 'rectangle' ? 'Rectangle (banner)' : 'Square'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.btnRow}>
                <Pressable onPress={() => setShowNewModal(false)} disabled={creating} style={s.cancelBtn}>
                  <Text style={s.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleCreate}
                  disabled={creating || !newName.trim()}
                  style={[s.confirmBtn, (creating || !newName.trim()) && { opacity: 0.4 }]}
                >
                  {creating
                    ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                    : <Text style={s.confirmText}>Create</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },

  body: { padding: Spacing.base, gap: Spacing.sm },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(66,165,245,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)' },
  infoText: { flex: 1, fontSize: Typography.xs, color: '#90CAF9', lineHeight: 17 },

  empty: { alignItems: 'center', paddingVertical: Spacing.xxl * 2, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  createBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs },
  createBtnInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.base },
  createBtnText: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  countLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  placementCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  sizeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  placementName: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  placementMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  liveToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: Typography.xs, fontWeight: Typography.semibold as any },

  newPlacementBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md, marginTop: Spacing.xs,
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: `${Colors.gold}44`,
    backgroundColor: Colors.goldSurface,
  },
  newPlacementBtnText: { fontSize: Typography.base, color: Colors.gold, fontWeight: Typography.semibold as any },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.md },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md, height: 52, color: Colors.textPrimary, fontSize: Typography.base },
  sizeRow: { flexDirection: 'row', gap: Spacing.md },
  sizeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  sizeBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  sizeBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textMuted },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  confirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold, borderRadius: Radius.md, minHeight: 48 },
  confirmText: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
});
