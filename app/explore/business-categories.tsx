// ─── Business Category Directory ─────────────────────────────────────────────
// Shows all enabled business categories.
// Tap any category → dedicated Business Category discovery page.

import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useBusinesses } from '../../hooks/useBusinesses';

export default function BusinessCategoriesScreen() {
  const router = useRouter();
  const { categories, loadCategories } = useBusinesses();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    loadCategories().finally(() => setLoading(false));
  }, [loadCategories]);

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Business Categories</Text>
            <Text style={s.subtitle}>Discover businesses across Jamaica</Text>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          numColumns={3}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: cat }) => (
            <Pressable
              onPress={() => router.push({
                pathname: '/explore/business-category',
                params: { categoryId: cat.id, categoryLabel: cat.label, categoryIcon: cat.icon, categoryColor: cat.color },
              } as any)}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.82 }]}
            >
              <View style={[s.iconRing, { backgroundColor: `${cat.color}20` }]}>
                <MaterialIcons name={cat.icon as any} size={28} color={cat.color} />
              </View>
              <Text style={[s.cardLabel, { color: cat.color }]} numberOfLines={2}>
                {cat.label}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      )}
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
