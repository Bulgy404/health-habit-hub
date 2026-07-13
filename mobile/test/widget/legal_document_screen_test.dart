// Widget tests for LegalDocumentScreen.
//
// webview_flutter has no platform implementation in plain widget tests
// (WebViewController() asserts WebViewPlatform.instance != null); a minimal
// fake platform stands in so the success branch is reachable, and captures
// the HTML string passed to loadHtmlString so the metadata footer (baked
// into that HTML, not rendered as separate Flutter widgets) can still be
// asserted on.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/legal_document_screen.dart';

// AppConfig.appBaseUrl defaults to 'http://localhost:3000' in tests
// (apiBaseUrl 'http://localhost:3000/api/v1' with the /api/v1 suffix
// stripped).
const _appBase = 'http://localhost:3000';

const _successBody = {
  'content': '<p>Some legal text</p>',
  'document': {
    'version': '2.0.0',
    'effectiveDate': '2026-01-01',
    'bindingLanguage': 'de',
  },
};

// ---------------------------------------------------------------------------
// Fake webview_flutter platform (see file header for why this exists)
// ---------------------------------------------------------------------------

String? _lastLoadedHtml;

class _FakeWebViewController extends PlatformWebViewController {
  _FakeWebViewController(super.params) : super.implementation();

  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async {}

  @override
  Future<void> loadHtmlString(String html, {String? baseUrl}) async {
    _lastLoadedHtml = html;
  }
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
// Harness
// ---------------------------------------------------------------------------

Widget _buildSubject(Dio dio, LegalDocumentType type) {
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
      home: LegalDocumentScreen(documentType: type),
    ),
  );
}

void main() {
  late Dio dio;
  late DioAdapter adapter;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
    WebViewPlatform.instance = _FakeWebViewPlatform();
    _lastLoadedHtml = null;
  });

  group('fetches the correct endpoint per document type', () {
    final cases = {
      LegalDocumentType.privacy: ('privacy', 'Privacy Statement'),
      LegalDocumentType.accessibility: (
        'accessibility',
        'Accessibility Statement'
      ),
      LegalDocumentType.imprint: ('imprint', 'Imprint'),
      LegalDocumentType.consent: ('consent', 'Study consent'),
    };

    for (final entry in cases.entries) {
      final (segment, title) = entry.value;
      testWidgets('$segment -> GET /en/$segment, AppBar titled "$title"',
          (tester) async {
        adapter.onGet(
          '$_appBase/en/$segment',
          (server) => server.reply(200, _successBody),
        );

        await tester.pumpWidget(_buildSubject(dio, entry.key));
        await tester.pumpAndSettle();

        expect(find.widgetWithText(AppBar, title), findsOneWidget);
        expect(_lastLoadedHtml, isNotNull);
        expect(_lastLoadedHtml, contains('Some legal text'));
      });
    }
  });

  testWidgets('shows a loading indicator before the document arrives',
      (tester) async {
    adapter.onGet(
      '$_appBase/en/privacy',
      (server) =>
          server.reply(200, _successBody, delay: const Duration(seconds: 1)),
    );

    await tester.pumpWidget(_buildSubject(dio, LegalDocumentType.privacy));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
  });

  testWidgets('embeds version/effective-date footer with the binding-language note',
      (tester) async {
    adapter.onGet(
      '$_appBase/en/privacy',
      (server) => server.reply(200, _successBody),
    );

    await tester.pumpWidget(_buildSubject(dio, LegalDocumentType.privacy));
    await tester.pumpAndSettle();

    expect(_lastLoadedHtml, contains('Version 2.0.0'));
    expect(_lastLoadedHtml, contains('Effective 2026-01-01'));
    // bindingLanguage 'de' != the 'en' locale used here, so the binding note
    // should be present.
    expect(
      _lastLoadedHtml,
      contains('The German version is authoritative.'),
    );
  });

  testWidgets('omits the footer entirely when the backend sends no metadata',
      (tester) async {
    adapter.onGet(
      '$_appBase/en/privacy',
      (server) => server.reply(200, {'content': '<p>No metadata here</p>'}),
    );

    await tester.pumpWidget(_buildSubject(dio, LegalDocumentType.privacy));
    await tester.pumpAndSettle();

    expect(_lastLoadedHtml, isNotNull);
    // The `.doc-meta` CSS rule is always present in the static stylesheet;
    // what's conditional is the <footer> element itself.
    expect(_lastLoadedHtml, isNot(contains('<footer')));
  });

  testWidgets('shows an offline banner on fetch failure, with a working retry',
      (tester) async {
    adapter.onGet(
      '$_appBase/en/privacy',
      (server) => server.reply(500, {}),
    );

    await tester.pumpWidget(_buildSubject(dio, LegalDocumentType.privacy));
    await tester.pumpAndSettle();

    expect(
      find.text('Could not load this document.\nPlease check your connection.'),
      findsOneWidget,
    );
    expect(find.byType(WebViewWidget), findsNothing);

    // Retry succeeds once the backend is reachable.
    adapter.onGet(
      '$_appBase/en/privacy',
      (server) => server.reply(200, _successBody),
    );
    await tester.tap(find.widgetWithText(ElevatedButton, 'Retry'));
    await tester.pumpAndSettle();

    expect(
      find.text('Could not load this document.\nPlease check your connection.'),
      findsNothing,
    );
    expect(_lastLoadedHtml, contains('Some legal text'));
  });

  testWidgets('treats an empty content body as a failure (offline banner)',
      (tester) async {
    adapter.onGet(
      '$_appBase/en/privacy',
      (server) => server.reply(200, {'content': ''}),
    );

    await tester.pumpWidget(_buildSubject(dio, LegalDocumentType.privacy));
    await tester.pumpAndSettle();

    expect(
      find.text('Could not load this document.\nPlease check your connection.'),
      findsOneWidget,
    );
  });
}
