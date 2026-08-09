// Dynamic Expo config layered on top of app.json.

let withGradleProperties, withProjectBuildGradle;
try {
  ({ withGradleProperties, withProjectBuildGradle } = require('@expo/config-plugins'));
} catch (_) {
  // @expo/config-plugins not available — Gradle overrides skipped.
  withGradleProperties = null;
  withProjectBuildGradle = null;
}

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

  // ── openiap-google version override ───────────────────────────────────────
  //
  // expo-iap 5.1.0 pulls in openiap-google:3.1.0, which was compiled with
  // Kotlin 2.4.x (metadata_version 2.4.0). Expo SDK 54 uses Kotlin 2.1.20
  // and KSP only supports up to Kotlin 2.2.20 — so there is no Kotlin version
  // that satisfies BOTH the KSP constraint and openiap-google 3.1.0.
  //
  // Solution: force openiap-google to 2.0.0, which was compiled with
  // Kotlin 1.x/2.0.x and is compatible with Kotlin 2.1.20 + KSP.
  // The Google Play Billing client (billing:7.x) bundled in 2.0.0 is still
  // fully supported for Play Store submission.
  //
  // This Gradle allprojects resolutionStrategy override survives prebuild
  // --clean because it is applied as a config mod.
  if (!withProjectBuildGradle) return baseConfig;

  return withProjectBuildGradle(baseConfig, (cfg) => {
    const contents = cfg.modResults.contents;
    const marker = 'io.github.hyochan.openiap:openiap-google';
    // Only inject once.
    if (contents.includes(marker)) return cfg;

    const resolutionBlock = `
    // Force openiap-google to a Kotlin 2.1.x-compatible version.
    // openiap-google 3.1.0 (default from expo-iap 5.1.0) was compiled with
    // Kotlin 2.4.x metadata which is incompatible with KSP + Kotlin 2.1.20.
    configurations.all {
        resolutionStrategy {
            force 'io.github.hyochan.openiap:openiap-google:2.0.0'
        }
    }
`;

    cfg.modResults.contents = contents.replace(
      /allprojects\s*\{/,
      `allprojects {${resolutionBlock}`,
    );
    return cfg;
  });
};
