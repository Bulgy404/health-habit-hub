// ─────────────────────────────────────────────────────────────────────────────
// Firebase configuration — fill in values from the Firebase Console.
//
// How to get these values:
//   1. Go to https://console.firebase.google.com
//   2. Open your project → Project Settings → General → Your apps
//   3. Add an Android app (package name from AndroidManifest.xml) and an
//      iOS app (bundle ID from Xcode), then download the config files.
//   4. Copy each value into the constants below.
//
// Alternatively run: flutterfire configure
// (requires `dart pub global activate flutterfire_cli`)
// ─────────────────────────────────────────────────────────────────────────────

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'Web platform is not configured for Firebase. '
        'Add web options if needed.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  // ── Android ──────────────────────────────────────────────────────────────
  // From google-services.json → client[0].api_key[0].current_key
  //                           → client[0].client_info.mobilesdk_app_id
  //                           → project_info.project_number (= messagingSenderId)
  //                           → project_info.project_id
  //                           → project_info.storage_bucket
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'CHANGE_THIS_ANDROID_API_KEY',
    appId: 'CHANGE_THIS_ANDROID_APP_ID',           // e.g. 1:123456789:android:abcdef
    messagingSenderId: 'CHANGE_THIS_SENDER_ID',     // numeric project number
    projectId: 'CHANGE_THIS_PROJECT_ID',            // e.g. health-habit-hub
    storageBucket: 'CHANGE_THIS_STORAGE_BUCKET',    // e.g. health-habit-hub.appspot.com
  );

  // ── iOS ───────────────────────────────────────────────────────────────────
  // From GoogleService-Info.plist → API_KEY, GOOGLE_APP_ID, GCM_SENDER_ID,
  //                                  PROJECT_ID, STORAGE_BUCKET,
  //                                  CLIENT_ID, BUNDLE_ID
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'CHANGE_THIS_IOS_API_KEY',
    appId: 'CHANGE_THIS_IOS_APP_ID',               // e.g. 1:123456789:ios:abcdef
    messagingSenderId: 'CHANGE_THIS_SENDER_ID',
    projectId: 'CHANGE_THIS_PROJECT_ID',
    storageBucket: 'CHANGE_THIS_STORAGE_BUCKET',
    iosClientId: 'CHANGE_THIS_IOS_CLIENT_ID',      // from CLIENT_ID in plist
    iosBundleId: 'CHANGE_THIS_IOS_BUNDLE_ID',      // e.g. de.felixreinsch.healthhabithub
  );
}
