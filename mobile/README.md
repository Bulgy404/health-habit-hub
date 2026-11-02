# HHH Mobile App

Flutter client for Health Habit Hub.

## Common Commands

```bash
# Install dependencies
flutter pub get

# Analyze the app
dart analyze

# Run on the first available iPhone simulator
flutter run -d iPhone

# Run on a specific simulator
flutter devices
flutter run -d "iPhone 15 Pro"
```

## Notes

- Run commands from the `mobile/` directory because this is the Flutter project root.
- `flutter pub run` is not the app entrypoint. To launch the app, use `flutter run`.
- The main entrypoint is `lib/main.dart`.
- For the full local stack setup, including Docker services and seeding, see [`../docs/guides/local-dev.md`](../docs/guides/local-dev.md).

## Dependency Upgrades

Use this order when upgrading Flutter packages:

```bash
flutter pub upgrade
dart analyze
flutter test
```

If you then choose to adopt new major versions, run:

```bash
flutter pub upgrade --major-versions
dart analyze
flutter test
```

Major upgrades can require code changes. Recent migrations in this app included Riverpod `NotifierProvider` adoption and updated `share_plus` / `flutter_local_notifications` APIs.

## Release builds

Run from this directory. After the native dependency updates, close Xcode and
start with a clean build to remove stale precompiled Sentry modules:

```bash
flutter clean
flutter pub get
flutter analyze
flutter test
bash tool/build_ios.sh ipa
flutter build appbundle --release --dart-define-from-file=dart_defines_prod.json
```

The version is `1.3.1+7`. Android's integer after `+` must exceed **every**
previously uploaded version code, including test tracks. Production currently
uses code 6; code 1 in the 1.3.1 draft cannot upgrade it. Replace that draft's
bundle with the rebuilt code 7 bundle. Keep the existing application ID and
upload signing key. Check the generated AAB in Play's bundle explorer before
rolling out; an old local AAB does not reflect the source changes automatically.

Android still requires API 26 (Android 8): the Sentry 10 native library requires
it. Do not override its manifest to force API 24 support. Devices below API 26
need a separately maintained compatible dependency set. Microphone hardware is
optional because typed/structured donations work without recording. Compare
code 6 and code 7 in Play's device catalog to distinguish Android-version,
hardware and ABI exclusions; the excluded-device count alone is insufficient.

iOS now uses Swift Package Manager for all native plugins, following
[Flutter’s migration instructions](https://docs.flutter.dev/packages-and-plugins/swift-package-manager/for-app-developers#how-to-remove-cocoapods-integration). The iOS build helper applies `tool/ios_plugin_patches.json` through
`tool/patch_ios_plugins.py` before Xcode resolves its dependency graph, using
transient local package overrides. It restores the hosted lockfile and removes
the overrides on exit. Use `bash tool/build_ios.sh ipa` for release builds; a
plain Flutter build on a fresh checkout compiles the original upstream packages. These small fixes are applied to **build-local copies**, never the
shared pub cache. They address missing nullability, integer truncation, old
window APIs, obsolete login fallbacks, Bluetooth naming and replay helpers.
FCM token registration and Sentry's legacy app-hang channel calls retain their
existing behavior with narrowly scoped deprecation exceptions. FID registration
is a different server protocol, so replacing FCM token calls just to silence
warnings would break notification delivery.

The patches are tied to reviewed source hashes. When updating a patched
dependency, review and update its patch rather than bypassing the check. CI
checks both the original source contexts and cache isolation:

```bash
python3 tool/patch_ios_plugins.py --check
python3 -m unittest discover -s tool -p 'test_*.py'
```

Before uploading, validate the iOS archive in Xcode and test login/cancellation,
push-token refresh and notifications, voice input and sharing on real devices.
