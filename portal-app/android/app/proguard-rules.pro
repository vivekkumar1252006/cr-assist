# Flutter wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.embedding.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep serialization for Flutter
-keep class **.$Properties { *; }
-keep class **.$$Properties { *; }

# Dio
-keep class com.google.gson.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class retrofit2.** { *; }

# Keep annotation processors
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses
-keepattributes Signature

# Keep classes used via reflection (e.g., GoRouter, plugins)
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Image picker and file picker
-keep class com.yalantis.ucrop.** { *; }
-keep class androidx.activity.result.** { *; }

# SharedPreferences, SecureStorage
-keep class io.flutter.plugins.sharedpreferences.** { *; }
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Path provider
-keep class io.flutter.plugins.pathprovider.** { *; }

# URL Launcher
-keep class io.flutter.plugins.urllauncher.** { *; }

# Mobile Scanner
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.vision.** { *; }

# OpenFileX
-keep class com.crazecoder.openfile.** { *; }

# Intl
-keep class com.ibm.icu.** { *; }

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static int d(...);
    public static int v(...);
    public static int i(...);
    public static int w(...);
}

# Play Core Split Install (for deferred components)
-keep class com.google.android.play.core.splitcompat.** { *; }
-keep class com.google.android.play.core.splitinstall.** { *; }
-keep class com.google.android.play.core.tasks.** { *; }