// Dynamic Expo config layered on top of app.json.
//
// ANDROID IAP BUILD FIX (react-native-iap store flavor dimension):
// react-native-iap defines a Gradle product flavor dimension named "store"
// with variants "play" (Google Play Billing) and "amazon" (Amazon Appstore).
// When the consuming app does not define this dimension, Gradle 8.x fails with:
//   "Could not resolve project :react-native-iap — cannot choose between
//    amazonReleaseRuntimeElements and playReleaseRuntimeElements"
//
// Fix: inject `missingDimensionStrategy "store", "play"` into the app's
// defaultConfig block so Gradle always selects the Google Play variant.
//
// withIAPPlayStoreFlavor uses @expo/config-plugins withAppBuildGradle, which:
//   • runs during every `expo prebuild` (including EAS cloud prebuild)
//   • modifies the generated android/app/build.gradle before Gradle resolves deps
//   • is idempotent — skipped if the line already exists
//
// @expo/config-plugins is a transitive dependency of expo; no separate install.

const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Injects missingDimensionStrategy into android/app/build.gradle defaultConfig.
 * Selects the "play" (Google Play Billing) variant of react-native-iap.
 * Does NOT add Vybz Hub product flavors — debug/release builds are unchanged.
 */
const withIAPPlayStoreFlavor = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;

    // Idempotency guard — do not insert twice
    if (contents.includes('missingDimensionStrategy "store", "play"')) {
      return cfg;
    }

    // Insert into the first defaultConfig { ... } block.
    // The generated build.gradle always contains exactly one defaultConfig block.
    cfg.modResults.contents = contents.replace(
      /(\s*defaultConfig\s*\{)/,
      `$1\n        missingDimensionStrategy "store", "play"`,
    );

    return cfg;
  });
};

module.exports = ({ config }) => {
  const isProduction =
    process.env.EAS_BUILD_PROFILE === 'production';

  const existingPlugins = Array.isArray(config.plugins)
    ? config.plugins
    : [];

  // Remove the Stripe native config plugin.
  // Payments currently use hosted Stripe Checkout, so native
  // Apple Pay / Google Pay configuration is not required.
  const pluginsWithoutStripe = existingPlugins.filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== '@stripe/stripe-react-native';
  });

  return {
    ...config,

    plugins: [
      ...pluginsWithoutStripe,
      // Must be last so it runs after all other plugins have written build.gradle
      withIAPPlayStoreFlavor,
    ],

    // Explicitly anchor the Android package name so no EAS remote or cached
    // configuration can override the value set in app.json.
    android: {
      ...config.android,
      package: 'com.chambex.vybzhub',
    },

    ios: {
      ...config.ios,

      config: {
        ...config.ios?.config,
        usesNonExemptEncryption: false,
      },

      entitlements: {
        ...config.ios?.entitlements,
        'aps-environment': isProduction
          ? 'production'
          : 'development',
      },
    },
  };
};
