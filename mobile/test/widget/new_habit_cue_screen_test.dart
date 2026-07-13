// Widget tests for SetCueScreen (step 2 of the new habit flow).
//
// Tests cover: the dismissible intro card, pre-rated assigned-cues display
// (read-only) vs self-selected cues (add/remove, max 7, min-length
// validation), the "none available" empty state for assigned cues, and that
// Next routes to either the stitching screen or straight to Confirm
// depending on the study's guidedHabitCreationEnabled flag.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/new_habit_screen_2_cue.dart';
import 'package:hhh/providers/locale_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/// See new_habit_behavior_screen_test.dart for why locale is faked rather
/// than left to hit secure storage / the network.
class _FakeLocaleNotifier extends LocaleNotifier {
  @override
  Locale build() => const Locale('en');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Widget _buildSubject(HabitConfig config, {String? initialCue}) {
  final router = GoRouter(
    initialLocation: '/habits/new/cue',
    routes: [
      GoRoute(
        path: '/habits/new/cue',
        builder: (context, state) => SetCueScreen(
          behaviorKey: 'walk',
          behaviorLabel: 'Walking',
          config: config,
          initialCue: initialCue,
        ),
      ),
      GoRoute(
        path: '/habits/new/stitching',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>;
          final cues = (extra['cues'] as List<dynamic>).cast<IntentionCue>();
          return Scaffold(body: Text('STITCH:${cues.length}'));
        },
      ),
      GoRoute(
        path: '/habits/new/confirm',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>;
          final cues = (extra['cues'] as List<dynamic>).cast<IntentionCue>();
          return Scaffold(body: Text('CONFIRM:${cues.length}'));
        },
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      localeProvider.overrideWith(() => _FakeLocaleNotifier()),
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

const _selfSelectedConfig = HabitConfig(
  cueCount: 'multi',
  cueSource: 'self_selected',
  behaviorOptions: [],
  srhiItems: [],
  guidedHabitCreationEnabled: true,
);

const _preRatedConfig = HabitConfig(
  cueCount: 'single',
  cueSource: 'high_quality',
  behaviorOptions: [],
  srhiItems: [],
  assignedCues: [
    IntentionCue(text: 'After my morning coffee', source: 'pre_rated'),
  ],
  guidedHabitCreationEnabled: true,
);

const _preRatedNoneAssignedConfig = HabitConfig(
  cueCount: 'single',
  cueSource: 'high_quality',
  behaviorOptions: [],
  srhiItems: [],
  assignedCues: [],
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Uses a tall surface so the ListView content (which grows as cues are
/// added) never renders off-screen, matching srhi_form_test.dart's pattern
/// for the same class of problem.
void _growView(WidgetTester tester) {
  tester.view.physicalSize = const Size(1000, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows the intro explainer card when not yet seen',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    expect(find.text("What's a cue?"), findsOneWidget);
  });

  testWidgets(
      'dismissing the intro card hides it and persists the dismissal under its own key',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(find.text("What's a cue?"), findsNothing);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('cue_onboarding_seen_v1'), isTrue);
    // Separate key from step 1's explainer — dismissing this one must not
    // mark the habit-intro as seen.
    expect(prefs.getBool('habit_onboarding_seen_v1'), isNot(true));
  });

  testWidgets(
      'does not show the intro card once already dismissed (persisted)',
      (tester) async {
    SharedPreferences.setMockInitialValues({'cue_onboarding_seen_v1': true});

    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    expect(find.text("What's a cue?"), findsNothing);
  });

  testWidgets('shows assigned cues read-only for pre-rated cue sources',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_preRatedConfig));
    await tester.pumpAndSettle();

    expect(find.text('After my morning coffee'), findsOneWidget);
    expect(find.text('Assigned by study'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('numbers assigned cues when the study assigns more than one',
      (tester) async {
    const config = HabitConfig(
      cueCount: 'multi',
      cueSource: 'high_quality',
      behaviorOptions: [],
      srhiItems: [],
      assignedCues: [
        IntentionCue(text: 'After breakfast', source: 'pre_rated'),
        IntentionCue(text: 'Before bed', source: 'pre_rated'),
      ],
    );
    await tester.pumpWidget(_buildSubject(config));
    await tester.pumpAndSettle();

    expect(find.text('Cue 1 of 2 (assigned by study)'), findsOneWidget);
    expect(find.text('Cue 2 of 2 (assigned by study)'), findsOneWidget);
  });

  testWidgets(
      'shows a "none available" empty state when no cues are assigned yet',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_preRatedNoneAssignedConfig));
    await tester.pumpAndSettle();

    expect(find.text('No cues available yet'), findsOneWidget);
    expect(
      find.text('Your study coordinator will assign cues soon'),
      findsOneWidget,
    );
  });

