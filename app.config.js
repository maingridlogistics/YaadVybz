// Dynamic Expo config layered on top of app.json.

const { withGradleProperties } = require('@expo/config-plugins');

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

  // ── Base config ────────────────────────────────────────────────────────────
  const baseConfig = {
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
  };

  // ── Kotlin compiler version alignment ──────────────────────────────────────
  //
  // expo-iap 5.1.0 pulls in openiap-google 3.1.0, which was compiled with
  // Kotlin 2.4.x. Its AAR class files carry Kotlin metadata version 2.4.0.
  //
  // Expo SDK 54's default Kotlin compiler is 2.1.20, which hard-rejects any
  // module whose metadata_version > [2, 1, x]. This is a bytecode-level
  // incompatibility — forcing kotlin-stdlib to a lower version does NOT fix it
  // because the incompatibility is in the compiled AAR bytes, not the runtime.
  //
  // Setting kotlinVersion=2.4.10 in gradle.properties causes Expo's generated
  // android/build.gradle to load kotlin-gradle-plugin:2.4.10, which can read
  // both Kotlin 2.4.x metadata (openiap-google) and all Kotlin 2.1.x modules
  // (Expo SDK 54 native modules) — Kotlin is backwards-compatible in this
  // direction: newer compiler reads older bytecode without issue.
  //
  // This override survives expo prebuild --clean because it is applied as a
  // config mod, not as a manual edit to the generated android/ directory.
  return withGradleProperties(baseConfig, (cfg) => {
    // Remove any pre-existing kotlinVersion entries to avoid duplicate keys.
    cfg.modResults = cfg.modResults.filter(
      (item) => item.key !== 'kotlinVersion' && item.key !== 'kotlin.version',
    );
    // Set the Kotlin compiler version to match openiap-google's requirement.
    cfg.modResults.push({ type: 'property', key: 'kotlinVersion', value: '2.4.10' });
    return cfg;
  });
};
