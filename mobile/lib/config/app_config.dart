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

  /// Names of the `--dart-define` values a release build is missing (i.e. still
  /// at their localhost defaults). Empty when the build is correctly configured.
  ///
  /// A release build produced without these flags would otherwise ship pointing
  /// at localhost with no way to override it post-build. `assert()` is stripped
  /// in release mode, so this is a real (non-assert) check.
  static List<String> missingProductionDefines() {
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
    final missing = missingProductionDefines();
    if (missing.isEmpty) return null;
    return 'This release build was compiled without the required '
        '--dart-define values: ${missing.join(', ')}.\n\n'
        'It would point at localhost, so it refuses to start.\n\n'
        'Rebuild with:\n'
        'flutter build ipa --release '
        '--dart-define-from-file=dart_defines_prod.json';
  }

  /// Throwing variant of [productionConfigError], kept for non-UI callers.
  static void assertProductionConfig() {
    final error = productionConfigError();
    if (error != null) throw StateError(error);
  }
}
