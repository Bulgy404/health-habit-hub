/// Compile-time configuration constants.
///
/// Override defaults with --dart-define flags at build time:
///   flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
///   flutter run --dart-define=KEYCLOAK_URL=https://keycloak.example.com
///   flutter run --dart-define=WS_BASE_URL=wss://api.example.com/ws
abstract final class AppConfig {
  /// Base URL for the REST API, including the `/api/v1` path prefix.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
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
    defaultValue: 'http://localhost:8080',
  );

  /// WebSocket base URL for real-time features.
  static const wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:3000/ws',
  );

  /// Contact address shown on the Help & Support screen.
  static const supportEmail = String.fromEnvironment(
    'SUPPORT_EMAIL',
    defaultValue: 'digital-health@tu-dresden.de',
  );
}
