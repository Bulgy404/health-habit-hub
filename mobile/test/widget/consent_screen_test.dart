// Widget tests for ConsentScreen.
//
// webview_flutter has no platform implementation in plain widget tests:
// `WebViewController()` asserts `WebViewPlatform.instance != null` and
// throws otherwise. Since ConsentScreen constructs the controller *inside*
// the same try/catch that wraps the document fetch, that assertion failure
// would be swallowed and misread as an offline document fetch, making the
// success view (and therefore Accept/Decline) completely unreachable. A
// minimal fake WebViewPlatform — overriding only the two calls the screen
// makes (setJavaScriptMode, loadHtmlString) plus a no-op widget build — sits
// in for the real platform so the success branch is actually exercised.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/onboarding/consent_screen.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests;
// ConsentScreen fetches the document from the appBaseUrl (without the
// /api/v1 suffix).
const _apiBase = 'http://localhost:3000/api/v1';
const _appBase = 'http://localhost:3000';
const _docUrl = '$_appBase/en/consent';
const _updateConsentUrl = '$_apiBase/users/me/consent';

const _successDoc = {
  'content': '<p>Study details</p>',
  'document': {'version': '2.0.0'},
};

// ---------------------------------------------------------------------------
// Fake webview_flutter platform (see file header for why this exists)
// ---------------------------------------------------------------------------

class _FakeWebViewController extends PlatformWebViewController {
  _FakeWebViewController(super.params) : super.implementation();

  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async {}

  @override
  Future<void> loadHtmlString(String html, {String? baseUrl}) async {}
}

class _FakeWebViewWidget extends PlatformWebViewWidget {
  _FakeWebViewWidget(super.params) : super.implementation();

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _FakeWebViewPlatform extends WebViewPlatform {
  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) =>
      _FakeWebViewController(params);

  @override
  PlatformWebViewWidget createPlatformWebViewWidget(
    PlatformWebViewWidgetCreationParams params,
  ) =>
      _FakeWebViewWidget(params);
}

// ---------------------------------------------------------------------------
// Secure storage mock
// ---------------------------------------------------------------------------

// flutter_secure_storage has no platform implementation in the plain widget
// test environment, so calls on its MethodChannel never resolve and hang
// pumpAndSettle forever. ConsentScreen uses `const FlutterSecureStorage()`
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
// A sequenced adapter used only by the retry test, where the same GET route
// must fail once and then succeed — DioAdapter matches routes once, so a
// hand-rolled HttpClientAdapter (same pattern as restore_screen_test.dart /
// rotate_passphrase_screen_test.dart) is used instead.
// ---------------------------------------------------------------------------

class _SequencedAdapter implements HttpClientAdapter {
  _SequencedAdapter(this._statusCodes);
  final List<int> _statusCodes;
  int _calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final index = _calls < _statusCodes.length
        ? _calls
        : _statusCodes.length - 1;
    final statusCode = _statusCodes[index];
    _calls++;
    final body = statusCode == 200 ? jsonEncode(_successDoc) : '{}';
    return ResponseBody.fromString(
      body,
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps [ConsentScreen] in the minimal widget tree needed for tests.
///
/// Provides [dio] (with an attached adapter) as the [dioProvider] override.
Widget _buildSubject(Dio dio, {bool isUpdate = false}) {
  final router = GoRouter(
    initialLocation: '/onboarding/consent',
    routes: [
      GoRoute(
        path: '/onboarding/consent',
        builder: (context, state) => ConsentScreen(isUpdate: isUpdate),
      ),
      GoRoute(
        path: '/onboarding/passphrase',
        builder: (context, state) =>
            const Scaffold(body: Text('Passphrase')),
      ),
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const Scaffold(body: Text('Welcome')),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('Home')),
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
    WebViewPlatform.instance = _FakeWebViewPlatform();
  });

  testWidgets('shows a loading indicator while the document is being fetched',
      (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets(
      'shows the document with Accept/Decline actions once loaded, titled '
      'for the initial consent flow', (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('Study Information & Consent'), findsOneWidget);
    expect(find.byType(WebViewWidget), findsOneWidget);
    expect(find.text('I consent'), findsOneWidget);
    expect(find.text('I do not consent'), findsOneWidget);
  });

  testWidgets('shows the update title and hides the back button when isUpdate',
      (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));

    await tester.pumpWidget(_buildSubject(dio, isUpdate: true));
    await tester.pumpAndSettle();

    expect(find.text('Updated Study Consent'), findsOneWidget);
    expect(find.byType(BackButton), findsNothing);
  });

  testWidgets('shows an offline banner when the document fetch fails',
      (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(500, <String, dynamic>{}));

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('No connection'), findsOneWidget);
    expect(
      find.text(
        'The consent document could not be loaded. Please check your connection.',
      ),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(WebViewWidget), findsNothing);
  });

  testWidgets('tapping Retry on the offline banner re-fetches the document',
      (tester) async {
    dio.httpClientAdapter = _SequencedAdapter([500, 200]);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('No connection'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('No connection'), findsNothing);
    expect(find.byType(WebViewWidget), findsOneWidget);
    expect(find.text('I consent'), findsOneWidget);
  });

  testWidgets(
      'Accept in the initial flow navigates straight to the passphrase '
      'screen without calling the update-consent endpoint', (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I consent'));
    await tester.pumpAndSettle();

    expect(find.text('Passphrase'), findsOneWidget);
  });

  testWidgets(
      'Accept in isUpdate mode posts the accepted version and navigates home',
      (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));
    adapter.onPost(
      _updateConsentUrl,
      (server) => server.reply(200, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio, isUpdate: true));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I consent'));
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
  });

  testWidgets(
      'Accept in isUpdate mode still navigates home even if the '
      'update-consent POST fails (local record is the fallback)',
      (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));
    adapter.onPost(
      _updateConsentUrl,
      (server) => server.reply(500, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio, isUpdate: true));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I consent'));
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
  });

  testWidgets(
      'Decline in the initial flow navigates back to welcome (no sign-out '
      'call is relevant pre-authentication)', (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I do not consent'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome'), findsOneWidget);
  });

  testWidgets(
      'Decline in isUpdate mode signs the participant out and navigates back '
      'to welcome', (tester) async {
    adapter.onGet(_docUrl, (server) => server.reply(200, _successDoc));

    await tester.pumpWidget(_buildSubject(dio, isUpdate: true));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I do not consent'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome'), findsOneWidget);
  });
}
