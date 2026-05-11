// Firebase configuration for Health Habit Hub.
//
// API keys are injected at compile time via --dart-define-from-file.
// Copy mobile/firebase.json.example → mobile/firebase.json, fill in real keys, then:
//   flutter run --dart-define-from-file=firebase.json
//   flutter build apk --dart-define-from-file=firebase.json
//   flutter build ios --dart-define-from-file=firebase.json

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'Web platform is not configured for Firebase.',
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

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: String.fromEnvironment('FIREBASE_ANDROID_API_KEY'),
    appId: '1:427166078990:android:a84442dfc163503096045f',
    messagingSenderId: '427166078990',
    projectId: 'health-habit-hub-v2',
    storageBucket: 'health-habit-hub-v2.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: String.fromEnvironment('FIREBASE_IOS_API_KEY'),
    appId: '1:427166078990:ios:7d1d7820096bf7a296045f',
    messagingSenderId: '427166078990',
    projectId: 'health-habit-hub-v2',
    storageBucket: 'health-habit-hub-v2.firebasestorage.app',
    iosBundleId: 'de.felixreinsch.healthhabithub',
  );
}
