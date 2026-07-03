// Widget tests for ShareHabitScreen.
//
// WebView rendering is not tested in unit widget tests (requires platform
// channels). Tests cover the landing card state, offline/error state, and
// survey-ready vs loading button text.
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/questionnaire/questionnaire_service.dart';
import 'package:hhh/models/habit_stats.dart';
import 'package:hhh/models/survey.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/donate_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/habit_service.dart';
import 'package:hhh/services/survey_service.dart';

/// Shared no-op Dio instance for fake service constructors.
/// Tests override surveyServiceProvider so HTTP calls never happen.
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

class _FakeSurveyService extends SurveyService {
  final bool shouldThrow;
  final Completer<Survey>? _completer;

  _FakeSurveyService.throwing()
      : shouldThrow = true,
        _completer = null,
        super(dio: _fakeDio);

  _FakeSurveyService.loading()
      : shouldThrow = false,
        _completer = Completer<Survey>(),
        super(dio: _fakeDio);

  @override
  Future<Survey> fetchSurvey(String id) {
    if (shouldThrow) return Future.error(Exception('Network error'));
    return _completer!.future;
  }
}

Widget _buildSubject(_FakeSurveyService surveyService) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      surveyServiceProvider.overrideWithValue(surveyService),
      // Return empty stats immediately to avoid any network calls.
      habitStatsProvider.overrideWith(
        (_) async => const HabitStats(total: 0, byCategory: [], byDay: []),
      ),
      // No due questionnaires — avoids a real network call to /questionnaires/due.
      dueQuestionnairesProvider.overrideWith(
        (_) async => const <DueQuestionnaire>[],
      ),
    ],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: const ShareHabitScreen(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows AppBar with correct title', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeSurveyService.loading()));
    await tester.pump();

    expect(find.text('Health Habit Hub'), findsOneWidget);
  });

  testWidgets('shows Start sharing button while survey is fetching',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeSurveyService.loading()));
    await tester.pump();

    expect(find.text('Start sharing'), findsOneWidget);
  });

  testWidgets('still shows Start sharing button when survey fetch fails',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeSurveyService.throwing()));
    await tester.pumpAndSettle();

    // Survey ID is optional — errors are silently ignored so the habit
    // can still be donated without ratings.
    expect(find.text('Start sharing'), findsOneWidget);
  });

  testWidgets('tapping Start sharing enters survey mode', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeSurveyService.throwing()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Start sharing'));
    await tester.pump();

    expect(find.text('How often do you do this habit?'), findsOneWidget);
  });
}
