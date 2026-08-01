import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { TYPE_COLORS } from '../../constants/data';

interface BadgeProps {
  label: string;
  type?: 'type' | 'parish' | 'tag' | 'role';
  eventType?: string;
  small?: boolean;
}

export function Badge({ label, type = 'tag', eventType, small = false }: BadgeProps) {
  const bgColor = eventType
    ? `${TYPE_COLORS[eventType]}22`
    : type === 'parish'
    ? Colors.goldSurface
    : type === 'role'
    ? Colors.greenSurface
    : Colors.surfaceElevated;

  const textColor = eventType
    ? TYPE_COLORS[eventType]
    : type === 'parish'
    ? Colors.gold
    : type === 'role'
    ? Colors.greenLight
    : Colors.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, small && styles.small]}>
      <Text style={[styles.label, { color: textColor }, small && styles.smallLabel]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
  },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  smallLabel: {
    fontSize: Typography.xs,
  },
});
