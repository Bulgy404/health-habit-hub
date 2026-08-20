import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Release signing config, loaded from a git-ignored key.properties (see
// android/.gitignore and android/key.properties.example) — never committed.
// Generate a keystore with:
//   keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 \
//     -validity 10000 -alias <your-alias>
// Falls back to debug signing when key.properties doesn't exist, so local
// `flutter run --release` still works without every developer holding the
// production keystore — but a release built this way is NOT suitable for
// Play Store distribution.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "de.felixreinsch.healthhabithub"
    // Pinned instead of flutter.compileSdkVersion (currently resolves to 37):
    // Android SDK 37 introduced a new minor-version naming scheme
    // (android-37.0, android-37.1, ... — no plain "android-37" package
    // exists), which this Flutter version's bundled default doesn't yet
    // account for, so Gradle fails to resolve the compile target at all.
    // Revisit once a newer Flutter release's compileSdkVersion default
    // matches the new naming scheme.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications (uses java.time APIs not
        // natively available below Android 8/API 26) — see its own example
        // app's build.gradle for the same two lines.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "de.felixreinsch.healthhabithub"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Required by flutter_appauth for the Keycloak PKCE login redirect
        // (AuthService._redirectUrl = 'de.tu-dresden.hhh://callback') to be
        // caught and routed back into the app.
        manifestPlaceholders["appAuthRedirectScheme"] = "de.tu-dresden.hhh"
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                // No key.properties present — debug-signed, dev-only build.
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Pairs with isCoreLibraryDesugaringEnabled above.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
