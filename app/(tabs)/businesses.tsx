import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, FlatList, Pressable, StyleSheet,
  ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useBusinesses } from '../../hooks/useBusinesses';
import { useAuth } from '../../hooks/useAuth';
import { Business, BusinessCategory, getLocationHoursStatus } from '../../types/business';
import { PARISHES } from '../../constants/data';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.72, 300);

// ─── Hours badge ─────────────────────────────────────────────────────────────
function HoursBadge({ business }: { business: Business }) {
  const primaryLoc = business.locations?.find((l) => l.isPrimary && l.active) ?? business.locations?.[0];
  if (!primaryLoc) return null;
  const status = getLocationHoursStatus(primaryLoc.openingHours);
  if (status.type === 'no_hours') return null;
  const isOpen = status.type === 'open';
  return (
    <View style={[hStyles.badge, isOpen ? hStyles.open : hStyles.closed]}>
      <View style={[hStyles.dot, isOpen ? hStyles.dotOpen : hStyles.dotClosed]} />
      <Text style={[hStyles.label, isOpen ? hStyles.labelOpen : hStyles.labelClosed]}>
        {isOpen ? 'Open Now' : 'Closed'}
      </Text>
    </View>
  );
}
const hStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  open: { backgroundColor: 'rgba(0,200,83,0.15)' },
  closed: { backgroundColor: 'rgba(255,68,68,0.12)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOpen: { backgroundColor: Colors.success },
  dotClosed: { backgroundColor: Colors.error },
  label: { fontSize: 11, fontWeight: Typography.semibold },
  labelOpen: { color: Colors.success },
  labelClosed: { color: Colors.error },
});

