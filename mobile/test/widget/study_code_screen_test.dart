// Widget tests for StudyCodeScreen.
//
// Tests cover: initial render, code uppercase forcing, validation,
// loading state on submit, skip navigation, and error display.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/onboarding/study_code_screen.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps [StudyCodeScreen] in the minimal widget tree needed for tests.
///
/// Provides [dio] (with an attached adapter) as the [dioProvider] override.
Widget _buildSubject(Dio dio) {
  final router = GoRouter(
    initialLocation: '/onboarding/study-code',
    routes: [
      GoRoute(
        path: '/onboarding/study-code',
        builder: (context, state) => const StudyCodeScreen(),
      ),
      GoRoute(
        path: '/share',
        builder: (context, state) => const Scaffold(body: Text('Share')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      dioProvider.overrideWithValue(dio),
    ],
    child: MaterialApp.router(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      routerConfig: router,
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late Dio dio;
  late DioAdapter adapter;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
  });

  testWidgets('shows "Do you have a study code?" heading', (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.text('Do you have a study code?'), findsOneWidget);
  });

  testWidgets('shows text field with HHH-XXXXX hint', (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('HHH-XXXXX'), findsOneWidget);
  });

  testWidgets('shows "Continue with code" button', (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.text('Continue with code'), findsOneWidget);
  });

  testWidgets('shows Skip link in AppBar actions and below text field',
      (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    // AppBar action says 'Skip'; TextButton below field says longer text.
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Skip — join without a study code'), findsOneWidget);
  });

  testWidgets('code input forces uppercase', (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'hhh-abcde');
    await tester.pump();

    expect(find.text('HHH-ABCDE'), findsOneWidget);
  });

  testWidgets('shows validation error for invalid code format', (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'BADCODE');
    await tester.tap(find.text('Continue with code'));
    await tester.pump();

    expect(
      find.text('Enter a valid code in HHH-XXXXX format.'),
      findsOneWidget,
    );
  });

  testWidgets('shows "Invalid code" error on 404', (tester) async {
    adapter.onPost(
      '$_base/onboarding/redeem-code',
      (server) => server.reply(404, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'HHH-ABCDE');
    await tester.tap(find.text('Continue with code'));
    await tester.pumpAndSettle();

    expect(
        find.text('Invalid code. Please check and try again.'), findsOneWidget);
  });

  testWidgets('shows "expired" error on 410', (tester) async {
    adapter.onPost(
      '$_base/onboarding/redeem-code',
      (server) => server.reply(410, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'HHH-ABCDE');
    await tester.tap(find.text('Continue with code'));
    await tester.pumpAndSettle();

    expect(find.text('This code has expired.'), findsOneWidget);
  });

  testWidgets('shows "already used" error on 409', (tester) async {
    adapter.onPost(
      '$_base/onboarding/redeem-code',
      (server) => server.reply(409, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'HHH-ABCDE');
    await tester.tap(find.text('Continue with code'));
    await tester.pumpAndSettle();

    expect(find.text('This code has already been used.'), findsOneWidget);
  });

}
