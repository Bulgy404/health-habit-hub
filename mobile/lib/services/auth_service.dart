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

  // Credentials stored during onboarding for silent re-authentication.
  static const _usernameKey = 'username';
  static const _passwordKey = 'password';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _secureStorage;
  final Dio? _dio;
  final void Function()? onLogout;
  final void Function()? onLogin;

  AuthService({
    FlutterAppAuth? appAuth,
    FlutterSecureStorage? secureStorage,
    Dio? dio,
    this.onLogout,
    this.onLogin,
  })  : _appAuth = appAuth ?? const FlutterAppAuth(),
        _secureStorage = secureStorage ?? const FlutterSecureStorage(),
        _dio = dio;

  /// Triggers the PKCE authorization code flow via Keycloak.
  ///
  /// Stores the returned tokens and notifies [onLogin] so that
  /// role providers re-evaluate with the freshly stored token.
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
    onLogin?.call();
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

    final response = await (_dio ?? Dio()).post<Map<String, dynamic>>(
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

  /// Silently re-authenticates using credentials stored during onboarding
  /// (Keycloak ROPC password grant with the stored username/password).
  ///
  /// Returns true and writes fresh tokens to storage on success.
  /// Returns false without modifying storage if no credentials are stored or
  /// if Keycloak rejects them.
  Future<bool> reauthenticate() async {
    final username = await _secureStorage.read(key: _usernameKey);
    final password = await _secureStorage.read(key: _passwordKey);
    if (username == null || password == null) return false;
    try {
      final response = await (_dio ?? Dio()).post<Map<String, dynamic>>(
        '$_keycloakBaseUrl/realms/$_realm/protocol/openid-connect/token',
        data: {
          'grant_type': 'password',
          'client_id': _clientId,
          'username': username,
          'password': password,
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
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Returns the current access token, auto-refreshing if within 60s of expiry.
  ///
  /// Expiry is determined from the stored [_expiryKey] if available, otherwise
  /// by decoding the JWT `exp` claim directly. This handles tokens stored by
  /// the onboarding and restore flows which do not write [_expiryKey].
  ///
  /// Returns null if not logged in or if the refresh token is invalid.
  ///
  /// When Keycloak explicitly rejects the refresh token (HTTP 400/401), first
  /// attempts silent re-authentication via [reauthenticate()]. Only calls
  /// [logout()] if reauthentication also fails. Network errors leave tokens
  /// intact so the user is not logged out when the server is unreachable.
  Future<String?> getAccessToken() async {
    if (await _tokenNeedsRefresh()) {
      try {
        await refreshToken();
      } catch (e) {
        final isTokenRejected = e is DioException &&
            e.response != null &&
            (e.response!.statusCode == 400 || e.response!.statusCode == 401);
        if (isTokenRejected) {
          final reauthed = await reauthenticate();
          if (reauthed) {
            return _secureStorage.read(key: _tokenKey);
          }
          await logout();
          return null;
        }
        // Network / server error — return the stored token as-is and let the
        // caller's API request fail with 401 if the token is truly expired.
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

  /// Returns the user ID (JWT `sub` claim) decoded from the stored token
  /// WITHOUT triggering a refresh or logout.  Safe to call from UI providers
  /// because the Dio interceptor will handle the actual refresh before any
  /// API request is made.
  Future<String?> getUserIdFromToken() async {
    final token = await _secureStorage.read(key: _tokenKey);
    if (token == null) return null;
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final payload =
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final claims = jsonDecode(payload) as Map<String, dynamic>;
      return claims['sub'] as String?;
    } catch (_) {
      return null;
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
