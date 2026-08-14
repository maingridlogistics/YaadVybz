// components/ui/MenuRow.tsx
// Stage 4 — Reusable settings/menu row for Profile, Settings, Admin, Promoter tools.
// Structure: Icon | Label / optional subtitle | optional badge | Chevron

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface MenuRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  iconColor?: string;
  iconBackground?: string;
  title: string;
  subtitle?: string;
  badge?: string | number;
  badgeColor?: string;
  rightLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  showChevron?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function MenuRow({
  icon,
  iconColor,
  iconBackground,
  title,
  subtitle,
  badge,
  badgeColor = Colors.primary,
  rightLabel,
  destructive = false,
  disabled = false,
  showChevron = true,
  onPress,
  style,
  accessibilityLabel,
}: MenuRowProps) {
  const resolvedIconColor = destructive ? Colors.error : (iconColor ?? Colors.primary);
  const resolvedIconBg = destructive ? Colors.errorSoft : (iconBackground ?? `${resolvedIconColor}12`);
  const resolvedTitleColor = destructive ? Colors.error : (disabled ? Colors.textDisabled : Colors.textPrimary);

  const content = (
    <View style={[styles.row, disabled && styles.rowDisabled, style]}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: resolvedIconBg }]}>
        <MaterialIcons name={icon} size={20} color={disabled ? Colors.textDisabled : resolvedIconColor} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: resolvedTitleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      {/* Right side */}
      <View style={styles.right}>
        {badge !== undefined ? (
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        {rightLabel ? (
          <Text style={styles.rightLabel}>{rightLabel}</Text>
        ) : null}
        {showChevron && onPress ? (
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={disabled ? Colors.textDisabled : Colors.textMuted}
          />
        ) : null}
      </View>
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityRole="button"
        style={({ pressed }) => [pressed && { opacity: 0.75 }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// ─── Menu Section Wrapper ─────────────────────────────────────────────────────
// Groups menu rows visually with an optional title.

interface MenuSectionProps {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
}

export function MenuSection({ children, title, style }: MenuSectionProps) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionCard}>
        {React.Children.map(children, (child, i) => {
          const isLast = i === React.Children.count(children) - 1;
          return (
            <>
              {child}
              {!isLast ? <View style={styles.divider} /> : null}
            </>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    minHeight: 56,
  },
  rowDisabled: { opacity: 0.5 },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  content: { flex: 1, gap: 2 },
  title: {
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },

  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
  },
  rightLabel: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },

  // Section
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.base,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: Spacing.base + 36 + Spacing.md, // align after icon
  },
});
