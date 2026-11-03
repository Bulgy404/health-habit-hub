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
flutter build ipa --release --dart-define-from-file=dart_defines_prod.json
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

## Building directly in Xcode

The native fixes are regular maintained package dependencies under
`third_party/`; Xcode and Flutter use the same sources. The custom build helper
is no longer required. All seven upstream licenses are retained. The package
catalog and update procedure are documented in `third_party/README.md`.

After a fresh checkout or dependency update, prepare the normal Flutter
configuration once from this directory:

```bash
flutter pub get
flutter build ios --config-only --release --dart-define-from-file=dart_defines_prod.json
open ios/Runner.xcworkspace
```

In Xcode select **Runner**, choose **Any iOS Device (arm64)** (or a connected
physical device), then choose **Product → Archive**. Use Organizer to validate
and distribute the archive. Debug builds use **Product → Run** as usual; the
selected scheme configuration controls debug versus release.

After changing the app version in `pubspec.yaml`, run the configuration command
again so Xcode receives the new version and build number. Xcode signing stays
under **Runner → Signing & Capabilities**. Archive builds use the production
settings; the initial configuration command explicitly loads the production
settings file.

Xcode's **Quoted Include In Framework Header** style warning is disabled in
Debug, Profile and Release because Flutter's supplied framework uses quoted
header imports. This setting applies to that one diagnostic; it does not change
header resolution or turn off other compiler warnings. After updating the
project, use **Product → Clean Build Folder** before archiving in Xcode to
replace the old archive diagnostics.

## Dependency maintenance (November 2026)

Use Flutter 3.47+ / Dart 3.13+. Android uses AGP 9 built-in Kotlin
(`android.builtInKotlin=true`); the app no longer applies the separate Kotlin
Android plugin. Keep `android.newDsl=false` until Flutter supports AGP's new
extension types. These switches are independent.

Compatible stable package releases are recorded in `pubspec.lock`. The app uses
Google Fonts 9 and the standalone `material_ui` / `cupertino_ui` libraries.
Use `appLocalizationDelegates` from `lib/l10n/ui_localizations.dart` instead of
the SDK UI delegates emitted by gen-l10n. `LegacyUiBridge` preserves theme and
localizations for dependencies such as fl_chart that still use SDK Material;
remove it when those dependencies have migrated. See `third_party/README.md`
for the native fixes that remain necessary in current upstream plugin sources.
