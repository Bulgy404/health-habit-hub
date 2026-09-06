// Widget tests for RecommendationResultsScreen.
//
// Uses a GoRouter test harness (house style, see study_code_screen_test.dart)
// because the "Add to habits" action navigates via `context.push`, which
// requires a GoRouter ancestor. Every test pushes the results screen from a
// `/start` placeholder so "pop" behavior (Try Again / Try a different goal)
// is observable by asserting we've landed back on `/start`.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/features/recommendation/recommendation_feature_service.dart';
import 'package:hhh/features/recommendation/recommendation_models.dart';
import 'package:hhh/features/recommendation/results_screen.dart';
import 'package:hhh/l10n/app_localizations.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeRecommendationService extends RecommendationFeatureService {
  _FakeRecommendationService({this.shouldThrow = false}) : super(dio: Dio());

  final bool shouldThrow;
  final List<String> submittedComments = [];

  @override
  Future<void> submitFeedback({
    required String recommendationId,
    required String comment,
  }) async {
    if (shouldThrow) throw Exception('feedback failed');
    submittedComments.add(comment);
  }
}

const _fakeHabitConfig = HabitConfig(
  cueCount: 'single',
  cueSource: 'self_selected',
  behaviorOptions: [],
  srhiItems: [],
);

const _sampleSource = RecommendationSourceRef(
  filename: 'wood-runger-2016.pdf',
  excerpt: 'Wood & Rünger (2016) — Psychology of Habit',
  url: 'https://example.com/paper1',
  quote: 'Habits form through repetition.',
);

const _sampleItem = RecommendationItem(
  title: 'Drink more water',
  body: 'Keep a bottle nearby.',
  rationale: 'Hydration improves alertness.',
  sources: [_sampleSource],
  suggestedCue: 'After I wake up',
);

const _populatedResponse = RecommendationResponse(
  recommendationId: 'rec-1',
  goal: 'Sleep better',
  recommendations: [_sampleItem],
);

const _emptyResponse = RecommendationResponse(
  recommendationId: 'rec-2',
  goal: 'Sleep better',
  recommendations: [],
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps a `/start -> /results` GoRouter flow so results-screen navigation
/// (pop, and push into the habit-creation flow) can be exercised end to end.
Widget _buildSubject({
  required RecommendationResultsScreen Function() resultsScreenBuilder,
  _FakeRecommendationService? service,
  HabitConfig? habitConfig,
}) {
  final router = GoRouter(
    initialLocation: '/start',
    routes: [
      GoRoute(
        path: '/start',
        builder: (context, state) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => context.push('/results'),
              child: const Text('Open Results'),
            ),
          ),
        ),
      ),
      GoRoute(
        path: '/results',
        builder: (context, state) => resultsScreenBuilder(),
      ),
      GoRoute(
        path: '/habits/new/cue',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>;
          return Scaffold(
            body: Text(
              'cue:${extra['behaviorKey']}|${extra['behaviorLabel']}|${extra['initialCue']}|${extra['recommendationId']}',
            ),
          );
        },
      ),
      GoRoute(
        path: '/habits/new/behavior',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return Scaffold(
            body: Text('behavior-picker:${extra?['recommendationId']}'),
          );
        },
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      habitConfigProvider.overrideWith(
        (_) async => habitConfig ?? _fakeHabitConfig,
      ),
      if (service != null)
        recommendationFeatureServiceProvider.overrideWithValue(service),
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

