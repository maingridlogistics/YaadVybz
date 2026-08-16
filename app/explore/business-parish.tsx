// ─── Business Parish Discovery Page ──────────────────────────────────────────
// Dedicated discovery destination for a single parish.
// Visual reference: Manchester-style page with category chip rail.
//
// Two visual states managed locally:
//   "all"      → Popular Categories grid + Featured Businesses section
//   <catId>    → inline filtered business list for that category
//
// When navigated to from Category page, the categoryId param pre-selects a chip.
// BACK always returns to wherever this page was pushed from.
//
// Deep-link: /explore/business-parish?parish=Manchester
// Deep-link: /explore/business-parish?parish=Manchester&categoryId=xxx

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, Pressable,
  TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { getParishImage } from '../../constants/parishImages';
import { useBusinesses } from '../../hooks/useBusinesses';
import {
  BusinessSearchResult,
  BusinessCategory,
  searchBusinesses,
} from '../../services/businessService';

const SCREEN_W = Dimensions.get('window').width;

// ─── Category chip ────────────────────────────────────────────────────────────
const CategoryChip = memo(function CategoryChip({
  cat,
  selected,
  onPress,
}: {
  cat: BusinessCategory | { id: '__all__'; label: string; icon: string; color: string };
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        ch.chip,
        selected && { backgroundColor: cat.color, borderColor: cat.color },
        pressed && { opacity: 0.8 },
      ]}
    >
      <MaterialIcons
        name={cat.icon as any}
        size={13}
        color={selected ? '#fff' : cat.color}
      />
      <Text style={[ch.label, selected && ch.labelActive]}>
        {cat.label}
      </Text>
    </Pressable>
  );
});

const ch = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  label: { fontSize: 12, color: Colors.textSecondary, fontWeight: Typography.semibold },
  labelActive: { color: '#fff', fontWeight: Typography.bold },
});

// ─── Category rail card (fixed width, horizontal scroll) ────────────────────
const CatRailCard = memo(function CatRailCard({
  cat,
  onPress,
}: {
  cat: BusinessCategory;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cg.card, pressed && { opacity: 0.82 }]}
    >
      <View style={[cg.iconRing, { backgroundColor: `${cat.color}1A` }]}>
        <MaterialIcons name={cat.icon as any} size={24} color={cat.color} />
      </View>
      <Text style={[cg.label, { color: cat.color }]} numberOfLines={2}>
        {cat.label}
      </Text>
    </Pressable>
  );
});

const cg = StyleSheet.create({
  card: {
    width: 88, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 6,
    gap: 6, height: 92, flexShrink: 0,
  },
  iconRing: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 11, fontWeight: Typography.semibold,
    textAlign: 'center', lineHeight: 14, paddingHorizontal: 2,
  },
});

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
          <Image
            source={{ uri: (biz.cover_url ?? biz.logo_url)! }}
            style={br.thumb}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[br.thumb, br.thumbPlaceholder]}>
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
            {biz.review_count > 0 ? (
              <Text style={br.reviewCt}>({biz.review_count})</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </Pressable>
  );
});

