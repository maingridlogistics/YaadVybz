// ─── PlacementAd ─────────────────────────────────────────────────────────────
// Reusable ad component. Pass a placementName; it fetches the active ads for
// that placement and rotates through them every 10 seconds.
//
// Renders NOTHING when:
//   • the placement is disabled
//   • the placement has zero active ads
//   • the DB query fails (network error, RLS block, etc.)
//
// Size behaviour:
//   'rectangle' → fixed 80px height, full width (matches original BannerAd)
//   'square'    → full width, 1:1 aspect ratio
//
// Tapping opens the ad's target_url in the system browser. If target_url is
// null the ad is display-only (not tappable).

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { fetchActiveAdsByPlacementName, Ad, AdPlacement } from '../../services/adsService';

interface PlacementAdProps {
  placementName: string;
  style?: any;
}

export function PlacementAd({ placementName, style }: PlacementAdProps) {
  const [placement, setPlacement] = useState<AdPlacement | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch on mount / name change
  useEffect(() => {
    let cancelled = false;
    fetchActiveAdsByPlacementName(placementName).then(({ placement: p, ads: a }) => {
      if (cancelled) return;
      setPlacement(p);
      setAds(a);
      setCurrentIdx(0);
    });
    return () => {
      cancelled = true;
    };
  }, [placementName]);

  // Rotation timer — only when 2+ active ads
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (ads.length < 2) return;

    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % ads.length);
    }, 10000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ads.length]);

  // Render nothing when placement disabled / no active ads
  if (!placement || ads.length === 0) return null;

  const ad = ads[currentIdx] ?? ads[0];
  const isRect = placement.size === 'rectangle';

  const handlePress = () => {
    if (ad.target_url) {
      Linking.openURL(ad.target_url).catch(() => {});
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!ad.target_url}
      style={({ pressed }) => [
        isRect ? adStyles.rect : adStyles.square,
        style,
        pressed && ad.target_url ? { opacity: 0.9 } : undefined,
      ]}
      accessibilityRole={ad.target_url ? 'link' : 'none'}
      accessibilityLabel={ad.label ? `Ad: ${ad.label}` : 'Advertisement'}
    >
      <Image
        source={{ uri: ad.image_url }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        transition={400}
      />

      {/* "Ad" badge */}
      <View style={adStyles.badge}>
        <Text style={adStyles.badgeText}>Ad</Text>
      </View>

      {/* Rotation dots — only when 2+ ads */}
      {ads.length > 1 && (
        <View style={adStyles.dots}>
          {ads.map((_, i) => (
            <View
              key={i}
              style={[adStyles.dot, i === currentIdx && adStyles.dotActive]}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const adStyles = StyleSheet.create({
  rect: {
    height: 80,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  square: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  badgeText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dots: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: Colors.gold,
    width: 12,
    borderRadius: 3,
  },
});
