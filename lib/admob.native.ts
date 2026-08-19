// Native (iOS / Android) — real Google Mobile Ads initialisation.
// Uses require() inside the function body so the native module is never
// accessed at bundle evaluation time (prevents AppRegistry crash).
export async function initializeAdMob(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { default: mobileAds } = require('react-native-google-mobile-ads') as {
      default: () => { initialize: () => Promise<unknown> };
    };
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
