// Widget tests for StudyCodeScreen.
//
// Tests cover: initial render, code uppercase forcing, validation,
// loading state on submit, skip navigation, and error display.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

// flutter_secure_storage has no platform implementation in the plain widget
// test environment, so calls on its MethodChannel never resolve and hang
// pumpAndSettle forever — every test in this file exercises it via
// _redirectIfAlreadyEnrolled's storage.read in initState, and the
// skip-success path also does a storage.write.
const _secureStorageChannel = MethodChannel(
  'plugins.it_nomads.com/flutter_secure_storage',
);

void _mockSecureStorage() {
  TestWidgetsFlutterBinding.ensureInitialized();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(_secureStorageChannel, (call) async {
    switch (call.method) {
      case 'readAll':
        return <String, String>{};
      default:
        return null;
    }
  });
}

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
    _mockSecureStorage();
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

  testWidgets('shows a Join without study code button below the text field',
      (tester) async {
    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.text('Join without study code'), findsOneWidget);
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

  testWidgets('tapping Skip enrols in the default study and navigates on success',
      (tester) async {
    adapter.onPost(
      '$_base/onboarding/skip-code',
      (server) => server.reply(200, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.tap(find.text('Join without study code'));
    await tester.pumpAndSettle();

    expect(find.text('Share'), findsOneWidget);
  });

  testWidgets(
      'tapping Skip shows an error and stays on the screen when skip-code fails',
      (tester) async {
    adapter.onPost(
      '$_base/onboarding/skip-code',
      (server) => server.reply(503, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    await tester.tap(find.text('Join without study code'));
    await tester.pumpAndSettle();

    // Must not have silently proceeded into an unenrolled state.
    expect(find.text('Share'), findsNothing);
    expect(
      find.text(
        'Could not join without a code. Please check your connection and try again.',
      ),
      findsOneWidget,
    );
  });
}
