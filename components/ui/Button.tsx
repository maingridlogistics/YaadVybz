import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.textOnGold : Colors.gold}
          size="small"
        />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`], styles[`${size}Label`]]}>
          {label}
        </Text>
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
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.45,
  },

  // Variants
  primary: {
    backgroundColor: Colors.gold,
  },
  secondary: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  danger: {
    backgroundColor: Colors.error,
  },

  // Sizes
  sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, height: 36 },
  md: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, height: 48 },
  lg: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, height: 56 },

  // Labels
  label: {
    fontWeight: Typography.bold,
    letterSpacing: 0.3,
  },
  primaryLabel: { color: Colors.textOnGold },
  secondaryLabel: { color: Colors.textPrimary },
  ghostLabel: { color: Colors.gold },
  dangerLabel: { color: Colors.textPrimary },

  smLabel: { fontSize: Typography.sm },
  mdLabel: { fontSize: Typography.base },
  lgLabel: { fontSize: Typography.md },
});
