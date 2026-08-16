// ─── Business Combined Results ─────────────────────────────────────────────────
// Canonical convergence page for Parish + Category combined business discovery.
// Both navigation paths converge here:
//   Parish-first:    /explore/business-parish?parish=X → tap category chip → /explore/business-results?parish=X&categoryId=Y
//   Category-first:  /explore/business-category?categoryId=Y → tap parish → /explore/business-results?parish=X&categoryId=Y
//
// Deep-link: /explore/business-results?parish=Manchester&categoryId=xxx&categoryLabel=Barbers

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  BusinessSearchResult,
  searchBusinesses,
} from '../../services/businessService';

const LIMIT = 40;

// ─── Business result row ──────────────────────────────────────────────────────
const BizRow = memo(function BizRow({
  biz,
  onPress,
}: {
  biz: BusinessSearchResult;
  onPress: () => void;
}) {
  const locationStr = biz.serves_parish
    ? `Serves ${biz.primary_parish}`
    : biz.town
    ? `${biz.town}, ${biz.primary_parish}`
    : biz.primary_parish;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [br.card, pressed && { opacity: 0.82 }]}>
      <View style={br.thumbWrap}>
        {biz.cover_url ?? biz.logo_url ? (
          <Image source={{ uri: (biz.cover_url ?? biz.logo_url)! }} style={br.thumb} contentFit="cover" transition={200} />
        ) : (
          <View style={[br.thumb, br.thumbPh]}>
            <MaterialIcons name={biz.category_icon as any} size={24} color={biz.category_color} />
          </View>
        )}
      </View>
      <View style={br.body}>
        <View style={br.nameRow}>
          <Text style={br.name} numberOfLines={1}>{biz.name}</Text>
          {biz.verified ? <MaterialIcons name="verified" size={13} color={Colors.gold} /> : null}
        </View>
        <View style={br.meta}>
          <View style={[br.dot, { backgroundColor: biz.category_color }]} />
          <Text style={[br.catLabel, { color: biz.category_color }]}>{biz.category_label}</Text>
          <Text style={br.sep}>·</Text>
          <MaterialIcons
            name={biz.serves_parish ? 'near-me' : 'place'}
            size={10}
            color={biz.serves_parish ? Colors.info : Colors.textMuted}
          />
          <Text style={[br.location, biz.serves_parish && { color: Colors.info }]} numberOfLines={1}>
            {locationStr}
          </Text>
        </View>
        {biz.avg_rating != null && biz.avg_rating > 0 ? (
          <View style={br.ratingRow}>
            <MaterialIcons name="star" size={11} color={Colors.gold} />
            <Text style={br.ratingVal}>{biz.avg_rating.toFixed(1)}</Text>
            {biz.review_count > 0 ? <Text style={br.reviewCt}>({biz.review_count})</Text> : null}
          </View>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </Pressable>
  );
});

const br = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.sm, minHeight: 80, paddingRight: Spacing.sm,
  },
  thumbWrap: { width: 80, height: 80, flexShrink: 0 },
  thumb: { width: 80, height: 80 },
  thumbPh: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  catLabel: { fontSize: 11, fontWeight: Typography.semibold, flexShrink: 0 },
  sep: { fontSize: 10, color: Colors.textMuted, flexShrink: 0 },
  location: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingVal: { fontSize: 12, fontWeight: Typography.bold, color: Colors.gold },
  reviewCt: { fontSize: 10, color: Colors.textMuted },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BusinessResultsScreen() {
  const { parish, categoryId, categoryLabel, categoryIcon, categoryColor } =
    useLocalSearchParams<{
      parish: string;
      categoryId: string;
      categoryLabel?: string;
      categoryIcon?: string;
      categoryColor?: string;
    }>();
  const router = useRouter();

  const color = categoryColor ?? Colors.gold;
  const icon = categoryIcon ?? 'storefront';
  const label = categoryLabel ?? 'Businesses';

  const [businesses, setBusinesses] = useState<BusinessSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchText, setSearchText] = useState('');

  const loadResults = useCallback(
    async (query: string, off: number, append: boolean) => {
      if (off === 0) setLoading(true);
      else setLoadingMore(true);
      const { results } = await searchBusinesses({
        parish,
        categoryId,
        query: query.trim() || null,
        limit: LIMIT,
        offset: off,
      });
      setBusinesses((prev) => (append ? [...prev, ...results] : results));
      setHasMore(results.length === LIMIT);
      setOffset(off + results.length);
      setLoading(false);
      setLoadingMore(false);
    },
    [parish, categoryId]
  );

  useEffect(() => {
    loadResults('', 0, false);
  }, [loadResults]);

  useEffect(() => {
    if (searchText.trim() !== '') {
      loadResults(searchText, 0, false);
    } else {
      loadResults('', 0, false);
    }
  }, [searchText, loadResults]);

  const count = businesses.length;
  const servesCount = businesses.filter((b) => b.serves_parish).length;

  const handleBusinessPress = useCallback(
    (id: string) => router.push(`/business/${id}` as any),
    [router]
  );

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        {/* Header — discovery style: parish context above category title */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.context}>{parish}</Text>
            <View style={s.titleRow}>
              <View style={[s.catDot, { backgroundColor: color }]} />
              <Text style={s.title} numberOfLines={1}>{label}</Text>
            </View>
            <Text style={s.subtitle}>
              {loading ? 'Loading...' : `${count}${hasMore ? '+' : ''} ${count === 1 ? 'business' : 'businesses'}`}
            </Text>
          </View>
        </View>

        {/* Contextual search */}
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search ${label} in ${parish}...`}
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </SafeAreaView>

      <FlatList
        data={businesses}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <BizRow biz={item} onPress={() => handleBusinessPress(item.id)} />
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasMore && !loadingMore) loadResults(searchText, offset, true);
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            {servesCount > 0 && (
              <View style={s.servesNote}>
                <MaterialIcons name="near-me" size={12} color={Colors.info} />
                <Text style={s.servesText}>
                  {servesCount} business{servesCount !== 1 ? 'es' : ''} serve{servesCount === 1 ? 's' : ''}{' '}
                  {parish} but {servesCount === 1 ? 'is' : 'are'} based elsewhere
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={s.loaderText}>Finding {label} in {parish}...</Text>
            </View>
          ) : (
            <View style={s.emptyState}>
              <MaterialIcons name="storefront" size={36} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>No {label} in {parish} yet</Text>
              <Text style={s.emptySub}>
                Try another category or browse businesses that serve {parish}.
              </Text>
              <Pressable onPress={() => router.back()} style={s.backToParishBtn}>
                <Text style={s.backToParishText}>Back to {parish}</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={Colors.gold} style={{ paddingVertical: Spacing.xl }} />
          ) : (
            <View style={{ height: 100 }} />
          )
        }
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
    flexShrink: 0,
  },
  context: { fontSize: Typography.xs, color: Colors.textMuted, letterSpacing: 0.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 1 },
  catDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  subtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 42, backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base, marginVertical: Spacing.sm,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1, fontSize: Typography.sm, color: Colors.textPrimary,
    paddingVertical: 0, includeFontPadding: false,
  },
  listContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  servesNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: `${Colors.info}10`, borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: `${Colors.info}28`, marginBottom: Spacing.sm,
  },
  servesText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  loader: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  loaderText: { fontSize: Typography.sm, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  backToParishBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs,
  },
  backToParishText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
