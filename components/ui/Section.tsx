// components/ui/Section.tsx
// Stage 4 — Reusable section wrapper with optional title, subtitle, and header action.

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface SectionProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Right-side action label (e.g. "See All") */
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ComponentProps<typeof MaterialIcons>['name'];
  /** Apply a card-style background to the section body */
  card?: boolean;
  /** Remove horizontal padding from children */
  flush?: boolean;
  style?: ViewStyle;
  headerStyle?: ViewStyle;
  contentStyle?: ViewStyle;
}

export function Section({
  children,
  title,
  subtitle,
  actionLabel,
  onAction,
  actionIcon,
  card = false,
  flush = false,
  style,
  headerStyle,
  contentStyle,
}: SectionProps) {
  const hasHeader = title || actionLabel;

  return (
    <View style={[styles.section, style]}>
      {hasHeader ? (
        <View style={[styles.header, headerStyle]}>
          <View style={styles.headerLeft}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {(actionLabel || actionIcon) && onAction ? (
            <Pressable
              onPress={onAction}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.actionLabel}>{actionLabel}</Text>
              {actionIcon ? (
                <MaterialIcons name={actionIcon} size={14} color={Colors.primary} />
              ) : (
                <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.primary} />
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          card && styles.cardBody,
          flush ? null : styles.contentPadded,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

interface DividerProps {
  inset?: number;
  style?: ViewStyle;
}

export function Divider({ inset = 0, style }: DividerProps) {
  return (
    <View
      style={[
        styles.divider,
        inset ? { marginLeft: inset } : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  headerLeft: { flex: 1, gap: 2 },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: Typography.sm,
    color: Colors.primary,
    fontWeight: Typography.semibold,
  },

  cardBody: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  contentPadded: {},

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: Spacing.base,
  },
});
