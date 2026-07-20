// Contract tests for flutter_secure_storage calls made by AuthService.
//
// These tests verify every storage interaction so that a flutter_secure_storage
// API change is caught immediately.
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/services/auth_service.dart';

// ---------------------------------------------------------------------------
// Manual mock for FlutterSecureStorage
// ---------------------------------------------------------------------------

class MockFlutterSecureStorage extends FlutterSecureStorage {
  final Map<String, String?> _store = {};
  final List<Map<String, dynamic>> calls = [];

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    calls.add({'method': 'write', 'key': key, 'value': value});
    if (value == null) {
      _store.remove(key);
    } else {
      _store[key] = value;
    }
  }

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    calls.add({'method': 'read', 'key': key});
    return _store[key];
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    calls.add({'method': 'delete', 'key': key});
    _store.remove(key);
  }

  void seedValue(String key, String value) {
    _store[key] = value;
  }
}

/// Storage whose read() always throws — models a keychain/platform error.
/// delete() still works, so logout()'s best-effort contract can be verified.
class _ReadThrowingStorage extends MockFlutterSecureStorage {
  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    calls.add({'method': 'read', 'key': key});
    throw Exception('secure storage unavailable');
  }
}

// ---------------------------------------------------------------------------
// Stub for FlutterAppAuth
// ---------------------------------------------------------------------------

class _StubFlutterAppAuth extends FlutterAppAuth {
  final AuthorizationTokenResponse? _response;
  final Exception? _error;

  const _StubFlutterAppAuth({
    AuthorizationTokenResponse? response,
    Exception? error,
  })  : _response = response,
        _error = error;

  @override
  Future<AuthorizationTokenResponse> authorizeAndExchangeCode(
    AuthorizationTokenRequest request,
  ) async {
    if (_error != null) throw _error;
    return _response!;
  }
}

// ---------------------------------------------------------------------------
// Mock HTTP adapter for Dio — returns pre-configured responses in sequence.
// Dio automatically throws DioException for 4xx/5xx status codes.
// ---------------------------------------------------------------------------

class _MockResponse {
  final Map<String, dynamic>? data;
  final int statusCode;
  const _MockResponse({this.data, this.statusCode = 200});
}

class _MockAdapter implements HttpClientAdapter {
  final List<_MockResponse> _responses;
  int _index = 0;
  final List<RequestOptions> requests = [];

