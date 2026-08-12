// ─── ParishSelector ───────────────────────────────────────────────────────────
// Reusable Jamaica parish selector component (single-select).
// Renders a pressable field that opens a bottom-sheet modal with all 14 parishes.
//
// Usage:
//   <ParishSelector
//     value="Saint Andrew"
//     onChange={(parish) => setParish(parish)}
//     error="Parish is required"
//   />

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES, normalizeParish } from '../../constants/parishes';

interface ParishSelectorProps {
  /** Currently selected parish (canonical or legacy form — will be normalized). */
  value: string;
  /** Called with the canonical parish name when selection changes. */
  onChange: (parish: string) => void;
  /** Inline error message. */
  error?: string;
  /** Disabled state. */
  disabled?: boolean;
  /** Optional label shown above the selector. */
  label?: string;
  /** Whether this field is required — shows * on label. */
  required?: boolean;
  /** Placeholder text when no parish is selected. */
  placeholder?: string;
  /** Additional container style. */
  style?: any;
}

export function ParishSelector({
  value,
  onChange,
  error,
  disabled,
  label,
  required,
  placeholder = 'Select parish...',
  style,
}: ParishSelectorProps) {
  const [showModal, setShowModal] = useState(false);
  const insets = useSafeAreaInsets();

  // Normalize any legacy value for display
  const normalized = value ? normalizeParish(value) : '';

  const handleSelect = (parish: string) => {
    onChange(parish);
    setShowModal(false);
  };

  return (
    <View style={[selectorStyles.container, style]}>
      {label ? (
        <Text style={selectorStyles.label}>
          {label}
          {required ? <Text style={selectorStyles.required}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        onPress={() => !disabled && setShowModal(true)}
        disabled={disabled}
        style={({ pressed }) => [
          selectorStyles.field,
          error ? selectorStyles.fieldError : null,
          disabled ? selectorStyles.fieldDisabled : null,
          pressed && !disabled ? { opacity: 0.8 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={normalized || placeholder}
      >
        <MaterialIcons name="place" size={16} color={normalized ? Colors.gold : Colors.textMuted} />
        <Text style={[
          selectorStyles.fieldText,
          normalized ? selectorStyles.fieldTextSelected : null,
          disabled ? selectorStyles.disabledText : null,
        ]}>
          {normalized || placeholder}
        </Text>
        {!disabled && (
          <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textMuted} />
        )}
      </Pressable>

      {error ? (
        <View style={selectorStyles.errorRow}>
          <MaterialIcons name="error-outline" size={12} color={Colors.error} />
          <Text style={selectorStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Parish picker modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={modalStyles.overlay}>
          <Pressable style={modalStyles.backdrop} onPress={() => setShowModal(false)} />
          <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.header}>
              <View style={modalStyles.headerIcon}>
                <MaterialIcons name="place" size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.title}>Select Parish</Text>
                <Text style={modalStyles.sub}>All 14 parishes of Jamaica</Text>
              </View>
              <Pressable
                onPress={() => setShowModal(false)}
                style={modalStyles.closeBtn}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={modalStyles.list}
              contentContainerStyle={modalStyles.listContent}
            >
              {JAMAICA_PARISHES.map((parish) => {
                const isSelected = normalized === parish;
                return (
                  <Pressable
                    key={parish}
                    onPress={() => handleSelect(parish)}
                    style={({ pressed }) => [
                      modalStyles.parishRow,
                      isSelected && modalStyles.parishRowSelected,
                      pressed && { opacity: 0.75 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={parish}
                  >
                    <MaterialIcons
                      name="place"
                      size={16}
                      color={isSelected ? Colors.gold : Colors.textMuted}
                    />
                    <Text style={[
                      modalStyles.parishName,
                      isSelected && modalStyles.parishNameSelected,
                    ]}>
                      {parish}
                    </Text>
                    {isSelected && (
                      <MaterialIcons name="check-circle" size={18} color={Colors.gold} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Cancel button */}
            <Pressable
              onPress={() => setShowModal(false)}
              style={({ pressed }) => [modalStyles.cancelBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const selectorStyles = StyleSheet.create({
  container: { gap: Spacing.xs },
  label: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.semibold,
  },
  required: { color: Colors.error },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  fieldError: { borderColor: Colors.error },
  fieldDisabled: { opacity: 0.5 },
  fieldText: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textMuted,
  },
  fieldTextSelected: {
    color: Colors.textPrimary,
    fontWeight: Typography.medium,
  },
  disabledText: { color: Colors.textMuted },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  errorText: {
    fontSize: Typography.xs,
    color: Colors.error,
    flex: 1,
  },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md, marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  title: {
    fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary,
  },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: Spacing.md },
  parishRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  parishRowSelected: { backgroundColor: `${Colors.gold}08` },
  parishName: {
    flex: 1, fontSize: Typography.base, color: Colors.textPrimary, fontWeight: Typography.medium,
  },
  parishNameSelected: { color: Colors.gold, fontWeight: Typography.bold },
  cancelBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cancelText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
});
