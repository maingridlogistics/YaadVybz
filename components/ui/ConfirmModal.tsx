// components/ui/ConfirmModal.tsx
// Stage 4 — Reusable confirmation dialog / bottom sheet for the light theme design system.
// Cross-platform: uses React Native Modal (works on iOS, Android, Web).
// Preserves the cross-platform modal approach already used in deletion workflow.

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';
import { AppButton } from './AppButton';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Label for the confirm/primary action. Default: 'Confirm' */
  confirmLabel?: string;
  /** Label for the cancel action. Default: 'Cancel' */
  cancelLabel?: string;
  /** If true, confirm button uses destructive (red) styling. */
  destructive?: boolean;
  /** Show loading spinner in confirm button. */
  loading?: boolean;
  /** Icon shown in the header area. */
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.base) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          {icon ? (
            <View style={[
              styles.iconWrap,
              destructive ? styles.iconWrapDestructive : styles.iconWrapDefault,
            ]}>
              <MaterialIcons
                name={icon}
                size={28}
                color={destructive ? Colors.error : Colors.primary}
              />
            </View>
          ) : null}

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Message */}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {/* Actions */}
          <View style={styles.actions}>
            <AppButton
              label={cancelLabel}
              onPress={onCancel}
              variant="secondary"
              size="md"
              disabled={loading}
              style={{ flex: 1 }}
            />
            <AppButton
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'destructive' : 'primary'}
              size="md"
              loading={loading}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── InfoModal (non-interactive acknowledgement) ──────────────────────────────

interface InfoModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onConfirm: () => void;
}

export function InfoModal({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  icon = 'info-outline',
  onConfirm,
}: InfoModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onConfirm}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.base) }]}>
          <View style={styles.iconWrapDefault}>
            <MaterialIcons name={icon} size={28} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <AppButton
            label={confirmLabel}
            onPress={onConfirm}
            variant="primary"
            size="md"
            fullWidth
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.modal,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  iconWrapDefault: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  iconWrapDestructive: {
    backgroundColor: Colors.errorSoft,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: Spacing.sm,
  },
});
