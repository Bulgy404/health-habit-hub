// Widget tests for ProfileScreen.
//
// WebView rendering is not tested in unit widget tests (requires platform
// channels). Tests cover loading state, offline/error state, and key widgets.
//
// Note: ProfileScreen has an internal Dio instance that makes a real HTTP
// request in initState (GET /profile). In the test environment this request
// fails quickly. All tests use pumpAndSettle() to drain Dio's async timers so
// no pending timers remain after the test.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/survey.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/profile_screen.dart';
import 'package:dio/dio.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/survey_service.dart';

final _fakeDio = Dio();

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

// Fake survey service that always throws — ProfileScreen's internal Dio call
// will also fail, keeping the offline-banner as the visible state.
class _FakeSurveyService extends SurveyService {
  _FakeSurveyService() : super(dio: _fakeDio);

  @override
  Future<Survey> fetchSurvey(String id) =>
      Future.error(Exception('Network error'));
}

Widget _buildSubject() {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      surveyServiceProvider.overrideWithValue(_FakeSurveyService()),
    ],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: const ProfileScreen(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows AppBar with correct title', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pumpAndSettle();

    expect(find.text('My Profile'), findsOneWidget);
  });

  testWidgets('shows loading indicator briefly while fetching', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump(); // first frame: _loading = true
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // Drain all Dio timers so no pending timers remain.
    await tester.pumpAndSettle();
  });

  testWidgets('shows offline banner on network error', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pumpAndSettle();

    expect(find.text('No connection'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('offline banner shows wifi_off icon', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.wifi_off), findsOneWidget);
    expect(
        find.text('Could not load profile.\nPlease check your connection.'),
        findsOneWidget);
  });
}
