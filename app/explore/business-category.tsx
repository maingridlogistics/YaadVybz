// ─── Business Category Discovery Page ────────────────────────────────────────
// Dedicated discovery destination for a single business category, Jamaica-wide.
// Shows:
//   - Category heading + count
//   - Parish rail to narrow down
//   - Popular businesses in this category
//   - Full list
//
// Tap a parish → /explore/business-results?parish=X&categoryId=Y (canonical combined)
// Deep-link: /explore/business-category?categoryId=xxx&categoryLabel=Barbers

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, Pressable,
  TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { getParishImage } from '../../constants/parishImages';
import {
  BusinessSearchResult,
  searchBusinesses,
  fetchBusinessCountsByParish,
} from '../../services/businessService';
import {
  fetchPromotedBusinesses,
  PromotedBusiness,
  recordPromotionClick,
} from '../../services/businessPromotionService';

const SCREEN_W = Dimensions.get('window').width;
const PARISH_CARD_W = Math.round((SCREEN_W - Spacing.base * 2 - 10 * 2) / 2.5);
const LIMIT = 40;

// ─── Parish rail card ─────────────────────────────────────────────────────────
const ParishRailCard = memo(function ParishRailCard({
  parish,
  count,
  onPress,
}: {
  parish: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { width: PARISH_CARD_W, height: 90, borderRadius: Radius.lg, overflow: 'hidden', flexShrink: 0, borderWidth: 1, borderColor: Colors.surfaceBorder },
        pressed && { opacity: 0.82 },
      ]}
    >
      <Image source={getParishImage(parish)} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFillObject} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.sm, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: Typography.bold, color: '#fff' }} numberOfLines={1}>{parish}</Text>
        {count > 0 ? (
          <Text style={{ fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold }}>
            {count} {count === 1 ? 'business' : 'businesses'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

// ─── Business row ─────────────────────────────────────────────────────────────
const BizRow = memo(function BizRow({
  biz,
  onPress,
  promoted = false,
}: {
  biz: BusinessSearchResult;
  onPress: () => void;
  promoted?: boolean;
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
          {promoted ? (
            <View style={br.promoBadge}>
              <MaterialIcons name="campaign" size={9} color={Colors.gold} />
              <Text style={br.promoBadgeText}>Promoted</Text>
            </View>
          ) : null}
        </View>
        <View style={br.meta}>
          <MaterialIcons name={biz.serves_parish ? 'near-me' : 'place'} size={10} color={biz.serves_parish ? Colors.info : Colors.textMuted} />
          <Text style={[br.location, biz.serves_parish && { color: Colors.info }]} numberOfLines={1}>{locationStr}</Text>
        </View>
        {biz.avg_rating != null && biz.avg_rating > 0 ? (
          <View style={br.ratingRow}>
            <MaterialIcons name="star" size={11} color={Colors.gold} />
            <Text style={br.ratingVal}>{biz.avg_rating.toFixed(1)}</Text>
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
    overflow: 'hidden', marginBottom: Spacing.sm, minHeight: 76, paddingRight: Spacing.sm,
  },
  thumbWrap: { width: 76, height: 76, flexShrink: 0 },
  thumb: { width: 76, height: 76 },
  thumbPh: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingVal: { fontSize: 12, fontWeight: Typography.bold, color: Colors.gold },
  promoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  promoBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.gold, letterSpacing: 0.3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BusinessCategoryScreen() {
  const { categoryId, categoryLabel, categoryIcon, categoryColor } =
    useLocalSearchParams<{
      categoryId: string;
      categoryLabel: string;
      categoryIcon: string;
      categoryColor: string;
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
  const [parishCounts, setParishCounts] = useState<Record<string, number>>({});
  const [featuredBusinesses, setFeaturedBusinesses] = useState<PromotedBusiness[]>([]);

  // Load initial Jamaica-wide businesses for this category
  const loadBusinesses = useCallback(
    async (query: string, off: number, append: boolean) => {
      if (off === 0) setLoading(true);
      else setLoadingMore(true);
      const { results } = await searchBusinesses({
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
    [categoryId]
  );

  useEffect(() => {
    loadBusinesses('', 0, false);
    fetchBusinessCountsByParish().then(setParishCounts);
    fetchPromotedBusinesses({ placement: 'category', categoryId, limit: 4 })
      .then(setFeaturedBusinesses);
  }, [loadBusinesses, categoryId]);

  useEffect(() => {
    if (searchText.trim()) {
      loadBusinesses(searchText, 0, false);
    } else {
      loadBusinesses('', 0, false);
    }
  }, [searchText, loadBusinesses]);

  const handleParishSelect = useCallback(
    (parish: string) => {
      router.push({
        pathname: '/explore/business-results',
        params: { parish, categoryId, categoryLabel: label, categoryIcon: icon, categoryColor: color },
      } as any);
    },
    [router, categoryId, label, icon, color]
  );

  const handleBusinessPress = useCallback(
    (id: string) => router.push(`/business/${id}` as any),
    [router]
  );

  const count = businesses.length;

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={[s.iconWrap, { backgroundColor: `${color}1A` }]}>
            <MaterialIcons name={icon as any} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{label}</Text>
            <Text style={s.subtitle}>
              {loading ? 'Loading...' : `${count}${hasMore ? '+' : ''} businesses across Jamaica`}
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
            placeholder={`Search ${label}...`}
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
          if (hasMore && !loadingMore) loadBusinesses(searchText, offset, true);
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          !searchText.trim() ? (
            <View>
              {/* Browse by Parish */}
              <Text style={s.sectionTitle}>Browse by Parish</Text>
              <View style={s.railOuter}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  contentContainerStyle={s.railContent}
                >
                  {[...JAMAICA_PARISHES].map((parish) => (
                    <ParishRailCard
                      key={parish}
                      parish={parish}
                      count={parishCounts[parish] ?? 0}
                      onPress={() => handleParishSelect(parish)}
                    />
                  ))}
                </ScrollView>
              </View>
              {/* Featured category businesses (paid promotion) */}
              {featuredBusinesses.length > 0 ? (
                <View style={s.featuredSection}>
                  <View style={s.featuredHeader}>
                    <MaterialIcons name="campaign" size={13} color="#9C27B0" />
                    <Text style={s.featuredTitle}>Featured {label}</Text>
                  </View>
                  {featuredBusinesses.map((biz) => (
                    <BizRow
                      key={biz.id}
                      biz={{
                        id: biz.id, name: biz.name, category_id: biz.category_id,
                        category_label: biz.category_label, category_icon: biz.category_icon,
                        category_color: biz.category_color, location_type: biz.location_type,
                        primary_parish: biz.primary_parish, town: biz.town,
                        logo_url: biz.logo_url, cover_url: biz.cover_url,
                        verified: biz.verified, avg_rating: biz.avg_rating,
                        review_count: biz.review_count, serves_parish: false,
                        view_count: 0, slug: '',
                      } as any}
                      promoted
                      onPress={() => {
                        recordPromotionClick(biz.promotion_id, biz.id, 'category').catch(() => {});
                        handleBusinessPress(biz.id);
                      }}
                    />
                  ))}
                </View>
              ) : null}
              <Text style={s.sectionTitle}>All {label}</Text>
            </View>
          ) : (
            <View style={s.searchResultHdr}>
              <MaterialIcons name="search" size={14} color={Colors.gold} />
              <Text style={s.searchResultLabel}>{`"${searchText.trim()}"`}</Text>
              <Text style={s.searchResultCount}>{count} found</Text>
            </View>
          )
        }
        ListEmptyComponent={
          loading ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={s.loaderText}>Finding {label}...</Text>
            </View>
          ) : (
            <View style={s.emptyState}>
              <MaterialIcons name="storefront" size={36} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>No {label} found</Text>
              <Text style={s.emptySub}>Try a different search or browse by parish.</Text>
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
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
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
  listContent: { paddingHorizontal: Spacing.base },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  railOuter: { marginHorizontal: -Spacing.base, marginBottom: Spacing.md },
  railContent: { paddingHorizontal: Spacing.base, gap: 10, paddingBottom: 2 },
  searchResultHdr: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  searchResultLabel: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  searchResultCount: { fontSize: Typography.xs, color: Colors.textMuted },
  featuredSection: { marginBottom: Spacing.md },
  featuredHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  featuredTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#9C27B0', textTransform: 'uppercase', letterSpacing: 0.8 },
  loader: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  loaderText: { fontSize: Typography.sm, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
