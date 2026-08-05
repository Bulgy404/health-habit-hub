// Widget tests for PickBehaviorScreen (step 1 of the new habit flow).
//
// Tests cover: the dismissible onboarding explainer card (and that
// dismissing it persists via shared_preferences), the catalog list picker
// for study participants vs free-text entry for public users, free-text
// minimum-length validation, Enter-to-submit, and that tapping Next
// navigates to the cue step with the right `extra` payload.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/features/my_habits/new_habit_screen_1_behavior.dart';
import 'package:hhh/providers/locale_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/// A [LocaleNotifier] that never touches secure storage or the network —
/// [LocaleNotifier.build] normally schedules a microtask that reads/writes
/// flutter_secure_storage and calls the users API, which either hangs (no
/// platform implementation in widget tests) or requires mocking auth. This
/// screen only cares about the language code for onboarding copy, so a
/// fixed-locale override is simplest.
class _FakeLocaleNotifier extends LocaleNotifier {
  @override
  Locale build() => const Locale('en');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Widget _buildSubject(HabitConfig config) {
  final router = GoRouter(
    initialLocation: '/habits/new/behavior',
    routes: [
      GoRoute(
        path: '/habits/new/behavior',
        builder: (context, state) => const PickBehaviorScreen(),
      ),
      GoRoute(
        path: '/habits/new/cue',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>;
          return Scaffold(
            body: Text(
              'CUE:${extra['behaviorKey']}|${extra['behaviorLabel']}',
            ),
          );
        },
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      habitConfigProvider.overrideWith((_) async => config),
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

const _catalogConfig = HabitConfig(
  cueCount: 'multi',
  cueSource: 'high_quality',
  behaviorOptions: [
    BehaviorOption(key: 'walk', label: 'Walking'),
    BehaviorOption(key: 'meditate', label: 'Meditation'),
  ],
  srhiItems: [],
);

const _freeEntryConfig = HabitConfig(
  cueCount: 'multi',
  cueSource: 'self_selected',
  behaviorOptions: [],
  srhiItems: [],
);

const _overloadGuardConfig = HabitConfig(
  cueCount: 'multi',
  cueSource: 'high_quality',
  behaviorOptions: [
    BehaviorOption(key: 'walk', label: 'Walking'),
  ],
  srhiItems: [],
  informationOverloadEnabled: true,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows the pick-behaviour title', (tester) async {
    await tester.pumpWidget(_buildSubject(_catalogConfig));
    await tester.pumpAndSettle();

    expect(find.text('What habit do you want to form?'), findsOneWidget);
  });

  testWidgets(
      'shows the onboarding explainer card when onboarding is enabled and not yet seen',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_catalogConfig));
    await tester.pumpAndSettle();

    expect(find.text("What's a habit?"), findsOneWidget);
    expect(
      find.textContaining('A habit is a small action you repeat regularly'),
      findsOneWidget,
    );
  });

  testWidgets(
      'does not show the explainer card once already dismissed (persisted)',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'habit_onboarding_seen_v1': true,
    });

    await tester.pumpWidget(_buildSubject(_catalogConfig));
    await tester.pumpAndSettle();

    expect(find.text("What's a habit?"), findsNothing);
  });

  testWidgets(
      'dismissing the explainer card hides it and persists the dismissal',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_catalogConfig));
    await tester.pumpAndSettle();

    expect(find.text("What's a habit?"), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(find.text("What's a habit?"), findsNothing);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('habit_onboarding_seen_v1'), isTrue);
  });

  testWidgets(
      'shows the §7.3 information-overload explainer card when the guard is enabled and not yet seen',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_overloadGuardConfig));
    await tester.pumpAndSettle();

    expect(find.text('One habit at a time'), findsOneWidget);
    expect(
      find.textContaining("Habit stacking isn't affected by this limit"),
      findsOneWidget,
    );
  });

  testWidgets(
      'does not show the information-overload explainer card once already dismissed (persisted)',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'overload_guard_onboarding_seen_v1': true,
    });

    await tester.pumpWidget(_buildSubject(_overloadGuardConfig));
    await tester.pumpAndSettle();

    expect(find.text('One habit at a time'), findsNothing);
  });

  testWidgets(
      'dismissing the information-overload explainer card hides it, persists the dismissal, and leaves the "what\'s a habit?" card alone',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_overloadGuardConfig));
    await tester.pumpAndSettle();

    expect(find.text('One habit at a time'), findsOneWidget);
    expect(find.text("What's a habit?"), findsOneWidget);

    // Two dismissible cards are stacked (habit intro above, overload guard
    // below) — tap the second close button, which belongs to the guard card.
    await tester.tap(find.byIcon(Icons.close).last);
    await tester.pumpAndSettle();

    expect(find.text('One habit at a time'), findsNothing);
    expect(find.text("What's a habit?"), findsOneWidget);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('overload_guard_onboarding_seen_v1'), isTrue);
    expect(prefs.getBool('habit_onboarding_seen_v1'), isNot(isTrue));
  });

  testWidgets(
      'shows a catalog list picker when the study restricts behavior options',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_catalogConfig));
    await tester.pumpAndSettle();

    expect(find.text('Walking'), findsOneWidget);
    expect(find.text('Meditation'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('tapping a catalog item navigates to the cue step with extra',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_catalogConfig));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Walking'));
    await tester.pumpAndSettle();

    expect(find.text('CUE:walk|Walking'), findsOneWidget);
  });

  testWidgets(
      'shows free-text entry for public users (empty behaviorOptions)',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_freeEntryConfig));
    await tester.pumpAndSettle();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(ListTile), findsNothing);
  });

  testWidgets('shows a validation error for free text under 3 characters',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_freeEntryConfig));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'ab');
    await tester.tap(find.text('Next'));
    await tester.pump();

    expect(
      find.text('Please describe your habit (min. 3 characters)'),
      findsOneWidget,
    );
  });

  testWidgets('tapping Next with valid free text navigates with slugified key',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_freeEntryConfig));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Meditate Daily');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('CUE:meditate_daily|Meditate Daily'), findsOneWidget);
  });

  testWidgets('pressing Enter (submitting the field) submits the free text',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_freeEntryConfig));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Read every night');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(
      find.text('CUE:read_every_night|Read every night'),
      findsOneWidget,
    );
  });

  testWidgets('typing clears a previously shown validation error',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_freeEntryConfig));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'a');
    await tester.tap(find.text('Next'));
    await tester.pump();
    expect(
      find.text('Please describe your habit (min. 3 characters)'),
      findsOneWidget,
    );

    await tester.enterText(find.byType(TextField), 'ab');
    await tester.pump();

    expect(
      find.text('Please describe your habit (min. 3 characters)'),
      findsNothing,
    );
  });
}
