# VYBZ HUB — PHASE 28: FINAL iOS + ANDROID BUILDS

## STATUS
NEEDS USER ACTION

## IMPLEMENTED

Build preparation checklist completed. EAS build commands prepared.

## Pre-Build Verification Checklist

### Before iOS Build
- [ ] `app.json` version and buildNumber incremented
- [ ] `eas.json` production profile configured with `ios.credentialsSource: "remote"`
- [ ] Apple Developer Team ID configured in EAS
- [ ] Distribution certificate and provisioning profile available in EAS
- [ ] No debug-only secrets in production environment variables
- [ ] `expo-iap` or native IAP module confirmed in dependencies

### Before Android Build
- [ ] `app.json` versionCode incremented
- [ ] `eas.json` Android production profile configured
- [ ] Keystore available in EAS remote credentials
- [ ] Google Maps API key available as EAS secret
- [ ] `google-services.json` present in repo root (for FCM)

## Build Commands

```bash
# iOS Production Build
eas build --platform ios --profile production

# Android Production Build
eas build --platform android --profile production

# Both Platforms
eas build --platform all --profile production

# Preview the EAS config before building
eas build:configure
npx expo config --json
```

## Expected Build Outputs
- iOS: `.ipa` file submitted directly to App Store Connect via EAS Submit, or downloaded for manual upload
- Android: `.aab` (Android App Bundle) for Google Play, or `.apk` for direct install testing

## EAS Submit Commands (after successful build)
```bash
# Submit iOS to TestFlight
eas submit --platform ios --profile production

# Submit Android to Google Play internal testing
eas submit --platform android --profile production
```

## Native Module Verification
Before building, confirm these native modules are properly linked:
- `react-native-maps` — Maps (iOS: MapKit, Android: Google Maps)
- IAP module (Apple/Google billing)
- `expo-camera` — QR scanner
- `expo-image-picker` — image picker
- `expo-notifications` — push notifications
- `expo-av` — audio playback
- `react-native-safe-area-context`
- `react-native-reanimated`

## NOT RUN
iOS build: NOT RUN — requires Apple Developer account and EAS build credits
Android build: NOT RUN — requires Google Play account and EAS build credits

## USER ACTION REQUIRED
1. Ensure Apple Developer account is active ($99/year)
2. Ensure EAS account has sufficient build credits
3. Run `eas build --platform ios --profile production`
4. Run `eas build --platform android --profile production`
5. Test APK on physical Android device before Play Store submission
6. Distribute iOS build via TestFlight before App Store submission
