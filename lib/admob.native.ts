// Native (iOS / Android) — real Google Mobile Ads initialisation.
import mobileAds from 'react-native-google-mobile-ads';

export async function initializeAdMob(): Promise<void> {
  try {
    const adapterStatuses = await mobileAds().initialize();
    if (__DEV__) {
      console.log('[AdMob] Google Mobile Ads initialized', adapterStatuses);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[AdMob] Initialization failed', error);
    }
  }
}
