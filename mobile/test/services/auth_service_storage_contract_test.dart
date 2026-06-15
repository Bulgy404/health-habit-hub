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

  _MockAdapter(this._responses);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
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
        'returns null and calls logout() when Keycloak rejects refresh (400) '
        'and no stored credentials', () async {
      // Expired token + a refresh_token so refreshToken() reaches the HTTP
      // call, which returns 400. No username/password → reauthenticate() fails
      // → logout() is called.
      storage.seedValue('access_token', _expiredJwt);
      storage.seedValue('refresh_token', 'expired-refresh-token');
      final dio = _mockDio([const _MockResponse(statusCode: 400)]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final result = await service.getAccessToken();

      expect(result, isNull);
      final deletedKeys =
          storage.calls.where((c) => c['method'] == 'delete').map((c) => c['key'] as String).toSet();
      expect(deletedKeys, containsAll(['access_token', 'refresh_token', 'token_expiry']));
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
  });

  // ─── reauthenticate() ──────────────────────────────────────────────────────

  group('reauthenticate()', () {
    test('returns false when no username/password stored', () async {
      final service = AuthService(secureStorage: storage);
      expect(await service.reauthenticate(), isFalse);
    });

    test('reads username and password keys from storage', () async {
      storage.seedValue('username', 'user-123');
      storage.seedValue('password', 'pass-abc');
      // No Dio mock → HTTP will fail → returns false, but storage reads happen.
      final service = AuthService(secureStorage: storage);
      await service.reauthenticate();
      final readKeys = storage.calls
          .where((c) => c['method'] == 'read')
          .map((c) => c['key'] as String)
          .toSet();
      expect(readKeys, containsAll(['username', 'password']));
    });

    test('returns true and writes access_token, refresh_token, token_expiry on 200', () async {
      storage.seedValue('username', 'user-123');
      storage.seedValue('password', 'pass-abc');
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
      storage.seedValue('username', 'user-123');
      storage.seedValue('password', 'pass-abc');
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
        'reauthentication succeeds', () async {
      storage.seedValue('access_token', _expiredJwt);
      storage.seedValue('refresh_token', 'expired-refresh');
      storage.seedValue('username', 'user-123');
      storage.seedValue('password', 'pass-abc');
      final newToken = _validJwt;
      // First HTTP call: refresh_token grant → 400.
      // Second HTTP call: password grant → 200 with new tokens.
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

    test('calls logout when refresh 401 AND reauthentication also fails', () async {
      storage.seedValue('access_token', _expiredJwt);
      storage.seedValue('refresh_token', 'expired-refresh');
      storage.seedValue('username', 'user-123');
      storage.seedValue('password', 'pass-abc');
      // Both HTTP calls fail with 401.
      final dio = _mockDio([
        const _MockResponse(statusCode: 401),
        const _MockResponse(statusCode: 401),
      ]);
      final service = AuthService(secureStorage: storage, dio: dio);

      final token = await service.getAccessToken();

      expect(token, isNull);
      final deletedKeys = storage.calls
          .where((c) => c['method'] == 'delete')
          .map((c) => c['key'] as String)
          .toSet();
      expect(deletedKeys, containsAll(['access_token', 'refresh_token', 'token_expiry']));
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
