import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { PARISHES } from '../../constants/data';

export interface JamaicaMapProps {
  parishCounts: Record<string, number>;
  selectedParish: string | null;
  onParishPress: (parish: string) => void;
  style?: any;
  /** Override the active-pin color. Defaults to Colors.gold (events). */
  markerColor?: string;
}

// Web fallback — interactive parish grid (react-native-maps not available on web)
export function JamaicaMap({ parishCounts, selectedParish, onParishPress, style, markerColor }: JamaicaMapProps) {
  const activeColor = markerColor ?? Colors.gold;
  return (
    <View style={[styles.container, style]}>
      <View style={styles.banner}>
        <MaterialIcons name="map" size={16} color={Colors.gold} />
        <Text style={styles.bannerText}>Interactive map available on iOS & Android</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {PARISHES.map((parish) => {
          const count = parishCounts[parish] ?? 0;
          const isSelected = selectedParish === parish;
          return (
            <Pressable
              key={parish}
              onPress={() => onParishPress(parish)}
              style={({ pressed }) => [
                styles.parishTile,
                count > 0 && styles.parishTileActive,
                isSelected && styles.parishTileSelected,
              count > 0 && !isSelected && { borderColor: `${activeColor}55`, backgroundColor: `${activeColor}15` },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialIcons
                name="place"
                size={18}
                color={isSelected ? '#fff' : count > 0 ? activeColor : Colors.textMuted}
              />
              <Text style={[
                styles.parishName,
                isSelected && { color: '#fff', fontWeight: '700' },
              ]} numberOfLines={2}>
                {parish}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, { backgroundColor: activeColor }, isSelected && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#071a0d',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
  },
  bannerText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    alignItems: 'flex-start',
  },
  parishTile: {
    width: 90,
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 4,
    minHeight: 80,
    justifyContent: 'center',
  },
  parishTileActive: {
    borderColor: `${Colors.gold}55`,
    backgroundColor: Colors.goldSurface,
  },
  parishTileSelected: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  parishName: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 13,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textOnGold,
  },
});
