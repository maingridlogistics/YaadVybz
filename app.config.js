// app.config.js — dynamic config layer on top of app.json
//
// Expo evaluates this file at build time and merges it with app.json.
// The function form receives the base config from app.json as `config`.
//
// Purpose: make aps-environment environment-aware so development-profile builds
// receive iOS push notifications during testing (APNs rejects a "production"
// entitlement on dev-signed builds and vice-versa).
//
// EAS sets EAS_BUILD_PROFILE during `eas build` to the profile name (e.g.
// "development", "preview", "production").  Non-EAS / local `expo run:ios`
// builds leave it undefined, which defaults to "development" — correct for
// simulator and local device runs.

module.exports = ({ config }) => {
  const isProduction = process.env.EAS_BUILD_PROFILE === 'production';

  return {
    ...config,
    ios: {
      ...config.ios,
      entitlements: {
        ...config.ios?.entitlements,
        'aps-environment': isProduction ? 'production' : 'development',
      },
    },
  };
};
