// ─── BusinessExplore ──────────────────────────────────────────────────────────
// Full business discovery experience, composed of 3 internal views:
//   discover     – parish image rail + category horizontal rail + popular businesses
//   allParishes  – 2-column parish grid
//   results      – filtered list (parish-landing or filtered results)

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { getParishImage } from '../../constants/parishImages';
import { useBusinesses } from '../../hooks/useBusinesses';
import {
  BusinessSearchResult,
  BusinessCategory,
  searchBusinesses,
  fetchBusinessCountsByParish,
} from '../../services/businessService';

// ─── View state ───────────────────────────────────────────────────────────────
type ViewState = 'discover' | 'allParishes' | 'results';

interface BusinessExploreProps {
  initialParish?: string;
  initialCategory?: string;
}

// ─── Display label shortener — avoids truncation without touching DB slugs ───
const BIZ_DISPLAY_LABELS: Record<string, string> = {
  'Restaurants & Food': 'Restaurants',
  'Bars & Nightlife': 'Bars & Nightlife',
  'Hotels & Accommodation': 'Hotels',
  'Professional Services': 'Professional',
  'Photography & Media': 'Photography',
  'Health & Wellness': 'Wellness',
  'Construction & Trades': 'Construction',
  'Sound System Hire': 'Sound System',
  'Cleaning Services': 'Cleaning',
  'Home Services': 'Home Services',
  'Event Services': 'Event Services',
};