const br = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.sm, minHeight: 80, paddingRight: Spacing.sm,
  },
  thumbWrap: { width: 80, height: 80, flexShrink: 0 },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
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

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHdr({ title }: { title: string }) {
  return <Text style={sec.title}>{title}</Text>;
}
const sec = StyleSheet.create({
  title: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: Spacing.sm,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BusinessParishScreen() {
  const { parish, categoryId: initialCatId } = useLocalSearchParams<{
    parish: string;
    categoryId?: string;
  }>();
  const router = useRouter();
  const { categories, loadCategories } = useBusinesses();

  const [selectedCatId, setSelectedCatId] = useState<string | null>(initialCatId ?? null);
  const [searchText, setSearchText] = useState('');

  // Business data
  const [allBusinesses, setAllBusinesses] = useState<BusinessSearchResult[]>([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState<BusinessSearchResult[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingFiltered, setLoadingFiltered] = useState(false);
  const [hasMoreFiltered, setHasMoreFiltered] = useState(false);
  const [filteredOffset, setFilteredOffset] = useState(0);
  const LIMIT = 40;

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load parish-wide businesses for the landing state
  useEffect(() => {
    if (!parish) return;
    setLoadingAll(true);
    searchBusinesses({ parish, limit: 6, offset: 0 })
      .then(({ results }) => setAllBusinesses(results))
      .finally(() => setLoadingAll(false));
  }, [parish]);

  // Load filtered businesses when category or search changes
  const doFilteredSearch = useCallback(
    async (catId: string | null, query: string, offset: number, append: boolean) => {
      if (!parish) return;
      if (offset === 0) setLoadingFiltered(true);
      const { results } = await searchBusinesses({
        parish,
        categoryId: catId,
        query: query.trim() || null,
        limit: LIMIT,
        offset,
      });
      setFilteredBusinesses((prev) => (append ? [...prev, ...results] : results));
      setHasMoreFiltered(results.length === LIMIT);
      setFilteredOffset(offset + results.length);
      setLoadingFiltered(false);
    },
    [parish]
  );

  useEffect(() => {
    if (selectedCatId || searchText.trim()) {
      doFilteredSearch(selectedCatId, searchText, 0, false);
    }
  }, [selectedCatId, searchText, doFilteredSearch]);

  const selectedCat = useMemo(
    () => categories.find((c) => c.id === selectedCatId),
    [categories, selectedCatId]
  );

  const activeCatLabel = selectedCat?.label ?? 'All Categories';
  const totalLabel = selectedCat
    ? `${filteredBusinesses.length}${hasMoreFiltered ? '+' : ''} businesses`
    : `${allBusinesses.length}${allBusinesses.length === 6 ? '+' : ''} businesses`;

  const ALL_CAT = { id: '__all__' as const, label: 'All', icon: 'apps', color: Colors.gold };

  const handleCatSelect = useCallback((catId: string | null) => {
    setSelectedCatId(catId);
    setSearchText('');
    setFilteredOffset(0);
  }, []);

  const handleBusinessPress = useCallback(
    (id: string) => router.push(`/business/${id}` as any),
    [router]
  );

  // Navigate to combined results — used by Category-first path navigating to this parish
  // (no-op here: we handle everything inline since we're already on the parish page)

  const servesCount = filteredBusinesses.filter((b) => b.serves_parish).length;

  const renderBizRow = useCallback(
    ({ item }: { item: BusinessSearchResult }) => (
      <BizRow biz={item} onPress={() => handleBusinessPress(item.id)} />
    ),
    [handleBusinessPress]
  );

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerContent}>
            {/* Parish image strip */}
            <Image
              source={getParishImage(parish ?? '')}
              style={s.headerImg}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.55)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={s.headerText}>
              <Text style={s.parishName}>{parish}</Text>
              <Text style={s.parishCount}>{totalLabel}</Text>
            </View>
          </View>
        </View>

        {/* Category chip rail */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRail}
        >
          <CategoryChip
            cat={ALL_CAT}
            selected={selectedCatId === null}
            onPress={() => handleCatSelect(null)}
          />
          {categories.map((cat) => (
            <CategoryChip
              key={cat.id}
              cat={cat}
              selected={selectedCatId === cat.id}
              onPress={() => handleCatSelect(cat.id)}
            />
          ))}
        </ScrollView>

        {/* Contextual search */}
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={
              selectedCat
                ? `Search ${selectedCat.label} in ${parish}...`
                : `Search businesses in ${parish}...`
            }
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </SafeAreaView>

      {/* ── Content ── */}
      {selectedCatId === null && !searchText.trim() ? (
        /* ALL CATEGORIES LANDING STATE */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.landingContent}
        >
          {/* Popular Categories — horizontal swipeable rail */}
          <SectionHdr title="Popular Categories" />
          {categories.length > 0 ? (
            <View style={s.catRailOuter}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                contentContainerStyle={s.catRailContent}
              >
                {categories.map((cat) => (
                  <CatRailCard
                    key={cat.id}
                    cat={cat}
                    onPress={() => handleCatSelect(cat.id)}
                  />
                ))}
                <Pressable
                  style={({ pressed }) => [cg.card, pressed && { opacity: 0.82 }]}
                  onPress={() =>
                    router.push({ pathname: '/explore/business-categories' } as any)
                  }
                >
                  <View style={[cg.iconRing, { backgroundColor: `${Colors.gold}1A` }]}>
                    <MaterialIcons name="more-horiz" size={24} color={Colors.gold} />
                  </View>
                  <Text style={[cg.label, { color: Colors.gold }]}>All</Text>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}

          {/* Featured Businesses */}
          {allBusinesses.length > 0 ? (
            <View style={s.featuredSection}>
              <SectionHdr title={`Businesses in ${parish}`} />
              {loadingAll ? (
                <ActivityIndicator color={Colors.gold} />
              ) : (
                allBusinesses.map((biz) => (
                  <BizRow
                    key={biz.id}
                    biz={biz}
                    onPress={() => handleBusinessPress(biz.id)}
                  />
                ))
              )}
            </View>
          ) : loadingAll ? (
            <View style={s.loader}>
              <ActivityIndicator color={Colors.gold} />
            </View>
          ) : (
            <View style={s.emptyState}>
              <MaterialIcons name="storefront" size={36} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>No businesses listed yet</Text>
              <Text style={s.emptySub}>Be the first to list your business in {parish}.</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        /* FILTERED STATE — category or search active */
        <FlatList
          data={filteredBusinesses}
          keyExtractor={(b) => b.id}
          renderItem={renderBizRow}
          contentContainerStyle={s.filteredContent}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasMoreFiltered && !loadingFiltered) {
              doFilteredSearch(selectedCatId, searchText, filteredOffset, true);
            }
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View>
              {selectedCat ? (
                <View style={s.resultHeader}>
                  <View style={[s.resultCatDot, { backgroundColor: selectedCat.color }]} />
                  <Text style={[s.resultCatLabel, { color: selectedCat.color }]}>
                    {selectedCat.label}
                  </Text>
                  <Text style={s.resultCount}>
                    {filteredBusinesses.length}{hasMoreFiltered ? '+' : ''} businesses
                  </Text>
                </View>
              ) : searchText.trim() ? (
                <View style={s.resultHeader}>
                  <MaterialIcons name="search" size={14} color={Colors.gold} />
                  <Text style={s.resultSearchLabel}>
                    "{searchText.trim()}" in {parish}
                  </Text>
                  <Text style={s.resultCount}>
                    {filteredBusinesses.length} found
                  </Text>
                </View>
              ) : null}
              {servesCount > 0 && (
                <View style={s.servesNote}>
                  <MaterialIcons name="near-me" size={12} color={Colors.info} />
                  <Text style={s.servesText}>
                    {servesCount} business{servesCount !== 1 ? 'es' : ''} serve{servesCount === 1 ? 's' : ''} {parish} from another location
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loadingFiltered ? (
              <View style={s.loader}>
                <ActivityIndicator size="large" color={Colors.gold} />
                <Text style={s.loaderText}>Finding businesses...</Text>
              </View>
            ) : (
              <View style={s.emptyState}>
                <MaterialIcons name="storefront" size={36} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>
                  {selectedCat ? `No ${selectedCat.label} in ${parish} yet` : 'No businesses found'}
                </Text>
                <Text style={s.emptySub}>
                  Try another category or check businesses that serve {parish}.
                </Text>
                <Pressable onPress={() => handleCatSelect(null)} style={s.clearBtn}>
                  <Text style={s.clearBtnText}>Show All Categories</Text>
                </Pressable>
              </View>
            )
          }
          ListFooterComponent={
            loadingFiltered && filteredBusinesses.length > 0 ? (
              <ActivityIndicator color={Colors.gold} style={{ paddingVertical: Spacing.xl }} />
            ) : (
              <View style={{ height: 100 }} />
            )
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    marginTop: 2, flexShrink: 0, zIndex: 2,
  },
  headerContent: {
    flex: 1, height: 72, borderRadius: Radius.lg, overflow: 'hidden',
    position: 'relative', justifyContent: 'flex-end',
  },
  headerImg: { ...StyleSheet.absoluteFillObject },
  headerText: { padding: Spacing.md },
  parishName: {
    fontSize: 22, fontWeight: Typography.black, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  parishCount: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: Typography.medium },

  // Chip rail
  chipRail: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.xs, flexDirection: 'row', alignItems: 'center',
  },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 42, backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1, fontSize: Typography.sm, color: Colors.textPrimary,
    paddingVertical: 0, includeFontPadding: false,
  },

  // Landing
  landingContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  catRailOuter: { marginHorizontal: -Spacing.base, marginBottom: Spacing.xl },
  catRailContent: {
    paddingHorizontal: Spacing.base, gap: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', paddingVertical: 2,
  },
  featuredSection: { marginBottom: Spacing.md },

  // Filtered
  filteredContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  resultCatDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  resultCatLabel: { fontSize: Typography.md, fontWeight: Typography.black, flex: 1 },
  resultSearchLabel: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted },

  servesNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: `${Colors.info}10`, borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: `${Colors.info}28`, marginBottom: Spacing.sm,
  },
  servesText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },

  // Empty / loading
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: 60 },
  loaderText: { fontSize: Typography.sm, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  clearBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs,
  },
  clearBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
