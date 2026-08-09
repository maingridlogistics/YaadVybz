// Dynamic Expo config layered on top of app.json.

let withProjectBuildGradle;
try {
  ({ withProjectBuildGradle } = require('@expo/config-plugins'));
} catch (_) {
  // @expo/config-plugins not available — Kotlin override skipped.
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

  // ── Android: Kotlin metadata version compatibility ────────────────────────
  //
  // expo-iap 5.1.0 depends on openiap-google:3.1.0 (hardcoded in its config
  // plugin). openiap-google:3.1.0 was compiled with Kotlin 2.4.x and carries
  // Kotlin metadata version 2.4.0 inside its AAR.
  //
  // Expo SDK 54 uses Kotlin 2.1.20. The Kotlin 2.1.20 compiler refuses to
  // read metadata version 2.4.0 and hard-fails before compilation begins.
  //
  // FIX: -Xskip-metadata-version-check instructs the Kotlin compiler to
  // attempt to read the metadata regardless of its version header. The actual
  // JVM bytecode inside openiap-google is standard Java bytecode and is fully
  // binary-compatible with Kotlin 2.1.20. The billing symbols expo-iap uses
  // (OpenIapSubscriptionBillingIssueListener, showInAppMessages, etc.) are
  // plain Java class/interface definitions — no Kotlin 2.4.x-only intrinsics.
  //
  // kotlinVersion is NOT overridden — Expo SDK 54's default (2.1.20) is kept,
  // so KSP (max 2.2.20) and all other Expo tooling stay compatible.
  //
  // openiap-google version is NOT overridden — 3.1.0 is used as expo-iap
  // 5.1.0 requires, preventing the "unresolved symbol" compile errors that
  // occur when a lower version (2.0.0) is forced.
  if (!withProjectBuildGradle) return baseConfig;

  return withProjectBuildGradle(baseConfig, (cfg) => {
    if (!cfg.modResults?.contents) return cfg;
    const contents = cfg.modResults.contents;
    const marker = '-Xskip-metadata-version-check';
    // Only inject once.
    if (contents.includes(marker)) return cfg;

    const kotlinCompatPatch = `
    // expo-iap 5.1.0 + openiap-google 3.1.0 Kotlin metadata compatibility.
    // Kotlin 2.1.20 (Expo SDK 54) cannot parse openiap-google 3.1.0 metadata
    // (compiled with Kotlin 2.4.x, version header 2.4.0) without this flag.
    // The JVM bytecode is standard Java and is fully binary-compatible.
    afterEvaluate {
        tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
            kotlinOptions {
                freeCompilerArgs += ['-Xskip-metadata-version-check']
            }
        }
    }
`;

    cfg.modResults.contents = contents.replace(
      /allprojects\s*\{/,
      `allprojects {${kotlinCompatPatch}`,
    );
    return cfg;
  });
};
