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
  // OWNER ACTION REQUIRED before production native builds:
  //   1. Create Apple Merchant ID in Apple Developer Portal
  //      (Certificates, Identifiers & Profiles → Merchant IDs)
  //   2. Register the merchant ID with Stripe in Stripe Dashboard
  //      (Settings → Payment methods → Apple Pay)
  //   3. Replace 'merchant.com.chambex.vybzhub' below with the actual
  //      Merchant ID you created in step 1.
  //   4. Ensure EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is set in .env
  //      (pk_test_... for test, pk_live_... for production)
  //   5. Run a new EAS native build — OTA update alone is NOT sufficient.
  const stripePlugin = [
    '@stripe/stripe-react-native',
    {
      merchantIdentifier: 'merchant.com.chambex.vybzhub',
      enableGooglePay: true,
    },
  ];

  // Remove any stale Stripe plugin entry and add the freshly configured one.
  const pluginsWithoutStripe = existingPlugins.filter((plugin) => {
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
        'aps-environment': isProduction
          ? 'production'
          : 'development',
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

  // ── iOS: Fix Stripe enum redeclaration (Xcode 16 compatibility) ───────────
  //
  // Root cause: @stripe/stripe-react-native < 0.38.x ships Objective-C headers
  // that declare certain enums (e.g. STPPaymentStatus, STPCardBrand) using
  //   NS_ENUM(NSUInteger, STPPaymentStatus)
  // Stripe iOS SDK >= 23.x changed those same enums to
  //   NS_ENUM(NSInteger, STPPaymentStatus)
  // Xcode 16 made this a hard error:
  //   "enumeration redeclared with different underlying type 'NSInteger'
  //    (aka 'long') (was 'NSUInteger' (aka 'unsigned long'))"
  //
  // Fix strategy: inject a CocoaPods post_install hook that sets
  // CLANG_WARN_ENUM_CONVERSION=NO and GCC_TREAT_WARNINGS_AS_ERRORS=NO
  // only for Stripe-prefixed pod targets. This suppresses the enum type
  // mismatch error without touching node_modules or Stripe's source code,
  // and without downgrading Xcode or Expo SDK.
  //
  // Apple Pay (merchant.com.chambex.vybzhub) and Google Pay are unaffected —
  // this only changes warning levels inside Stripe's own Pods.
  //
  // Remove this modifier once @stripe/stripe-react-native is upgraded to
  // >= 0.38.0 (which ships aligned NSInteger declarations throughout).
  const withStripeIosEnumFix = (cfg) =>
    withDangerousMod(cfg, [
      'ios',
      (c) => {
        const path = require('path');
        const fs = require('fs');

        const podfilePath = path.join(c.modRequest.projectRoot, 'ios', 'Podfile');
        if (!fs.existsSync(podfilePath)) return c;

        let podfile = fs.readFileSync(podfilePath, 'utf8');

        // Idempotency guard — do not apply twice
        const hookMarker = '# STRIPE_XCODE16_ENUM_FIX';
        if (podfile.includes(hookMarker)) return c;

        // The hook lowers warning severity for Stripe pod targets only.
        // CLANG_WARN_ENUM_CONVERSION=NO   — silences the NS_ENUM type mismatch.
        // GCC_TREAT_WARNINGS_AS_ERRORS=NO — ensures the mismatch stays a warning
        //                                   rather than a build error.
        const enumFixHook = `
  ${hookMarker}
  # Suppress Stripe iOS SDK enum-type mismatch errors caused by NSUInteger/NSInteger
  # inconsistency between stripe-react-native shim headers and stripe-ios headers.
  # Required for Xcode 16 compatibility. Safe to remove after upgrading
  # @stripe/stripe-react-native to >= 0.38.0.
  installer.pods_project.targets.each do |target|
    next unless target.name.start_with?('Stripe') || target.name == 'stripe-react-native'
    target.build_configurations.each do |config|
      config.build_settings['CLANG_WARN_ENUM_CONVERSION']    = 'NO'
      config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS']  = 'NO'
      config.build_settings['SWIFT_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
    end
  end
`;

        // Insert hook inside existing post_install block if present,
        // otherwise append a new post_install block.
        if (podfile.includes('post_install do |installer|')) {
          // Insert just before the closing `end` of the first post_install block
          podfile = podfile.replace(
            /(post_install do \|installer\|)([\s\S]*?)(^end)/m,
            (match, open, body, close) => `${open}${body}${enumFixHook}\n${close}`,
          );
        } else {
          podfile += `\npost_install do |installer|\n${enumFixHook}\nend\n`;
        }

        fs.writeFileSync(podfilePath, podfile);
        return c;
      },
    ]);

  // Apply modifiers in sequence:
  //   iOS portrait lock
  //   → iOS Stripe enum fix (Xcode 16)
  //   → Android Kotlin compat
  //   → Android large-screen manifest
  //   → Android R8 full mode
  return withR8FullMode(
    withLargeScreenSupport(
      withKotlinCompat(
        withStripeIosEnumFix(
          withIosPortraitLock(baseConfig)
        )
      )
    )
  );
};
