/// Detects a genuine fresh install and wipes secure storage accordingly.
///
/// [FlutterSecureStorage] is backed by the iOS Keychain, which survives an
/// app uninstall/reinstall by design (it's tied to the device/Keychain, not
/// the app's sandbox). Without this guard, reinstalling the app can
/// resurrect a stale auth token and the onboarding-complete flag, sending a
/// freshly-installed user straight past onboarding into a "logged in" home
/// screen.
///
/// [SharedPreferences] data, by contrast, is deleted on uninstall on both
/// platforms (Android backup for app data is disabled via
/// `android:allowBackup="false"` in AndroidManifest.xml), so its absence
/// reliably signals a fresh install.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _hasLaunchedKey = 'has_launched_before';

/// Wipes [FlutterSecureStorage] the first time the app runs after a fresh
/// install, so stale Keychain data can't skip onboarding or restore a
/// previous session. No-op on every subsequent launch.
Future<void> ensureFreshInstallState({
  SharedPreferences? preferences,
  FlutterSecureStorage? secureStorage,
}) async {
  final prefs = preferences ?? await SharedPreferences.getInstance();
  if (prefs.getBool(_hasLaunchedKey) == true) return;

  await (secureStorage ?? const FlutterSecureStorage()).deleteAll();
  await prefs.setBool(_hasLaunchedKey, true);
}
