/**
 * Admin Portal — Categories
 * Manage parishes and event types used throughout the app.
 * Admin-only. Accessed from Profile → CONTENT & APP → Categories.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useCategories } from '../../hooks/useCategories';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const ICON_OPTIONS = [
  'local-bar', 'celebration', 'speaker', 'beach-access', 'nightlife', 'mic',
  'flag', 'museum', 'people', 'emoji-events', 'work', 'lock',
  'star', 'music-note', 'sports', 'restaurant', 'camera-alt', 'festival',
];
const COLOR_OPTIONS = [
  '#FF6B35', '#E91E63', '#FF9800', '#00BCD4', '#9C27B0', '#5C6BC0',
  '#F44336', '#27AE60', '#00897B', '#1565C0', '#607D8B', '#FFD700',
];

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { parishes, eventTypes, addParish, removeParish, addEventType, editEventType, removeEventType, resetToDefaults } = useCategories();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [showAddParish, setShowAddParish] = useState(false);
  const [addParishInput, setAddParishInput] = useState('');
  const [typeModal, setTypeModal] = useState<{
    visible: boolean; editId: string | null; label: string; icon: string; color: string;
  }>({ visible: false, editId: null, label: '', icon: ICON_OPTIONS[0], color: COLOR_OPTIONS[0] });

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

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="category" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Categories</Text>
            <Text style={s.headerSub}>Parishes and event types</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* ── Parishes ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>PARISHES ({parishes.length})</Text>
          <Pressable
            onPress={() => { setShowAddParish(true); setAddParishInput(''); }}
            style={s.addChipBtn}
            hitSlop={8}
          >
            <MaterialIcons name="add" size={13} color={Colors.gold} />
            <Text style={s.addChipText}>Add</Text>
          </Pressable>
        </View>

        {showAddParish && (
          <View style={s.addRow}>
            <TextInput
              style={s.addInput}
              value={addParishInput}
              onChangeText={setAddParishInput}
              placeholder="Parish name..."
              placeholderTextColor={Colors.textMuted}
              autoFocus
              accessibilityLabel="New parish name"
              onSubmitEditing={() => {
                if (addParishInput.trim()) addParish(addParishInput.trim());
                setShowAddParish(false);
                setAddParishInput('');
              }}
            />
            <Pressable
              onPress={() => { if (addParishInput.trim()) addParish(addParishInput.trim()); setShowAddParish(false); setAddParishInput(''); }}
              style={s.saveChipBtn}
            >
              <MaterialIcons name="check" size={16} color={Colors.textOnGold} />
            </Pressable>
            <Pressable
              onPress={() => { setShowAddParish(false); setAddParishInput(''); }}
              style={s.cancelChipBtn}
            >
              <MaterialIcons name="close" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        <View style={s.chipsWrap}>
          {parishes.map((parish) => (
            <View key={parish} style={s.chip}>
              <MaterialIcons name="place" size={11} color={Colors.gold} />
              <Text style={s.chipText}>{parish}</Text>
              <Pressable
                onPress={() => Alert.alert('Remove Parish', `Remove "${parish}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeParish(parish) },
                ])}
                hitSlop={6}
              >
                <MaterialIcons name="close" size={11} color={Colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>

        {/* ── Event Types ── */}
        <View style={[s.sectionHeader, { marginTop: Spacing.lg }]}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>EVENT TYPES ({eventTypes.length})</Text>
          <Pressable
            onPress={() => setTypeModal({ visible: true, editId: null, label: '', icon: ICON_OPTIONS[0], color: COLOR_OPTIONS[0] })}
            style={s.addChipBtn}
            hitSlop={8}
          >
            <MaterialIcons name="add" size={13} color={Colors.gold} />
            <Text style={s.addChipText}>Add</Text>
          </Pressable>
        </View>

        {eventTypes.map((type) => (
          <View key={type.id} style={s.typeRow}>
            <View style={[s.typeIconWrap, { backgroundColor: `${type.color}20` }]}>
              <MaterialIcons name={type.icon as any} size={18} color={type.color} />
            </View>
            <Text style={s.typeLabel} numberOfLines={1}>{type.label}</Text>
            <View style={[s.typeColorDot, { backgroundColor: type.color }]} />
            <Pressable
              onPress={() => setTypeModal({ visible: true, editId: type.id, label: type.label, icon: type.icon, color: type.color })}
              style={s.typeActionBtn}
              hitSlop={6}
            >
              <MaterialIcons name="edit" size={14} color={Colors.gold} />
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Delete Type', `Delete "${type.label}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeEventType(type.id) },
              ])}
              style={s.typeActionBtn}
              hitSlop={6}
            >
              <MaterialIcons name="delete-outline" size={14} color={Colors.error} />
            </Pressable>
          </View>
        ))}

        {/* Reset button */}
        <Pressable
          onPress={() => Alert.alert('Reset to Defaults', 'Restore all parishes and event types to factory defaults? All custom entries will be lost.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: resetToDefaults },
          ])}
          style={({ pressed }) => [s.resetBtn, pressed && { opacity: 0.8 }]}
        >
          <MaterialIcons name="restore" size={15} color={Colors.error} />
          <Text style={s.resetBtnText}>Reset All to Defaults</Text>
        </Pressable>
      </ScrollView>

      {/* Event Type form modal */}
      <Modal
        visible={typeModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setTypeModal((p) => ({ ...p, visible: false }))}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setTypeModal((p) => ({ ...p, visible: false }))}>
            <Pressable
              style={[s.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={s.handle} />
              <Text style={s.modalTitle}>{typeModal.editId ? 'Edit Event Type' : 'Add Event Type'}</Text>

              <Text style={s.fieldLabel}>Type Name *</Text>
              <TextInput
                style={s.input}
                value={typeModal.label}
                onChangeText={(v) => setTypeModal((p) => ({ ...p, label: v }))}
                placeholder="e.g. Fashion Shows"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                accessibilityLabel="Event type name"
              />

              <Text style={s.fieldLabel}>Icon</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRow}>
                {ICON_OPTIONS.map((ic) => (
                  <Pressable
                    key={ic}
                    onPress={() => setTypeModal((p) => ({ ...p, icon: ic }))}
                    style={[s.iconOpt, typeModal.icon === ic && { borderColor: typeModal.color, backgroundColor: `${typeModal.color}20` }]}
                  >
                    <MaterialIcons name={ic as any} size={20} color={typeModal.icon === ic ? typeModal.color : Colors.textMuted} />
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>Color</Text>
              <View style={s.colorGrid}>
                {COLOR_OPTIONS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setTypeModal((p) => ({ ...p, color: c }))}
                    style={[s.colorDot, { backgroundColor: c }, typeModal.color === c && s.colorDotSelected]}
                  />
                ))}
              </View>

              <View style={s.btnRow}>
                <Pressable onPress={() => setTypeModal((p) => ({ ...p, visible: false }))} style={s.cancelBtn}>
                  <Text style={s.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!typeModal.label.trim()) return;
                    if (typeModal.editId) editEventType(typeModal.editId, { label: typeModal.label.trim(), icon: typeModal.icon, color: typeModal.color });
                    else addEventType({ label: typeModal.label.trim(), icon: typeModal.icon, color: typeModal.color });
                    setTypeModal((p) => ({ ...p, visible: false }));
                  }}
                  disabled={!typeModal.label.trim()}
                  style={[s.confirmBtn, !typeModal.label.trim() && { opacity: 0.4 }]}
                >
                  <Text style={s.confirmText}>{typeModal.editId ? 'Save' : 'Add'}</Text>
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

  body: { padding: Spacing.base, gap: Spacing.md },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { flex: 1, fontSize: 11, fontWeight: Typography.bold as any, color: Colors.textMuted, textTransform: 'uppercase' as any, letterSpacing: 1.1 },
  addChipBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 5, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  addChipText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gold, padding: Spacing.sm },
  addInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, height: 40 },
  saveChipBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  cancelChipBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder },
  chipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium as any },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md },
  typeIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeLabel: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  typeColorDot: { width: 16, height: 16, borderRadius: 8, flexShrink: 0 },
  typeActionBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm, padding: Spacing.md, backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  resetBtnText: { fontSize: Typography.sm, color: Colors.error, fontWeight: Typography.semibold as any },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.md },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  fieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase' as any, letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md, height: 52, color: Colors.textPrimary, fontSize: Typography.base },
  iconRow: { gap: Spacing.xs, flexDirection: 'row', paddingVertical: Spacing.xs },
  iconOpt: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff' },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  confirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.gold, borderRadius: Radius.md },
  confirmText: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
});
