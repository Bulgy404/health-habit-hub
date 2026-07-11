import 'package:flutter/foundation.dart' show kReleaseMode;

/// Compile-time configuration constants.
///
/// Override defaults with --dart-define flags at build time:
///   flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
///   flutter run --dart-define=KEYCLOAK_URL=https://keycloak.example.com
///   flutter run --dart-define=WS_BASE_URL=wss://api.example.com/ws
abstract final class AppConfig {
  static const _localhostApiBaseUrl = 'http://localhost:3000/api/v1';
  static const _localhostKeycloakUrl = 'http://localhost:8080';
  static const _localhostWsBaseUrl = 'ws://localhost:3000/ws';

  /// Base URL for the REST API, including the `/api/v1` path prefix.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: _localhostApiBaseUrl,
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
    defaultValue: _localhostKeycloakUrl,
  );

  /// WebSocket base URL for real-time features.
  static const wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: _localhostWsBaseUrl,
  );

  /// Contact address shown on the Help & Support screen.
  static const supportEmail = String.fromEnvironment(
    'SUPPORT_EMAIL',
    defaultValue: 'felix.reinsch@tu-dresden.de',
  );

  /// Refuses to run a release build against the localhost defaults — a
  /// release build produced without passing all three --dart-define flags
  /// above would otherwise silently ship pointing at localhost with no way
  /// to override it post-build. `assert()` is stripped in release mode, so
  /// this is a real (non-assert) check, called once from `main()`.
  static void assertProductionConfig() {
    if (!kReleaseMode) return;
    final usingLocalhostDefault =
        apiBaseUrl == _localhostApiBaseUrl ||
        keycloakUrl == _localhostKeycloakUrl ||
        wsBaseUrl == _localhostWsBaseUrl;
    if (usingLocalhostDefault) {
      throw StateError(
        'Release build was compiled without API_BASE_URL/KEYCLOAK_URL/WS_BASE_URL '
        '--dart-define overrides — refusing to run pointing at localhost.',
      );
    }
  }
}