  testWidgets('shows a self-selected cue text field with add button',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    expect(find.text('Your cue'), findsOneWidget);
    expect(find.text('Add another cue (1/7)'), findsOneWidget);
  });

  testWidgets('prefills the first self-selected cue field from initialCue',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(_selfSelectedConfig, initialCue: 'After morning coffee'),
    );
    await tester.pumpAndSettle();

    final field = tester.widget<TextField>(find.byType(TextField).first);
    expect(field.controller!.text, 'After morning coffee');
  });

  testWidgets('can add cues up to the maximum of 7, then the button hides',
      (tester) async {
    _growView(tester);
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    // Starts with 1 field; add 6 more to reach the max of 7.
    for (var i = 1; i < 7; i++) {
      await tester.tap(find.text('Add another cue ($i/7)'));
      await tester.pump();
    }

    expect(find.byType(TextField), findsNWidgets(7));
    expect(find.textContaining('Add another cue'), findsNothing);
    expect(find.text('You can add up to 7 cues.'), findsOneWidget);
  });

  testWidgets('can remove a self-selected cue field', (tester) async {
    _growView(tester);
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add another cue (1/7)'));
    await tester.pump();
    expect(find.byType(TextField), findsNWidgets(2));

    await tester.tap(find.byIcon(Icons.remove_circle_outline).first);
    await tester.pump();

    expect(find.byType(TextField), findsNWidgets(1));
  });

  testWidgets('validates the first self-selected cue is at least 10 chars',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'short');
    await tester.tap(find.text('Next'));
    await tester.pump();

    expect(
      find.text('Please describe your cue in at least 10 characters.'),
      findsOneWidget,
    );
  });

  testWidgets('validates additional self-selected cues are at least 3 chars',
      (tester) async {
    _growView(tester);
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField).first,
      'After my morning coffee',
    );
    await tester.tap(find.text('Add another cue (1/7)'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).last, 'ab');
    await tester.tap(find.text('Next'));
    await tester.pump();

    expect(
      find.text('Please describe your cue in at least 10 characters.'),
      findsOneWidget,
    );
  });

  testWidgets(
      'routes to the stitching screen when guidedHabitCreationEnabled is true',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_selfSelectedConfig));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField),
      'After my morning coffee',
    );
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('STITCH:1'), findsOneWidget);
  });

  testWidgets(
      'routes straight to confirm when guidedHabitCreationEnabled is false',
      (tester) async {
    const config = HabitConfig(
      cueCount: 'multi',
      cueSource: 'self_selected',
      behaviorOptions: [],
      srhiItems: [],
      guidedHabitCreationEnabled: false,
    );
    await tester.pumpWidget(_buildSubject(config));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField),
      'After my morning coffee',
    );
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('CONFIRM:1'), findsOneWidget);
  });

  testWidgets(
      'tapping Next with no cues assigned still proceeds using the fallback assigned cue',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_preRatedNoneAssignedConfig));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // guidedHabitCreationEnabled defaults to true, so this lands on stitching
    // with exactly one (fallback) cue.
    expect(find.text('STITCH:1'), findsOneWidget);
  });
}
