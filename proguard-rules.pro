# ─── Vybz Hub ProGuard / R8 Keep Rules ────────────────────────────────────────
#
# R8 minification is enabled for release builds via expo-build-properties.
# These rules prevent obfuscation of classes accessed by reflection or JNI
# so the release APK/AAB behaves identically to the debug build.
#
# Rule format: -keep class <pattern> { <members>; }
#   -keep          = keep class name AND members (prevents renaming + removal)
#   -keepnames     = keep names only (still removes unused code)
#   -keepclassmembers = keep members of classes that survive shrinking
# ─────────────────────────────────────────────────────────────────────────────

# ── React Native core ─────────────────────────────────────────────────────────
# RN bridges use reflection to locate and invoke native module methods.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ── Expo modules ──────────────────────────────────────────────────────────────
# Expo module infrastructure resolves module classes by name at runtime.
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# ── expo-iap / OpenIAP Google ─────────────────────────────────────────────────
# expo-iap wraps the Google Play Billing Library. The billing client uses
# reflection internally and openiap-google registers its own classes.
-keep class expo.modules.iap.** { *; }
-keep class com.openiap.** { *; }
-keep class com.android.billingclient.** { *; }
-dontwarn expo.modules.iap.**
-dontwarn com.openiap.**
-dontwarn com.android.billingclient.**

# ── Supabase / Ktor / OkHttp / Kotlinx serialization ─────────────────────────
# Supabase JS runs in the JS bundle (not JVM), so no JVM keep rules are
# needed for it. However, the Kotlin/Java HTTP stack it may pull in for
# WebSocket / Realtime on Android must be preserved.
-keep class io.ktor.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class kotlinx.serialization.** { *; }
-dontwarn io.ktor.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn kotlinx.serialization.**

# ── Kotlin reflection ─────────────────────────────────────────────────────────
# Kotlin's reflection library is used by several AndroidX and Expo components.
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-keepclassmembers class ** {
    @kotlin.Metadata *;
}
-dontwarn kotlin.reflect.**

# ── Kotlin coroutines ─────────────────────────────────────────────────────────
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ── AndroidX / Jetpack ────────────────────────────────────────────────────────
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

# ── Google Play Services / Firebase ──────────────────────────────────────────
# Firebase Cloud Messaging (FCM) for push notifications. FCM uses reflection
# to locate the app's FirebaseMessagingService subclass.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── Expo Notifications ────────────────────────────────────────────────────────
-keep class expo.modules.notifications.** { *; }
-dontwarn expo.modules.notifications.**

# ── Expo Image ────────────────────────────────────────────────────────────────
# expo-image uses Glide/Coil internally — both use reflection for decoders.
-keep class com.bumptech.glide.** { *; }
-keep class expo.modules.image.** { *; }
-dontwarn com.bumptech.glide.**
-dontwarn expo.modules.image.**

# ── Expo Linear Gradient ─────────────────────────────────────────────────────
-keep class expo.modules.lineargradient.** { *; }

# ── React Native Maps ─────────────────────────────────────────────────────────
-keep class com.airbnb.android.react.maps.** { *; }
-dontwarn com.airbnb.android.react.maps.**

# ── expo-web-browser (Chrome Custom Tabs) ────────────────────────────────────
-keep class expo.modules.webbrowser.** { *; }
-dontwarn expo.modules.webbrowser.**

# ── Hermes JS engine ─────────────────────────────────────────────────────────
# Hermes is bundled as a prebuilt .so — no JVM classes to keep.
# These dontwarn entries suppress noise from the Hermes adapter shims.
-dontwarn com.facebook.hermes.intl.**
-dontwarn com.facebook.hermes.unicode.**

# ── JSI / Fabric / TurboModules (React Native New Architecture) ──────────────
-keep class com.facebook.react.fabric.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-dontwarn com.facebook.react.fabric.**
-dontwarn com.facebook.react.turbomodule.**

# ── Safe-area context ─────────────────────────────────────────────────────────
-keep class com.th3rdwave.safeareacontext.** { *; }
-dontwarn com.th3rdwave.safeareacontext.**

# ── Stripe Android SDK ───────────────────────────────────────────────────────
# @stripe/stripe-react-native bundles the full Stripe Android SDK, which
# includes optional Stripe Issuing / Push Provisioning classes. Vybz Hub
# uses Stripe only for PaymentSheet (ticket payments) and does NOT use
# Stripe Issuing card-to-wallet provisioning. R8 still resolves references
# to these classes at link time, so we suppress the warnings rather than
# requiring the unused Stripe Issuing AAR.
#
# ONE package-scoped rule covers all current and future nested/generated
# classes in the pushProvisioning package (e.g. $f, $g, $Args, etc.)
# regardless of obfuscator-suffix changes across stripe-react-native versions.
# Minification, resource shrinking, and R8 full-mode remain fully enabled.
-dontwarn com.stripe.android.pushProvisioning.**
-dontwarn com.stripe.android.camera.**

# ── Application class ─────────────────────────────────────────────────────────
# Ensure the app's own package is never obfuscated.
-keep class com.chambex.vybzhub.** { *; }

# ── Serializable / Parcelable ─────────────────────────────────────────────────
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    !private <fields>;
    !private <methods>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# ── Enum classes ──────────────────────────────────────────────────────────────
# R8 can incorrectly optimize enums accessed by name (e.g., valueOf).
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── Native methods ────────────────────────────────────────────────────────────
-keepclasseswithmembernames class * {
    native <methods>;
}

# ── Annotations ───────────────────────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions
-keepattributes SourceFile
-keepattributes LineNumberTable
