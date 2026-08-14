// components/ui/ErrorState.tsx
// Stage 4 — Reusable error state component for the light theme design system.

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { AppButton } from './AppButton';

// ─── Full-screen / section error state ───────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  /** User-friendly message. Never show raw stack traces here. */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again. If the problem continues, contact support.',
  onRetry,
  retryLabel = 'Try Again',
  fullScreen = false,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen, style]}>
      <View style={styles.iconWrap}>
        <MaterialIcons name="error-outline" size={40} color={Colors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {onRetry ? (
        <AppButton
          label={retryLabel}
          onPress={onRetry}
          variant="secondary"
          size="md"
          icon="refresh"
          style={styles.retryBtn}
        />
      ) : null}
    </View>
  );
}

// ─── Inline error (form field / banner) ──────────────────────────────────────

interface InlineErrorProps {
  message: string;
  style?: ViewStyle;
}

export function InlineError({ message, style }: InlineErrorProps) {
  if (!message) return null;
  return (
    <View style={[styles.inlineError, style]}>
      <MaterialIcons name="error-outline" size={14} color={Colors.error} />
      <Text style={styles.inlineErrorText}>{message}</Text>
    </View>
  );
}

// ─── Error banner (top of screen) ────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  style?: ViewStyle;
}

export function ErrorBanner({ message, onDismiss, style }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <View style={[styles.banner, style]}>
      <MaterialIcons name="error" size={16} color={Colors.error} style={{ flexShrink: 0 }} />
      <Text style={styles.bannerText}>{message}</Text>
      {onDismiss ? (
        <MaterialIcons
          name="close"
          size={16}
          color={Colors.error}
          style={{ flexShrink: 0 }}
          onPress={onDismiss}
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
  fullScreen: { flex: 1, justifyContent: 'center' },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.xl,
    backgroundColor: Colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.errorBorder,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  retryBtn: { marginTop: Spacing.sm },

  // Inline error
  inlineError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: 4,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.error,
    lineHeight: 16,
  },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.errorSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
    padding: Spacing.md,
  },
  bannerText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.error,
    lineHeight: 20,
  },
});
