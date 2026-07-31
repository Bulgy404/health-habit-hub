// Widget tests for IntentionStitchScreen (animated LLM-stitch step between
// cues and confirmation).
//
// Tests cover: the animated status messages cycling through phases, that the
// minimum on-screen duration (3600ms, see _minAnimationDuration in the
// screen) is respected even when the API responds instantly, that an API
// failure falls back to a locally-assembled sentence instead of getting
// stuck, and that the Continue button appears once ready and navigates to
// Confirm with the stitched sentence.
//
// This screen runs a repeating AnimationController and a Timer.periodic for
// the whole time it's mounted (both are only cancelled in dispose()), so
// every test below unmounts the widget (pumpWidget a replacement) before
// finishing — otherwise flutter_test fails with "A Timer is still pending".
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/features/my_habits/intention_stitch_screen.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/providers/locale_provider.dart';
import 'package:hhh/services/study_config_service.dart';

/// Mirrors the screen's private `_minAnimationDuration` constant (not
/// exported), used to fast-forward past the minimum reveal delay.
const _minAnimationDuration = Duration(milliseconds: 3600);

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeLocaleNotifier extends LocaleNotifier {
  @override
  Locale build() => const Locale('en');
}

final _fakeDio = Dio();

class _FakeStudyConfigService extends StudyConfigService {
  _FakeStudyConfigService.returning(this._sentence)
      : _throws = false,
        _completer = null,
        super(dio: _fakeDio);

  _FakeStudyConfigService.throwing()
      : _sentence = null,
        _throws = true,
        _completer = null,
        super(dio: _fakeDio);

  _FakeStudyConfigService.pending()
      : _sentence = null,
        _throws = false,
        _completer = Completer<String?>(),
        super(dio: _fakeDio);

  final String? _sentence;
  final bool _throws;
  final Completer<String?>? _completer;

  @override
  Future<String?> stitchIntention({
    required String action,
    required List<String> cues,
    String language = 'en',
  }) {
    if (_throws) return Future.error(Exception('LLM unavailable'));
    if (_completer != null) return _completer.future;
    return Future.value(_sentence);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const _config = HabitConfig(
  cueCount: 'multi',
  cueSource: 'self_selected',
  behaviorOptions: [],
  srhiItems: [],
);

const _cues = [IntentionCue(text: 'After breakfast', source: 'self_selected')];

Widget _buildSubject(
  StudyConfigService studyConfigService, {
  List<IntentionCue> cues = _cues,
  String behaviorLabel = 'Walking',
}) {
  final router = GoRouter(
    initialLocation: '/habits/new/stitching',
    routes: [
      GoRoute(
        path: '/habits/new/stitching',
        builder: (context, state) => IntentionStitchScreen(
          behaviorKey: 'walk',
          behaviorLabel: behaviorLabel,
          config: _config,
          habitType: HabitType.build,
          cues: cues,
        ),
      ),
      GoRoute(
        path: '/habits/new/confirm',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>;
          return Scaffold(
            body: Text('CONFIRM:${extra['stitchedSentence']}'),
          );
        },
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      localeProvider.overrideWith(() => _FakeLocaleNotifier()),
      studyConfigServiceProvider.overrideWithValue(studyConfigService),
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

/// Unmounts the pumped subject so the screen's dispose() cancels its
/// repeating Timer/AnimationController before the test ends.
Future<void> _unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows the first status message while stitching is in flight',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeStudyConfigService.pending()));
    await tester.pump();

    expect(
      find.text('Bringing your cue and habit together…'),
      findsOneWidget,
    );
    expect(find.text('Continue'), findsNothing);

    await _unmount(tester);
  });

  testWidgets('cycles through status messages and holds on the last one',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeStudyConfigService.pending()));
    await tester.pump();
    expect(
      find.text('Bringing your cue and habit together…'),
      findsOneWidget,
    );

    await tester.pump(const Duration(milliseconds: 2600));
    expect(find.text('Forming your plan…'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 2600));
    expect(find.text('Almost ready…'), findsOneWidget);

    // Holds on the final message rather than looping back to the first.
    await tester.pump(const Duration(milliseconds: 2600));
    expect(find.text('Almost ready…'), findsOneWidget);

    await _unmount(tester);
  });

  testWidgets(
      'respects the minimum on-screen duration even when the API responds instantly',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(_FakeStudyConfigService.returning('After breakfast, walk.')),
    );
    await tester.pump();

    // The API call resolves on the very next microtask, but the reveal must
    // not happen before the minimum animation duration has elapsed.
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Continue'), findsNothing);

    await tester.pump(const Duration(milliseconds: 3000));
    expect(find.text('Continue'), findsNothing);

    // Cross the minimum duration threshold and let the reveal transition run.
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Continue'), findsOneWidget);
    expect(find.text('After breakfast, walk.'), findsOneWidget);

    await _unmount(tester);
  });

  testWidgets('falls back to a locally-assembled sentence when the API fails',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeStudyConfigService.throwing()));
    await tester.pump();

    await tester.pump(_minAnimationDuration);
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Continue'), findsOneWidget);
    // _localFallbackSentence(): '<cues joined>, I will <label lowercased>.'
    expect(find.text('After breakfast, I will walking.'), findsOneWidget);

    await _unmount(tester);
  });

  testWidgets(
      'tapping Continue navigates to Confirm with the stitched sentence',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(_FakeStudyConfigService.returning('After breakfast, walk.')),
    );
    await tester.pump();
    await tester.pump(_minAnimationDuration);
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('CONFIRM:After breakfast, walk.'), findsOneWidget);
  });
}
