// iOS stub — Google Mobile Ads is not configured for iOS.
// react-native-google-mobile-ads is excluded from iOS autolinking via
// react-native.config.js. This file ensures initializeAdMob() is a no-op
// on iOS so no native bridge call is ever attempted.
export function initializeAdMob(): Promise<void> {
  return Promise.resolve();
}
