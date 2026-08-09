// Dynamic Expo config layered on top of app.json.

const { withAppBuildGradle } = require('@expo/config-plugins');

// react-native-iap ships both an "amazon" and a "play" product flavor
// under a `store` flavor dimension. Since this app doesn't declare that
// dimension itself, Gradle can't pick a variant when resolving
// react-native-iap and the release build fails with a variant ambiguity
// error ("Could not resolve project :react-native-iap"). This plugin
// pins the app to the "play" flavor on every prebuild.
const withIapStoreFlavor = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("missingDimensionStrategy 'store'")) {
      config.modResults.contents = config.modResults.contents.replace(
        /defaultConfig\s*{/,
        `defaultConfig {\n        missingDimensionStrategy 'store', 'play'`
      );
    }
    return config;
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

  return withIapStoreFlavor({
    ...config,

    plugins: pluginsWithoutStripe,

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
  });
};
