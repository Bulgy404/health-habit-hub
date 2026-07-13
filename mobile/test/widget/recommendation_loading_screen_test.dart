// Widget tests for RecommendationLoadingScreen.
//
// The screen has an infinitely-repeating pulse AnimationController, so tests
// must drive time with `tester.pump(duration)` rather than `pumpAndSettle`
// while the loading screen itself is on stage — pumpAndSettle would spin
// forever waiting for that controller to stop. It's safe to use
// pumpAndSettle again once navigation has replaced the loading screen with
// RecommendationResultsScreen, which has no repeating animations.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/recommendation/loading_screen.dart';
import 'package:hhh/features/recommendation/recommendation_feature_service.dart';
import 'package:hhh/features/recommendation/recommendation_models.dart';
import 'package:hhh/features/recommendation/results_screen.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/providers/auth_provider.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeRecommendationService extends RecommendationFeatureService {
  _FakeRecommendationService._() : super(dio: Dio());

  factory _FakeRecommendationService.success(RecommendationResponse response) {
    return _FakeRecommendationService._().._response = response;
  }

  factory _FakeRecommendationService.failure() {
    return _FakeRecommendationService._().._shouldThrow = true;
  }

  RecommendationResponse? _response;
  bool _shouldThrow = false;

  @override
  Future<RecommendationResponse> generateRecommendations({
    required String userId,
    required String goal,
    required String sessionId,
  }) async {
    if (_shouldThrow) throw Exception('Network error');
    return _response!;
  }
}

const _sampleResponse = RecommendationResponse(
  recommendationId: 'rec-1',
  goal: 'Sleep better',
  recommendations: [
    RecommendationItem(
      title: 'Drink more water',
      body: 'Keep a bottle nearby.',
      rationale: 'Hydration improves alertness.',
      sources: [],
      suggestedCue: 'After I wake up',
    ),
  ],
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps [RecommendationLoadingScreen] in the minimal widget tree needed for
/// tests. [userIdProvider] and [recommendationFeatureServiceProvider] are
/// overridden directly so no secure storage or real Dio calls happen.
Widget _buildSubject(RecommendationFeatureService service, {String goal = 'Sleep better'}) {
  return ProviderScope(
    overrides: [
      userIdProvider.overrideWith((_) async => 'user-1'),
      recommendationFeatureServiceProvider.overrideWithValue(service),
    ],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: RecommendationLoadingScreen(goal: goal),
    ),
  );
}

// ---------------------------------------------------------------------------
// Time helper
// ---------------------------------------------------------------------------

/// Advances the fake clock in small steps rather than one large jump.
///
/// The phase-transition logic in [RecommendationLoadingScreen] alternates
/// between `Future.delayed` timers and `AnimationController` fade
/// animations (`await _labelFade.reverse()` then `await _labelFade.forward()`
/// before the next timer is even scheduled). A single big `tester.pump(...)`
/// only renders one frame at the end of the jump, which isn't enough for
/// that chain of awaits to fully unwind — stepping through in small
/// increments lets each link resolve the way it would frame-by-frame in a
/// real run.
Future<void> _pumpFor(
  WidgetTester tester,
  Duration total, {
  Duration step = const Duration(milliseconds: 50),
}) async {
  var remaining = total;
  while (remaining > Duration.zero) {
    final chunk = remaining < step ? remaining : step;
    await tester.pump(chunk);
    remaining -= chunk;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('renders the first phase label and progress dots on initial render',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(_FakeRecommendationService.success(_sampleResponse)),
    );
    await tester.pump();

    expect(find.text('Asking experts…'), findsOneWidget);
    expect(find.byIcon(Icons.menu_book), findsOneWidget);

    // Drain the rest of the flow so no timers are left pending at teardown.
    await _pumpFor(tester, const Duration(seconds: 10));
    await tester.pumpAndSettle();
  });

  testWidgets('does not advance to the next phase before the minimum phase duration elapses',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(_FakeRecommendationService.success(_sampleResponse)),
    );
    await tester.pump();

    // Just short of the 2-second minimum phase duration: still phase 0.
    await _pumpFor(tester, const Duration(milliseconds: 1900));
    expect(find.text('Asking experts…'), findsOneWidget);
    expect(find.text('Looking through your habits database…'), findsNothing);

    // Past the minimum duration plus the label fade transition: phase 1.
    await _pumpFor(tester, const Duration(milliseconds: 700));
    expect(find.text('Looking through your habits database…'), findsOneWidget);
    expect(find.text('Asking experts…'), findsNothing);

    // Drain the rest of the flow so no timers are left pending at teardown.
    await _pumpFor(tester, const Duration(seconds: 10));
    await tester.pumpAndSettle();
  });

  testWidgets(
      'navigates (pushReplacement) to RecommendationResultsScreen with response populated and error null on success',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeRecommendationService.success(_sampleResponse),
        goal: 'Sleep better',
      ),
    );
    await tester.pump();

    // Drive through all 4 phases (>= 2s each) plus the api-done poll.
    await _pumpFor(tester, const Duration(seconds: 9));
    await tester.pumpAndSettle();

    expect(find.byType(RecommendationLoadingScreen), findsNothing);
    final resultsScreen =
        tester.widget<RecommendationResultsScreen>(find.byType(RecommendationResultsScreen));
    expect(resultsScreen.goal, 'Sleep better');
    expect(resultsScreen.response, _sampleResponse);
    expect(resultsScreen.error, isNull);
  });

  testWidgets(
      'navigates (pushReplacement) to RecommendationResultsScreen with error populated and response null on failure',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeRecommendationService.failure(),
        goal: 'Sleep better',
      ),
    );
    await tester.pump();

    await _pumpFor(tester, const Duration(seconds: 9));
    await tester.pumpAndSettle();

    expect(find.byType(RecommendationLoadingScreen), findsNothing);
    final resultsScreen =
        tester.widget<RecommendationResultsScreen>(find.byType(RecommendationResultsScreen));
    expect(resultsScreen.goal, 'Sleep better');
    expect(resultsScreen.response, isNull);
    expect(
      resultsScreen.error,
      'Something went wrong while generating recommendations. Please try again.',
    );
  });
}
