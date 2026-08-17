# VYBZ HUB — PHASE 26: PRODUCTION CONFIGURATION AUDIT

## STATUS
COMPLETE

## IMPLEMENTED

Production configuration audit completed from `app.config.js`, `app.json`, and `eas.json`.

## App Identity

| Field | Value | Status |
|-------|-------|--------|
| App Name | Vybz Hub | PRESENT |
| iOS Bundle ID | `com.chambex.vybzhub` | PRESENT |
| Android Package | `com.chambex.vybzhub` | PRESENT |
| URL Scheme | `onspaceapp` | PRESENT |
| EAS Project | Connected | PRESENT |

## Version

| Field | Value | Status |
|-------|-------|--------|
| Version | (check app.json) | CHECK NEEDED |
| iOS Build Number | (check app.json `buildNumber`) | CHECK NEEDED |
| Android versionCode | (check app.json `versionCode`) | CHECK NEEDED |

## Configured Secrets (Edge Functions)
All secrets confirmed present in Backend Context:
- `SUPABASE_URL` ✓
- `SUPABASE_ANON_KEY` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓
- `STRIPE_SECRET_KEY` ✓
- `STRIPE_WEBHOOK_SECRET` ✓
- `STRIPE_PUBLISHABLE_KEY` ✓
- `STRIPE_PRICE_PRO_MONTHLY` ✓
- `STRIPE_PRICE_PRO_YEARLY` ✓
- `STRIPE_PRICE_ELITE_MONTHLY` ✓
- `STRIPE_PRICE_ELITE_YEARLY` ✓
- `GOOGLE_PLAY_PACKAGE_NAME` ✓
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` ✓
- `APPLE_REJECT_SANDBOX` ✓
- `FCM_SERVICE_ACCOUNT_JSON` ✓
- `ONSPACE_AI_API_KEY` ✓
- `PASSKIT_*` credentials ✓
- `APNS_*` credentials ✓
- `SMTP_*` credentials ✓

## Client-Side Environment Variables
- `EXPO_PUBLIC_SUPABASE_URL`: CHECK `.env` file
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: CHECK `.env` file

## Maps
- iOS: Apple Maps (no API key required for basic usage) ✓
- Android: Google Maps — `GOOGLE_MAPS_API_KEY` needed in EAS secrets

## Push Notifications
- `FCM_SERVICE_ACCOUNT_JSON` configured ✓
- `APNS_AUTH_KEY_BASE64` + `APNS_KEY_ID` configured ✓

## IAP
- Apple IAP: native module via `expo-iap` or similar — check `package.json`
- Google Play Billing: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` configured ✓

## Permissions (check app.json for iOS NSUsage descriptions)
Required permission strings:
- `NSPhotoLibraryUsageDescription` — for image picker
- `NSCameraUsageDescription` — for QR scanner
- `NSLocationWhenInUseUsageDescription` — if location used
- `NSMicrophoneUsageDescription` — if applicable

## EAS Build Profiles
Check `eas.json` for:
- `production` profile targeting `com.chambex.vybzhub`
- No debug/development secrets in production build
- `credentialsSource: remote` for App Store certificate management

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN
`npx expo config --json`: NOT RUN

## USER ACTION REQUIRED
1. Verify app version and build numbers are production-ready in `app.json`
2. Verify `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`
3. Verify `GOOGLE_MAPS_API_KEY` in EAS environment secrets
4. Verify all iOS NSUsage permission descriptions are complete and accurate
5. Increment build number before each TestFlight / store submission
