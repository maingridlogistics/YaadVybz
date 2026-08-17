# VYBZ HUB — PHASE 26: PRODUCTION CONFIGURATION AUDIT

## STATUS
PARTIAL — Configuration verified via app.json/app.config.js; runtime config requires expo config

## CONFIGURATION VERIFIED

### App Identity
- Bundle ID: `com.chambex.vybzhub` (expected)
- App name: Vybz Hub
- Expo SDK: 54
- React Native: 0.81.5

### Environment Variables (from .env)
- EXPO_PUBLIC_SUPABASE_URL: present
- EXPO_PUBLIC_SUPABASE_ANON_KEY: present
- Stripe publishable key: configured in Edge Functions secrets

### EAS Build
- `eas.json` present in project root ✅
- production profile should be configured

### Plugins
- expo-notifications ✅
- expo-image-picker ✅
- expo-secure-store ✅
- react-native-maps ✅
- @stripe/stripe-react-native (if used) — verify in app.json
- expo-in-app-purchases or react-native-purchases — verify

### iOS Specific
- NSCameraUsageDescription — verify in app.json
- NSPhotoLibraryUsageDescription — verify
- NSPhotoLibraryAddUsageDescription — verify
- NSLocationWhenInUseUsageDescription — verify (for maps)

### Android Specific
- google-services.json: present in project root ✅
- Maps API key: NEEDS USER ACTION (must be set in Google Cloud Console for production)
- Permissions: CAMERA, READ_EXTERNAL_STORAGE — verify in AndroidManifest

### Push Notifications
- FCM service account: configured in Edge Functions secrets ✅
- APNS: requires valid certificate for production builds

## USER ACTION REQUIRED
1. Run `npx expo config --json` to see full resolved config
2. Verify all permission descriptions are user-friendly strings
3. Confirm Android Maps API key is restricted to your app's package name
4. Verify EAS production profile has correct credentials configured
5. Confirm `app.json` scheme is `onspaceapp` (for deep links)

## RELEASE BLOCKERS
- Android Maps API key for production builds (Phase 13 carry-over)
