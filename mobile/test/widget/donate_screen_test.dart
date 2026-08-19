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
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/features/questionnaire/questionnaire_service.dart';
import 'package:hhh/models/habit_stats.dart';
import 'package:hhh/models/survey.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/show_in_graph_provider.dart';
import 'package:hhh/screens/donate_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/habit_service.dart';
import 'package:hhh/services/survey_service.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _apiBase = 'http://localhost:3000/api/v1';

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

Widget _buildSubject(
  _FakeSurveyService surveyService, {
  List<MyHabit> myHabits = const [],
  String donationInputMode = 'freeText',
  List<BehaviorOption> behaviorOptions = const [],
}) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      surveyServiceProvider.overrideWithValue(surveyService),
      // Return empty stats immediately to avoid any network calls.
      habitStatsProvider.overrideWith(
        (_) async => const HabitStats(total: 0, byCategory: [], byDay: []),
      ),
      // Drives the share-activity graph / "shared today" state — defaults to
      // no donated habits, avoiding a real network call to /habits/my-stats.
      myStatsProvider.overrideWith(
        (_) async => MyStats(
          total: myHabits.length,
          byDimension: const [],
          habits: myHabits,
        ),
      ),
      // No due questionnaires — avoids a real network call to /questionnaires/due.
      dueQuestionnairesProvider.overrideWith(
        (_) async => const <DueQuestionnaire>[],
      ),
      // Avoids a real network call to /me/habit-config (DonateFormWidget
      // reads donationInputModeProvider, which derives from this).
      habitConfigProvider.overrideWith(
        (_) async => HabitConfig(
          cueCount: 'multi',
          cueSource: 'self_selected',
          behaviorOptions: behaviorOptions,
          srhiItems: const [],
          donationInputMode: donationInputMode,
        ),
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

/// Builds the donate screen behind a real [GoRouter] with a mocked [Dio], so
/// [ShareHabitScreen._submit] can actually run end-to-end — needed to test
/// the success→questionnaire navigation timing.
Widget _buildRoutedSubject({
  required Dio dio,
  String? postDonationQuestionnaireSlug,
}) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (context, state) => const ShareHabitScreen()),
      GoRoute(
        path: '/questionnaire/:slug',
        builder: (context, state) => Scaffold(
          body: Text('Questionnaire: ${state.pathParameters['slug']}'),
        ),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      dioProvider.overrideWithValue(dio),
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      surveyServiceProvider.overrideWithValue(_FakeSurveyService.throwing()),
      habitStatsProvider.overrideWith(
        (_) async => const HabitStats(total: 0, byCategory: [], byDay: []),
      ),
      myStatsProvider.overrideWith(
        (_) async => const MyStats(total: 0, byDimension: [], habits: []),
      ),
      dueQuestionnairesProvider.overrideWith(
        (_) async => const <DueQuestionnaire>[],
      ),
      // Ratings off so the form is submittable with just the habit sentence.
      habitConfigProvider.overrideWith(
        (_) async => HabitConfig(
          cueCount: 'multi',
          cueSource: 'self_selected',
          behaviorOptions: const [],
          srhiItems: const [],
          donationInputMode: 'freeText',
          donationQuestionnaireSlug: postDonationQuestionnaireSlug,
          donationAskFrequency: false,
          donationAskHealthBenefit: false,
          donationAskWellbeing: false,
        ),
      ),
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
  testWidgets('shows AppBar with correct title', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeSurveyService.loading()));
    await tester.pump();

    expect(find.text('Health Habit Hub'), findsOneWidget);
  });

  testWidgets('shows Start sharing button while survey is fetching', (
    tester,
  ) async {
    await tester.pumpWidget(_buildSubject(_FakeSurveyService.loading()));
    await tester.pump();

    expect(find.text('Start sharing'), findsOneWidget);
  });

  testWidgets('still shows Start sharing button when survey fetch fails', (
    tester,
  ) async {
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

  testWidgets(
    'voice input control is hidden when donationInputMode is freeText (default)',
    (tester) async {
      await tester.pumpWidget(_buildSubject(_FakeSurveyService.throwing()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start sharing'));
      await tester.pump();

      expect(find.text('Hold to speak'), findsNothing);
    },
  );

  testWidgets('voice input control is shown when donationInputMode is voice', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildSubject(_FakeSurveyService.throwing(), donationInputMode: 'voice'),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Start sharing'));
    await tester.pumpAndSettle();

    expect(find.text('Hold to speak'), findsOneWidget);
  });

  testWidgets(
    'catalog picker is shown (not the free-text field or voice control) when donationInputMode is structured',
    (tester) async {
      await tester.pumpWidget(
        _buildSubject(
          _FakeSurveyService.throwing(),
          donationInputMode: 'structured',
          behaviorOptions: const [
            BehaviorOption(key: 'walking', label: 'Going for a walk'),
            BehaviorOption(key: 'meditation', label: 'Meditating'),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start sharing'));
      await tester.pumpAndSettle();

      expect(find.text('Hold to speak'), findsNothing);
      expect(find.text('Going for a walk'), findsOneWidget);
      expect(find.text('Meditating'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
    },
  );

  testWidgets(
    'shows a prominent "Share another habit" button once already shared today, and it opens the form',
    (tester) async {
      final habitDonatedToday = MyHabit(
        id: 'h1',
        label: 'I stretch before bed.',
        originalText: 'I stretch before bed.',
        language: 'en',
        dimensions: const ['TIME'],
        annotationCounts: const {},
        createdAt: DateTime.now(),
      );

      await tester.pumpWidget(
        _buildSubject(
          _FakeSurveyService.throwing(),
          myHabits: [habitDonatedToday],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Shared today'), findsOneWidget);
      expect(find.text('Share another habit'), findsOneWidget);

      await tester.tap(find.text('Share another habit'));
      await tester.pump();

      expect(find.text('How often do you do this habit?'), findsOneWidget);
    },
  );

  testWidgets(
    'navigates straight to the post-donation questionnaire, skipping the success screen entirely',
    (tester) async {
      final dio = Dio();
      final adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
      adapter.onPost(
        '$_apiBase/habits/share',
        (server) => server.reply(201, {
          'uuid': 'habit-1',
          'is_habit': true,
          'message': 'Thank you!',
          'postDonationQuestionnaireSlug': 'who5',
        }),
      );

      await tester.pumpWidget(
        _buildRoutedSubject(dio: dio, postDonationQuestionnaireSlug: 'who5'),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start sharing'));
      await tester.pump();

      await tester.enterText(
        find.byType(TextFormField),
        'I go for a walk every evening',
      );
      await tester.tap(find.text('Donate habit'));

      // Drain the async submit steps (POST + best-effort follow-ups) and let
      // the route push settle — how many microtask/timer hops that takes
      // isn't a stable implementation detail worth pinning down exactly.
      await tester.pumpAndSettle();

      // The questionnaire is configured, so the success screen is never
      // shown at all — it goes straight to the questionnaire.
      expect(find.text('Habit shared successfully!'), findsNothing);
      expect(find.text('Questionnaire: who5'), findsOneWidget);

      // The donate form stays mounted (never disposed) underneath the pushed
      // questionnaire route — merely offstage, which is why skipOffstage:
      // false is needed to find it here — so it must have been reset before
      // being covered: returning to /share afterwards (a StatefulShellRoute
      // branch in the real app, which resumes this exact instance rather
      // than a fresh one) must show a blank form, not the just-submitted text.
      final habitField = tester.widget<TextFormField>(
        find.byType(TextFormField, skipOffstage: false),
      );
      expect(habitField.controller?.text ?? '', isEmpty);
    },
  );

  testWidgets(
    'shows the success screen (not the questionnaire) when no post-donation questionnaire is configured',
    (tester) async {
      final dio = Dio();
      final adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
      adapter.onPost(
        '$_apiBase/habits/share',
        (server) => server.reply(201, {
          'uuid': 'habit-1',
          'is_habit': true,
          'message': 'Thank you!',
          'postDonationQuestionnaireSlug': null,
        }),
      );

      await tester.pumpWidget(_buildRoutedSubject(dio: dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start sharing'));
      await tester.pump();

      await tester.enterText(
        find.byType(TextFormField),
        'I go for a walk every evening',
      );
      await tester.tap(find.text('Donate habit'));
      await tester.pumpAndSettle();

      expect(find.text('Habit shared successfully!'), findsOneWidget);
      expect(find.textContaining('Questionnaire:'), findsNothing);
    },
  );
}