Future<void> _openResults(WidgetTester tester, Widget subject) async {
  await tester.pumpWidget(subject);
  await tester.pump();
  await tester.tap(find.text('Open Results'));
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  group('error state', () {
    Widget subject() => _buildSubject(
      resultsScreenBuilder: () => const RecommendationResultsScreen(
        goal: 'Sleep better',
        response: null,
        error: 'Something went wrong.',
      ),
    );

    testWidgets('shows the error message and a Try Again button', (
      tester,
    ) async {
      await _openResults(tester, subject());

      expect(find.text('Something went wrong.'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text('Try a different goal'), findsOneWidget);
    });

    testWidgets('tapping Try Again pops the route', (tester) async {
      await _openResults(tester, subject());

      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Open Results'), findsOneWidget);
      expect(find.text('Something went wrong.'), findsNothing);
    });

    testWidgets(
      'tapping "Try a different goal" in the bottom bar pops the route',
      (tester) async {
        await _openResults(tester, subject());

        await tester.tap(find.text('Try a different goal'));
        await tester.pumpAndSettle();

        expect(find.text('Open Results'), findsOneWidget);
        expect(find.text('Something went wrong.'), findsNothing);
      },
    );
  });

  group('empty state', () {
    Widget subject() => _buildSubject(
      resultsScreenBuilder: () => const RecommendationResultsScreen(
        goal: 'Sleep better',
        response: _emptyResponse,
      ),
    );

    testWidgets('shows the empty message and a Try Again button', (
      tester,
    ) async {
      await _openResults(tester, subject());

      expect(
        find.text(
          'No recommendations were generated. Try describing your goal in more detail: the more context you share, the better.',
        ),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.lightbulb_outline), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });

    testWidgets('tapping Try Again pops the route', (tester) async {
      await _openResults(tester, subject());

      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Open Results'), findsOneWidget);
    });
  });

  group('populated results', () {
    Widget subject({
      _FakeRecommendationService? service,
      HabitConfig? habitConfig,
    }) => _buildSubject(
      resultsScreenBuilder: () => const RecommendationResultsScreen(
        goal: 'Sleep better',
        response: _populatedResponse,
      ),
      service: service,
      habitConfig: habitConfig,
    );

    testWidgets(
      'shows title, body, rationale, suggested cue, and a collapsed sources list',
      (tester) async {
        await _openResults(tester, subject());

        expect(find.text('Drink more water'), findsOneWidget);
        expect(find.text('Keep a bottle nearby.'), findsOneWidget);
        expect(find.text('Why this helps:'), findsOneWidget);
        expect(find.text('Hydration improves alertness.'), findsOneWidget);
        expect(find.text('After I wake up'), findsOneWidget);

        // Sources list starts collapsed: the ExpansionTile title is visible but
        // its child content is not yet.
        expect(find.text('Sources (1)'), findsOneWidget);
        expect(
          find.text('Wood & Rünger (2016) — Psychology of Habit'),
          findsNothing,
        );
      },
    );

    testWidgets('expanding the sources list reveals the citation and quote', (
      tester,
    ) async {
      await _openResults(tester, subject());

      await tester.tap(find.text('Sources (1)'));
      await tester.pumpAndSettle();

      expect(
        find.text('Wood & Rünger (2016) — Psychology of Habit'),
        findsOneWidget,
      );
      expect(find.text('“Habits form through repetition.”'), findsOneWidget);
    });

    testWidgets(
      'tapping "Add to my habits" pushes into the new-habit cue screen with prefilled data',
      (tester) async {
        await _openResults(tester, subject());

        await tester.tap(find.text('Add to my habits'));
        await tester.pumpAndSettle();

        expect(
          find.text(
            'cue:drink_more_water|Drink more water|After I wake up|rec-1',
          ),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'tapping "Add to my habits" routes to the catalog picker instead of '
      'free-texting the title when the study restricts habit entry to a '
      'fixed activity catalog',
      (tester) async {
        // Regression test: a study configured for structured habit entry must
        // not let a recommendation's arbitrary free-text title become an
        // uncatalogued behaviorKey — that would silently bypass the admin's
        // activity-type restriction (see results_screen.dart _addToHabits).
        const restrictedConfig = HabitConfig(
          cueCount: 'single',
          cueSource: 'self_selected',
          behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
          srhiItems: [],
        );
        await _openResults(tester, subject(habitConfig: restrictedConfig));

        await tester.tap(find.text('Add to my habits'));
        await tester.pumpAndSettle();

        expect(find.text('behavior-picker:rec-1'), findsOneWidget);
        expect(find.textContaining('cue:'), findsNothing);
      },
    );

    testWidgets(
      'submitting feedback replaces the field with a submitted-state indicator',
      (tester) async {
        final service = _FakeRecommendationService();
        await _openResults(tester, subject(service: service));

        expect(find.text('Feedback submitted, thank you!'), findsNothing);
        expect(find.byType(TextField), findsOneWidget);

        await tester.enterText(find.byType(TextField), 'Great idea, thanks!');
        await tester.tap(find.byIcon(Icons.send));
        await tester.pumpAndSettle();

        expect(find.text('Feedback submitted, thank you!'), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(service.submittedComments, ['Great idea, thanks!']);
      },
    );

    testWidgets(
      'shows an error and keeps the field when feedback submission fails',
      (tester) async {
        final service = _FakeRecommendationService(shouldThrow: true);
        await _openResults(tester, subject(service: service));

        await tester.enterText(find.byType(TextField), 'Great idea, thanks!');
        await tester.tap(find.byIcon(Icons.send));
        await tester.pumpAndSettle();

        expect(find.text('Failed to submit feedback'), findsOneWidget);
        expect(find.byType(TextField), findsOneWidget);
        expect(find.text('Feedback submitted, thank you!'), findsNothing);
      },
    );
  });
}
