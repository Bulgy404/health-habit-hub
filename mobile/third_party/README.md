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
