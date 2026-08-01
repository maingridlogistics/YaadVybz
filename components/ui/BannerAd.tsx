import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { MOCK_ADS, BannerAd } from '../../constants/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  style?: any;
  adIndex?: number; // fixed index; if undefined, rotates automatically
}

export function BannerAdCard({ style, adIndex }: Props) {
  const [idx, setIdx] = useState(adIndex ?? Math.floor(Math.random() * MOCK_ADS.length));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (adIndex !== undefined) return; // fixed
    timerRef.current = setTimeout(() => {
      setIdx((prev) => (prev + 1) % MOCK_ADS.length);
    }, 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, adIndex]);

  const ad: BannerAd = MOCK_ADS[idx % MOCK_ADS.length];

  return (
    <Pressable
      onPress={() => Linking.openURL(ad.ctaUrl).catch(() => {})}
      style={({ pressed }) => [bannerStyles.container, style, pressed && { opacity: 0.9 }]}
    >
      {/* Background image */}
      <Image source={{ uri: ad.imageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={300} />

      {/* Dim overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.72)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ad label */}
      <View style={bannerStyles.adTag}>
        <Text style={bannerStyles.adTagText}>Ad</Text>
      </View>

      {/* Content */}
      <View style={bannerStyles.content}>
        <View style={bannerStyles.textBlock}>
          <Text style={bannerStyles.businessName} numberOfLines={1}>{ad.businessName}</Text>
          <Text style={bannerStyles.tagline} numberOfLines={2}>{ad.tagline}</Text>
        </View>
        <View style={[bannerStyles.cta, { backgroundColor: ad.accentColor }]}>
          <Text style={bannerStyles.ctaText}>{ad.ctaLabel}</Text>
          <MaterialIcons name="arrow-forward" size={12} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    height: 72,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.base,
  },
  adTag: {
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
  adTagText: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 0.5 },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  textBlock: { flex: 1 },
  businessName: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#fff',
    lineHeight: 18,
  },
  tagline: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 15,
    marginTop: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.full,
    flexShrink: 0,
  },
  ctaText: { fontSize: 11, fontWeight: Typography.bold, color: '#fff' },
});
