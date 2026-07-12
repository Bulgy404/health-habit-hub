// Widget tests for RestoreScreen.
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/screens/onboarding/restore_screen.dart';

class _MockSecureStorage extends FlutterSecureStorage {
  final Map<String, String?> writes = {};

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
    writes[key] = value;
  }
}

class _MockAdapter implements HttpClientAdapter {
  _MockAdapter({this.statusCode = 200, this.data});
  final int statusCode;
  final Map<String, dynamic>? data;

  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    if (statusCode >= 400) {
      return ResponseBody.fromString('{"error":"nope"}', statusCode, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });
    }
    return ResponseBody.fromString(
      data != null ? _jsonEncodeMap(data!) : '{}',
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

String _jsonEncodeMap(Map<String, dynamic> map) {
  final buffer = StringBuffer('{');
  var first = true;
  map.forEach((key, value) {
    if (!first) buffer.write(',');
    first = false;
    final encoded = value is String ? '"$value"' : '$value';
    buffer.write('"$key":$encoded');
  });
  buffer.write('}');
  return buffer.toString();
}

const _validPhrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon '
    'abandon abandon abandon ability abandon abandon abandon abandon '
    'abandon abandon abandon abandon abandon abandon abandon ability';

Widget _buildSubject({
  required Dio dio,
  required _MockSecureStorage storage,
}) {
  return ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/restore',
        routes: [
          GoRoute(
            path: '/restore',
            builder: (context, state) => RestoreScreen(storage: storage),
          ),
          GoRoute(
            path: '/share',
            builder: (context, state) => const Scaffold(body: Text('Share')),
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('rejects a phrase that is not 24 words without calling the API',
      (tester) async {
    final adapter = _MockAdapter();
    final dio = Dio()..httpClientAdapter = adapter;
    await tester.pumpWidget(
      _buildSubject(dio: dio, storage: _MockSecureStorage()),
    );

    await tester.enterText(find.byType(TextField), 'too short');
    await tester.tap(find.text('Restore account'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid passphrase or account not found'),
        findsOneWidget);
    expect(adapter.lastRequest, isNull);
  });

  testWidgets(
      'submits the phrase to POST /restore and stores the returned tokens '
      'on success', (tester) async {
    final storage = _MockSecureStorage();
    final adapter = _MockAdapter(
      data: {
        'username': '11111111-2222-3333-4444-555555555555',
        'access_token': 'tok',
        'refresh_token': 'ref',
        'expires_in': 300,
      },
    );
    final dio = Dio()..httpClientAdapter = adapter;
    await tester.pumpWidget(_buildSubject(dio: dio, storage: storage));

    await tester.enterText(find.byType(TextField), _validPhrase);
    await tester.tap(find.text('Restore account'));
    await tester.pumpAndSettle();

    expect(adapter.lastRequest?.path, contains('/restore'));
    expect(
      (adapter.lastRequest?.data as Map)['phrase'],
      _validPhrase,
    );
    expect(storage.writes['username'], '11111111-2222-3333-4444-555555555555');
    expect(storage.writes['access_token'], 'tok');
    expect(storage.writes['refresh_token'], 'ref');
    // The password never appears in the response and must never be written.
    expect(storage.writes.containsKey('password'), isFalse);
  });

  testWidgets('shows a generic error when the backend rejects the phrase',
      (tester) async {
    final dio = Dio()..httpClientAdapter = _MockAdapter(statusCode: 401);
    await tester.pumpWidget(
      _buildSubject(dio: dio, storage: _MockSecureStorage()),
    );

    await tester.enterText(find.byType(TextField), _validPhrase);
    await tester.tap(find.text('Restore account'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid passphrase or account not found'),
        findsOneWidget);
  });
}
