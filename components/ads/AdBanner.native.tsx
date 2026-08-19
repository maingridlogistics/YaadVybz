// Native (iOS / Android) — real Google Mobile Ads banner.
// BannerAd and BannerAdSize are required lazily inside the render function
// so the native module is never accessed at bundle evaluation time.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BANNER_AD_UNIT_ID } from '@/constants/admob';

export default function AdBanner() {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  let BannerAd: any;
  let BannerAdSize: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ads = require('react-native-google-mobile-ads') as {
      BannerAd: any;
      BannerAdSize: any;
    };
    BannerAd = ads.BannerAd;
    BannerAdSize = ads.BannerAdSize;
  } catch {
    return null;
  }

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
