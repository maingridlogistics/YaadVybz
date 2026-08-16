// ─── Business Parish Discovery Page ──────────────────────────────────────────
// Dedicated discovery destination for a single parish.
// Visual hierarchy (matches reference):
//   Header:             ← Parish Name   X businesses
//   Top chip rail:      swipeable category chips (tapping navigates to business-results)
//   Contextual search:  "Search businesses in Manchester..."
//   Popular Categories: compact 3-column grid
//   Businesses:         compact BizRow list
//
// Both navigation paths converge at business-results when a category is selected:
//   Parish-first:    business-parish → tap chip → business-results
//   Category-first:  business-category → tap parish → business-results

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useBusinesses } from '../../hooks/useBusinesses';
import {
  BusinessSearchResult,
  BusinessCategory,
  searchBusinesses,
} from '../../services/businessService';
import {
  fetchPromotedBusinesses,
  PromotedBusiness,
  recordPromotionClick,
} from '../../services/businessPromotionService';

// ─── Category chip (top swipeable rail) ──────────────────────────────────────
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
      <MaterialIcons name={cat.icon as any} size={13} color={selected ? '#fff' : cat.color} />
      <Text style={[ch.label, selected && ch.labelActive]}>{cat.label}</Text>
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

// ─── Business result row (with optional Promoted badge) ──────────────────────
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
          {promoted ? (
            <View style={br.promoBadge}>
              <MaterialIcons name="campaign" size={9} color={Colors.gold} />
              <Text style={br.promoBadgeText}>Promoted</Text>
            </View>
          ) : null}
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
  promoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  promoBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.gold, letterSpacing: 0.3 },
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
const ALL_CAT = { id: '__all__', label: 'All', icon: 'apps', color: Colors.gold };

export default function BusinessParishScreen() {
  const { parish } = useLocalSearchParams<{ parish: string }>();
  const router = useRouter();
  const { categories, loadCategories } = useBusinesses();
  const [selectedChip, setSelectedChip] = useState<string>('__all__');

  const [searchText, setSearchText] = useState('');
  const [allBusinesses, setAllBusinesses] = useState<BusinessSearchResult[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<PromotedBusiness[]>([]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  useEffect(() => {
    if (!parish) return;
    setLoadingAll(true);
    Promise.all([
      searchBusinesses({ parish, limit: 8, offset: 0 }),
      fetchPromotedBusinesses({ placement: 'parish', parish, limit: 4 }),
    ]).then(([{ results }, promoted]) => {
        setAllBusinesses(results);
        setTotalCount(results.length);
        setFeaturedBusinesses(promoted);
      })
      .finally(() => setLoadingAll(false));
  }, [parish]);

  const totalLabel =
    totalCount !== null
      ? `${totalCount}${totalCount === 8 ? '+' : ''} businesses`
      : loadingAll ? 'Loading...' : 'Businesses';

  // Top-6 Popular Categories: sort by parish presence, cap at 5, append "All"
  const popularCats = useMemo(() => {
    // Count how many of the fetched businesses belong to each category
    const counts: Record<string, number> = {};
    allBusinesses.forEach((b) => { counts[b.category_id] = (counts[b.category_id] ?? 0) + 1; });
    const sorted = [...categories].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
    return sorted.slice(0, 5);
  }, [categories, allBusinesses]);

  // Category chip tap → navigate to canonical combined results page
  const handleCatSelect = useCallback((catId: string) => {
    setSelectedChip(catId);
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      router.push({
        pathname: '/explore/business-results',
        params: {
          parish,
          categoryId: catId,
          categoryLabel: cat.label,
          categoryIcon: cat.icon,
          categoryColor: cat.color,
        },
      } as any);
    }
  }, [router, categories, parish]);

  const handleBusinessPress = useCallback(
    (id: string) => router.push(`/business/${id}` as any),
    [router]
  );

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.parishName}>{parish}</Text>
            <Text style={s.parishCount}>{totalLabel}</Text>
          </View>
        </View>

        {/* Category chip rail — horizontal swipe, each tap → business-results */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRail}
        >
          {/* All Categories chip — default selected state */}
          <CategoryChip
            cat={ALL_CAT as any}
            selected={selectedChip === '__all__'}
            onPress={() => setSelectedChip('__all__')}
          />
          {categories.map((cat) => (
            <CategoryChip
              key={cat.id}
              cat={cat}
              selected={selectedChip === cat.id}
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
            placeholder={`Search businesses in ${parish}...`}
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </SafeAreaView>

      {/* ── Scrollable content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.landingContent}
      >
        {/* Popular Categories — compact 3-column × 2-row grid (max 6 cards) */}
        {popularCats.length > 0 ? (
          <View style={s.catSection}>
            <SectionHdr title="Popular Categories" />
            <View style={s.catGrid}>
              {popularCats.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => handleCatSelect(cat.id)}
                  style={({ pressed }) => [s.catGridCell, pressed && { opacity: 0.8 }]}
                >
                  <View style={[s.catGridIcon, { backgroundColor: `${cat.color}1A` }]}>
                    <MaterialIcons name={cat.icon as any} size={22} color={cat.color} />
                  </View>
                  <Text style={[s.catGridLabel, { color: cat.color }]} numberOfLines={2}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
              {/* "All" cell — always the 6th card, opens category directory with parish context */}
              <Pressable
                style={({ pressed }) => [s.catGridCell, pressed && { opacity: 0.8 }]}
                onPress={() => router.push({
                  pathname: '/explore/business-categories',
                  params: { parish },
                } as any)}
              >
                <View style={[s.catGridIcon, { backgroundColor: `${Colors.gold}1A` }]}>
                  <MaterialIcons name="more-horiz" size={22} color={Colors.gold} />
                </View>
                <Text style={[s.catGridLabel, { color: Colors.gold }]}>All</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Featured Businesses (paid Parish promotion) */}
        {featuredBusinesses.length > 0 ? (
          <View style={s.featuredSection}>
            <View style={s.featuredHeader}>
              <MaterialIcons name="campaign" size={14} color="#9C27B0" />
              <Text style={s.featuredTitle}>Featured in {parish}</Text>
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
                  recordPromotionClick(biz.promotion_id, biz.id, 'parish').catch(() => {});
                  handleBusinessPress(biz.id);
                }}
              />
            ))}
          </View>
        ) : null}

        {/* Businesses in Parish */}
        {loadingAll ? (
          <View style={s.loader}><ActivityIndicator color={Colors.gold} /></View>
        ) : allBusinesses.length > 0 ? (
          <View style={s.featuredSection}>
            <SectionHdr title={`All Businesses in ${parish}`} />
            {allBusinesses.map((biz) => (
              <BizRow key={biz.id} biz={biz} onPress={() => handleBusinessPress(biz.id)} />
            ))}
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
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  parishName: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  parishCount: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

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

  // Content
  landingContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  // Popular Categories — compact 3-column grid
  catSection: { marginBottom: Spacing.lg },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catGridCell: {
    width: '30%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 6,
  },
  catGridIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  catGridLabel: {
    fontSize: 10, fontWeight: Typography.semibold,
    textAlign: 'center', lineHeight: 13,
  },

  featuredHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  featuredTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: '#9C27B0',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  loader: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