  _MockAdapter(this._responses);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (_index >= _responses.length) {
      throw StateError('_MockAdapter ran out of responses (index $_index)');
    }
    final config = _responses[_index++];
    return ResponseBody.fromString(
      config.data != null ? jsonEncode(config.data) : '{}',
      config.statusCode,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _mockDio(List<_MockResponse> responses) {
  final dio = Dio();
  dio.httpClientAdapter = _MockAdapter(responses);
  return dio;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

String _buildJwt({required int expSeconds}) {
  final header = base64Url.encode(utf8.encode('{"alg":"none","typ":"JWT"}'));
  final payload = base64Url
      .encode(utf8.encode(jsonEncode({'sub': 'test', 'exp': expSeconds})));
  return '$header.$payload.fakesig';
}

String get _expiredJwt {
  final past =
      DateTime.now().subtract(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000;
  return _buildJwt(expSeconds: past);
}

String get _validJwt {
  final future =
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000;
  return _buildJwt(expSeconds: future);
}

/// A refresh token whose `azp` claim names the client it was issued to —
/// used to exercise AuthService's azp-based dispatch (Keycloak directly for
/// `hhh-flutter`, the backend's /auth/* routes for anything else, e.g. the
/// confidential `hhh-ropc` client used by onboarding/restore/rotation).
String _buildJwtWithAzp(String azp) {
  final header = base64Url.encode(utf8.encode('{"alg":"none","typ":"JWT"}'));
  final future =
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000;
  final payload = base64Url.encode(
      utf8.encode(jsonEncode({'sub': 'test', 'exp': future, 'azp': azp})));
  return '$header.$payload.fakesig';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late MockFlutterSecureStorage storage;

  setUp(() {
    storage = MockFlutterSecureStorage();
  });

  // ─── login() ───────────────────────────────────────────────────────────────

  group('login()', () {
    test('write() is called for access_token, refresh_token, token_expiry',
        () async {
      final expiry = DateTime.now().add(const Duration(hours: 1));
      final appAuth = _StubFlutterAppAuth(
        response: AuthorizationTokenResponse(
          'access-abc',
          'refresh-xyz',
          expiry,
          null,
          'Bearer',
          null,
          null,
          null,
        ),
      );
      final service = AuthService(appAuth: appAuth, secureStorage: storage);

      await service.login();

      final writes = storage.calls.where((c) => c['method'] == 'write');
      final writtenKeys = writes.map((c) => c['key'] as String).toSet();

      expect(writtenKeys, containsAll(['access_token', 'refresh_token', 'token_expiry']));
      expect(
        writes.firstWhere((c) => c['key'] == 'access_token')['value'],
        'access-abc',
      );
      expect(
        writes.firstWhere((c) => c['key'] == 'refresh_token')['value'],
        'refresh-xyz',
      );
    });
  });

  // ─── isLoggedIn() ──────────────────────────────────────────────────────────

  group('isLoggedIn()', () {
    test('read(access_token) is called', () async {
      storage.seedValue('access_token', 'tok');
      final service = AuthService(secureStorage: storage);

      await service.isLoggedIn();

      expect(
        storage.calls.any((c) => c['method'] == 'read' && c['key'] == 'access_token'),
        isTrue,
      );
    });

    test('returns true when access_token is present', () async {
      storage.seedValue('access_token', 'tok');
      final service = AuthService(secureStorage: storage);

      expect(await service.isLoggedIn(), isTrue);
    });

    test('returns false when access_token is absent', () async {
      final service = AuthService(secureStorage: storage);

      expect(await service.isLoggedIn(), isFalse);
    });
  });

  // ─── getAccessToken() ──────────────────────────────────────────────────────

  group('getAccessToken()', () {
    test('read() is called for token_expiry and access_token', () async {
      storage.seedValue('access_token', _validJwt);
      final service = AuthService(secureStorage: storage);

      await service.getAccessToken();

      final readKeys =
          storage.calls.where((c) => c['method'] == 'read').map((c) => c['key'] as String).toList();
      // token_expiry is checked first (via _tokenNeedsRefresh), then access_token returned
      expect(readKeys, contains('token_expiry'));
      expect(readKeys, contains('access_token'));
    });

    test('returns access_token when token is valid', () async {
      storage.seedValue('access_token', _validJwt);
      final service = AuthService(secureStorage: storage);

      final token = await service.getAccessToken();

      expect(token, equals(_validJwt));
    });

    test(
        'returns null but does NOT call logout() when Keycloak rejects '
        'refresh (400) and the reauthenticate() retry also fails', () async {
      // Expired token + a refresh_token so refreshToken() reaches the HTTP
      // call, which returns 400. reauthenticate() retries the same
      // refresh-token exchange (second queued response, also 400) → fails.
      // This must NOT clear the session — only an explicit user action
      // (Settings -> Sign out / Delete account) may do that. Storage is left
      // untouched so the next call retries the refresh.
      storage.seedValue('access_token', _expiredJwt);
      storage.seedValue('refresh_token', 'expired-refresh-token');
      final dio = _mockDio([
        const _MockResponse(statusCode: 400),
        const _MockResponse(statusCode: 400),
      ]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final result = await service.getAccessToken();

      expect(result, isNull);
      expect(storage.calls.where((c) => c['method'] == 'delete'), isEmpty);
    });
  });

  // ─── logout() ──────────────────────────────────────────────────────────────

  group('logout()', () {
    test('delete() is called exactly five times (tokens + credentials)', () async {
      storage.seedValue('access_token', 'tok');
      storage.seedValue('refresh_token', 'ref');
      storage.seedValue('token_expiry', DateTime.now().toIso8601String());
      storage.seedValue('username', 'user');
      storage.seedValue('password', 'pass');

      final service = AuthService(secureStorage: storage);
      await service.logout();

      final deletes = storage.calls.where((c) => c['method'] == 'delete').toList();
      expect(deletes.length, 5);
    });

    test('delete() is called for all stored keys including credentials',
        () async {
      final service = AuthService(secureStorage: storage);
      await service.logout();

      final deletedKeys = storage.calls
          .where((c) => c['method'] == 'delete')
          .map((c) => c['key'] as String)
          .toSet();
      expect(deletedKeys,
          equals({'access_token', 'refresh_token', 'token_expiry', 'username', 'password'}));
    });

    test('onLogout callback is triggered after all deletes', () async {
      final log = <String>[];

      final service = AuthService(
        secureStorage: storage,
        onLogout: () => log.add('logout'),
      );
      await service.logout();

      // Callback fires after the five deletes.
      expect(log, equals(['logout']));
      final deletesBeforeCallback =
          storage.calls.where((c) => c['method'] == 'delete').length;
      expect(deletesBeforeCallback, 5);
    });

    test(
        'clears all tokens and fires onLogout even when the storage read '
        'throws (best-effort contract)', () async {
      // A keychain/platform error while reading the refresh token must not
      // abort logout — the doc promises local tokens are always cleared.
      final throwing = _ReadThrowingStorage();
      final log = <String>[];
      final service = AuthService(
        secureStorage: throwing,
        onLogout: () => log.add('logout'),
      );

      await service.logout(); // must not throw

      final deletedKeys = throwing.calls
          .where((c) => c['method'] == 'delete')
          .map((c) => c['key'] as String)
          .toSet();
      expect(
        deletedKeys,
        equals({
          'access_token',
          'refresh_token',
          'token_expiry',
          'username',
          'password',
        }),
      );
      expect(log, equals(['logout']));
    });

    test('clears all tokens even when the revocation HTTP call fails',
        () async {
      // Keycloak unreachable / 500 on the revoke endpoint — logout must still
      // clear local state rather than surface the error.
      storage.seedValue('refresh_token', 'ref');
      final dio = _mockDio([const _MockResponse(statusCode: 500)]);
      final service = AuthService(secureStorage: storage, dio: dio);

      await service.logout(); // must not throw

      final deletedKeys = storage.calls
          .where((c) => c['method'] == 'delete')
          .map((c) => c['key'] as String)
          .toSet();
      expect(
        deletedKeys,
        equals({
          'access_token',
          'refresh_token',
          'token_expiry',
          'username',
          'password',
        }),
      );
    });

    test(
        'revokes directly against Keycloak when the refresh token was issued '
        'to hhh-flutter (azp matches)', () async {
      storage.seedValue('refresh_token', _buildJwtWithAzp('hhh-flutter'));
      final adapter = _MockAdapter([const _MockResponse()]);
      final dio = Dio()..httpClientAdapter = adapter;
      final service = AuthService(secureStorage: storage, dio: dio);

      await service.logout();

      expect(adapter.requests, hasLength(1));
      expect(
        adapter.requests.single.path,
        'http://localhost:8080/realms/hhh/protocol/openid-connect/revoke',
      );
      expect(adapter.requests.single.data, isA<Map>().having(
        (m) => m['client_id'],
        'client_id',
        'hhh-flutter',
      ));
    });

    test(
        'routes through the backend /auth/revoke when the refresh token was '
        'issued to a different client (e.g. hhh-ropc) — Keycloak ignores '
        'revocation requests from a client other than the token\'s issuer',
        () async {
      storage.seedValue('refresh_token', _buildJwtWithAzp('hhh-ropc'));
      final adapter = _MockAdapter([const _MockResponse()]);
      final dio = Dio()..httpClientAdapter = adapter;
      final service = AuthService(secureStorage: storage, dio: dio);

      await service.logout();

      expect(adapter.requests, hasLength(1));
      expect(
        adapter.requests.single.path,
        'http://localhost:3000/api/v1/auth/revoke',
      );
    });

    test(
        'routes through the backend /auth/revoke when the refresh token is '
        'opaque/undecodable (onboarding/restore-issued tokens are not JWTs '
        'AuthService itself minted)', () async {
      storage.seedValue('refresh_token', 'opaque-server-issued-token');
      final adapter = _MockAdapter([const _MockResponse()]);
      final dio = Dio()..httpClientAdapter = adapter;
      final service = AuthService(secureStorage: storage, dio: dio);

      await service.logout();

      expect(adapter.requests, hasLength(1));
      expect(
        adapter.requests.single.path,
        'http://localhost:3000/api/v1/auth/revoke',
      );
    });
  });

  // ─── reauthenticate() ──────────────────────────────────────────────────────
  //
  // reauthenticate() no longer replays a stored raw password via Keycloak's
  // ROPC grant (removed as a security risk — see auth_service.dart). It now
  // delegates entirely to refreshToken(), i.e. a standard grant_type=
  // refresh_token exchange using the stored refresh token.

  group('reauthenticate()', () {
    test('returns false when no refresh token stored', () async {
      final service = AuthService(secureStorage: storage);
      expect(await service.reauthenticate(), isFalse);
    });

    test('reads the refresh_token key from storage', () async {
      storage.seedValue('refresh_token', 'refresh-abc');
      // Dio has no queued response → HTTP will fail → returns false, but the
      // storage read still happens inside refreshToken().
      final dio = _mockDio([]);
      final service = AuthService(secureStorage: storage, dio: dio);
      await service.reauthenticate();
      final readKeys = storage.calls
          .where((c) => c['method'] == 'read')
          .map((c) => c['key'] as String)
          .toSet();
      expect(readKeys, contains('refresh_token'));
    });

    test('returns true and writes access_token, refresh_token, token_expiry on 200', () async {
      storage.seedValue('refresh_token', 'refresh-abc');
      final newToken = _validJwt;
      final dio = _mockDio([
        _MockResponse(data: {
          'access_token': newToken,
          'refresh_token': 'new-refresh',
          'expires_in': 3600,
        }),
      ]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final result = await service.reauthenticate();

      expect(result, isTrue);
      final writes = storage.calls.where((c) => c['method'] == 'write').toList();
      expect(writes.any((c) => c['key'] == 'access_token' && c['value'] == newToken), isTrue);
      expect(writes.any((c) => c['key'] == 'refresh_token' && c['value'] == 'new-refresh'), isTrue);
      expect(writes.any((c) => c['key'] == 'token_expiry'), isTrue);
    });

    test('returns false and does NOT call delete when HTTP returns 401', () async {
      storage.seedValue('refresh_token', 'refresh-abc');
      final dio = _mockDio([const _MockResponse(statusCode: 401)]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final result = await service.reauthenticate();

      expect(result, isFalse);
      expect(storage.calls.where((c) => c['method'] == 'delete'), isEmpty);
    });
  });

  // ─── getAccessToken() — reauthentication fallback ──────────────────────────

  group('getAccessToken() — reauthentication fallback', () {
    test('does NOT call logout and returns new token when refresh 400 but '
        'the reauthenticate() retry succeeds', () async {
      storage.seedValue('access_token', _expiredJwt);
      storage.seedValue('refresh_token', 'expired-refresh');
      final newToken = _validJwt;
      // First HTTP call: refreshToken()'s refresh_token grant → 400.
      // Second HTTP call: reauthenticate()'s retry of the same grant → 200
      // with new tokens (models a concurrent instance having rotated the
      // refresh token in between).
      final dio = _mockDio([
        const _MockResponse(statusCode: 400),
        _MockResponse(data: {
          'access_token': newToken,
          'refresh_token': 'new-refresh',
          'expires_in': 3600,
        }),
      ]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final token = await service.getAccessToken();

      expect(token, equals(newToken));
      expect(storage.calls.where((c) => c['method'] == 'delete'), isEmpty);
    });

    test(
        'does NOT call logout when refresh 401 AND the reauthenticate() '
        'retry also fails', () async {
      storage.seedValue('access_token', _expiredJwt);
      storage.seedValue('refresh_token', 'expired-refresh');
      // Both HTTP calls fail with 401. The session must survive this —
      // only Settings -> Sign out / Delete account may clear it.
      final dio = _mockDio([
        const _MockResponse(statusCode: 401),
        const _MockResponse(statusCode: 401),
      ]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final token = await service.getAccessToken();

      expect(token, isNull);
      expect(storage.calls.where((c) => c['method'] == 'delete'), isEmpty);
    });
  });

  // ─── _tokenNeedsRefresh() via getAccessToken() ─────────────────────────────

  group('_tokenNeedsRefresh() — JWT exp decoding', () {
    test('expired JWT triggers refresh attempt (no stored expiry key)', () async {
      // Seed expired JWT, no token_expiry key → falls back to JWT exp claim.
      // No refresh_token → refreshToken() throws plain Exception (not a
      // DioException). Treated as a network error: stored token returned as-is.
      storage.seedValue('access_token', _expiredJwt);
      final service = AuthService(secureStorage: storage);

      final result = await service.getAccessToken();

      // Returns stored token without logging out (non-DioException error).
      expect(result, equals(_expiredJwt));
      expect(storage.calls.where((c) => c['method'] == 'delete'), isEmpty);
    });

    test('valid JWT skips refresh (no stored expiry key)', () async {
      // Seed a valid JWT with exp one hour from now, no token_expiry key.
      storage.seedValue('access_token', _validJwt);
      final service = AuthService(secureStorage: storage);

      final result = await service.getAccessToken();

      // Token is valid → returned directly without attempting refresh.
      expect(result, equals(_validJwt));
      expect(
        storage.calls.where((c) => c['method'] == 'read' && c['key'] == 'refresh_token'),
        isEmpty,
      );
    });
  });
}