function bizShortLabel(label: string): string {
  return BIZ_DISPLAY_LABELS[label] ?? label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Parish Image Card (horizontal rail in discover) ───────────────────────────
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
      style={({ pressed }) => [prc.card, pressed && { opacity: 0.82 }]}
    >
      <Image
        source={getParishImage(parish)}
        style={prc.img}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.78)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={prc.content}>
        <Text style={prc.name}>{parish}</Text>
        {count > 0 ? (
          <View style={prc.countRow}>
            <MaterialIcons name="storefront" size={10} color={Colors.gold} />
            <Text style={prc.count}>
              {count} business{count !== 1 ? 'es' : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const prc = StyleSheet.create({
  card: {
    width: 130,
    height: 96,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  img: { ...StyleSheet.absoluteFillObject },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    gap: 2,
  },
  name: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#fff',
    lineHeight: 16,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { fontSize: 10, color: Colors.gold, fontWeight: Typography.medium },
});

// ── Parish Grid Card (all-parishes 2-col view) ────────────────────────────────
const ParishGridCard = memo(function ParishGridCard({
  parish,
  count,
  selected,
  onPress,
}: {
  parish: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        pgc.card,
        selected && pgc.cardSelected,
        pressed && { opacity: 0.82 },
      ]}
    >
      <Image
        source={getParishImage(parish)}
        style={pgc.img}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.80)']}
        style={StyleSheet.absoluteFillObject}
      />
      {selected && (
        <View style={pgc.selectedOverlay}>
          <MaterialIcons name="check-circle" size={18} color={Colors.gold} />
        </View>
      )}
      <View style={pgc.content}>
        <Text style={pgc.name} numberOfLines={1}>{parish}</Text>
        {count > 0 ? (
          <Text style={pgc.count}>{count} biz{count !== 1 ? 'es' : ''}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const pgc = StyleSheet.create({
  card: {
    flex: 1,
    height: 88,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  cardSelected: { borderColor: Colors.gold, borderWidth: 2 },
  img: { ...StyleSheet.absoluteFillObject },
  selectedOverlay: { position: 'absolute', top: 7, right: 7, zIndex: 2 },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    gap: 1,
  },
  name: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
  count: { fontSize: 10, color: `${Colors.gold}CC`, fontWeight: Typography.medium },
});

// ── Category Rail Card (horizontal scroll — fixed width, no truncation) ───────
const CategoryRailCard = memo(function CategoryRailCard({
  category,
  selected,
  onPress,
}: {
  category: BusinessCategory & { displayLabel?: string };
  selected: boolean;
  onPress: () => void;
}) {
  const label = category.displayLabel ?? bizShortLabel(category.label);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        crc.card,
        { borderColor: selected ? category.color : `${category.color}35` },
        selected && { backgroundColor: `${category.color}1A` },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[crc.iconBg, { backgroundColor: `${category.color}1F` }]}>
        <MaterialIcons name={category.icon as any} size={24} color={category.color} />
      </View>
      <Text
        style={[crc.label, { color: selected ? category.color : Colors.textSecondary }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {selected && (
        <View style={[crc.dot, { backgroundColor: category.color }]} />
      )}
    </Pressable>
  );
});

const crc = StyleSheet.create({
  card: {
    width: 88,
    flexShrink: 0,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    minHeight: 92,
    justifyContent: 'center',
    position: 'relative',
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: Typography.semibold,
    textAlign: 'center',
    lineHeight: 13,
  },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});

// ── Business Row Card ─────────────────────────────────────────────────────────
const BusinessRowCard = memo(function BusinessRowCard({
  business,
  onPress,
}: {
  business: BusinessSearchResult;
  onPress: () => void;
}) {
  const hasRating = business.avg_rating != null && business.avg_rating > 0;

  const locationStr = business.serves_parish
    ? `Serves ${business.primary_parish}`
    : business.town
    ? `${business.town}, ${business.primary_parish}`
    : business.primary_parish;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [brc.card, pressed && { opacity: 0.80 }]}
      accessibilityRole="button"
      accessibilityLabel={`${business.name}, ${business.category_label}`}
    >
      {/* Thumbnail */}
      <View style={brc.thumbWrap}>
        {business.cover_url ?? business.logo_url ? (
          <Image
            source={{ uri: (business.cover_url ?? business.logo_url)! }}
            style={brc.thumb}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[brc.thumb, brc.thumbPlaceholder]}>
            <MaterialIcons name={business.category_icon as any} size={26} color={business.category_color} />
          </View>
        )}
        {business.location_type === 'mobile' && (
          <View style={brc.mobileBadge}>
            <MaterialIcons name="two-wheeler" size={9} color="#fff" />
          </View>
        )}
      </View>

      {/* Body */}
      <View style={brc.body}>
        <View style={brc.nameRow}>
          <Text style={brc.name} numberOfLines={1}>{business.name}</Text>
          {business.verified ? (
            <MaterialIcons name="verified" size={13} color={Colors.gold} />
          ) : null}
        </View>

        <View style={brc.metaRow}>
          <View style={[brc.catDot, { backgroundColor: business.category_color }]} />
          <Text style={[brc.catLabel, { color: business.category_color }]} numberOfLines={1}>
            {business.category_label}
          </Text>
          <View style={brc.metaSep} />
          <MaterialIcons
            name={business.serves_parish ? 'near-me' : 'place'}
            size={10}
            color={business.serves_parish ? Colors.info : Colors.textMuted}
          />
          <Text
            style={[brc.location, business.serves_parish && { color: Colors.info }]}
            numberOfLines={1}
          >
            {locationStr}
          </Text>
        </View>

        {hasRating ? (
          <View style={brc.ratingRow}>
            <MaterialIcons name="star" size={11} color={Colors.gold} />
            <Text style={brc.ratingText}>{business.avg_rating!.toFixed(1)}</Text>
            {business.review_count > 0 ? (
              <Text style={brc.reviewCount}>({business.review_count})</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Save */}
      <Pressable style={brc.saveBtn} hitSlop={8} onPress={(e) => e.stopPropagation()}>
        <MaterialIcons name="bookmark-border" size={18} color={Colors.textMuted} />
      </Pressable>
    </Pressable>
  );
});

const brc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    minHeight: 84,
  },
  thumbWrap: { width: 84, height: 84, position: 'relative', flexShrink: 0 },
  thumb: { width: 84, height: 84 },
  thumbPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: Colors.gold, borderRadius: 10,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
  catDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  catLabel: { fontSize: 11, fontWeight: Typography.semibold, flexShrink: 0 },
  metaSep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted, flexShrink: 0 },
  location: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 12, fontWeight: Typography.bold, color: Colors.gold },
  reviewCount: { fontSize: 10, color: Colors.textMuted },
  saveBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.lg,
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
  },
});

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={6}>
          <Text style={sh.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const sh = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  action: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main BusinessExplore component
// ─────────────────────────────────────────────────────────────────────────────

export default function BusinessExplore({
  initialParish,
  initialCategory,
}: BusinessExploreProps) {
  const router = useRouter();

  const {
    results,
    categories,
    loading,
    loadingMore,
    error,
    hasMore,
    search,
    loadMore,
    clearError,
    loadCategories,
  } = useBusinesses();

  const [view, setView] = useState<ViewState>(() =>
    initialParish || initialCategory ? 'results' : 'discover'
  );

  const [selectedParish, setSelectedParish] = useState<string | null>(initialParish ?? null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategory ?? null);
  const [searchQuery, setSearchQuery] = useState('');

  const [parishCounts, setParishCounts] = useState<Record<string, number>>({});
  const [popularBusinesses, setPopularBusinesses] = useState<BusinessSearchResult[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);

  const hasActiveFilter = !!selectedParish || !!selectedCategoryId || searchQuery.trim().length > 0;

  const goBack = useCallback(() => setView('discover'), []);

  const navigateTo = useCallback((v: ViewState) => setView(v), []);

  // Load on mount
  useEffect(() => {
    loadCategories();
    fetchBusinessCountsByParish().then(setParishCounts).catch(() => {});
  }, [loadCategories]);

  // Popular businesses for discover view
  useEffect(() => {
    if (view !== 'discover') return;
    setLoadingPopular(true);
    searchBusinesses({ limit: 6, offset: 0 })
      .then(({ results: r }) => setPopularBusinesses(r))
      .finally(() => setLoadingPopular(false));
  }, [view]);

  // Search when filters change in results view
  useEffect(() => {
    if (view !== 'results') return;
    search({
      parish: selectedParish,
      categoryId: selectedCategoryId,
      query: searchQuery.trim() || null,
    });
  }, [view, selectedParish, selectedCategoryId, searchQuery, search]);

  const handleParishSelect = useCallback((parish: string) => {
    setSelectedParish(parish);
    setSelectedCategoryId(null);
    setView('results');
  }, []);

  const handleCategorySelect = useCallback((catId: string) => {
    const next = selectedCategoryId === catId ? null : catId;
    setSelectedCategoryId(next);
    if (view !== 'results') setView('results');
  }, [selectedCategoryId, view]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.trim()) {
      if (view !== 'results') setView('results');
    } else if (!selectedParish && !selectedCategoryId) {
      setView('discover');
    }
  }, [view, selectedParish, selectedCategoryId]);

  const handleClearAll = useCallback(() => {
    setSelectedParish(null);
    setSelectedCategoryId(null);
    setSearchQuery('');
    setView('discover');
  }, []);

  const handleLoadMore = useCallback(() => {
    loadMore({
      parish: selectedParish,
      categoryId: selectedCategoryId,
      query: searchQuery.trim() || null,
    });
  }, [selectedParish, selectedCategoryId, searchQuery, loadMore]);

  const handleBusinessPress = useCallback((id: string) => {
    router.push(`/business/${id}` as any);
  }, [router]);

  const activeCat = useMemo(
    () => selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId) : null,
    [selectedCategoryId, categories]
  );

  const resultTitle = useMemo(() => {
    if (activeCat && selectedParish) return `${activeCat.label} in ${selectedParish}`;
    if (activeCat) return activeCat.label;
    if (selectedParish) return selectedParish;
    if (searchQuery.trim()) return `"${searchQuery.trim()}"`;
    return 'All Businesses';
  }, [activeCat, selectedParish, searchQuery]);

  // ── Shared search bar ──────────────────────────────────────────────────────
  const searchBarEl = (
    <View style={s.searchBar}>
      <MaterialIcons name="search" size={20} color={Colors.textMuted} />
      <TextInput
        style={s.searchInput}
        placeholder="Search businesses..."
        placeholderTextColor={Colors.textMuted}
        value={searchQuery}
        onChangeText={handleSearchChange}
        returnKeyType="search"
        accessibilityLabel="Search businesses"
      />
      {searchQuery.length > 0 && (
        <Pressable onPress={() => handleSearchChange('')} hitSlop={8}>
          <MaterialIcons name="close" size={17} color={Colors.textMuted} />
        </Pressable>
      )}
    </View>
  );

  const errorBanner = error ? (
    <View style={s.errorBanner}>
      <MaterialIcons name="wifi-off" size={14} color="#FF4444" />
      <Text style={s.errorText} numberOfLines={1}>{error}</Text>
      <Pressable onPress={clearError} hitSlop={8}>
        <Text style={s.dismissText}>Dismiss</Text>
      </Pressable>
    </View>
  ) : null;

  // ─── VIEW: DISCOVER ──────────────────────────────────────────────────────────
  if (view === 'discover') {
    return (
      <View style={s.flex}>
        <View style={s.searchPad}>{searchBarEl}</View>
        {errorBanner}
        <ScrollView
          style={s.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.discoverContent}
        >
          <Text style={s.discoverHeading}>Discover Businesses</Text>

          {/* Browse by Parish */}
          <View style={s.section}>
            <SectionHeader
              title="Browse by Parish"
              actionLabel="View all"
              onAction={() => navigateTo('allParishes')}
            />
            <View style={s.railWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.parishRail}
              >
                {JAMAICA_PARISHES.slice(0, 8).map((parish) => (
                  <ParishRailCard
                    key={parish}
                    parish={parish}
                    count={parishCounts[parish] ?? 0}
                    onPress={() => handleParishSelect(parish)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Browse by Category — horizontal rail */}
          <View style={s.section}>
            <SectionHeader title="Browse by Category" />
            <View style={s.railWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.categoryRail}
              >
                {categories.map((cat) => (
                  <CategoryRailCard
                    key={cat.id}
                    category={cat}
                    selected={false}
                    onPress={() => handleCategorySelect(cat.id)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Popular Near You */}
          <View style={s.section}>
            <SectionHeader title="Popular Near You" />
            {loadingPopular ? (
              <View style={s.miniLoader}>
                <ActivityIndicator size="small" color={Colors.gold} />
              </View>
            ) : popularBusinesses.length > 0 ? (
              <View style={s.popularList}>
                {popularBusinesses.map((biz) => (
                  <BusinessRowCard
                    key={biz.id}
                    business={biz}
                    onPress={() => handleBusinessPress(biz.id)}
                  />
                ))}
              </View>
            ) : (
              <View style={s.miniEmpty}>
                <Text style={s.miniEmptyText}>No businesses listed yet.</Text>
              </View>
            )}
          </View>

          <View style={{ height: Spacing.xxl * 3 }} />
        </ScrollView>
      </View>
    );
  }

  // ─── VIEW: ALL PARISHES ──────────────────────────────────────────────────────
  if (view === 'allParishes') {
    return (
      <View style={s.flex}>
        <View style={s.innerHeader}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.innerTitle}>Browse by Parish</Text>
          <View style={{ width: 36 }} />
        </View>
        <FlatList
          data={JAMAICA_PARISHES as unknown as string[]}
          keyExtractor={(p) => p}
          numColumns={2}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.allParishesContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={s.gridSubLabel}>
              {Object.values(parishCounts).reduce((a, b) => a + b, 0)} businesses across {JAMAICA_PARISHES.length} parishes
            </Text>
          }
          renderItem={({ item: parish }) => (
            <ParishGridCard
              parish={parish}
              count={parishCounts[parish] ?? 0}
              selected={selectedParish === parish}
              onPress={() => handleParishSelect(parish)}
            />
          )}
          ListFooterComponent={<View style={{ height: Spacing.xxl * 3 }} />}
        />
      </View>
    );
  }

  // ─── VIEW: RESULTS ────────────────────────────────────────────────────────────
  const isParishLanding = !!selectedParish && !selectedCategoryId && !searchQuery.trim();
  const servesParishCount = results.filter((r) => r.serves_parish).length;

  return (
    <View style={s.flex}>
      {/* Inner header */}
      <View style={s.innerHeader}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={s.innerTitleWrap}>
          <Text style={s.innerTitle} numberOfLines={1}>
            {selectedParish ?? 'All Businesses'}
          </Text>
          {!loading && results.length > 0 && (
            <Text style={s.innerSubtitle}>
              {results.length}{hasMore ? '+' : ''} businesses
            </Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {searchBarEl}
      {errorBanner}

      {/* Category filter strip (horizontal chips) */}
      <View style={s.catStripOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catStrip}>
          <Pressable
            onPress={() => setSelectedCategoryId(null)}
            style={[s.catChip, !selectedCategoryId && s.catChipAllActive]}
          >
            <MaterialIcons name="apps" size={12} color={!selectedCategoryId ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.catChipText, !selectedCategoryId && s.catChipTextActive]}>All Categories</Text>
          </Pressable>
          {categories.map((cat) => {
            const isActive = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategoryId(isActive ? null : cat.id)}
                style={[s.catChip, isActive && { backgroundColor: cat.color, borderColor: cat.color }]}
              >
                <MaterialIcons name={cat.icon as any} size={12} color={isActive ? '#fff' : cat.color} />
                <Text style={[s.catChipText, isActive && { color: '#fff', fontWeight: Typography.bold }]}>
                  {bizShortLabel(cat.label)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Parish landing — show category rail + businesses */}
      {isParishLanding && !loading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.parishLandingContent}>
          {/* Category rail in landing */}
          {categories.length > 0 && (
            <View style={s.section}>
              <SectionHeader title="Popular Categories" />
              <View style={s.railWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRail}>
                  {categories.map((cat) => (
                    <CategoryRailCard
                      key={cat.id}
                      category={cat}
                      selected={false}
                      onPress={() => handleCategorySelect(cat.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Businesses in parish */}
          <View style={s.section}>
            <SectionHeader title={`Businesses in ${selectedParish}`} />
            {results.length === 0 ? (
              <View style={s.empty}>
                <MaterialIcons name="storefront" size={36} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>No businesses listed yet</Text>
                <Text style={s.emptySub}>Be the first to list your business in {selectedParish}.</Text>
              </View>
            ) : (
              <>
                {results.map((biz) => (
                  <BusinessRowCard key={biz.id} business={biz} onPress={() => handleBusinessPress(biz.id)} />
                ))}
                {hasMore && (
                  <Pressable style={s.loadMoreBtn} onPress={handleLoadMore}>
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={Colors.gold} />
                    ) : (
                      <Text style={s.loadMoreText}>Load More</Text>
                    )}
                  </Pressable>
                )}
              </>
            )}
          </View>
          <View style={{ height: Spacing.xxl * 3 }} />
        </ScrollView>
      ) : (
        /* Filtered results */
        <>
          {loading ? (
            <View style={s.loadingCenter}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={s.loadingText}>Finding businesses...</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <BusinessRowCard business={item} onPress={() => handleBusinessPress(item.id)} />
              )}
              contentContainerStyle={s.resultsList}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              ListHeaderComponent={
                <View>
                  <View style={s.resultsHeader}>
                    <Text style={s.resultsTitle}>{resultTitle}</Text>
                    <Text style={s.resultsCount}>{results.length}{hasMore ? '+' : ''} found</Text>
                  </View>
                  {hasActiveFilter && (
                    <View style={s.filterChips}>
                      {selectedParish && (
                        <Pressable style={s.chip} onPress={() => setSelectedParish(null)}>
                          <MaterialIcons name="place" size={11} color={Colors.gold} />
                          <Text style={s.chipText}>{selectedParish}</Text>
                          <MaterialIcons name="close" size={10} color={Colors.gold} />
                        </Pressable>
                      )}
                      {activeCat && (
                        <Pressable
                          style={[s.chip, { borderColor: `${activeCat.color}55`, backgroundColor: `${activeCat.color}18` }]}
                          onPress={() => setSelectedCategoryId(null)}
                        >
                          <MaterialIcons name={activeCat.icon as any} size={11} color={activeCat.color} />
                          <Text style={[s.chipText, { color: activeCat.color }]}>{activeCat.label}</Text>
                          <MaterialIcons name="close" size={10} color={activeCat.color} />
                        </Pressable>
                      )}
                      <Pressable style={s.clearChip} onPress={handleClearAll}>
                        <MaterialIcons name="filter-list-off" size={12} color={Colors.textMuted} />
                        <Text style={s.clearChipText}>Clear</Text>
                      </Pressable>
                    </View>
                  )}
                  {selectedParish && servesParishCount > 0 && (
                    <View style={s.servesNote}>
                      <MaterialIcons name="near-me" size={12} color={Colors.info} />
                      <Text style={s.servesText}>
                        {servesParishCount} business{servesParishCount !== 1 ? 'es' : ''} serve{servesParishCount === 1 ? 's' : ''}{' '}
                        {selectedParish} but {servesParishCount === 1 ? 'is' : 'are'} based elsewhere
                      </Text>
                    </View>
                  )}
                </View>
              }
              ListFooterComponent={() =>
                loadingMore ? (
                  <View style={s.footerLoader}>
                    <ActivityIndicator size="small" color={Colors.gold} />
                  </View>
                ) : (
                  <View style={{ height: Spacing.xxl * 3 }} />
                )
              }
              ListEmptyComponent={
                <View style={s.empty}>
                  <View style={s.emptyIcon}>
                    <MaterialIcons name="storefront" size={38} color={Colors.textMuted} />
                  </View>
                  <Text style={s.emptyTitle}>No businesses found</Text>
                  <Text style={s.emptySub}>
                    {hasActiveFilter
                      ? 'Try adjusting your filters or search term.'
                      : 'No businesses have been listed yet.'}
                  </Text>
                  {hasActiveFilter && (
                    <Pressable onPress={handleClearAll} style={s.clearAllBtn}>
                      <Text style={s.clearAllText}>Clear All Filters</Text>
                    </Pressable>
                  )}
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  searchPad: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.base, marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, height: 48,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    marginHorizontal: Spacing.base, marginBottom: Spacing.xs,
    borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.22)',
  },
  errorText: { flex: 1, fontSize: 11, color: '#FF7777' },
  dismissText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },

  innerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  innerTitleWrap: { flex: 1, alignItems: 'center' },
  innerTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  innerSubtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  // Discover
  discoverContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: 0 },
  discoverHeading: {
    fontSize: Typography.xl, fontWeight: Typography.black,
    color: Colors.textPrimary, marginBottom: Spacing.lg,
  },
  section: { marginBottom: Spacing.lg },

  railWrap: { marginHorizontal: -Spacing.base },
  parishRail: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: 2 },
  categoryRail: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  popularList: { gap: 0 },
  miniLoader: { paddingVertical: Spacing.lg, alignItems: 'center' },
  miniEmpty: { paddingVertical: Spacing.base },
  miniEmptyText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  // All parishes
  allParishesContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.sm },
  gridRow: { gap: Spacing.sm },
  gridSubLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.xs },

  // Category filter strip
  catStripOuter: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  catStrip: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.xs, flexDirection: 'row', alignItems: 'center',
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm + 2, height: 32, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  catChipAllActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  catChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  catChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Parish landing
  parishLandingContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  // Results
  resultsList: { paddingTop: Spacing.xs, paddingBottom: Spacing.xxl * 3 },
  resultsHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
  },
  resultsTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1 },
  resultsCount: { fontSize: Typography.xs, color: Colors.textMuted },

  filterChips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, height: 26, borderRadius: Radius.full,
    backgroundColor: Colors.goldSurface, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  chipText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.medium },
  clearChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, height: 26, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  clearChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },

  servesNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    padding: Spacing.sm, backgroundColor: `${Colors.info}10`,
    borderRadius: Radius.md, borderWidth: 1, borderColor: `${Colors.info}28`,
  },
  servesText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },

  loadMoreBtn: {
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.base, marginTop: Spacing.sm,
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, height: 44,
  },
  loadMoreText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  footerLoader: { paddingVertical: Spacing.xl, alignItems: 'center' },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  clearAllBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.xs,
  },
  clearAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
});
