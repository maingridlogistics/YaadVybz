// Native (iOS / Android) — static import is safe here because Metro only
// bundles this file on iOS/Android (never on web, per .native.ts extension).
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
