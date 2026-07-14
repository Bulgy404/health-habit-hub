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

  // offline_access matches the scope the backend's ROPC helper
  // (keycloakRopcClient.js) requests for onboarding/restore/rotation, so a
  // token minted via this PKCE path gets the same long-lived offline
  // session instead of the regular 30-minute-idle SSO session.
  static const _scopes = ['openid', 'profile', 'email', 'offline_access'];

  static const _tokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _expiryKey = 'token_expiry';

  // Username persisted alongside tokens by onboarding/restore/rotate flows
  // (not used for auth by this service; cleared on logout for hygiene).
  static const _usernameKey = 'username';
  // Legacy key: older app versions stored the raw account password here for
  // ROPC-based silent re-auth. Nothing writes it anymore (see reauthenticate()
  // below) — logout() still clears it so it doesn't linger on upgraded
  // installs.
  static const _passwordKey = 'password';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _secureStorage;
  final Dio? _dio;
  /// Called after a successful logout to notify auth listeners.
  final void Function()? onLogout;

  /// Called after a successful login to notify auth listeners.
  final void Function()? onLogin;

  /// Single-flight guard for token refresh. When multiple requests fire at
  /// once (e.g. a screen loading logs + trajectory together) they must share
  /// one refresh, otherwise the second replays an already-rotated (single-use)
  /// refresh token, gets rejected, and forces an unnecessary logout.
  Future<bool>? _refreshFuture;

  /// Keycloak's token endpoint should answer in well under a second — this is
  /// deliberately much tighter than the app's general API timeouts (which are
  /// sized for slow LLM-backed calls), so a stuck/unreachable auth server
  /// fails fast instead of leaving every screen that needs a token stuck on a
  /// loading spinner for a minute or more.
  static const _authCallTimeout = Duration(seconds: 10);

  /// Set once both a refresh attempt and its one retry ([reauthenticate])
  /// have been explicitly rejected by Keycloak (not a network blip) — see
  /// [getAccessToken]. `null` when the last known refresh outcome was either
  /// unattempted, successful, or an ordinary network/server error.
  DateTime? _refreshDeadUntil;

  /// How long [getAccessToken] skips retrying the refresh handshake after
  /// [_refreshDeadUntil] is set. Short enough that a genuine recovery (the
  /// user reconnects, or a transient Keycloak outage clears) is picked up
  /// quickly; long enough that every provider/screen touched while the
  /// session is dead doesn't each independently pay for a fresh doomed
  /// refresh + retry round trip.
  static const _deadCooldown = Duration(seconds: 30);

  /// Creates an [AuthService].
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
      options: Options(
        contentType: 'application/x-www-form-urlencoded',
        sendTimeout: _authCallTimeout,
        receiveTimeout: _authCallTimeout,
      ),
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
    // A successful exchange proves the session is alive again — clear any
    // cooldown left over from an earlier failed attempt.
    _refreshDeadUntil = null;
  }

  /// Silently re-authenticates by exchanging the stored refresh token.
  ///
  /// This previously replayed a persisted raw account password via
  /// Keycloak's ROPC (`grant_type=password`) grant for silent re-auth. The
  /// app no longer stores the password after the initial login exchange, so
  /// that replay path has been removed — silent re-auth is now purely a
  /// refresh-token exchange, which is exactly what [refreshToken] does. This
  /// thin wrapper exists so [_performRefresh]'s single-retry shape (and this
  /// method's stable boolean success/failure API used by callers/tests)
  /// stays unchanged. It also guards against a benign race with a concurrent
  /// [AuthService] instance that rotates the refresh token between this
  /// instance's failed attempt and the retry.
  ///
  /// Returns true and leaves fresh tokens in storage on success. Returns
  /// false without modifying storage if no refresh token is stored or if
  /// Keycloak rejects it.
  Future<bool> reauthenticate() async {
    try {
      await refreshToken();
      return true;
    } catch (e) {
      if (_isTokenRejected(e)) {
        // Two explicit rejections in a row (this and the [_performRefresh]
        // attempt before it) is not a single-use-token rotation race
        // (reauthenticate() exists for exactly that race, and a race would
        // not survive a second attempt) — it's a session that will not come
        // back on its own. See [getAccessToken] for what the cooldown does.
        _refreshDeadUntil = DateTime.now().add(_deadCooldown);
      }
      return false;
    }
  }

  /// True when [e] is Keycloak explicitly rejecting the refresh token
  /// (HTTP 400/401), as opposed to a network/connectivity/server error.
  static bool _isTokenRejected(Object e) =>
      e is DioException &&
      e.response != null &&
      (e.response!.statusCode == 400 || e.response!.statusCode == 401);

  /// Returns the current access token, auto-refreshing if within 60s of expiry.
  ///
  /// Expiry is determined from the stored [_expiryKey] if available, otherwise
  /// by decoding the JWT `exp` claim directly. This handles tokens stored by
  /// the onboarding and restore flows which do not write [_expiryKey].
  ///
  /// Returns null if not logged in or if this refresh attempt fails.
  ///
  /// When Keycloak explicitly rejects the refresh token (HTTP 400/401),
  /// attempts one silent re-authentication via [reauthenticate()]. Never
  /// calls [logout()] itself — see [_performRefresh] for why. Network errors
  /// leave tokens intact so the user is not logged out when the server is
  /// unreachable.
  ///
  /// Returns immediately without hitting the network at all while
  /// [_refreshDeadUntil] is in the future — otherwise every screen/provider
  /// that needs a token while the session is dead would each independently
  /// re-run the full refresh-then-retry handshake against an endpoint
  /// already known (moments ago) to reject it.
  Future<String?> getAccessToken() async {
    final deadUntil = _refreshDeadUntil;
    if (deadUntil != null && DateTime.now().isBefore(deadUntil)) {
      return null;
    }
    if (await _tokenNeedsRefresh()) {
      // Coalesce concurrent refreshes: the first caller starts the refresh, and
      // any others awaiting during that window share its result.
      _refreshFuture ??=
          _performRefresh().whenComplete(() => _refreshFuture = null);
      final stillAuthenticated = await _refreshFuture!;
      if (!stillAuthenticated) return null;
    }
    return _secureStorage.read(key: _tokenKey);
  }

  /// Performs a single token refresh, recovering via silent re-authentication.
  /// Returns true when a usable token is available afterwards, false when
  /// this refresh attempt could not produce one.
  ///
  /// Deliberately never calls [logout()] — a rejected refresh may be a
  /// transient server hiccup rather than proof the session is truly dead
  /// (see the class doc and [reauthenticate]'s doc for why a single 400/401
  /// isn't conclusive here). Returning false just means *this* caller's
  /// [getAccessToken] resolves to null for now: the in-flight request
  /// proceeds unauthenticated and the backend answers with its own 401,
  /// which every screen already treats as an ordinary transient error. Local
  /// tokens are left intact and the next call retries the refresh — the
  /// session can only be cleared by an explicit user action (Settings ->
  /// Sign out / Delete account).
  Future<bool> _performRefresh() async {
    try {
      await refreshToken();
      return true;
    } catch (e) {
      if (_isTokenRejected(e)) {
        return reauthenticate();
      }
      // Network / server error — keep the stored token and let the caller's API
      // request fail with 401 if the token is truly expired.
      return true;
    }
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
      final sub = claims['sub'] as String?;
      if (sub != null && sub.trim().isNotEmpty) return sub;
      final preferredUsername = claims['preferred_username'] as String?;
      if (preferredUsername != null && preferredUsername.trim().isNotEmpty) {
        return preferredUsername;
      }
      final email = claims['email'] as String?;
      if (email != null && email.trim().isNotEmpty) return email;
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Returns true if an access token is stored.
  Future<bool> isLoggedIn() async {
    final token = await _secureStorage.read(key: _tokenKey);
    return token != null;
  }

  /// Logs out locally and revokes the Keycloak server-side session.
  ///
  /// Calls Keycloak's token revocation endpoint (RFC 7009) with the stored
  /// refresh token before clearing local storage. This invalidates the session
  /// on the server so a stolen refresh token cannot be replayed. Revocation
  /// failure is silently ignored — local tokens are always cleared regardless.
  Future<void> logout() async {
    final refreshToken = await _secureStorage.read(key: _refreshTokenKey);
    if (refreshToken != null) {
      try {
        await (_dio ?? Dio()).post<void>(
          '$_keycloakBaseUrl/realms/$_realm/protocol/openid-connect/revoke',
          data: {
            'client_id': _clientId,
            'token': refreshToken,
            'token_type_hint': 'refresh_token',
          },
          options: Options(
            contentType: 'application/x-www-form-urlencoded',
            sendTimeout: _authCallTimeout,
            receiveTimeout: _authCallTimeout,
          ),
        );
      } catch (_) {
        // Best-effort — always clear local tokens even if revocation fails.
      }
    }
    await _secureStorage.delete(key: _tokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
    await _secureStorage.delete(key: _expiryKey);
    await _secureStorage.delete(key: _usernameKey);
    await _secureStorage.delete(key: _passwordKey);
    _refreshDeadUntil = null;
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
    _refreshDeadUntil = null;
  }
}
