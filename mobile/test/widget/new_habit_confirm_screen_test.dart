// Widget tests for ConfirmPlanScreen (step 3 of the new habit flow).
//
// Tests cover: the editable intention-statement field pre-filled from
// `extra`, the reminder toggle + time picker when the study allows
// participant control vs the read-only study-controlled reminder display,
// the community-share toggle only appearing when the study's
// communityShareDefault is enabled, the "Create Habit" button showing a
// submitting spinner and calling the create-habit API, and that a
// habit-limit-reached error is surfaced distinctly from a generic failure.
//
// On success, _submit() fires two best-effort, fire-and-forget background
// tasks (community sharing + reminder-plan sync) that touch the
// flutter_local_notifications and flutter_timezone platform channels and,
// potentially, the network. Tests that exercise the success path disable
// local habit reminders via shared_preferences (so the reminder sync
// short-circuits before any network call) and mock the two platform
// channels it still touches first, so nothing hangs or leaves a pending
// Timer.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/core/exceptions.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/features/my_habits/new_habit_screen_3_confirm.dart';
import 'package:hhh/models/study_group_config.dart';
import 'package:hhh/providers/locale_provider.dart';
import 'package:hhh/providers/study_config_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';

// ---------------------------------------------------------------------------
// Platform channel mocks
// ---------------------------------------------------------------------------

const _notificationsChannel =
    MethodChannel('dexterous.com/flutter/local_notifications');
const _timezoneChannel = MethodChannel('flutter_timezone');

void _mockPlatformChannels() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(_notificationsChannel, (call) async {
    if (call.method == 'pendingNotificationRequests') return <dynamic>[];
    return null;
  });
  messenger.setMockMethodCallHandler(_timezoneChannel, (call) async {
    if (call.method == 'getLocalTimezone') return 'UTC';
    return null;
  });
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeLocaleNotifier extends LocaleNotifier {
  @override
  Locale build() => const Locale('en');
}

final _fakeDio = Dio();

enum _Mode { success, limitReached, genericError, pending }

class _FakeMyHabitsService extends MyHabitsService {
  _FakeMyHabitsService.success() : _mode = _Mode.success, super(dio: _fakeDio);
  _FakeMyHabitsService.limitReached()
      : _mode = _Mode.limitReached,
        super(dio: _fakeDio);
  _FakeMyHabitsService.genericError()
      : _mode = _Mode.genericError,
        super(dio: _fakeDio);
  _FakeMyHabitsService.pending()
      : _mode = _Mode.pending,
        super(dio: _fakeDio);

  final _Mode _mode;

  /// Captures the arguments of the most recent [createIntention] call.
  Map<String, dynamic>? lastCall;

