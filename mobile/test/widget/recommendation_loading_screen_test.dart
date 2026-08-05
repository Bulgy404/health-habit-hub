// Widget tests for RecommendationLoadingScreen.
//
// The screen has a Timer.periodic phase-label rotation that only stops once
// the recommend call resolves, so tests must drive time with
// `tester.pump(duration)` rather than `pumpAndSettle` while the loading
// screen itself is on stage — pumpAndSettle would spin forever waiting for
// that timer. It's safe to use pumpAndSettle again once navigation has
// replaced the loading screen with RecommendationResultsScreen, which has no
// repeating animations.
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
import 'package:hhh/widgets/entrance_fade.dart';
import 'package:hhh/widgets/skeleton.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeRecommendationService extends RecommendationFeatureService {
  _FakeRecommendationService._({this.delay = Duration.zero}) : super(dio: Dio());

  /// Resolves immediately — exercises the "API finishes before the phase
  /// rotation ever ticks" path (the common case: recommend calls are
  /// usually faster than 2.5s in tests, since there's no real network here).
  factory _FakeRecommendationService.success(RecommendationResponse response) {
    return _FakeRecommendationService._().._response = response;
  }

  factory _FakeRecommendationService.failure() {
    return _FakeRecommendationService._().._shouldThrow = true;
  }

  /// Resolves after [delay] — used to exercise phase rotation and the
  /// skeleton staying on screen while the call is still in flight.
  factory _FakeRecommendationService.slow(
    RecommendationResponse response, {
    required Duration delay,
  }) {
    return _FakeRecommendationService._(delay: delay).._response = response;
  }

  final Duration delay;
  RecommendationResponse? _response;
  bool _shouldThrow = false;

  @override
  Future<RecommendationResponse> generateRecommendations({
    required String userId,
    required String goal,
    required String sessionId,
  }) async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
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

/// Advances the fake clock in small steps rather than one large jump, so
/// chained awaits (fade animations, timers) unwind the way they would
/// frame-by-frame in a real run.
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
  testWidgets(
      'renders the first phase label and skeleton cards on initial render',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeRecommendationService.slow(
          _sampleResponse,
          delay: const Duration(seconds: 6),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.text('Comparing with habits people like you have tried…'),
      findsOneWidget,
    );
    expect(find.byType(SkeletonBox), findsWidgets);

    // Drain the rest of the flow so no timers are left pending at teardown.
    await _pumpFor(tester, const Duration(seconds: 7));
    await tester.pumpAndSettle();
  });

  testWidgets(
      'builds up all 3 skeleton cards one at a time, not all at once',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeRecommendationService.slow(
          _sampleResponse,
          delay: const Duration(seconds: 6),
        ),
      ),
    );
    await tester.pump();

    // Scoped to descendants of EntranceFade specifically: MaterialPageRoute's
    // own push transition also uses SlideTransition, so an unscoped
    // find.byType(SlideTransition) picks up unrelated route-animation
    // instances too. SkeletonBox's perpetual pulse only uses FadeTransition,
    // so it doesn't collide with this regardless.
    final entranceSlides = find.descendant(
      of: find.byType(EntranceFade),
      matching: find.byType(SlideTransition),
    );
    List<Offset> cardPositions() => tester
        .widgetList<SlideTransition>(entranceSlides)
        .map((w) => w.position.value)
        .toList();

    // Exactly 3 cards configured for staggered entrance — matches the
    // screen's private _skeletonCardCount (kept in sync manually; there's no
    // public constant to import here).
    expect(entranceSlides, findsNWidgets(3));

    // Shortly after first frame: the build-up has only just started, so not
    // every card should have slid into place yet.
    await _pumpFor(tester, const Duration(milliseconds: 100));
    expect(
      cardPositions().every((p) => p == Offset.zero),
      isFalse,
      reason: 'cards should still be mid-entrance shortly after first frame',
    );

    // Past the full 2.2s build-up: every card has slid fully into place.
    await _pumpFor(tester, const Duration(milliseconds: 2300));
    expect(cardPositions().every((p) => p == Offset.zero), isTrue);

    // Drain the rest of the flow so no timers are left pending at teardown.
    await _pumpFor(tester, const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });

  testWidgets(
      'rotates to the next phase label after the phase duration, while the API is still in flight',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeRecommendationService.slow(
          _sampleResponse,
          delay: const Duration(seconds: 6),
        ),
      ),
    );
    await tester.pump();

    // Just short of the 2.5s phase duration: still phase 0.
    await _pumpFor(tester, const Duration(milliseconds: 2400));
    expect(
      find.text('Comparing with habits people like you have tried…'),
      findsOneWidget,
    );
    expect(
      find.text("Checking what's already working for you…"),
      findsNothing,
    );

    // Past the phase duration plus the label fade-out: phase 1. The fade is
    // now spring-driven (AppSpring.standard) rather than a fixed 400ms
    // tween — a critically damped spring only asymptotically reaches 0, so
    // SpringSimulation's distance+velocity tolerance takes closer to ~700ms
    // wall-clock to consider it "done" (vs. the old fixed 400ms). Padded
    // well past that here rather than pinning to the exact settle time.
    await _pumpFor(tester, const Duration(milliseconds: 900));
    expect(
      find.text("Checking what's already working for you…"),
      findsOneWidget,
    );
    expect(
      find.text('Comparing with habits people like you have tried…'),
      findsNothing,
    );

    // Drain the rest of the flow so no timers are left pending at teardown.
    await _pumpFor(tester, const Duration(seconds: 5));
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

    // The fake resolves instantly, so navigation only waits on the minimum
    // display floor — long enough for the skeleton build-up to finish
    // (2.6s), not the old fixed multi-phase schedule.
    await _pumpFor(tester, const Duration(seconds: 3));
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

    await _pumpFor(tester, const Duration(seconds: 3));
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

  testWidgets(
      'still shows the skeleton (not a blank/stalled screen) well past the old fixed 8s schedule when the API is slow',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeRecommendationService.slow(
          _sampleResponse,
          delay: const Duration(seconds: 12),
        ),
      ),
    );
    await tester.pump();

    await _pumpFor(tester, const Duration(seconds: 10));

    // Still on the loading screen, still showing skeleton content — not
    // stalled on a finished animation like the old phase-icon version was.
    expect(find.byType(RecommendationLoadingScreen), findsOneWidget);
    expect(find.byType(SkeletonBox), findsWidgets);

    await _pumpFor(tester, const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.byType(RecommendationLoadingScreen), findsNothing);
  });
}
