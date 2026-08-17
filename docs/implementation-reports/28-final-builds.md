# VYBZ HUB — PHASE 28: FINAL iOS + ANDROID BUILDS

## STATUS
NEEDS USER ACTION — EAS build execution requires terminal + EAS credentials

## BUILD COMMANDS

```bash
# iOS Production Build
eas build --platform ios --profile production

# Android Production Build  
eas build --platform android --profile production

# Both platforms
eas build --platform all --profile production
```

## PRE-BUILD CHECKLIST
- [ ] TypeScript: 0 errors (`npx tsc --noEmit`)
- [ ] ESLint: 0 errors (`npx eslint .`)
- [ ] Expo Doctor: 18/18 (`npx expo-doctor`)
- [ ] EAS project linked (`eas project:info`)
- [ ] iOS distribution certificate configured in EAS
- [ ] iOS provisioning profile configured in EAS
- [ ] Android keystore configured in EAS
- [ ] `eas.json` production profile verified
- [ ] Environment variables set in EAS secrets (or .env committed for EAS)
- [ ] `app.json` version/buildNumber incremented
- [ ] Google Maps API key set for Android production

## EXPECTED OUTPUTS
- iOS: `.ipa` file for App Store submission
- Android: `.aab` (Android App Bundle) for Google Play submission

## VALIDATION
NOT RUN — requires EAS CLI and credentials.
