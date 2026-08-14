// components/ui/AppBadge.tsx
// Stage 4 — Reusable badge/chip system for the light theme design system.

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export type BadgeVariant =
  | 'default'
  | 'brand'
  | 'success'
  | 'warning'
  | 'error'
  | 'premium'
  | 'neutral'
  | 'admin'
  | 'promoter'
  | 'featured'
  | 'soldOut'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'live'
  | 'info';

export type BadgeSize = 'sm' | 'md';

interface AppBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  style?: ViewStyle;
  customColor?: string;
  customBackground?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string; border?: string }> = {
  default:   { bg: Colors.surfaceSecondary,  text: Colors.textSecondary },
  brand:     { bg: Colors.primarySoft,       text: Colors.primary,        border: Colors.primaryBorder },
  success:   { bg: Colors.successSoft,       text: Colors.success,        border: Colors.successBorder },
  warning:   { bg: Colors.warningSoft,       text: Colors.warning,        border: Colors.warningBorder },
  error:     { bg: Colors.errorSoft,         text: Colors.error,          border: Colors.errorBorder },
  premium:   { bg: Colors.goldSoft,          text: Colors.gold,           border: Colors.goldBorder },
  neutral:   { bg: Colors.surfaceSecondary,  text: Colors.textMuted },
  admin:     { bg: Colors.primarySoft,       text: Colors.primary,        border: Colors.primaryBorder },
  promoter:  { bg: Colors.goldSoft,          text: Colors.gold,           border: Colors.goldBorder },
  featured:  { bg: Colors.goldSoft,          text: Colors.gold,           border: Colors.goldBorder },
  soldOut:   { bg: Colors.errorSoft,         text: Colors.error,          border: Colors.errorBorder },
  pending:   { bg: Colors.warningSoft,       text: Colors.warning,        border: Colors.warningBorder },
  approved:  { bg: Colors.successSoft,       text: Colors.success,        border: Colors.successBorder },
  rejected:  { bg: Colors.errorSoft,         text: Colors.error,          border: Colors.errorBorder },
  active:    { bg: Colors.successSoft,       text: Colors.success,        border: Colors.successBorder },
  live:      { bg: Colors.primarySoft,       text: Colors.primary,        border: Colors.primaryBorder },
  info:      { bg: Colors.infoSoft,          text: Colors.info,           border: Colors.infoBorder },
};

export function AppBadge({
  label,
  variant = 'default',
  size = 'md',
  dot = false,
  style,
  customColor,
  customBackground,
}: AppBadgeProps) {
  const config = VARIANT_STYLES[variant];

  return (
    <View
      style={[
        styles.badge,
        styles[`size_${size}`],
        {
          backgroundColor: customBackground ?? config.bg,
          borderColor: config.border ?? 'transparent',
          borderWidth: config.border ? 1 : 0,
        },
        style,
      ]}
    >
      {dot ? (
        <View style={[styles.dot, { backgroundColor: customColor ?? config.text }]} />
      ) : null}
      <Text
        style={[
          styles.label,
          styles[`label_${size}`],
          { color: customColor ?? config.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    gap: 4,
  },
  size_sm: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  size_md: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  label: {
    fontWeight: Typography.semibold,
  },
  label_sm: {
    fontSize: Typography.xs,
  },
  label_md: {
    fontSize: Typography.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
