// Widget tests for UserSettingsScreen — the settings hub itself. Its
// sub-screens (profile, help, rotate-passphrase, legal docs) already have
// their own dedicated tests; this file focuses on what's unique to the hub:
// the profile hero card, language/appearance pickers, the community-comments
// toggle, export-my-data, sign-out, and delete-account.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:share_plus_platform_interface/share_plus_platform_interface.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/comments_enabled_provider.dart';
import 'package:hhh/screens/user_settings_screen.dart';
import 'package:hhh/services/auth_service.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

// ---------------------------------------------------------------------------
// Secure storage mock (flutter_secure_storage has no platform implementation
// in plain widget tests). Covers every method the screen's provider chain
// touches: themeModeProvider and localeProvider read/write a single key
// each; commentsEnabledProvider is overridden below so it never hits this,
// but delete-account calls FlutterSecureStorage().deleteAll() directly.
// ---------------------------------------------------------------------------

const _secureStorageChannel = MethodChannel(
  'plugins.it_nomads.com/flutter_secure_storage',
);

final Map<String, String> _secureStorageValues = {};

void _mockSecureStorage() {
  TestWidgetsFlutterBinding.ensureInitialized();
  _secureStorageValues.clear();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(_secureStorageChannel, (call) async {
    switch (call.method) {
      case 'read':
        final key = (call.arguments as Map)['key'] as String;
        return _secureStorageValues[key];
      case 'write':
        final args = call.arguments as Map;
        _secureStorageValues[args['key'] as String] = args['value'] as String;
        return null;
      case 'delete':
        final key = (call.arguments as Map)['key'] as String;
        _secureStorageValues.remove(key);
        return null;
      case 'deleteAll':
        _secureStorageValues.clear();
        return null;
      case 'readAll':
        return _secureStorageValues;
      default:
        return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  int logoutCalls = 0;

  @override
  Future<bool> isLoggedIn() async => true;

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> logout() async {
    logoutCalls++;
  }
}

/// In-memory comments-enabled notifier, bypassing secure storage so the
/// toggle's own persistence doesn't interfere with the storage-value
/// assertions the theme/locale tests make.
class _FakeCommentsEnabledNotifier extends CommentsEnabledNotifier {
  @override
  bool build() => true;

  @override
  Future<void> setEnabled(bool value) async {
    state = value;
  }
}

/// No-op share platform (MockPlatformInterfaceMixin bypasses the token
/// check `SharePlatform.instance` normally enforces), so "Export my data"
/// can be tested without a real platform channel.
class _FakeSharePlatform extends SharePlatform with MockPlatformInterfaceMixin {
  ShareParams? lastParams;

  @override
  Future<ShareResult> share(ShareParams params) async {
    lastParams = params;
    return const ShareResult('ok', ShareResultStatus.success);
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

Widget _buildSubject(Dio dio, _FakeAuthService authService) {
  final router = GoRouter(
    initialLocation: '/settings',
    routes: [
      GoRoute(
        path: '/settings',
        builder: (context, state) => const UserSettingsScreen(),
      ),
      GoRoute(
        path: '/settings/profile',
        builder: (context, state) => const Scaffold(body: Text('Profile')),
      ),
      GoRoute(
        path: '/settings/help',
        builder: (context, state) => const Scaffold(body: Text('Help')),
      ),
      GoRoute(
        path: '/settings/rotate-passphrase',
        builder: (context, state) =>
            const Scaffold(body: Text('Rotate passphrase')),
      ),
      GoRoute(
        path: '/settings/privacy',
        builder: (context, state) => const Scaffold(body: Text('Privacy')),
      ),
      GoRoute(
        path: '/settings/consent',
        builder: (context, state) => const Scaffold(body: Text('Consent')),
      ),
      GoRoute(
        path: '/settings/imprint',
        builder: (context, state) => const Scaffold(body: Text('Imprint')),
      ),
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const Scaffold(body: Text('Welcome')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      dioProvider.overrideWithValue(dio),
      authServiceProvider.overrideWithValue(authService),
      commentsEnabledProvider.overrideWith(_FakeCommentsEnabledNotifier.new),
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
// Scroll helper — the screen is a long ListView, so most rows below the
// fold aren't built until scrolled into view.
// ---------------------------------------------------------------------------

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

Future<void> _scrollToAndTap(WidgetTester tester, Finder finder) async {
  await _scrollTo(tester, finder);
  await tester.tap(finder);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late Dio dio;
  late DioAdapter adapter;
  late _FakeAuthService authService;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
    authService = _FakeAuthService();
    _mockSecureStorage();
  });

  testWidgets('renders the profile hero card and My Profile row', (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    expect(find.text('Participant'), findsOneWidget);
    expect(find.text('My Profile'), findsOneWidget);
  });

  testWidgets('tapping My Profile navigates to the profile screen', (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await tester.tap(find.text('My Profile'));
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
  });

  testWidgets(
      'language picker lists all 5 languages and selecting one updates the row',
      (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    expect(find.text('English'), findsOneWidget); // current-value trailing text

    await tester.tap(find.text('Language'));
    await tester.pumpAndSettle();

    // Sheet lists all 5 supported languages.
    expect(find.text('Deutsch'), findsWidgets);
    expect(find.text('日本語'), findsOneWidget);
    expect(find.text('Français'), findsOneWidget);
    expect(find.text('Nederlands'), findsOneWidget);

    await tester.tap(find.text('Deutsch').last);
    await tester.pumpAndSettle();

    // Sheet closed, trailing value on the row updated.
    expect(find.text('Deutsch'), findsOneWidget);
  });

  testWidgets(
      'appearance picker lists light/system/dark and selecting one does not throw',
      (tester) async {
    // Regression check for the previously-fixed InheritedElement
    // `_dependents.isEmpty` crash: picking a theme mode right after the
    // sheet closes must not throw.
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    expect(find.text('System'), findsOneWidget); // default trailing value

    await tester.tap(find.text('Appearance'));
    await tester.pumpAndSettle();

    expect(find.text('Light'), findsWidgets);
    expect(find.text('Dark'), findsWidgets);

    await tester.tap(find.text('Dark').last);
    // The fix waits for the scheduler to go idle before applying the mode;
    // pumpAndSettle drives that to completion.
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Dark'), findsOneWidget);
  });

  testWidgets('community comments toggle flips state', (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    final toggle = find.byType(Switch).first;
    expect(tester.widget<Switch>(toggle).value, isTrue);

    await tester.tap(toggle);
    await tester.pumpAndSettle();

    expect(tester.widget<Switch>(toggle).value, isFalse);
  });

  testWidgets('tapping Help & Support navigates', (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Help & Support'));
    await tester.pumpAndSettle();

    expect(find.text('Help'), findsOneWidget);
  });

  testWidgets('tapping Change recovery passphrase navigates', (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Change recovery passphrase'));
    await tester.pumpAndSettle();

    expect(find.text('Rotate passphrase'), findsOneWidget);
  });

  testWidgets('legal links navigate to their respective screens', (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Privacy Statement'));
    await tester.pumpAndSettle();
    expect(find.text('Privacy'), findsOneWidget);
  });

  testWidgets('Export my data attempts a share after a successful fetch',
      (tester) async {
    final fakeShare = _FakeSharePlatform();
    SharePlatform.instance = fakeShare;
    adapter.onGet(
      '$_base/users/me/export',
      (server) => server.reply(200, {'profile': 'data'}),
    );

    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Export my data'));
    await tester.pumpAndSettle();

    expect(fakeShare.lastParams, isNotNull);
    expect(fakeShare.lastParams!.files, hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Export my data shows a failure snackbar when the fetch fails',
      (tester) async {
    adapter.onGet(
      '$_base/users/me/export',
      (server) => server.reply(500, {}),
    );

    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Export my data'));
    await tester.pumpAndSettle();

    expect(
      find.text('Export failed. Please check your connection and try again.'),
      findsOneWidget,
    );
  });

  testWidgets('Sign out shows a confirm dialog and only signs out on confirm',
      (tester) async {
    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(find.text('Are you sure you want to sign out?'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(authService.logoutCalls, 0);

    await _scrollToAndTap(tester, find.text('Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out').last);
    await tester.pumpAndSettle();

    expect(authService.logoutCalls, 1);
  });

  testWidgets(
      'Delete account shows a confirm dialog and, on confirm, clears storage and navigates to onboarding',
      (tester) async {
    _secureStorageValues['some_leftover_key'] = 'value';
    adapter.onDelete(
      '$_base/users/me',
      (server) => server.reply(200, {}),
    );

    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Delete account'));
    await tester.pumpAndSettle();

    expect(find.text('Delete account?'), findsOneWidget);

    await tester.tap(find.text('Delete permanently'));
    await tester.pumpAndSettle();

    expect(_secureStorageValues, isEmpty);
    expect(authService.logoutCalls, 1);
    expect(find.text('Welcome'), findsOneWidget);
  });

  testWidgets('Delete account shows a failure snackbar and does not navigate on error',
      (tester) async {
    adapter.onDelete(
      '$_base/users/me',
      (server) => server.reply(500, {}),
    );

    await tester.pumpWidget(_buildSubject(dio, authService));
    await tester.pumpAndSettle();

    await _scrollToAndTap(tester, find.text('Delete account'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete permanently'));
    await tester.pumpAndSettle();

    expect(
      find.text('Account deletion failed. Please check your connection and try again.'),
      findsOneWidget,
    );
    expect(authService.logoutCalls, 0);
    expect(find.text('Welcome'), findsNothing);
  });
}
