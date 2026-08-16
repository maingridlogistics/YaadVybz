// ─── BusinessExplore Component ────────────────────────────────────────────────
// Extracted business discovery mode for app/(tabs)/browse.tsx.
// Manages its own search/filter state independently of the events explore.
//
// Features:
//  - Search bar (business name, category, town, description)
//  - Parish filter strip (reuses JAMAICA_PARISHES from constants/parishes.ts)
//  - Category filter strip (fetched from business_categories table)
//  - Business results FlatList (paginated, 40/page)
//  - Serves-parish distinction in results
//
// Props:
//  initialParish    — optional pre-selected parish (deep-link from Home)
//  initialCategory  — optional pre-selected category id (deep-link)

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { BusinessCard } from './BusinessCard';
import { useBusinesses } from '../../hooks/useBusinesses';
import { BusinessCategory } from '../../services/businessService';

const ALL = '__all__';

interface BusinessExploreProps {
  initialParish?: string;
  initialCategory?: string;
}

// ─── Category Grid Tile ───────────────────────────────────────────────────────
function CategoryTile({
  category,
  selected,
  onPress,
}: {
  category: BusinessCategory;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        catS.tile,
        { borderColor: selected ? category.color : `${category.color}44` },
        selected && { backgroundColor: `${category.color}20` },
        pressed && { opacity: 0.82 },
      ]}
    >
      <View style={[catS.iconBg, { backgroundColor: `${category.color}22` }]}>
        <MaterialIcons name={category.icon as any} size={26} color={category.color} />
      </View>
      <Text style={[catS.label, { color: selected ? category.color : Colors.textSecondary }]} numberOfLines={2}>
        {category.label}
      </Text>
      {selected && (
        <View style={[catS.selectedDot, { backgroundColor: category.color }]} />
      )}
    </Pressable>
  );
}

