import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';

/// Authentication service for Keycloak OIDC/PKCE flow.
///
/// Stores tokens in flutter_secure_storage and auto-refreshes
/// the access token when it is within 60 seconds of expiry.
class AuthService {
  static const _clientId = 'hhh-flutter';
  static const _redirectUrl = 'de.tu-dresden.hhh://callback';
  static const _keycloakBaseUrl = AppConfig.keycloakUrl;
  static const _realm = 'hhh';

  static String get _discoveryUrl =>
      '$_keycloakBaseUrl/realms/$_realm/.well-known/openid-configuration';

  static const _scopes = ['openid', 'profile', 'email'];

  static const _tokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _expiryKey = 'token_expiry';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _secureStorage;
  final void Function()? onLogout;

  AuthService({
    FlutterAppAuth? appAuth,
    FlutterSecureStorage? secureStorage,
    this.onLogout,
  })  : _appAuth = appAuth ?? const FlutterAppAuth(),
        _secureStorage = secureStorage ?? const FlutterSecureStorage();

  /// Triggers the PKCE authorization code flow via Keycloak.
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

  /// Exchanges the stored refresh token for a new access token via a direct
  /// HTTP call to Keycloak's token endpoint.
  ///
  /// This works for tokens issued by any grant type (PKCE or direct-grant).
  /// Throws if no refresh token is stored or if Keycloak rejects it.
  Future<void> refreshToken() async {
    final storedRefreshToken =
        await _secureStorage.read(key: _refreshTokenKey);
    if (storedRefreshToken == null) {
      throw Exception('No refresh token available');
    }

    final response = await Dio().post<Map<String, dynamic>>(
      '$_keycloakBaseUrl/realms/$_realm/protocol/openid-connect/token',
      data: {
        'grant_type': 'refresh_token',
        'client_id': _clientId,
        'refresh_token': storedRefreshToken,
      },
      options: Options(contentType: 'application/x-www-form-urlencoded'),
    );

    final data = response.data!;
    if (data['access_token'] != null) {
      await _secureStorage.write(
          key: _tokenKey, value: data['access_token'] as String);
    }
    if (data['refresh_token'] != null) {
      await _secureStorage.write(
          key: _refreshTokenKey, value: data['refresh_token'] as String);
    }
    if (data['expires_in'] != null) {
      final expiresIn = data['expires_in'] as int;
      final expiry = DateTime.now().add(Duration(seconds: expiresIn));
      await _secureStorage.write(
          key: _expiryKey, value: expiry.toIso8601String());
    }
  }

  /// Returns the current access token, auto-refreshing if within 60s of expiry.
  ///
  /// Expiry is determined from the stored [_expiryKey] if available, otherwise
  /// by decoding the JWT `exp` claim directly. This handles tokens stored by
  /// the onboarding and restore flows which do not write [_expiryKey].
  ///
  /// Returns null if not logged in or if the refresh token is invalid.
  /// Clears stored tokens on refresh failure so the user is redirected to login.
  Future<String?> getAccessToken() async {
    if (await _tokenNeedsRefresh()) {
      try {
        await refreshToken();
      } catch (_) {
        await logout();
        return null;
      }
    }
    return _secureStorage.read(key: _tokenKey);
  }

  /// Returns true if the stored access token is expired or within 60 seconds
  /// of expiry. Returns false if no token is stored (nothing to refresh).
  Future<bool> _tokenNeedsRefresh() async {
    // Prefer the explicitly stored expiry (written after every successful refresh).
    final storedExpiry = await _secureStorage.read(key: _expiryKey);
    if (storedExpiry != null) {
      final expiryTime = DateTime.parse(storedExpiry);
      return DateTime.now()
          .isAfter(expiryTime.subtract(const Duration(seconds: 60)));
    }

    // Fall back to decoding the JWT exp claim (tokens from onboarding/restore
    // do not have a separately stored expiry).
    final token = await _secureStorage.read(key: _tokenKey);
    if (token == null) return false;

    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      final payload = utf8
          .decode(base64Url.decode(base64Url.normalize(parts[1])));
      final claims = jsonDecode(payload) as Map<String, dynamic>;
      final exp = claims['exp'];
      if (exp == null) return false;
      final expiry =
          DateTime.fromMillisecondsSinceEpoch((exp as int) * 1000);
      return DateTime.now()
          .isAfter(expiry.subtract(const Duration(seconds: 60)));
    } catch (_) {
      return false;
    }
  }

  /// Returns true if an access token is stored.
  Future<bool> isLoggedIn() async {
    final token = await _secureStorage.read(key: _tokenKey);
    return token != null;
  }

  /// Clears all tokens from secure storage and notifies listeners.
  Future<void> logout() async {
    await _secureStorage.delete(key: _tokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
    await _secureStorage.delete(key: _expiryKey);
    onLogout?.call();
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
