// ─── React Native Autolinking Configuration ───────────────────────────────────
//
// This file controls which native modules are linked per platform.
//
// react-native-google-mobile-ads — Android only
// ──────────────────────────────────────────────
// Setting platforms.ios = null tells the React Native autolinking resolver to
// completely skip this package on iOS. The Google Mobile Ads SDK (RNGoogleMobileAds,
// Google-Mobile-Ads-SDK, GoogleUserMessagingPlatform) will NOT be compiled or
// linked into the iOS application.
//
// Android is left unspecified (undefined), which means autolinking proceeds
// normally — the SDK is linked, initialized, and renders ads on Android.
//
// This is the ONLY reliable way to exclude a native SDK from iOS autolinking
// without modifying package.json or Podfile manually. JavaScript-layer platform
// guards (.android.tsx files, Platform.OS checks) do NOT prevent native linking.
//
// When an iOS AdMob App ID is obtained in the future:
//   1. Remove the platforms.ios = null entry below.
//   2. Add iosAppId to the react-native-google-mobile-ads plugin in app.config.js.
//   3. Create constants/admob.ios.ts, lib/admob.ios.ts, components/ads/AdBanner.ios.tsx
//      with real implementations.
//   4. Run a clean iOS prebuild and verify GADApplicationIdentifier appears in Info.plist.

module.exports = {
  dependencies: {
    'react-native-google-mobile-ads': {
      platforms: {
        // null = do not autolink this package on iOS.
        // The SDK will NOT be added to Podfile, NOT compiled, and NOT linked.
        ios: null,
        // android: undefined = use default autolinking (SDK fully linked on Android).
      },
    },
  },
};