// ─── Business Card (featured / horizontal) ───────────────────────────────────
function BusinessCardFeatured({ business, onPress }: { business: Business; onPress: () => void }) {
  const primaryLoc = business.locations?.find((l) => l.isPrimary) ?? business.locations?.[0];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [fcStyles.card, pressed && { opacity: 0.88 }]}
    >
      <Image
        source={{ uri: business.coverUrl || business.logoUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=70' }}
        style={fcStyles.cover}
        contentFit="cover"
        transition={200}
      />
      <View style={fcStyles.overlay} />
      {business.featured && (
        <View style={fcStyles.featuredBadge}>
          <MaterialIcons name="star" size={10} color={Colors.textOnGold} />
          <Text style={fcStyles.featuredText}>Featured</Text>
        </View>
      )}
      <View style={fcStyles.info}>
        <View style={fcStyles.logoRow}>
          {business.logoUrl ? (
            <Image source={{ uri: business.logoUrl }} style={fcStyles.logo} contentFit="cover" />
          ) : (
            <View style={[fcStyles.logo, fcStyles.logoFallback]}>
              <MaterialIcons name="store" size={18} color={Colors.gold} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={fcStyles.name} numberOfLines={1}>{business.name}</Text>
            {business.category && (
              <Text style={fcStyles.cat} numberOfLines={1}>{business.category.name}</Text>
            )}
          </View>
        </View>
        <View style={fcStyles.meta}>
          {primaryLoc && (
            <View style={fcStyles.metaItem}>
              <MaterialIcons name="place" size={11} color={Colors.textMuted} />
              <Text style={fcStyles.metaText}>{primaryLoc.parish}</Text>
            </View>
          )}
          <HoursBadge business={business} />
        </View>
      </View>
    </Pressable>
  );
}
const fcStyles = StyleSheet.create({
  card: { width: CARD_W, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface, marginRight: Spacing.md },
  cover: { width: '100%', height: 160 },
  overlay: { ...StyleSheet.absoluteFillObject, top: 80, backgroundColor: 'rgba(0,0,0,0.55)' },
  featuredBadge: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  featuredText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textOnGold },
  info: { padding: Spacing.md },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  logo: { width: 40, height: 40, borderRadius: Radius.sm, flexShrink: 0 },
  logoFallback: { backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cat: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: Colors.textMuted },
});

// ─── Business Card (list) ────────────────────────────────────────────────────
function BusinessCardList({ business, onPress }: { business: Business; onPress: () => void }) {
  const primaryLoc = business.locations?.find((l) => l.isPrimary && l.active) ?? business.locations?.[0];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [lcStyles.card, pressed && { opacity: 0.88 }]}
    >
      {business.logoUrl ? (
        <Image source={{ uri: business.logoUrl }} style={lcStyles.logo} contentFit="cover" transition={200} />
      ) : (
        <View style={[lcStyles.logo, lcStyles.logoFallback]}>
          <MaterialIcons name="store" size={24} color={Colors.gold} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={lcStyles.topRow}>
          <Text style={lcStyles.name} numberOfLines={1}>{business.name}</Text>
          {business.verified && <MaterialIcons name="verified" size={14} color={Colors.info} />}
        </View>
        {business.category && (
          <Text style={lcStyles.cat} numberOfLines={1}>{business.category.name}</Text>
        )}
        <View style={lcStyles.meta}>
          {primaryLoc && (
            <View style={lcStyles.metaItem}>
              <MaterialIcons name="place" size={11} color={Colors.textMuted} />
              <Text style={lcStyles.metaText}>{primaryLoc.parish}</Text>
            </View>
          )}
          {business.priceRange ? (
            <Text style={lcStyles.price}>{business.priceRange}</Text>
          ) : null}
        </View>
      </View>
      <HoursBadge business={business} />
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}
const lcStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  logo: { width: 52, height: 52, borderRadius: Radius.sm, flexShrink: 0 },
  logoFallback: { backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary, flex: 1 },
  cat: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: Colors.textMuted },
  price: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Category chip ────────────────────────────────────────────────────────────
function CategoryChip({ category, selected, onPress }: { category: BusinessCategory; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.chip,
        selected && { backgroundColor: Colors.gold },
        pressed && { opacity: 0.8 },
      ]}
    >
      <MaterialIcons
        name={category.icon as any}
        size={14}
        color={selected ? Colors.textOnGold : Colors.textSecondary}
      />
      <Text style={[chipStyles.label, selected && { color: Colors.textOnGold }]}>
        {category.name}
      </Text>
    </Pressable>
  );
}
const chipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, marginRight: Spacing.sm },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BusinessesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { businesses, categories, isLoading, myBusiness, getFeatured, filterByCategory, filterByParish, searchBusinesses, getNearby } = useBusinesses();

  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedParish, setSelectedParish] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const locationRequested = useRef(false);

  // Request location once on mount
  useEffect(() => {
    if (locationRequested.current) return;
    locationRequested.current = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocationDenied(true); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch (_) {
        setLocationDenied(true);
      }
    })();
  }, []);

  // Compute displayed list
  const displayedBusinesses = useCallback(() => {
    let list = search.trim() ? searchBusinesses(search) : businesses;
    if (selectedCat) list = list.filter((b) => b.categoryId === selectedCat || b.secondaryCategoryIds.includes(selectedCat));
    if (selectedParish) list = list.filter((b) => b.locations?.some((l) => l.parish.toLowerCase() === selectedParish.toLowerCase() && l.active));
    return list;
  }, [businesses, search, selectedCat, selectedParish, searchBusinesses]);

  const featured = getFeatured();
  const nearby = userLocation ? getNearby(userLocation.lat, userLocation.lng, 30) : [];

  const openBusiness = (id: string) => router.push(`/business/${id}` as any);

  const isBusinessOwner = user?.roles.includes('business_owner' as any);

  const renderItem = ({ item }: { item: Business }) => (
    <BusinessCardList business={item} onPress={() => openBusiness(item.id)} />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Businesses</Text>
          <Text style={styles.headerSub}>Discover local Jamaica businesses</Text>
        </View>
        <Pressable
          onPress={() => {
            if (myBusiness) router.push('/business-dashboard' as any);
            else if (isBusinessOwner) router.push('/create-business' as any);
            else router.push('/create-business' as any);
          }}
          style={({ pressed }) => [styles.myBizBtn, pressed && { opacity: 0.8 }]}
        >
          <MaterialIcons name={myBusiness ? 'dashboard' : 'add-business'} size={18} color={Colors.textOnGold} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search businesses..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={displayedBusinesses()}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            <>
              {/* Category filter */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Categories</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                <Pressable
                  onPress={() => setSelectedCat(null)}
                  style={({ pressed }) => [chipStyles.chip, !selectedCat && { backgroundColor: Colors.gold }, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name="apps" size={14} color={!selectedCat ? Colors.textOnGold : Colors.textSecondary} />
                  <Text style={[chipStyles.label, !selectedCat && { color: Colors.textOnGold }]}>All</Text>
                </Pressable>
                {categories.map((cat) => (
                  <CategoryChip
                    key={cat.id}
                    category={cat}
                    selected={selectedCat === cat.id}
                    onPress={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
                  />
                ))}
              </ScrollView>

              {/* Parish filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.catRow, { marginTop: Spacing.sm }]}>
                <Pressable
                  onPress={() => setSelectedParish(null)}
                  style={({ pressed }) => [chipStyles.chip, !selectedParish && { backgroundColor: Colors.surfaceElevated, borderColor: Colors.gold }, pressed && { opacity: 0.8 }]}
                >
                  <Text style={[chipStyles.label, !selectedParish && { color: Colors.gold }]}>All Parishes</Text>
                </Pressable>
                {PARISHES.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setSelectedParish(selectedParish === p ? null : p)}
                    style={({ pressed }) => [chipStyles.chip, selectedParish === p && { backgroundColor: Colors.surfaceElevated, borderColor: Colors.gold }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={[chipStyles.label, selectedParish === p && { color: Colors.gold }]}>{p}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Featured */}
              {featured.length > 0 && !search && !selectedCat && !selectedParish && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Featured</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                    {featured.map((biz) => (
                      <BusinessCardFeatured key={biz.id} business={biz} onPress={() => openBusiness(biz.id)} />
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Near You */}
              {nearby.length > 0 && !search && !selectedCat && !selectedParish && (
                <>
                  <View style={styles.sectionHeader}>
                    <MaterialIcons name="near-me" size={16} color={Colors.gold} />
                    <Text style={styles.sectionTitle}>Near You</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                    {nearby.slice(0, 8).map((biz) => (
                      <BusinessCardFeatured key={biz.id} business={biz} onPress={() => openBusiness(biz.id)} />
                    ))}
                  </ScrollView>
                </>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {search || selectedCat || selectedParish ? 'Results' : 'All Businesses'}
                </Text>
                <Text style={styles.sectionCount}>{displayedBusinesses().length}</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="store" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No businesses found</Text>
              <Text style={styles.emptyBody}>Try adjusting your filters or search terms.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  myBizBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  searchRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.base, paddingVertical: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  catRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  sectionCount: { fontSize: Typography.sm, color: Colors.textMuted, marginLeft: 4 },
  featuredRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  emptyState: { alignItems: 'center', paddingVertical: 64, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary, textAlign: 'center' },
  emptyBody: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