const catS = StyleSheet.create({
  tile: {
    width: '30.5%',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    minHeight: 100,
    justifyContent: 'center',
    position: 'relative',
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: Typography.semibold,
    textAlign: 'center',
    lineHeight: 14,
  },
  selectedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

// ─── Main BusinessExplore ─────────────────────────────────────────────────────

type ExploreMode = 'browse' | 'results';

export default function BusinessExplore({
  initialParish,
  initialCategory,
}: BusinessExploreProps) {
  const router = useRouter();
  const { results, categories, loading, loadingMore, error, hasMore, search, loadMore, clearError, loadCategories } = useBusinesses();

  const [exploreMode, setExploreMode] = useState<ExploreMode>(
    initialParish || initialCategory ? 'results' : 'browse',
  );

  const [searchText, setSearchText] = useState('');
  const [selectedParish, setSelectedParish] = useState<string>(initialParish ?? ALL);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory ?? ALL);

  const searchTextRef = useRef(searchText);
  searchTextRef.current = searchText;

  const hasActiveFilter = selectedParish !== ALL || selectedCategory !== ALL || searchText.trim().length > 0;
  const activeFilterCount = (selectedParish !== ALL ? 1 : 0) + (selectedCategory !== ALL ? 1 : 0);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Execute search whenever filters change (only in results mode)
  useEffect(() => {
    if (exploreMode !== 'results') return;
    const catId = selectedCategory === ALL
      ? null
      : categories.find((c) => c.id === selectedCategory)?.id ?? null;

    search({
      parish:     selectedParish === ALL ? null : selectedParish,
      categoryId: catId,
      query:      searchText.trim() || null,
    });
  }, [exploreMode, selectedParish, selectedCategory, searchText, categories, search]);

  const handleParishSelect = useCallback((parish: string) => {
    setSelectedParish(parish === selectedParish ? ALL : parish);
    setExploreMode('results');
  }, [selectedParish]);

  const handleCategorySelect = useCallback((catId: string) => {
    setSelectedCategory(catId === selectedCategory ? ALL : catId);
    setExploreMode('results');
  }, [selectedCategory]);

  const handleSearchSubmit = useCallback(() => {
    if (searchText.trim()) setExploreMode('results');
  }, [searchText]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (text.trim()) setExploreMode('results');
    else if (selectedParish === ALL && selectedCategory === ALL) setExploreMode('browse');
  }, [selectedParish, selectedCategory]);

  const clearFilters = useCallback(() => {
    setSelectedParish(ALL);
    setSelectedCategory(ALL);
    setSearchText('');
    setExploreMode('browse');
  }, []);

  const handleLoadMore = useCallback(() => {
    const catId = selectedCategory === ALL
      ? null
      : categories.find((c) => c.id === selectedCategory)?.id ?? null;
    loadMore({
      parish:     selectedParish === ALL ? null : selectedParish,
      categoryId: catId,
      query:      searchText.trim() || null,
    });
  }, [selectedParish, selectedCategory, searchText, categories, loadMore]);

  // Result title for display
  const resultTitle = () => {
    const catLabel = selectedCategory === ALL
      ? null
      : categories.find((c) => c.id === selectedCategory)?.label;
    const parishLabel = selectedParish === ALL ? null : selectedParish;

    if (catLabel && parishLabel) return `${catLabel} in ${parishLabel}`;
    if (catLabel) return catLabel;
    if (parishLabel) return `Businesses in ${parishLabel}`;
    if (searchText.trim()) return `Results for "${searchText.trim()}"`;
    return 'All Businesses';
  };

  // ─── Render result item ─────────────────────────────────────────────────────
  const renderResult = useCallback(
    ({ item }: { item: any }) => (
      <BusinessCard
        business={item}
        variant="row"
        onPress={() => router.push(`/business/${item.id}` as any)}
      />
    ),
    [router],
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  // ─── Results Footer ─────────────────────────────────────────────────────────
  const renderFooter = useCallback(() => {
    if (!loadingMore) return <View style={{ height: Spacing.xxl * 3 }} />;
    return (
      <View style={s.footerLoader}>
        <ActivityIndicator size="small" color={Colors.gold} />
      </View>
    );
  }, [loadingMore]);

  // ─── Results Header ─────────────────────────────────────────────────────────
  const resultsHeader = (
    <View>
      {/* Active filter chips */}
      {hasActiveFilter && (
        <View style={s.activeFiltersRow}>
          {selectedParish !== ALL && (
            <Pressable
              onPress={() => setSelectedParish(ALL)}
              style={s.activeChip}
            >
              <MaterialIcons name="place" size={11} color={Colors.gold} />
              <Text style={s.activeChipText}>{selectedParish}</Text>
              <MaterialIcons name="close" size={11} color={Colors.gold} />
            </Pressable>
          )}
          {selectedCategory !== ALL && (() => {
            const cat = categories.find((c) => c.id === selectedCategory);
            return cat ? (
              <Pressable
                onPress={() => setSelectedCategory(ALL)}
                style={[s.activeChip, { borderColor: `${cat.color}55`, backgroundColor: `${cat.color}15` }]}
              >
                <MaterialIcons name={cat.icon as any} size={11} color={cat.color} />
                <Text style={[s.activeChipText, { color: cat.color }]}>{cat.label}</Text>
                <MaterialIcons name="close" size={11} color={cat.color} />
              </Pressable>
            ) : null;
          })()}
          <Pressable onPress={clearFilters} style={s.clearBtn}>
            <MaterialIcons name="filter-list-off" size={13} color={Colors.textMuted} />
            <Text style={s.clearBtnText}>Clear</Text>
          </Pressable>
        </View>
      )}
      {/* Results count + title */}
      <View style={s.resultsHeaderRow}>
        <Text style={s.resultTitle}>{resultTitle()}</Text>
        {!loading && (
          <Text style={s.resultCount}>{results.length}{hasMore ? '+' : ''} found</Text>
        )}
      </View>
      {/* Serves-parish note */}
      {selectedParish !== ALL && results.some((r) => r.serves_parish) && (
        <View style={s.servesNote}>
          <MaterialIcons name="near-me" size={13} color={Colors.info} />
          <Text style={s.servesNoteText}>
            Some businesses serve {selectedParish} but are located elsewhere — shown with{' '}
            <Text style={{ color: Colors.info }}>Serves {selectedParish}</Text>
          </Text>
        </View>
      )}
    </View>
  );

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Search Bar ── */}
      <View style={s.searchBar}>
        <MaterialIcons name="search" size={20} color={Colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search businesses, services, towns..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={handleSearchChange}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          accessibilityLabel="Search businesses"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => handleSearchChange('')} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
        {activeFilterCount > 0 && (
          <View style={s.filterCountBadge}>
            <Text style={s.filterCountText}>{activeFilterCount}</Text>
          </View>
        )}
      </View>

      {/* ── Error Banner ── */}
      {error ? (
        <View style={s.errorBanner}>
          <MaterialIcons name="wifi-off" size={15} color="#FF4444" />
          <Text style={s.errorText} numberOfLines={2}>{error}</Text>
          <Pressable onPress={clearError} style={s.retryBtn} hitSlop={8}>
            <Text style={s.retryText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── BROWSE MODE: Parish Grid + Category Grid ── */}
      {exploreMode === 'browse' && (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          numColumns={3}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.browseContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Parish filter strip */}
              <View style={s.sectionBlock}>
                <Text style={s.sectionLabel}>Browse by Parish</Text>
                <View style={s.parishWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.parishStrip}
                  >
                    {JAMAICA_PARISHES.map((parish) => (
                      <Pressable
                        key={parish}
                        onPress={() => handleParishSelect(parish)}
                        style={[
                          s.parishChip,
                          selectedParish === parish && s.parishChipActive,
                        ]}
                      >
                        <MaterialIcons
                          name="place"
                          size={12}
                          color={selectedParish === parish ? Colors.textOnGold : Colors.textMuted}
                        />
                        <Text
                          style={[
                            s.parishChipText,
                            selectedParish === parish && s.parishChipTextActive,
                          ]}
                        >
                          {parish}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Category grid header */}
              <Text style={[s.sectionLabel, { paddingHorizontal: Spacing.base }]}>
                Browse by Category
              </Text>
            </>
          }
          renderItem={({ item: cat }) => (
            <CategoryTile
              category={cat}
              selected={selectedCategory === cat.id}
              onPress={() => handleCategorySelect(cat.id)}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <ActivityIndicator size="small" color={Colors.gold} />
              <Text style={s.emptyText}>Loading categories...</Text>
            </View>
          }
        />
      )}

      {/* ── RESULTS MODE ── */}
      {exploreMode === 'results' && (
        <View style={{ flex: 1 }}>
          {/* Parish + Category filter strips */}
          <View style={s.filterStrips}>
            {/* Parish strip */}
            <View style={s.stripWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.strip}
              >
                <Pressable
                  onPress={() => setSelectedParish(ALL)}
                  style={[s.stripChip, selectedParish === ALL && s.stripChipActive]}
                >
                  <Text style={[s.stripText, selectedParish === ALL && s.stripTextActive]}>
                    All Parishes
                  </Text>
                </Pressable>
                {JAMAICA_PARISHES.map((parish) => (
                  <Pressable
                    key={parish}
                    onPress={() => setSelectedParish(selectedParish === parish ? ALL : parish)}
                    style={[s.stripChip, selectedParish === parish && s.stripChipActive]}
                  >
                    <Text style={[s.stripText, selectedParish === parish && s.stripTextActive]}>
                      {parish}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Category strip */}
            <View style={s.stripWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.strip}
              >
                <Pressable
                  onPress={() => setSelectedCategory(ALL)}
                  style={[s.catStripChip, selectedCategory === ALL && s.catStripAllActive]}
                >
                  <MaterialIcons
                    name="apps"
                    size={12}
                    color={selectedCategory === ALL ? Colors.textOnGold : Colors.textMuted}
                  />
                  <Text style={[s.catStripText, selectedCategory === ALL && { color: Colors.textOnGold }]}>
                    All
                  </Text>
                </Pressable>
                {categories.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setSelectedCategory(selectedCategory === cat.id ? ALL : cat.id)}
                      style={[
                        s.catStripChip,
                        isActive && { backgroundColor: cat.color, borderColor: cat.color },
                      ]}
                    >
                      <MaterialIcons
                        name={cat.icon as any}
                        size={12}
                        color={isActive ? '#fff' : cat.color}
                      />
                      <Text style={[s.catStripText, isActive && { color: '#fff', fontWeight: Typography.bold }]}>
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Results list */}
          {loading ? (
            <View style={s.loadingCenter}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={s.loadingText}>Finding businesses...</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={keyExtractor}
              renderItem={renderResult}
              contentContainerStyle={s.resultsList}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              ListHeaderComponent={resultsHeader}
              ListFooterComponent={renderFooter}
              ListEmptyComponent={
                <View style={s.empty}>
                  <View style={s.emptyIcon}>
                    <MaterialIcons name="storefront" size={40} color={Colors.textMuted} />
                  </View>
                  <Text style={s.emptyTitle}>No businesses found</Text>
                  <Text style={s.emptySub}>
                    {hasActiveFilter
                      ? 'Try adjusting your filters or search term.'
                      : 'No businesses have been listed yet.'}
                  </Text>
                  {hasActiveFilter && (
                    <Pressable onPress={clearFilters} style={s.clearAllBtn}>
                      <Text style={s.clearAllText}>Clear All Filters</Text>
                    </Pressable>
                  )}
                </View>
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  filterCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountText: { fontSize: 9, fontWeight: Typography.black, color: Colors.textOnGold },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: Radius.md,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.xs,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.25)',
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: '#FF7777', lineHeight: 17 },
  retryBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  retryText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  // Browse mode
  browseContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxl * 3,
    gap: Spacing.sm,
  },
  gridRow: { gap: Spacing.sm },

  sectionBlock: { marginBottom: Spacing.base },
  sectionLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  parishWrap: { borderRadius: Radius.md, overflow: 'visible' },
  parishStrip: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: 2,
    paddingRight: Spacing.base,
  },
  parishChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.md,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  parishChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  parishChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  parishChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Filter strips (results mode)
  filterStrips: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  stripWrap: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  strip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stripChip: {
    paddingHorizontal: Spacing.md,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripChipActive: { backgroundColor: Colors.goldSurface, borderColor: Colors.gold },
  stripText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  stripTextActive: { color: Colors.gold, fontWeight: Typography.bold },

  catStripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  catStripAllActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  catStripText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },

  // Results mode
  resultsList: { paddingTop: Spacing.xs, paddingBottom: Spacing.xxl * 3 },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    height: 26,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldSurface,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  activeChipText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.medium },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    height: 26,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  clearBtnText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },

  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  resultTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    flex: 1,
  },
  resultCount: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },

  servesNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: `${Colors.info}12`,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: `${Colors.info}30`,
  },
  servesNoteText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  // Loading
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xxl,
  },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  footerLoader: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },

  // Empty state
  empty: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyText: { fontSize: Typography.xs, color: Colors.textMuted },
  clearAllBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    marginTop: Spacing.xs,
  },
  clearAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
