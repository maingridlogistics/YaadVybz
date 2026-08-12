// app/ticketing/tiers/[eventId].tsx
// Phase 2 — Promoter: Create and manage up to 5 ticket tiers for an event.
// Supports add, edit, toggle active/paused, soft-cancel (no sold tickets).
// All prices entered in major units (e.g. "25.00"), stored as minor units internally.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTicketSettings, useTicketTiers } from '../../../hooks/useTicketing';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import {
  formatMinorAmount,
  parsePriceToMinor,
  formatMinorToInput,
  TIER_STATUS_CONFIG,
  type TicketTier,
  type TicketCurrency,
} from '../../../services/ticketingService';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';

const MAX_TIERS = 5;

interface TierFormData {
  name: string;
  description: string;
  price: string;          // major units as string, e.g. "25.00"
  isFree: boolean;
  quantity: string;
  minPerOrder: string;
  maxPerOrder: string;
}

const EMPTY_FORM: TierFormData = {
  name: '',
  description: '',
  price: '',
  isFree: false,
  quantity: '',
  minPerOrder: '1',
  maxPerOrder: '10',
};

function TierFormModal({
  visible,
  currency,
  editingTier,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  currency: TicketCurrency;
  editingTier: TicketTier | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: TierFormData) => void;
}) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<TierFormData>(EMPTY_FORM);

  useEffect(() => {
    if (editingTier) {
      setForm({
        name: editingTier.name,
        description: editingTier.description,
        price: editingTier.price_minor === 0 ? '' : formatMinorToInput(editingTier.price_minor),
        isFree: editingTier.price_minor === 0,
        quantity: String(editingTier.quantity_total),
        minPerOrder: String(editingTier.min_per_order),
        maxPerOrder: String(editingTier.max_per_order),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingTier, visible]);

  const set = (field: keyof TierFormData) => (val: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  const currencySymbol = currency === 'JMD' ? 'J$' : '$';
  const isEditing = !!editingTier;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={modalStyles.header}>
            <Pressable onPress={onClose} style={({ pressed }) => [modalStyles.cancelBtn, pressed && { opacity: 0.7 }]}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={modalStyles.headerTitle}>{isEditing ? 'Edit Tier' : 'Add Tier'}</Text>
            <Pressable
              onPress={() => onSubmit(form)}
              disabled={saving}
              style={({ pressed }) => [modalStyles.saveBtn, pressed && { opacity: 0.8 }]}
            >
              {saving ? (
                <ActivityIndicator color={Colors.textOnGold} size="small" style={{ width: 56 }} />
              ) : (
                <Text style={modalStyles.saveBtnText}>{isEditing ? 'Update' : 'Add'}</Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            modalStyles.scroll,
            { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={modalStyles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={modalStyles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Name */}
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Tier Name <Text style={modalStyles.required}>*</Text></Text>
            <TextInput
              style={modalStyles.input}
              value={form.name}
              onChangeText={set('name')}
              placeholder="e.g. Early Bird, General Admission, VIP"
              placeholderTextColor={Colors.textMuted}
              maxLength={80}
              returnKeyType="next"
            />
          </View>

          {/* Description */}
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Description</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.inputMulti]}
              value={form.description}
              onChangeText={set('description')}
              placeholder="What does this tier include?"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Free toggle */}
          <View style={modalStyles.field}>
            <View style={modalStyles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.label}>Free Ticket</Text>
                <Text style={modalStyles.fieldNote}>No payment required for this tier</Text>
              </View>
              <Switch
                value={form.isFree}
                onValueChange={(v) => set('isFree')(v)}
                trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }}
                thumbColor={form.isFree ? Colors.textOnGold : Colors.textMuted}
              />
            </View>
          </View>

          {/* Price */}
          {!form.isFree && (
            <View style={modalStyles.field}>
              <Text style={modalStyles.label}>
                Price ({currency}) <Text style={modalStyles.required}>*</Text>
              </Text>
              <View style={modalStyles.priceWrap}>
                <Text style={modalStyles.currencySymbol}>{currencySymbol}</Text>
                <TextInput
                  style={[modalStyles.input, modalStyles.priceInput]}
                  value={form.price}
                  onChangeText={set('price')}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
            </View>
          )}

          {/* Quantity */}
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Total Quantity <Text style={modalStyles.required}>*</Text></Text>
            <TextInput
              style={modalStyles.input}
              value={form.quantity}
              onChangeText={set('quantity')}
              placeholder="e.g. 100"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="next"
            />
          </View>

          {/* Min / Max per order */}
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Per-Order Limits</Text>
            <View style={modalStyles.minMaxRow}>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.subLabel}>Min</Text>
                <TextInput
                  style={modalStyles.input}
                  value={form.minPerOrder}
                  onChangeText={set('minPerOrder')}
                  keyboardType="number-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={modalStyles.minMaxSep}>
                <Text style={modalStyles.minMaxSepText}>—</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.subLabel}>Max</Text>
                <TextInput
                  style={modalStyles.input}
                  value={form.maxPerOrder}
                  onChangeText={set('maxPerOrder')}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
            <Text style={modalStyles.fieldNote}>
              Customers can buy between min and max tickets per transaction
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function TicketTiersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
  const {
    settings,
    loading: settingsLoading,
    load: loadSettings,
  } = useTicketSettings(eventId ?? '');
  const {
    tiers,
    loading,
    saving,
    error,
    load,
    addTier,
    editTier,
    removeTier,
    toggleTierStatus,
  } = useTicketTiers(eventId ?? '');

  const [showForm, setShowForm] = useState(false);
  const [editingTier, setEditingTier] = useState<TicketTier | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (eventId) {
      load();
      loadSettings();
    }
  }, [eventId]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  const currency = (settings?.currency ?? 'USD') as TicketCurrency;
  const activeTiers = tiers.filter((t) => t.status !== 'cancelled');
  const canAddMore = activeTiers.length < MAX_TIERS;

  const validateForm = (form: TierFormData): string | null => {
    if (!form.name.trim()) return 'Tier name is required.';
    if (!form.isFree) {
      const minor = parsePriceToMinor(form.price);
      if (minor === null || minor < 0) return 'Enter a valid price (e.g. 25.00).';
    }
    const qty = parseInt(form.quantity, 10);
    if (isNaN(qty) || qty < 1) return 'Quantity must be at least 1.';
    const min = parseInt(form.minPerOrder, 10);
    const max = parseInt(form.maxPerOrder, 10);
    if (isNaN(min) || min < 1) return 'Minimum per order must be at least 1.';
    if (isNaN(max) || max < 1) return 'Maximum per order must be at least 1.';
    if (min > max) return 'Minimum per order cannot exceed maximum.';
    if (max > qty) return 'Maximum per order cannot exceed total quantity.';
    return null;
  };

  const handleSubmit = async (form: TierFormData) => {
    setFormError(null);
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const priceMinor = form.isFree ? 0 : (parsePriceToMinor(form.price) ?? 0);
    const qty = parseInt(form.quantity, 10);
    const min = parseInt(form.minPerOrder, 10);
    const max = parseInt(form.maxPerOrder, 10);

    if (editingTier) {
      const ok = await editTier(editingTier.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        price_minor: priceMinor,
        quantity_total: qty,
        min_per_order: min,
        max_per_order: max,
      });
      if (ok) {
        setShowForm(false);
        setEditingTier(null);
        triggerToast('Tier updated');
      } else {
        setFormError(error ?? 'Failed to update tier');
      }
    } else {
      const ok = await addTier({
        name: form.name.trim(),
        description: form.description.trim(),
        price_minor: priceMinor,
        currency,
        quantity_total: qty,
        min_per_order: min,
        max_per_order: max,
        sales_start_at: null,
        sales_end_at: null,
        sort_order: tiers.length,
      });
      if (ok) {
        setShowForm(false);
        triggerToast('Tier added');
      } else {
        setFormError(error ?? 'Failed to add tier. You may have reached the 5-tier limit.');
      }
    }
  };

  const handleOpenEdit = (tier: TicketTier) => {
    setEditingTier(tier);
    setFormError(null);
    setShowForm(true);
  };

  const handleOpenAdd = () => {
    setEditingTier(null);
    setFormError(null);
    setShowForm(true);
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemoveId) return;
    const ok = await removeTier(confirmRemoveId);
    if (ok) {
      setConfirmRemoveId(null);
      triggerToast('Tier removed');
    }
  };

  return (
    <View style={styles.container}>
      {/* Toast */}
      <Animated.View
        style={[styles.toast, { opacity: toastOpacity, top: insets.top + Spacing.md }]}
        pointerEvents="none"
      >
        <MaterialIcons name="check-circle" size={16} color={Colors.textOnGold} />
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Ticket Tiers</Text>
            <Text style={styles.headerSub}>
              {activeTiers.length}/{MAX_TIERS} tiers · {currency}
            </Text>
          </View>
          {canAddMore && (
            <Pressable
              onPress={handleOpenAdd}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                style={styles.addBtnInner}
              >
                <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
                <Text style={styles.addBtnText}>Add</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      {loading || settingsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* Capacity bar */}
          <View style={styles.capacityBar}>
            {Array.from({ length: MAX_TIERS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.capacitySlot,
                  i < activeTiers.length && styles.capacitySlotFilled,
                  i === 0 && { borderRadius: `${Radius.sm}px 0 0 ${Radius.sm}px` } as any,
                  i === MAX_TIERS - 1 && { borderRadius: `0 ${Radius.sm}px ${Radius.sm}px 0` } as any,
                ]}
              />
            ))}
            <Text style={styles.capacityLabel}>
              {activeTiers.length}/{MAX_TIERS} tier slots used
            </Text>
          </View>

          {/* Error banner */}
          {error ? (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Empty state */}
          {activeTiers.length === 0 && (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="confirmation-number" size={36} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No ticket tiers yet</Text>
              <Text style={styles.emptySub}>
                Add up to 5 tiers (Early Bird, General, VIP, etc.) with different prices and quantities.
              </Text>
              <Pressable
                onPress={handleOpenAdd}
                style={({ pressed }) => [styles.emptyAddBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.emptyAddBtnInner}>
                  <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
                  <Text style={styles.emptyAddBtnText}>Add First Tier</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* Tier cards */}
          {activeTiers.map((tier) => {
            const available = tier.quantity_total - tier.quantity_reserved - tier.quantity_sold;
            const soldPct = tier.quantity_total > 0
              ? Math.round((tier.quantity_sold / tier.quantity_total) * 100)
              : 0;
            const cfg = TIER_STATUS_CONFIG[tier.status];

            return (
              <View key={tier.id} style={styles.tierCard}>
                {/* Tier header */}
                <View style={styles.tierCardHeader}>
                  <View style={{ flex: 1, gap: Spacing.xs }}>
                    <Text style={styles.tierName}>{tier.name}</Text>
                    {tier.description ? (
                      <Text style={styles.tierDesc} numberOfLines={2}>{tier.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.tierHeaderRight}>
                    <Text style={styles.tierPrice}>
                      {tier.price_minor === 0
                        ? 'Free'
                        : formatMinorAmount(tier.price_minor, currency)}
                    </Text>
                    <View style={[styles.tierStatusBadge, { backgroundColor: `${cfg.color}20` }]}>
                      <MaterialIcons name={cfg.icon as any} size={11} color={cfg.color} />
                      <Text style={[styles.tierStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                </View>

                {/* Inventory bar */}
                <View style={styles.inventoryWrap}>
                  <View style={styles.inventoryBar}>
                    <View style={[styles.inventoryFill, { width: `${soldPct}%` as any }]} />
                  </View>
                  <Text style={styles.inventoryLabel}>
                    {tier.quantity_sold} sold · {available} available · {tier.quantity_total} total
                  </Text>
                </View>

                {/* Per-order limits */}
                <View style={styles.tierMeta}>
                  <View style={styles.tierMetaItem}>
                    <MaterialIcons name="people" size={12} color={Colors.textMuted} />
                    <Text style={styles.tierMetaText}>
                      {tier.min_per_order}–{tier.max_per_order} per order
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.tierActions}>
                  {/* Toggle active/paused (only if no sold tickets or if active) */}
                  <Pressable
                    onPress={() => toggleTierStatus(tier.id, tier.status)}
                    disabled={saving || tier.status === 'sold_out' || tier.status === 'ended'}
                    style={({ pressed }) => [styles.tierActionBtn, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons
                      name={tier.status === 'active' ? 'pause' : 'play-arrow'}
                      size={15}
                      color={tier.status === 'active' ? Colors.gold : Colors.greenLight}
                    />
                    <Text style={[
                      styles.tierActionText,
                      { color: tier.status === 'active' ? Colors.gold : Colors.greenLight },
                    ]}>
                      {tier.status === 'active' ? 'Pause' : 'Resume'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleOpenEdit(tier)}
                    style={({ pressed }) => [styles.tierActionBtn, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="edit" size={15} color={Colors.textSecondary} />
                    <Text style={styles.tierActionText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setConfirmRemoveId(tier.id)}
                    disabled={saving}
                    style={({ pressed }) => [styles.tierActionBtnDestructive, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
                    <Text style={[styles.tierActionText, { color: Colors.error }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* Max reached note */}
          {!canAddMore && (
            <View style={styles.maxNote}>
              <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.maxNoteText}>
                Maximum of 5 ticket tiers reached. Remove or cancel a tier to add another.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Tier form modal */}
      <TierFormModal
        visible={showForm}
        currency={currency}
        editingTier={editingTier}
        saving={saving}
        error={formError}
        onClose={() => { setShowForm(false); setEditingTier(null); setFormError(null); }}
        onSubmit={handleSubmit}
      />

      {/* Remove confirmation modal */}
      <Modal
        visible={!!confirmRemoveId}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRemoveId(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.base) }]}>
            <View style={styles.confirmIcon}>
              <MaterialIcons name="delete-outline" size={28} color={Colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Remove Tier</Text>
            <Text style={styles.confirmMsg}>
              This tier will be permanently removed. Tiers with sold tickets cannot be removed.
            </Text>
            {error ? (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmRemoveId(null)}
                style={({ pressed }) => [styles.confirmCancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmRemove}
                disabled={saving}
                style={({ pressed }) => [styles.confirmDeleteBtn, pressed && { opacity: 0.7 }]}
              >
                {saving
                  ? <ActivityIndicator color={Colors.error} size="small" />
                  : <Text style={styles.confirmDeleteText}>Remove</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },

  toast: {
    position: 'absolute', left: Spacing.base, right: Spacing.base, zIndex: 999,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  toastText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold, flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  addBtn: { borderRadius: Radius.full, overflow: 'hidden' },
  addBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  addBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  scrollContent: { padding: Spacing.base, gap: Spacing.md },

  capacityBar: {
    flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: Spacing.xs,
  },
  capacitySlot: {
    flex: 1, height: 6, backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.sm,
  },
  capacitySlotFilled: { backgroundColor: Colors.gold },
  capacityLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: Spacing.sm },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.base },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  emptySub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  emptyAddBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm, width: '100%' },
  emptyAddBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  emptyAddBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  tierCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', gap: Spacing.md, padding: Spacing.base,
  },
  tierCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  tierName: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  tierDesc: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  tierHeaderRight: { alignItems: 'flex-end', gap: Spacing.xs },
  tierPrice: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.gold },
  tierStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full,
  },
  tierStatusText: { fontSize: 10, fontWeight: Typography.bold },

  inventoryWrap: { gap: Spacing.xs },
  inventoryBar: {
    height: 6, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, overflow: 'hidden',
  },
  inventoryFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: Radius.sm },
  inventoryLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  tierMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  tierMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tierMetaText: { fontSize: Typography.xs, color: Colors.textMuted },

  tierActions: {
    flexDirection: 'row', gap: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.md,
  },
  tierActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  tierActionBtnDestructive: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: 'rgba(255,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  tierActionText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },

  maxNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  maxNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
  },
  confirmBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xl, width: '100%', gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center',
  },
  confirmIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,68,68,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  confirmMsg: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  confirmActions: { flexDirection: 'row', gap: Spacing.md, width: '100%', marginTop: Spacing.sm },
  confirmCancelBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  confirmCancelText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
  confirmDeleteBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: 'rgba(255,68,68,0.15)', borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)',
  },
  confirmDeleteText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.error },
});

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  cancelBtn: { paddingVertical: Spacing.sm, paddingRight: Spacing.sm },
  cancelText: { fontSize: Typography.base, color: Colors.textSecondary },
  headerTitle: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  saveBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, minWidth: 56, alignItems: 'center',
  },
  saveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  scroll: { padding: Spacing.base, gap: Spacing.base },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  field: { gap: Spacing.xs },
  label: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  required: { color: Colors.error },
  subLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.xs },
  fieldNote: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  inputMulti: { minHeight: 80 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },

  priceWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  currencySymbol: {
    fontSize: Typography.md, fontWeight: Typography.bold,
    color: Colors.gold, width: 24, textAlign: 'center',
  },
  priceInput: { flex: 1 },

  minMaxRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  minMaxSep: { paddingBottom: Spacing.md },
  minMaxSepText: { fontSize: Typography.base, color: Colors.textMuted },
});
