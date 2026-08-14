// components/ui/LoadingState.tsx
// Stage 4 — Reusable loading states for the light theme design system.

import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Animated, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

// ─── Full-screen spinner ──────────────────────────────────────────────────────

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export function LoadingState({ message, fullScreen = false, style }: LoadingStateProps) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen, style]}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

// ─── Skeleton block ───────────────────────────────────────────────────────────

interface SkeletonBlockProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = Radius.sm,
  style,
}: SkeletonBlockProps) {
  return (
    <View
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius: radius },
        style,
      ]}
    />
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

interface SkeletonCardProps {
  style?: ViewStyle;
}

export function SkeletonCard({ style }: SkeletonCardProps) {
  return (
    <View style={[styles.skeletonCard, style]}>
      <SkeletonBlock height={160} radius={Radius.md} style={{ marginBottom: Spacing.md }} />
      <SkeletonBlock height={16} width="75%" style={{ marginBottom: Spacing.sm }} />
      <SkeletonBlock height={12} width="55%" style={{ marginBottom: Spacing.sm }} />
      <SkeletonBlock height={12} width="40%" />
    </View>
  );
}

// ─── Skeleton list row ────────────────────────────────────────────────────────

interface SkeletonRowProps {
  hasAvatar?: boolean;
  style?: ViewStyle;
}

export function SkeletonRow({ hasAvatar = false, style }: SkeletonRowProps) {
  return (
    <View style={[styles.skeletonRow, style]}>
      {hasAvatar ? (
        <SkeletonBlock width={44} height={44} radius={22} style={{ flexShrink: 0 }} />
      ) : null}
      <View style={styles.skeletonRowContent}>
        <SkeletonBlock height={14} width="70%" style={{ marginBottom: Spacing.xs }} />
        <SkeletonBlock height={12} width="45%" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  fullScreen: {
    flex: 1,
  },
  message: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Skeleton
  skeleton: {
    backgroundColor: Colors.surfaceSecondary,
    overflow: 'hidden',
  },
  skeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.base,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  skeletonRowContent: {
    flex: 1,
    gap: Spacing.xs,
  },
});
