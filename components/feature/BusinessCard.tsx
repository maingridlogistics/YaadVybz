// ─── BusinessCard Component ───────────────────────────────────────────────────
// Dedicated card for Business Directory listings.
// NOT derived from EventCard — different content structure.
//
// Props:
//   business  — result from search_businesses RPC
//   onPress   — navigation handler
//   variant   — 'row' (default) | 'featured' (larger hero card for rails)

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { BusinessSearchResult } from '../../services/businessService';

// ─── Location type labels ─────────────────────────────────────────────────────
const LOCATION_TYPE_LABELS: Record<string, string> = {
  physical:   '',       // No label — town/parish is sufficient
  home_based: 'Home-based',
  mobile:     'Mobile',
  online:     'Online',
  hybrid:     'Hybrid',
};

function locationLabel(locationType: string, town: string, parish: string, servesParish: boolean): string {
  if (servesParish) return `Serves ${parish}`;
  const typeLabel = LOCATION_TYPE_LABELS[locationType];
  if (locationType === 'online') return 'Online';
  if (town) return typeLabel ? `${town}, ${parish} · ${typeLabel}` : `${town}, ${parish}`;
  return typeLabel ? `${parish} · ${typeLabel}` : parish;
}

// ─── Rating Stars (only rendered when avg_rating > 0) ────────────────────────
function RatingRow({ rating, count }: { rating: number; count: number }) {
  const stars = Math.round(rating);
  return (
    <View style={rs.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <MaterialIcons
          key={i}
          name={i < stars ? 'star' : 'star-border'}
          size={12}
          color={i < stars ? Colors.gold : Colors.textMuted}
        />
      ))}
      <Text style={rs.count}>{rating.toFixed(1)}</Text>
      {count > 0 && <Text style={rs.countParens}>({count})</Text>}
    </View>
  );
}

const rs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  count: { fontSize: 11, color: Colors.gold, fontWeight: Typography.bold, marginLeft: 3 },
  countParens: { fontSize: 10, color: Colors.textMuted },
});

// ─── Row Card (default) ───────────────────────────────────────────────────────

function BusinessCardRow({
  business,
  onPress,
}: {
  business: BusinessSearchResult;
  onPress: () => void;
}) {
  const locLabel = locationLabel(
    business.location_type,
    business.town,
    business.primary_parish,
    business.serves_parish,
  );

  const hasRating = business.avg_rating != null && business.avg_rating > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [rowS.card, pressed && { opacity: 0.82 }]}
      accessibilityRole="button"
      accessibilityLabel={`${business.name}, ${business.category_label}`}
    >
      {/* Image / Logo */}
      <View style={rowS.imgWrap}>
        {business.cover_url || business.logo_url ? (
          <Image
            source={{ uri: (business.cover_url ?? business.logo_url)! }}
            style={rowS.img}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[rowS.img, rowS.imgPlaceholder]}>
            <MaterialIcons
              name={business.category_icon as any}
              size={28}
              color={business.category_color}
            />
          </View>
        )}
        {/* Logo overlay when cover is set but logo exists */}
        {business.cover_url && business.logo_url && (
          <View style={rowS.logoOverlay}>
            <Image
              source={{ uri: business.logo_url }}
              style={rowS.logo}
              contentFit="cover"
              transition={200}
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={rowS.content}>
        <View style={rowS.nameRow}>
          <Text style={rowS.name} numberOfLines={1}>{business.name}</Text>
          {business.verified && (
            <MaterialIcons name="verified" size={14} color={Colors.gold} />
          )}
        </View>

        {/* Category chip */}
        <View style={rowS.categoryRow}>
          <View style={[rowS.categoryDot, { backgroundColor: business.category_color }]} />
          <Text style={[rowS.categoryLabel, { color: business.category_color }]}>
            {business.category_label}
          </Text>
        </View>

        {/* Location */}
        <View style={rowS.locationRow}>
          <MaterialIcons
            name={business.serves_parish ? 'near-me' : 'place'}
            size={11}
            color={business.serves_parish ? Colors.info : Colors.textMuted}
          />
          <Text
            style={[rowS.locationText, business.serves_parish && { color: Colors.info }]}
            numberOfLines={1}
          >
            {locLabel}
          </Text>
        </View>

        {/* Rating row — only shown when real review data exists */}
        {hasRating && (
          <RatingRow rating={business.avg_rating!} count={business.review_count} />
        )}
      </View>

      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} style={rowS.chevron} />
    </Pressable>
  );
}

const rowS = StyleSheet.create({
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
    minHeight: 80,
  },
  imgWrap: {
    width: 80,
    height: 80,
    position: 'relative',
    flexShrink: 0,
  },
  img: {
    width: 80,
    height: 80,
  },
  imgPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 28,
    height: 28,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  logo: { width: 28, height: 28 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: Typography.semibold,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
  },
  chevron: {
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
});

// ─── Featured Card (horizontal rail, larger) ──────────────────────────────────

function BusinessCardFeatured({
  business,
  onPress,
}: {
  business: BusinessSearchResult;
  onPress: () => void;
}) {
  const hasRating = business.avg_rating != null && business.avg_rating > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [featS.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${business.name}, ${business.category_label}`}
    >
      {/* Cover image */}
      {business.cover_url ? (
        <Image
          source={{ uri: business.cover_url }}
          style={featS.cover}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[featS.cover, featS.coverPlaceholder]}>
          <MaterialIcons
            name={business.category_icon as any}
            size={40}
            color={business.category_color}
          />
        </View>
      )}

      {/* Verified badge */}
      {business.verified && (
        <View style={featS.verifiedBadge}>
          <MaterialIcons name="verified" size={12} color={Colors.textOnGold} />
          <Text style={featS.verifiedText}>Verified</Text>
        </View>
      )}

      {/* Category color accent bar */}
      <View style={[featS.accentBar, { backgroundColor: business.category_color }]} />

      <View style={featS.content}>
        <Text style={featS.name} numberOfLines={2}>{business.name}</Text>
        <View style={featS.categoryRow}>
          <MaterialIcons name={business.category_icon as any} size={11} color={business.category_color} />
          <Text style={[featS.categoryLabel, { color: business.category_color }]}>
            {business.category_label}
          </Text>
        </View>
        <View style={featS.locationRow}>
          <MaterialIcons
            name={business.serves_parish ? 'near-me' : 'place'}
            size={10}
            color={Colors.textMuted}
          />
          <Text style={featS.locationText} numberOfLines={1}>
            {business.town ? `${business.town}, ${business.primary_parish}` : business.primary_parish}
          </Text>
        </View>
        {hasRating && (
          <RatingRow rating={business.avg_rating!} count={business.review_count} />
        )}
      </View>
    </Pressable>
  );
}

const featS = StyleSheet.create({
  card: {
    width: 180,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: 110,
  },
  coverPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  content: {
    padding: Spacing.md,
    gap: 4,
  },
  name: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: Typography.semibold,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 10,
    color: Colors.textMuted,
    flex: 1,
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

export interface BusinessCardProps {
  business: BusinessSearchResult;
  onPress: () => void;
  variant?: 'row' | 'featured';
}

export function BusinessCard({ business, onPress, variant = 'row' }: BusinessCardProps) {
  if (variant === 'featured') {
    return <BusinessCardFeatured business={business} onPress={onPress} />;
  }
  return <BusinessCardRow business={business} onPress={onPress} />;
}
