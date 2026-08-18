// Dynamic Expo config layered on top of app.json.

let withProjectBuildGradle;
let withAndroidManifest;
let withGradleProperties;
let withInfoPlist;
let withDangerousMod;
try {
  ({ withProjectBuildGradle, withAndroidManifest, withGradleProperties, withInfoPlist, withDangerousMod } = require('@expo/config-plugins'));
} catch (_) {
  // @expo/config-plugins not available — Android overrides skipped.
  withProjectBuildGradle = null;
  withAndroidManifest = null;
  withGradleProperties = null;
  withInfoPlist = null;
  withDangerousMod = null;
}

module.exports = ({ config }) => {
  const isProduction =
    process.env.EAS_BUILD_PROFILE === 'production';

  const existingPlugins = Array.isArray(config.plugins)
    ? config.plugins
    : [];

  // ── Stripe native plugin ──────────────────────────────────────────────────
  // Required for PaymentSheet (Apple Pay, Google Pay, card form) on native.
  // The plugin configures:
  //   iOS  — Apple Pay entitlement, NSFaceIDUsageDescription, URL scheme
  //   Android — Google Pay API, proper activity configuration
  //
  // Apple Pay configuration — ACTIVE
  //   Merchant ID:  merchant.com.chambex.vybzhub
  //   Apple Developer Portal: Registered ✓
  //   Stripe Dashboard (Settings → Apple Pay): Verified, certificate active ✓
  //   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set in .env
  //   Any change to merchantIdentifier requires a new EAS native build.
  const stripePlugin = [
    '@stripe/stripe-react-native',
    {
      merchantIdentifier: 'merchant.com.chambex.vybzhub',
      enableGooglePay: true,
    },
  ];

  // ── @react-native-google-signin/google-signin native plugin ─────────────────
  // Added conditionally so that expo config resolves even when the package is
  // not yet installed (e.g. CI environments, depcheck auto-install pending).
  let googleSignInPlugins = existingPlugins.filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== '@react-native-google-signin/google-signin';
  });
  try {
    require.resolve('@react-native-google-signin/google-signin');
    googleSignInPlugins = [...googleSignInPlugins, '@react-native-google-signin/google-signin'];
  } catch {
    // Package not installed yet — skip plugin to allow expo config to resolve
  }

  // Remove any stale Stripe plugin entry and add the freshly configured one.
  const pluginsWithoutStripe = googleSignInPlugins.filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== '@stripe/stripe-react-native';
  });
  const pluginsWithStripe = [...pluginsWithoutStripe, stripePlugin];

  // ── Base config ────────────────────────────────────────────────────────────
  const baseConfig = {
    ...config,

    plugins: pluginsWithStripe,


    // orientation: "default" is set in app.json so Expo does NOT inject
    // android:screenOrientation on the activity. Large-screen and foldable
    // support requires the activity to be freely resizeable.
    //
    // iOS portrait lock is enforced via withInfoPlist below (sets
    // UISupportedInterfaceOrientations in Info.plist). The ios.orientation
    // field is NOT a valid Expo schema property and causes `expo doctor` to
    // fail, so it must not be set here.
    ios: {
      ...config.ios,

      config: {
        ...config.ios?.config,
        usesNonExemptEncryption: false,
      },

      entitlements: {
        ...config.ios?.entitlements,
        // Required for Sign in with Apple
        'com.apple.developer.applesignin': ['Default'],
        // APNs environment: 'development' for dev/preview builds, 'production' for store.
        // expo-notifications plugin configures the capability; the entitlement value
        // must match the provisioning profile's Push Notifications capability.
        // A new EAS build with Push Notifications enabled in Apple Developer Portal
        // is required after any change here.
        'aps-environment': isProduction ? 'production' : 'development',
        // Required for PKAddPassesViewController (react-native-wallet-manager).
        // Wildcard covers all pass type IDs registered under the team.
        'com.apple.developer.pass-type-identifiers': ['$(TeamIdentifierPrefix)*'],
      },
    },


    // Explicitly anchor the Android package name so no EAS remote or cached
    // configuration can override the value set in app.json.
    android: {
      ...config.android,
      package: 'com.chambex.vybzhub',
    },
  };

  if (!withProjectBuildGradle || !withAndroidManifest || !withGradleProperties || !withInfoPlist || !withDangerousMod) return baseConfig;

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
  // binary-compatible with Kotlin 2.1.20.
  //
  // kotlinVersion is NOT overridden — Expo SDK 54's default (2.1.20) is kept.
  // openiap-google version is NOT overridden — 3.1.0 is used as expo-iap
  // 5.1.0 requires it.
  const withKotlinCompat = (cfg) =>
    withProjectBuildGradle(cfg, (c) => {
      if (!c.modResults?.contents) return c;
      const contents = c.modResults.contents;
      const marker = '-Xskip-metadata-version-check';
      if (contents.includes(marker)) return c;

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
      c.modResults.contents = contents.replace(
        /allprojects\s*\{/,
        `allprojects {${kotlinCompatPatch}`,
      );
      return c;
    });

  // ── Android: Large-screen / orientation / resizability ───────────────────
  //
  // Google Play requires that apps support large-screen devices (tablets,
  // foldables, Chromebooks). Restrictions:
  //
  //   android:screenOrientation  — must NOT be set (or be "unspecified"/"fullUser")
  //                                 to allow free rotation on large screens.
  //   android:resizeableActivity — MUST be true (or absent, which defaults true
  //                                 on targetSdk >= 24). Expo sometimes injects
  //                                 resizeableActivity="false" when orientation
  //                                 is locked; we force it to "true" here.
  //   android:maxAspectRatio     — must not restrict large-screen display.
  //
  // Phone portrait UX is preserved at the React Native layer via the
  // orientation prop on individual screens where needed, or by the app's
  // natural portrait-first layout (users can rotate but the layout adapts).
  //
  // Deprecated edge-to-edge attributes (statusBarColor, navigationBarColor,
  // Window.setStatusBarColor, setDecorFitsSystemWindows) originate in React
  // Native internals and Expo SDK — not application code. The correct
  // application-layer fix is edgeToEdgeEnabled: true (already set in
  // app.json), which enables the WindowInsetsController path in RN 0.81+.
  // Any remaining calls inside react-native's own Java code are outside our
  // control and will be resolved in future RN releases.
  const withLargeScreenSupport = (cfg) =>
    withAndroidManifest(cfg, (c) => {
      const manifest = c.modResults;
      const app = manifest.manifest.application?.[0];
      if (!app) return c;

      const activities = app.activity ?? [];
      for (const activity of activities) {
        const attrs = activity.$;
        if (!attrs) continue;

        // ── Third-party activities: remove orientation lock for large-screen compliance ──
        // GmsBarcodeScanningDelegateActivity (MLKit, pulled in transitively by
        // expo-camera / expo-image-picker) declares android:screenOrientation="PORTRAIT".
        // Android 16 ignores this on large-screen devices but Play Console flags it.
        // Strip it here via manifest merger so the app passes the compliance check.
        if (
          attrs['android:name'] === 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity'
        ) {
          delete attrs['android:screenOrientation'];
          // Ensure tools namespace is declared on manifest root for the merger
          const manifestRoot = manifest.manifest.$;
          if (manifestRoot && !manifestRoot['xmlns:tools']) {
            manifestRoot['xmlns:tools'] = 'http://schemas.android.com/tools';
          }
          continue;
        }

        // Only touch the main launcher activity.
        if (
          attrs['android:name'] !== '.MainActivity' &&
          attrs['android:name'] !== 'com.chambex.vybzhub.MainActivity'
        ) continue;

        // Remove screenOrientation lock (Google Play large-screen requirement).
        // orientation: "default" in app.json should prevent Expo from setting
        // this, but we defensively remove it here in case any plugin sets it.
        delete attrs['android:screenOrientation'];

        // Explicitly allow resizing — required for foldables and tablets.
        // Overrides any value a plugin may have set to "false".
        attrs['android:resizeableActivity'] = 'true';

        // Remove maxAspectRatio restriction if present.
        delete attrs['android:maxAspectRatio'];

        // configChanges must include orientation and screenSize so the activity
        // handles device rotations without restarting. React Native sets these
        // by default; we add them defensively.
        const existing = attrs['android:configChanges'] ?? '';
        const needed = ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize'];
        const parts = existing ? existing.split('|').map((s) => s.trim()).filter(Boolean) : [];
        for (const item of needed) {
          if (!parts.includes(item)) parts.push(item);
        }
        attrs['android:configChanges'] = parts.join('|');
      }

      return c;
    });

  // ── Android: R8 full-mode optimization ──────────────────────────────────
  //
  // expo-build-properties sets enableMinifyInReleaseBuilds and
  // enableShrinkResourcesInReleaseBuilds, but does NOT enable R8 full mode
  // (which turns on aggressive inlining, class merging, and dead-code removal)
  // or optimized resource shrinking.
  //
  // R8 full mode is controlled by android.enableR8.fullMode in gradle.properties.
  // Optimized resource shrinking is controlled by
  // android.enableNewResourceShrinker=true.
  //
  // Both are safe to enable — ProGuard keep rules in proguard-rules.pro protect
  // all reflection-sensitive libraries (Supabase, Firebase, expo-iap, RN).
  //
  // AGP 9.0 upgrade: not applicable for Expo SDK 54 (requires AGP 8.x). The
  // Play Console advisory about AGP 9.0 will resolve when Expo upgrades its
  // build toolchain; it does not block publishing.
  const withR8FullMode = (cfg) =>
    withGradleProperties(cfg, (c) => {
      const props = c.modResults;

      const set = (key, value) => {
        const existing = props.find((p) => p.type === 'property' && p.key === key);
        if (existing) {
          existing.value = value;
        } else {
          props.push({ type: 'property', key, value });
        }
      };

      // Enable R8 full mode — aggressive optimizations (inlining, class merging,
      // dead-code elimination). Safe with the keep rules in proguard-rules.pro.
      set('android.enableR8.fullMode', 'true');

      // Enable the new resource shrinker for better APK/AAB size and Play
      // Console "Optimized resource shrinking" compliance.
      set('android.enableNewResourceShrinker', 'true');

      return c;
    });

  // ── iOS: Portrait-only lock via Info.plist ────────────────────────────────
  //
  // `ios.orientation` is not a valid Expo schema field and causes `expo doctor`
  // to fail. Instead, we directly set UISupportedInterfaceOrientations in
  // Info.plist to portrait-only values, which is the mechanism Expo itself uses
  // internally when orientation is locked.
  //
  // iPad orientation keys are NOT restricted — iPad layouts naturally handle
  // rotation and restricting them would also fail Play/App Store review.
  const withIosPortraitLock = (cfg) =>
    withInfoPlist(cfg, (c) => {
      // iPhone: portrait only
      c.modResults['UISupportedInterfaceOrientations'] = [
        'UIInterfaceOrientationPortrait',
      ];
      // iPad: allow all orientations (no forced restriction on tablet)
      c.modResults['UISupportedInterfaceOrientations~ipad'] = [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ];
      return c;
    });

  // Apply modifiers in sequence:
  //   iOS portrait lock
  //   → Android Kotlin compat
  //   → Android large-screen manifest
  //   → Android R8 full mode
  //
  // NOTE: withStripeIosEnumFix (Podfile CLANG_WARN_ENUM_CONVERSION/
  // GCC_TREAT_WARNINGS_AS_ERRORS suppression) has been removed.
  // Warning-suppression flags cannot fix a hard Clang enum redeclaration
  // compiler error. @stripe/stripe-react-native 0.74.0 resolves the
  // NSUInteger/NSInteger conflict natively — no Podfile patch required.
  return withR8FullMode(
    withLargeScreenSupport(
      withKotlinCompat(
        withIosPortraitLock(baseConfig)
      )
    )
  );
};
