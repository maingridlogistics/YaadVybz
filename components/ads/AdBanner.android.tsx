// Native (iOS / Android) — static import is safe here because Metro only
// bundles this file on iOS/Android (never on web, per .native.tsx extension).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { BANNER_AD_UNIT_ID } from '@/constants/admob';

export default function AdBanner() {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={(error: unknown) => {
          console.warn('[AdMob] Banner failed to load:', error);
          setFailed(true);
        }}
        onAdLoaded={() => {
          if (__DEV__) console.log('[AdMob] Banner loaded');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    overflow: 'hidden',
  },
});
