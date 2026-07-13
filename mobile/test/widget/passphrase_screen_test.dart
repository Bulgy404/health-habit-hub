// Widget tests for PassphraseScreen (initial creation flow — see
// rotate_passphrase_screen_test.dart for the closely related rotation flow).
//
// Tests cover: loading state while POST /onboard is in flight, error state
// with Retry on failure, success state showing the 24-word phrase and the
// copy-to-clipboard action, the "I have written it down" checkbox gating
// Continue, and Continue navigating onward.
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
import 'package:hhh/screens/onboarding/passphrase_screen.dart';
import 'package:hhh/widgets/passphrase_word_grid.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

// flutter_secure_storage has no platform implementation in the plain widget
// test environment, so calls on its MethodChannel never resolve and hang
// pumpAndSettle forever. PassphraseScreen uses `const FlutterSecureStorage()`
// directly (it has no injectable storage param), so every test needs this.
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

/// Wraps [PassphraseScreen] in the minimal widget tree needed for tests.
///
/// Provides [dio] (with an attached adapter) as the [dioProvider] override.
Widget _buildSubject(Dio dio) {
  final router = GoRouter(
    initialLocation: '/onboarding/passphrase',
    routes: [
      GoRoute(
        path: '/onboarding/passphrase',
        builder: (context, state) => const PassphraseScreen(),
      ),
      GoRoute(
        path: '/onboarding/profile-setup',
        builder: (context, state) =>
            const Scaffold(body: Text('ProfileSetup')),
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

/// Valid credential payload for a successful POST /onboard.
const _successData = {
  'username': '11111111-2222-3333-4444-555555555555',
  'password': 'aabbccddeeff00112233445566778899',
  'access_token': 'tok',
  'refresh_token': 'ref',
  'expires_in': 300,
};

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

  testWidgets('shows a loading indicator while the account is being created',
      (tester) async {
    adapter.onPost(
      '$_base/onboard',
      (server) => server.reply(200, _successData),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // Drain the pending request so no timers leak into the next test.
    await tester.pumpAndSettle();
  });

  testWidgets('shows an error state with a Retry button when creation fails',
      (tester) async {
    adapter.onPost(
      '$_base/onboard',
      (server) => server.reply(500, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Could not reach the server. Please check your connection and try again.',
      ),
      findsOneWidget,
    );
    expect(find.widgetWithText(FilledButton, 'Retry'), findsOneWidget);

    // Tapping Retry re-issues the request; the endpoint still fails, so the
    // error state is shown again rather than hanging or crashing.
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Could not reach the server. Please check your connection and try again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
      'shows the 24-word phrase, a copy button, and a Continue button that '
      'is disabled until confirmed', (tester) async {
    adapter.onPost(
      '$_base/onboard',
      (server) => server.reply(200, _successData),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    final grid = tester.widget<PassphraseWordGrid>(
      find.byType(PassphraseWordGrid),
    );
    expect(grid.words, hasLength(24));

    expect(find.widgetWithText(OutlinedButton, 'Copy to clipboard'),
        findsOneWidget);
    expect(find.text('I have written it down'), findsOneWidget);

    final continueButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Continue'),
    );
    expect(continueButton.onPressed, isNull);
  });

  testWidgets('copy-to-clipboard button shows a confirmation snackbar',
      (tester) async {
    adapter.onPost(
      '$_base/onboard',
      (server) => server.reply(200, _successData),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    final copyButtonFinder =
        find.widgetWithText(OutlinedButton, 'Copy to clipboard');
    await tester.ensureVisible(copyButtonFinder);
    await tester.tap(copyButtonFinder);
    await tester.pump();

    expect(find.text('Passphrase copied to clipboard'), findsOneWidget);
  });

  testWidgets(
      'checking "I have written it down" enables Continue, which navigates '
      'to profile-setup', (tester) async {
    adapter.onPost(
      '$_base/onboard',
      (server) => server.reply(200, _successData),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    final continueButtonFinder = find.widgetWithText(FilledButton, 'Continue');
    expect(
      tester.widget<FilledButton>(continueButtonFinder).onPressed,
      isNull,
    );

    await tester.ensureVisible(find.text('I have written it down'));
    await tester.tap(find.text('I have written it down'));
    await tester.pump();

    expect(
      tester.widget<FilledButton>(continueButtonFinder).onPressed,
      isNotNull,
    );

    await tester.tap(continueButtonFinder);
    await tester.pumpAndSettle();

    expect(find.text('ProfileSetup'), findsOneWidget);
  });
}
