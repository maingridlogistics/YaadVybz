// components/ui/AppButton.tsx
// Stage 4 — Reusable Button component for the light theme design system.

import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  fullWidth?: boolean;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  iconPosition?: 'left' | 'right';
  accessibilityLabel?: string;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  labelStyle,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  accessibilityLabel,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;

  const iconColor =
    variant === 'primary' ? Colors.textOnPrimary
    : variant === 'destructive' ? '#FFFFFF'
    : variant === 'ghost' ? Colors.primary
    : Colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles[`pressed_${variant}`],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'destructive' ? '#FFFFFF' : Colors.primary}
          size="small"
        />
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' && (
            <MaterialIcons
              name={icon}
              size={iconSize}
              color={iconColor}
              style={{ marginRight: Spacing.xs }}
            />
          )}
          <Text
            style={[
              styles.label,
              styles[`label_${variant}`],
              styles[`label_${size}`],
              isDisabled && styles.labelDisabled,
              labelStyle,
            ]}
          >
            {label}
          </Text>
          {icon && iconPosition === 'right' && (
            <MaterialIcons
              name={icon}
              size={iconSize}
              color={iconColor}
              style={{ marginLeft: Spacing.xs }}
            />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.42,
  },

  // ── Variants ──────────────────────────────────────────────────────────────
  variant_primary: {
    backgroundColor: Colors.primary,
  },
  variant_secondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  variant_destructive: {
    backgroundColor: Colors.error,
  },

  // ── Pressed states ────────────────────────────────────────────────────────
  pressed_primary: { backgroundColor: Colors.primaryDark, opacity: 0.92 },
  pressed_secondary: { backgroundColor: Colors.surfaceSecondary, opacity: 0.9 },
  pressed_ghost: { backgroundColor: Colors.primarySoft, opacity: 0.9 },
  pressed_destructive: { backgroundColor: Colors.errorLight, opacity: 0.92 },

  // ── Sizes ─────────────────────────────────────────────────────────────────
  size_sm: { paddingHorizontal: Spacing.md, height: 36, borderRadius: Radius.sm },
  size_md: { paddingHorizontal: Spacing.lg, height: 48, borderRadius: Radius.md },
  size_lg: { paddingHorizontal: Spacing.xl, height: 56, borderRadius: Radius.lg },

  // ── Labels ────────────────────────────────────────────────────────────────
  label: {
    fontWeight: Typography.bold,
    letterSpacing: 0.2,
  },
  label_primary: { color: Colors.textOnPrimary },
  label_secondary: { color: Colors.textPrimary },
  label_ghost: { color: Colors.primary },
  label_destructive: { color: '#FFFFFF' },
  labelDisabled: { color: Colors.disabledText },

  label_sm: { fontSize: Typography.sm },
  label_md: { fontSize: Typography.base },
  label_lg: { fontSize: Typography.md },
});
