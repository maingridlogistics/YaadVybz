// components/ui/EmptyState.tsx
// Stage 4 — Reusable empty state component for the light theme design system.

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { AppButton } from './AppButton';

interface EmptyStateProps {
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

export function EmptyState({
  icon = 'inbox',
  illustration,
  title,
  description,
  ctaLabel,
  onCta,
  secondaryCtaLabel,
  onSecondaryCta,
  style,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {/* Illustration or icon */}
      {illustration ?? (
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
          <MaterialIcons
            name={icon}
            size={compact ? 32 : 44}
            color={Colors.textMuted}
          />
        </View>
      )}

      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>

      {description ? (
        <Text style={[styles.description, compact && styles.descriptionCompact]}>
          {description}
        </Text>
      ) : null}

      {ctaLabel && onCta ? (
        <AppButton
          label={ctaLabel}
          onPress={onCta}
          variant="primary"
          size={compact ? 'sm' : 'md'}
          style={styles.cta}
        />
      ) : null}

      {secondaryCtaLabel && onSecondaryCta ? (
        <AppButton
          label={secondaryCtaLabel}
          onPress={onSecondaryCta}
          variant="ghost"
          size={compact ? 'sm' : 'md'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  containerCompact: {
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.sm,
  },
  iconWrapCompact: {
    width: 60,
    height: 60,
    borderRadius: Radius.lg,
    marginBottom: 0,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  titleCompact: { fontSize: Typography.base },
  description: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  descriptionCompact: { fontSize: Typography.sm, lineHeight: 20 },
  cta: { marginTop: Spacing.sm, minWidth: 160 },
});
