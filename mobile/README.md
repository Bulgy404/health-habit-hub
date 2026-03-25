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
