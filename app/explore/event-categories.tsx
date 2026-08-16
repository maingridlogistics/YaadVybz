// ─── Event Category Directory ─────────────────────────────────────────────────
// Shows all event types/categories.
// Tap any category → dedicated Event Category discovery page.

import React from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useCategories } from '../../hooks/useCategories';

export default function EventCategoriesScreen() {
  const router = useRouter();
  const { eventTypes } = useCategories();

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Event Categories</Text>
            <Text style={s.subtitle}>Find events by type across Jamaica</Text>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={eventTypes}
        keyExtractor={(t) => t.id}
        numColumns={3}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.grid}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: type }) => (
          <Pressable
            onPress={() => router.push({
              pathname: '/explore/event-category',
              params: { typeId: type.id, typeLabel: type.label, typeIcon: type.icon, typeColor: type.color },
            } as any)}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.82 }]}
          >
            <View style={[s.iconRing, { backgroundColor: `${type.color}20` }]}>
              <MaterialIcons name={type.icon as any} size={28} color={type.color} />
            </View>
            <Text style={[s.cardLabel, { color: type.color }]} numberOfLines={2}>
              {type.label}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={<View style={{ height: 80 }} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  grid: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  card: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs,
    gap: Spacing.xs, minHeight: 96,
  },
  iconRing: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 11, fontWeight: Typography.semibold,
    textAlign: 'center', lineHeight: 14, paddingHorizontal: 2,
  },
});
