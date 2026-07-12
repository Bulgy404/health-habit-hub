// Widget tests for RotatePassphraseScreen.
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/rotate_passphrase_screen.dart';

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

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (statusCode >= 400) {
      throw DioException(
        requestOptions: options,
        response: Response(requestOptions: options, statusCode: statusCode),
      );
    }
    return ResponseBody.fromString(
      data != null ? jsonEncodeMap(data!) : '{}',
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

String jsonEncodeMap(Map<String, dynamic> map) {
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

Widget _buildSubject({required Dio dio, required _MockSecureStorage storage}) {
  return ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: RotatePassphraseScreen(storage: storage),
    ),
  );
}

void main() {
  testWidgets('idle state shows the warning and generate button',
      (tester) async {
    final dio = Dio()..httpClientAdapter = _MockAdapter();
    await tester.pumpWidget(
      _buildSubject(dio: dio, storage: _MockSecureStorage()),
    );

    expect(find.text('Generate new phrase'), findsOneWidget);
  });

  testWidgets('tapping generate shows a confirmation dialog first',
      (tester) async {
    final dio = Dio()..httpClientAdapter = _MockAdapter();
    await tester.pumpWidget(
      _buildSubject(dio: dio, storage: _MockSecureStorage()),
    );

    await tester.tap(find.text('Generate new phrase'));
    await tester.pumpAndSettle();

    expect(find.text('Change your recovery passphrase?'), findsOneWidget);
    // Dialog not yet confirmed — no request has been made.
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets(
      'confirming rotates the passphrase and shows the new word grid, '
      'writing the new credentials to storage', (tester) async {
    final storage = _MockSecureStorage();
    final dio = Dio()
      ..httpClientAdapter = _MockAdapter(
        data: {
          'username': '11111111-2222-3333-4444-555555555555',
          'password': 'aabbccddeeff00112233445566778899',
          'access_token': 'tok',
          'refresh_token': 'ref',
          'expires_in': 300,
        },
      );
    await tester.pumpWidget(_buildSubject(dio: dio, storage: storage));

    await tester.tap(find.text('Generate new phrase'));
    await tester.pumpAndSettle();
    // Dialog has two buttons with this label — confirm the last one (dialog action).
    await tester.tap(find.text('Generate new phrase').last);
    await tester.pumpAndSettle();

    expect(find.text('Your new recovery passphrase'), findsOneWidget);
    expect(storage.writes['username'], '11111111-2222-3333-4444-555555555555');
    // The raw password must never be persisted (it's only used in-memory to
    // derive the displayed recovery passphrase) — see auth_service.dart's
    // removed ROPC replay path.
    expect(storage.writes.containsKey('password'), isFalse);
    expect(storage.writes['access_token'], 'tok');

    // Done button stays disabled until the user confirms they saved it.
    final doneButtonFinder = find.widgetWithText(FilledButton, 'Done');
    final doneButton = tester.widget<FilledButton>(doneButtonFinder);
    expect(doneButton.onPressed, isNull);

    await tester.ensureVisible(find.text('I have written it down'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('I have written it down'));
    await tester.pump();

    final doneButtonAfter = tester.widget<FilledButton>(doneButtonFinder);
    expect(doneButtonAfter.onPressed, isNotNull);
  });

  testWidgets('shows an error state when the request fails', (tester) async {
    final dio = Dio()..httpClientAdapter = _MockAdapter(statusCode: 500);
    await tester.pumpWidget(
      _buildSubject(dio: dio, storage: _MockSecureStorage()),
    );

    await tester.tap(find.text('Generate new phrase'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate new phrase').last);
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Could not generate a new passphrase. Please check your connection and try again.',
      ),
      findsOneWidget,
    );
  });
}
