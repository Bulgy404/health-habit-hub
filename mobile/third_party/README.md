# Maintained Flutter plugin sources

These seven packages carry the native fixes recorded in
`../tool/ios_plugin_patches.json`. They are normal path dependencies in
`../pubspec.yaml`, so Xcode, Flutter CLI, Android and CI use identical sources.
No temporary package overrides or build-time source edits are needed.

Each directory retains its upstream LICENSE and has an UPSTREAM.md recording
the package/version. Examples, upstream tests, documentation directories and
assistant configuration files are omitted. Package runtime sources, native
build definitions and resources are retained. `resolution: workspace` is
removed where present so the packages work as standalone path dependencies.

The native changes address integer truncation, nullability, scene-based window
lookup, obsolete pre-iOS-15 authentication fallbacks, Bluetooth naming and
deprecated replay helpers. FCM tokens and Sentry's existing app-hang channel
methods keep their behavior through narrowly scoped compatibility exceptions.

To check the maintained changes:

```bash
python3 tool/patch_ios_plugins.py --check
python3 -m unittest discover -s tool -p 'test_*.py'
```

When updating a package, first review its current upstream source and remove
any patch already fixed upstream. Update the package version, patch contexts
and before/after SHA-256 hashes in the patch catalog. Download that exact
version into the pub cache, then refresh the maintained copies:

```bash
python3 tool/patch_ios_plugins.py --vendor
flutter pub get
```

Review the native source diff and license files, then run analysis, the Flutter
tests, an Xcode archive and an Android release build. Do not replace a native
source hash just to bypass a changed-context error.

## Review on November 3, 2026

The fixes are a mix of functional corrections and compatibility maintenance:

| Package | Reason for the local native changes |
| --- | --- |
| `device_info_plus` | Avoid 32-bit overflow when calculating free memory before converting to megabytes. |
| `flutter_appauth` | Find the active scene's key window for sign-in presentation; remove authentication fallbacks below the app's minimum supported iOS version. |
| `flutter_local_notifications` | Make a mutable copy before mutation; replace the deprecated foreground alert option with banner/list options. |
| `record_ios` | Use the current Bluetooth HFP name on newer Swift compilers, with an older-compiler fallback. |
| `firebase_messaging` | Update foreground presentation options and narrowly suppress warnings for FCM token calls still used by the backend. |
| `sentry_flutter` | Correct Objective-C channel typing/nullability and bridge deprecated native app-hang calls while preserving Flutter channel behavior. |
| `posthog_flutter` | Use scene windows and replace deprecated native replay conversion helpers. |

Not every change fixes an app failure: several replace deprecated APIs or reduce compiler warnings. Full package copies are used because Flutter path dependencies must remain complete packages, and Xcode/Flutter/CI must compile the same sources.

Sentry was updated to 10.3.0 and PostHog to 5.58.4. Their affected native source was compared with the previous release before reapplying the reviewed edits. The other five patched packages are already at their latest stable release. No patch was removed because the relevant upstream code still needs the recorded edit. This review does not enable analytics autocapture, session replay, or a new push-registration protocol.
