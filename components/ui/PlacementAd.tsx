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
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { fetchActiveAdsByPlacementName, Ad, AdPlacement } from '../../services/adsService';

interface PlacementAdProps {
  placementName: string;
  style?: any;
}

export function PlacementAd({ placementName, style }: PlacementAdProps) {
  const router = useRouter();
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
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ads.length]);

  // Render nothing when placement is disabled or not found
  if (!placement) return null;

  // No active ads — show "Advertise Here" placeholder
  if (ads.length === 0) {
    const isRectPlaceholder = placement.size === 'rectangle';
    return (
      <Pressable
        onPress={() => router.push('/advertise' as any)}
        style={({ pressed }) => [
          isRectPlaceholder ? adStyles.rect : adStyles.square,
          adStyles.placeholder,
          style,
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Advertise here"
      >
        <View style={adStyles.placeholderInner}>
          <View style={adStyles.placeholderIcon}>
            <MaterialIcons name="campaign" size={isRectPlaceholder ? 18 : 28} color={Colors.gold} />
          </View>
          <View style={adStyles.placeholderText}>
            <Text style={adStyles.placeholderTitle}>Advertise Here</Text>
            {!isRectPlaceholder && (
              <Text style={adStyles.placeholderSub}>Reach thousands of event-goers across Jamaica</Text>
            )}
          </View>
          <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.gold} />
        </View>
      </Pressable>
    );
  }

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
        transition={300}
      />

      {/* Sponsored label strip */}
      <View style={adStyles.sponsoredStrip}>
        <Text style={adStyles.sponsoredText}>Sponsored</Text>
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
  sponsoredStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  sponsoredText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flex: 1,
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
  placeholder: {
    borderStyle: 'dashed',
    borderColor: `${Colors.gold}66`,
    borderWidth: 1.5,
    backgroundColor: Colors.goldSurface,
  },
  placeholderInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  placeholderIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: `${Colors.gold}22`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
    flexShrink: 0,
  },
  placeholderText: {
    flex: 1,
    gap: 2,
  },
  placeholderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  placeholderSub: {
    fontSize: 10,
    color: `${Colors.gold}99`,
    lineHeight: 14,
  },
});
