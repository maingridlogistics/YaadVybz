// components/ui/AppCard.tsx
// Stage 4 — Reusable card primitives for the light theme design system.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';

// ─── Basic Card ───────────────────────────────────────────────────────────────

interface AppCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  elevated?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  accessibilityLabel?: string;
}

export function AppCard({
  children,
  style,
  onPress,
  elevated = false,
  padding = 'md',
  accessibilityLabel,
}: AppCardProps) {
  const paddingValue = padding === 'none' ? 0 : padding === 'sm' ? Spacing.sm : padding === 'lg' ? Spacing.xl : Spacing.base;

  const inner = (
    <View
      style={[
        styles.card,
        elevated && Shadows.card,
        { padding: paddingValue },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        style={({ pressed }) => [pressed && { opacity: 0.88 }]}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
// For dashboard metrics.

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  accentColor?: string;
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  accentColor = Colors.primary,
  style,
}: StatCardProps) {
  const trendColor = trend === 'up' ? Colors.success : trend === 'down' ? Colors.error : Colors.textMuted;
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <View style={[styles.statCard, style]}>
      <View style={styles.statHeader}>
        {icon ? (
          <View style={[styles.statIconWrap, { backgroundColor: `${accentColor}14` }]}>
            {icon}
          </View>
        ) : null}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: accentColor }]}>{value}</Text>
      {trendLabel ? (
        <View style={styles.statTrendRow}>
          <Text style={[styles.statTrendText, { color: trendColor }]}>
            {trend ? trendIcon : ''} {trendLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Action Card ──────────────────────────────────────────────────────────────
// For Profile / Admin / Promoter action items.

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  rightContent?: React.ReactNode;
  accentColor?: string;
  style?: ViewStyle;
}

export function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  rightContent,
  accentColor = Colors.primary,
  style,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }, style]}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: `${accentColor}12` }]}>
        {icon}
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightContent ?? (
        <View style={styles.actionChevron}>
          <Text style={[styles.actionChevronText, { color: accentColor }]}>›</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Basic Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.card,
  },

  // Stat Card
  statCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    gap: Spacing.xs,
    ...Shadows.card,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
    flex: 1,
  },
  statValue: {
    fontSize: Typography.xxl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  statTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statTrendText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },

  // Action Card
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
    ...Shadows.card,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionContent: { flex: 1, gap: 2 },
  actionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  actionSubtitle: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  actionChevron: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceSecondary,
  },
  actionChevronText: {
    fontSize: 20,
    fontWeight: Typography.bold,
    lineHeight: 24,
  },
});