  @override
  Future<Intention> createIntention({
    required String behaviorKey,
    required String behaviorLabel,
    required int durationMinutes,
    required List<IntentionCue> cues,
    required String intentionStatement,
    required HabitType habitType,
    String? reminderTime,
    String? stackedOn,
    String creationMode = 'standalone',
  }) async {
    lastCall = {
      'behaviorKey': behaviorKey,
      'behaviorLabel': behaviorLabel,
      'durationMinutes': durationMinutes,
      'cues': cues,
      'intentionStatement': intentionStatement,
      'habitType': habitType,
      'reminderTime': reminderTime,
      'stackedOn': stackedOn,
      'creationMode': creationMode,
    };
    switch (_mode) {
      case _Mode.success:
        return Intention(
          id: 'intent-1',
          behaviorKey: behaviorKey,
          behaviorLabel: behaviorLabel,
          durationMinutes: durationMinutes,
          cues: cues,
          intentionStatement: intentionStatement,
          status: 'active',
          createdAt: DateTime(2026, 1, 1),
          habitType: habitType,
          stackedOn: stackedOn,
          creationMode: creationMode,
        );
      case _Mode.limitReached:
        throw const ValidationException('Habit limit reached');
      case _Mode.genericError:
        throw Exception('boom');
      case _Mode.pending:
        // Never resolves — used to observe the in-flight submitting state.
        return Completer<Intention>().future;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const _cues = [IntentionCue(text: 'After breakfast', source: 'self_selected')];

/// Builds a [RemindersConfig] with the given habit-reminder mode, leaving the
/// other 3 reminder types off (irrelevant to this screen).
RemindersConfig _remindersWithHabit(ReminderModeConfig habit) => RemindersConfig(
      habit: habit,
      questionnaire: const ReminderModeConfig(mode: ReminderMode.off),
      endOfStudy: const ReminderModeConfig(mode: ReminderMode.off),
      studyUpdate: const ReminderModeConfig(mode: ReminderMode.off),
    );

Widget _buildSubject({
  required HabitConfig config,
  required MyHabitsService myHabitsService,
  StudyGroupConfig? studyConfig,
  String? stitchedSentence,
  List<IntentionCue> cues = _cues,
  String behaviorLabel = 'Walking',
}) {
  final router = GoRouter(
    initialLocation: '/habits/new/confirm',
    routes: [
      GoRoute(
        path: '/habits/new/confirm',
        builder: (context, state) => ConfirmPlanScreen(
          behaviorKey: 'walk',
          behaviorLabel: behaviorLabel,
          config: config,
          habitType: HabitType.build,
          cues: cues,
          stitchedSentence: stitchedSentence,
        ),
      ),
      GoRoute(
        path: '/habits',
        builder: (context, state) =>
            const Scaffold(body: Text('MyHabitsScreen')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      localeProvider.overrideWith(() => _FakeLocaleNotifier()),
      myHabitsServiceProvider.overrideWithValue(myHabitsService),
      studyConfigProvider.overrideWith((_) async => studyConfig),
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

const _userControlledConfig = HabitConfig(
  cueCount: 'multi',
  cueSource: 'self_selected',
  behaviorOptions: [],
  srhiItems: [],
  communityShareDefault: false,
);

const _shareEnabledConfig = HabitConfig(
  cueCount: 'multi',
  cueSource: 'self_selected',
  behaviorOptions: [],
  srhiItems: [],
  communityShareDefault: true,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUp(() {
    _mockPlatformChannels();
    // Short-circuits ReminderSchedulerService.syncReminders() right after the
    // (mocked) platform-channel calls, before it would otherwise reach the
    // network — see the file header comment.
    SharedPreferences.setMockInitialValues({
      'notif_habit_reminders_enabled': false,
    });
  });

  testWidgets('pre-fills the intention statement from the stitched sentence',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      stitchedSentence: 'After breakfast, I will go for a walk.',
    ));
    await tester.pumpAndSettle();

    final field = tester.widget<TextField>(find.byType(TextField).first);
    expect(field.controller!.text, 'After breakfast, I will go for a walk.');
  });

  testWidgets(
      'falls back to a generated statement when no stitched sentence is provided',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      stitchedSentence: null,
      cues: const [IntentionCue(text: 'After breakfast', source: 'self_selected')],
      behaviorLabel: 'Walking',
    ));
    await tester.pumpAndSettle();

    final field = tester.widget<TextField>(find.byType(TextField).first);
    expect(field.controller!.text, 'After breakfast, I will walking.');
  });

  testWidgets(
      'shows a user-controlled reminder toggle and time chip when the study does not control reminders',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      studyConfig: null,
    ));
    await tester.pumpAndSettle();

    expect(find.byType(Switch), findsOneWidget);
    expect(find.text('19:00'), findsOneWidget);
  });

  testWidgets(
      'toggling the reminder switch off hides the time chip and shows No reminders',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      studyConfig: null,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();

    expect(find.text('No reminders'), findsOneWidget);
    expect(find.text('19:00'), findsNothing);
  });

  testWidgets(
      'admin_fixed: shows a read-only reminder status with the fixed time, no picker',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      studyConfig: StudyGroupConfig(
        studyId: 's1',
        studyName: 'Study',
        reminders: _remindersWithHabit(
          const ReminderModeConfig(mode: ReminderMode.adminFixed, time: '20:00'),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Reminder at 20:00 (set by study)'), findsOneWidget);
    expect(find.byType(Switch), findsNothing);
  });

  testWidgets(
      'participant_choice (explicit group override): reveals an editable picker with no study-set default',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      studyConfig: StudyGroupConfig(
        studyId: 's1',
        studyName: 'Study',
        reminders: _remindersWithHabit(
          const ReminderModeConfig(mode: ReminderMode.participantChoice),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(Switch), findsOneWidget);
    expect(find.text('19:00'), findsOneWidget);
  });

  testWidgets(
      'off: shows a read-only "no reminders" status, no switch, no picker',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
      studyConfig: StudyGroupConfig(
        studyId: 's1',
        studyName: 'Study',
        reminders: _remindersWithHabit(
          const ReminderModeConfig(mode: ReminderMode.off),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('No reminders (set by study)'), findsOneWidget);
    expect(find.byType(Switch), findsNothing);
  });

  testWidgets(
      'off: submits a null reminderTime even if the client were to attempt one (no UI path to enter one)',
      (tester) async {
    final service = _FakeMyHabitsService.success();
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: service,
      studyConfig: StudyGroupConfig(
        studyId: 's1',
        studyName: 'Study',
        reminders: _remindersWithHabit(
          const ReminderModeConfig(mode: ReminderMode.off),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create habit'));
    await tester.pumpAndSettle();

    expect(service.lastCall!['reminderTime'], isNull);
  });

  testWidgets(
      'admin_fixed: submits the admin-locked time regardless of local switch state',
      (tester) async {
    final service = _FakeMyHabitsService.success();
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: service,
      studyConfig: StudyGroupConfig(
        studyId: 's1',
        studyName: 'Study',
        reminders: _remindersWithHabit(
          const ReminderModeConfig(mode: ReminderMode.adminFixed, time: '06:15'),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create habit'));
    await tester.pumpAndSettle();

    expect(service.lastCall!['reminderTime'], '06:15');
  });

  testWidgets(
      'shows the community-share toggle (pre-selected) only when communityShareDefault is enabled',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _shareEnabledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Share this habit anonymously with the community'),
      findsOneWidget,
    );
    final shareSwitch = tester.widget<Switch>(find.byType(Switch).last);
    expect(shareSwitch.value, isTrue);
  });

  testWidgets('hides the community-share toggle when communityShareDefault is disabled',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
    ));
    await tester.pumpAndSettle();

    expect(
      find.text('Share this habit anonymously with the community'),
      findsNothing,
    );
  });

  testWidgets(
      'tapping Create Habit shows a submitting spinner and disables the button',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.pending(),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create habit'));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed, isNull);
  });

  testWidgets(
      'Create Habit calls the create API with the edited statement and navigates home on success',
      (tester) async {
    final service = _FakeMyHabitsService.success();
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: service,
      stitchedSentence: 'Original sentence.',
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Edited sentence.');
    await tester.tap(find.text('Create habit'));
    await tester.pumpAndSettle();

    expect(find.text('MyHabitsScreen'), findsOneWidget);
    expect(service.lastCall, isNotNull);
    expect(service.lastCall!['intentionStatement'], 'Edited sentence.');
    // Default reminder is enabled at 19:00.
    expect(service.lastCall!['reminderTime'], '19:00');
  });

  testWidgets('submits with a null reminderTime when reminders are disabled',
      (tester) async {
    final service = _FakeMyHabitsService.success();
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: service,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create habit'));
    await tester.pumpAndSettle();

    expect(service.lastCall!['reminderTime'], isNull);
  });

  testWidgets(
      'shows a distinct habit-limit-reached error when the API rejects with a validation error',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.limitReached(),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create habit'));
    await tester.pumpAndSettle();

    expect(
      find.text('You have reached the habit limit for your study condition.'),
      findsOneWidget,
    );
    // Must not fall through to the generic error path.
    expect(find.textContaining('Exception'), findsNothing);
    // The button must be re-enabled after the failure, not stuck spinning.
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Create habit'), findsOneWidget);
  });

  testWidgets('shows a generic error message on an unexpected failure',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: _userControlledConfig,
      myHabitsService: _FakeMyHabitsService.genericError(),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create habit'));
    await tester.pumpAndSettle();

    expect(find.text('Exception: boom'), findsOneWidget);
    expect(
      find.text('You have reached the habit limit for your study condition.'),
      findsNothing,
    );
  });
}
