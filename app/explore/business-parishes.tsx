// ─── Business Parish Directory ────────────────────────────────────────────────
// Shows all 14 Jamaican parishes with business counts.
// Tap any parish → dedicated Business Parish discovery page.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { getParishImage } from '../../constants/parishImages';
import { fetchBusinessCountsByParish } from '../../services/businessService';

export default function BusinessParishesScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBusinessCountsByParish()
      .then(setCounts)
      .finally(() => setLoading(false));
  }, []);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Business Parishes</Text>
            <Text style={s.subtitle}>{total} businesses across Jamaica</Text>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <FlatList
          data={[...JAMAICA_PARISHES]}
          keyExtractor={(p) => p}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: parish }) => {
            const count = counts[parish] ?? 0;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/explore/business-parish', params: { parish } } as any)}
                style={({ pressed }) => [s.card, pressed && { opacity: 0.82 }]}
              >
                <Image
                  source={getParishImage(parish)}
                  style={s.cardImg}
                  contentFit="cover"
                  transition={200}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.82)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={s.cardContent}>
                  <Text style={s.cardName} numberOfLines={1}>{parish}</Text>
                  <View style={s.countRow}>
                    <MaterialIcons name="storefront" size={11} color={Colors.gold} />
                    <Text style={s.countText}>
                      {count} {count === 1 ? 'business' : 'businesses'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
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
    flex: 1, height: 110, borderRadius: Radius.lg, overflow: 'hidden',
    position: 'relative', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cardImg: { ...StyleSheet.absoluteFillObject },
  cardContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.sm, gap: 3,
  },
  cardName: { fontSize: 13, fontWeight: Typography.bold, color: '#fff' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },
});
