import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Authentication service for Keycloak OIDC/PKCE flow.
///
/// Stores tokens in flutter_secure_storage and auto-refreshes
/// the access token when it is within 60 seconds of expiry.
class AuthService {
  static const _clientId = 'hhh-flutter';
  static const _redirectUrl = 'de.tu-dresden.hhh://callback';
  static const _keycloakBaseUrl = 'https://keycloak.hhh.tu-dresden.de';
  static const _realm = 'hhh';

  static String get _discoveryUrl =>
      '$_keycloakBaseUrl/realms/$_realm/.well-known/openid-configuration';

  static const _scopes = ['openid', 'profile', 'email'];

  static const _tokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _expiryKey = 'token_expiry';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _secureStorage;

  AuthService({
    FlutterAppAuth? appAuth,
    FlutterSecureStorage? secureStorage,
  })  : _appAuth = appAuth ?? const FlutterAppAuth(),
        _secureStorage = secureStorage ?? const FlutterSecureStorage();

  /// Triggers the PKCE authorization code flow via Keycloak.
  ///
  /// The [username] and [password] parameters are passed as login hints
  /// when provided, but the redirect/PKCE flow is always used (ROPC is
  /// deprecated in OAuth 2.1 and not supported by flutter_appauth).
  Future<void> login([String? username, String? password]) async {
    final result = await _appAuth.authorizeAndExchangeCode(
      AuthorizationTokenRequest(
        _clientId,
        _redirectUrl,
        discoveryUrl: _discoveryUrl,
        scopes: _scopes,
        loginHint: username,
      ),
    );
    await _storeTokens(result);
  }

  /// Exchanges the stored refresh token for a new access token.
  ///
  /// Throws an [Exception] if no refresh token is available.
  Future<void> refreshToken() async {
    final storedRefreshToken =
        await _secureStorage.read(key: _refreshTokenKey);
    if (storedRefreshToken == null) {
      throw Exception('No refresh token available');
    }

    final result = await _appAuth.token(
      TokenRequest(
        _clientId,
        _redirectUrl,
        discoveryUrl: _discoveryUrl,
        refreshToken: storedRefreshToken,
        scopes: _scopes,
      ),
    );
    await _storeTokens(result);
  }

  /// Returns the current access token, auto-refreshing if within 60s of expiry.
  ///
  /// Returns null if not logged in or if refresh fails.
  Future<String?> getAccessToken() async {
    final expiry = await _secureStorage.read(key: _expiryKey);
    if (expiry != null) {
      final expiryTime = DateTime.parse(expiry);
      if (DateTime.now()
          .isAfter(expiryTime.subtract(const Duration(seconds: 60)))) {
        try {
          await refreshToken();
        } catch (_) {
          return null;
        }
      }
    }
    return _secureStorage.read(key: _tokenKey);
  }

  /// Returns true if an access token is stored.
  Future<bool> isLoggedIn() async {
    final token = await _secureStorage.read(key: _tokenKey);
    return token != null;
  }

  /// Clears all tokens from secure storage.
  Future<void> logout() async {
    await _secureStorage.delete(key: _tokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
    await _secureStorage.delete(key: _expiryKey);
  }

  Future<void> _storeTokens(TokenResponse? result) async {
    if (result == null) return;
    if (result.accessToken != null) {
      await _secureStorage.write(key: _tokenKey, value: result.accessToken);
    }
    if (result.refreshToken != null) {
      await _secureStorage.write(
          key: _refreshTokenKey, value: result.refreshToken);
    }
    if (result.accessTokenExpirationDateTime != null) {
      await _secureStorage.write(
        key: _expiryKey,
        value: result.accessTokenExpirationDateTime!.toIso8601String(),
      );
    }
  }
}
