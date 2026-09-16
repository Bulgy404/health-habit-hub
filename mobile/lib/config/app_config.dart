import 'package:flutter/foundation.dart' show kReleaseMode;

/// Compile-time configuration constants.
///
/// These are baked into the binary at build time (`String.fromEnvironment` is a
/// const) — there is no runtime config file on device. The defaults are
/// **mode-dependent** so the common paths need no flags:
///
///   * debug/profile (`flutter run`)        -> localhost, for local development
///   * release (`flutter build ipa`, Xcode
///     Product > Archive)                   -> production
///
/// That means an Xcode archive — which cannot pass Flutter `--dart-define`
/// flags — still produces a correctly configured production build.
///
/// Override either default explicitly (e.g. for a staging server) with:
///   flutter build ipa --dart-define-from-file=dart_defines_prod.json
///   flutter run --dart-define=API_BASE_URL=https://staging.example.com/api/v1
abstract final class AppConfig {
  static const _localhostApiBaseUrl = 'http://localhost:3000/api/v1';
  static const _localhostKeycloakUrl = 'http://localhost:8080';
  static const _localhostWsBaseUrl = 'ws://localhost:3000/ws';

  // Production endpoints. These are public URLs (already published in the app's
  // legal pages and docs), so committing them exposes nothing sensitive.
  static const _prodApiBaseUrl = 'https://habit.wiwi.tu-dresden.de/api/v1';
  static const _prodKeycloakUrl = 'https://habit.wiwi.tu-dresden.de/auth';
  static const _prodWsBaseUrl = 'wss://habit.wiwi.tu-dresden.de/ws';

  /// Base URL for the REST API, including the `/api/v1` path prefix.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: kReleaseMode ? _prodApiBaseUrl : _localhostApiBaseUrl,
  );

  /// Base URL of the app server without the `/api/v1` suffix.
  ///
  /// Derived from [apiBaseUrl] by stripping the `/api/v1` suffix when present.
  static String get appBaseUrl {
    const apiSuffix = '/api/v1';
    if (apiBaseUrl.endsWith(apiSuffix)) {
      return apiBaseUrl.substring(0, apiBaseUrl.length - apiSuffix.length);
    }
    return apiBaseUrl;
  }

  /// Base URL of the Keycloak authentication server.
  static const keycloakUrl = String.fromEnvironment(
    'KEYCLOAK_URL',
    defaultValue: kReleaseMode ? _prodKeycloakUrl : _localhostKeycloakUrl,
  );

  /// WebSocket base URL for real-time features.
  static const wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: kReleaseMode ? _prodWsBaseUrl : _localhostWsBaseUrl,
  );

  /// Write-only PostHog project key. Empty keeps analytics completely off.
  /// Set together with [posthogHost] after the private analytics VM and its
  /// project have been created.
  static const posthogProjectKey = String.fromEnvironment(
    'POSTHOG_PROJECT_KEY',
  );

  /// Public ingest proxy URL on habitvm, ending in `/ingest`.
  /// Never point a mobile build at the analytics VM's private address.
  static const posthogHost = String.fromEnvironment('POSTHOG_HOST');

  /// Analytics is deliberately fail-closed: partial configuration sends no
  /// telemetry. The SDK integration can use this seam without environment-
  /// specific conditionals elsewhere in the app.
  static bool get analyticsConfigured =>
      posthogProjectKey.isNotEmpty && posthogHost.isNotEmpty;

  /// Contact address shown on the Help & Support screen.
  static const supportEmail = String.fromEnvironment(
    'SUPPORT_EMAIL',
    defaultValue: 'felix.reinsch@tu-dresden.de',
  );

  /// Names of the endpoints a release build has pointed at localhost. Empty for
  /// a correctly configured build.
  ///
  /// Release builds now default to production, so this only trips when someone
  /// explicitly passes a localhost `--dart-define` into a release build — which
  /// would ship an app that cannot reach any server. `assert()` is stripped in
  /// release mode, so this is a real (non-assert) check.
  static List<String> localhostOverridesInRelease() {
    if (!kReleaseMode) return const [];
    return [
      if (apiBaseUrl == _localhostApiBaseUrl) 'API_BASE_URL',
      if (keycloakUrl == _localhostKeycloakUrl) 'KEYCLOAK_URL',
      if (wsBaseUrl == _localhostWsBaseUrl) 'WS_BASE_URL',
    ];
  }

  /// Human-readable description of a misconfigured release build, or `null`
  /// when the configuration is valid. Preferred over [assertProductionConfig]
  /// in `main()` so the failure can be surfaced on screen instead of throwing
  /// before the Flutter binding exists (which renders as a blank white screen).
  static String? productionConfigError() {
    final localhost = localhostOverridesInRelease();
    if (localhost.isEmpty) return null;
    return 'This release build points at localhost for: '
        '${localhost.join(', ')}.\n\n'
        'A release build cannot reach localhost on a device, so it refuses to '
        'start.\n\n'
        'Rebuild without the localhost --dart-define overrides (release '
        'defaults to production):\n'
        'flutter build ipa --release';
  }

  /// Throwing variant of [productionConfigError], kept for non-UI callers.
  static void assertProductionConfig() {
    final error = productionConfigError();
    if (error != null) throw StateError(error);
  }
}
