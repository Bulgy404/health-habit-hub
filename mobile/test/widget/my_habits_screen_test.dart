// mobile/test/widget/my_habits_screen_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications_platform_interface/flutter_local_notifications_platform_interface.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_screen.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/services/reminder_scheduler_service.dart';
import 'package:hhh/widgets/contribution_graph_widget.dart';
// The umbrella `flutter_local_notifications` package deliberately hides
// MethodChannelFlutterLocalNotificationsPlugin from its public export — see
// new_habit_confirm_screen_test.dart for the same import and rationale.
// ignore: implementation_imports
import 'package:flutter_local_notifications/src/platform_flutter_local_notifications.dart';

const _notificationsChannel =
    MethodChannel('dexterous.com/flutter/local_notifications');
const _timezoneChannel = MethodChannel('flutter_timezone');

final _fakeDio = Dio();

class _FakeMyHabitsService extends MyHabitsService {
  _FakeMyHabitsService({
    required this.config,
    required this.intentions,
    this.dueSrhi = const [],
  }) : super(dio: _fakeDio);

  final HabitConfig config;
  final List<Intention> intentions;
  final List<SrhiWindow> dueSrhi;

  /// Set by [logDay] and read back by [fetchLogs], so tests can verify that
  /// providers depending on logs actually refetch (rather than serving a
  /// stale cached value) after a log is recorded.
  bool loggedToday = false;

  @override
  Future<HabitConfig> fetchHabitConfig(String lang) async => config;

  @override
  Future<List<Intention>> listIntentions() async => intentions;

  @override
  Future<List<SrhiWindow>> fetchDueSrhi() async => dueSrhi;

  @override
  Future<List<DailyLog>> fetchLogs(String intentionId, {String? from, String? to}) async {
    if (!loggedToday) return [];
    final now = DateTime.now();
    final todayStr = '${now.year}-${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
    return [
      DailyLog(
        intentionId: intentionId,
        date: todayStr,
        enacted: true,
        loggedAt: now,
      ),
    ];
  }

  @override
  Future<void> logDay({
    required String intentionId,
    required String date,
    required bool enacted,
  }) async {
    loggedToday = true;
  }

  @override
  Future<void> deleteLog({
    required String intentionId,
    required String date,
  }) async {
    loggedToday = false;
  }

  @override
  Future<List<SrhiTrajectoryPoint>> fetchTrajectory(String intentionId) async => [];
}

Widget _buildSubject({
  required HabitConfig config,
  required List<Intention> intentions,
  List<SrhiWindow> dueSrhi = const [],
  _FakeMyHabitsService? service,
}) {
  final fakeService = service ??
      _FakeMyHabitsService(
        config: config,
        intentions: intentions,
        dueSrhi: dueSrhi,
      );
  return ProviderScope(
    overrides: [
      myHabitsServiceProvider.overrideWithValue(fakeService),
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const MyHabitsScreen(),
    ),
  );
}

final _activeIntention = Intention(
  id: 'intent-1',
  behaviorKey: 'walking',
  behaviorLabel: 'Walking',
  durationMinutes: 20,
  cues: [IntentionCue(text: 'After dinner', source: 'pre_rated')],
  intentionStatement: 'After dinner, I will walk for 20 minutes.',
  status: 'active',
  createdAt: DateTime(2026, 1, 1),
);

void main() {
  testWidgets(
      'maxHabits=1 hides New Habit button when one active intention exists',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'single',
        cueSource: 'high_quality',
        behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
        maxHabits: 1,
        srhiItems: [],
      ),
      intentions: [_activeIntention],
    ));
    await tester.pumpAndSettle();

    expect(find.text('New Habit'), findsNothing);
  });

  testWidgets('New Habit button shown when maxHabits is null', (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: [_activeIntention],
    ));
    await tester.pumpAndSettle();

    expect(find.text('New Habit'), findsOneWidget);
  });

  testWidgets('shows empty state when no intentions', (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: const [],
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('No habits yet'), findsOneWidget);
    // The contribution graph is a standing fixture at the top of the page,
    // not conditional on having any habits — it should still render (empty).
    expect(find.byType(ContributionGraphWidget), findsOneWidget);
  });

  testWidgets('shows SRHI prompt card when windows are due', (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: [_activeIntention],
      dueSrhi: [
        SrhiWindow(
          id: 'w1',
          intentionId: 'intent-1',
          weekNumber: 1,
          scheduledFor: DateTime(2026, 1, 7),
        ),
      ],
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('Weekly habit check-in'), findsOneWidget);
  });

  testWidgets(
      'the page-level activity graph updates immediately after logging a habit '
      '(without a manual pull-to-refresh)', (tester) async {
    final fakeService = _FakeMyHabitsService(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: [_activeIntention],
    );

    await tester.pumpWidget(
      _buildSubject(
        config: fakeService.config,
        intentions: fakeService.intentions,
        service: fakeService,
      ),
    );
    await tester.pumpAndSettle();

    // The log toggle is a checkbox (no visible label), identified by its
    // tooltip.
    expect(find.byTooltip('Log today'), findsOneWidget);
    // Before logging, the page-level graph (fed by allHabitsActivityProvider)
    // has no data yet.
    expect(
      tester.widget<ContributionGraphWidget>(
        find.byType(ContributionGraphWidget),
      ).counts,
      isEmpty,
    );

    await tester.tap(find.byTooltip('Log today'));
    // Lets the logDay POST, the intentionLogsProvider + allHabitsActivityProvider
    // invalidation, and the resulting refetch all settle — with no manual
    // RefreshIndicator pull in between.
    await tester.pumpAndSettle();

    expect(find.byTooltip('Logged ✓'), findsWidgets);
    // The page-level graph must reflect today's log immediately, not just
    // the per-habit day strip — this is the bug: allHabitsActivityProvider
    // wasn't being invalidated alongside intentionLogsProvider.
    expect(
      tester.widget<ContributionGraphWidget>(
        find.byType(ContributionGraphWidget),
      ).counts,
      isNotEmpty,
    );
  });

  testWidgets(
      '#12: marking a habit complete for today cancels only today\'s '
      'reminder; un-marking runs a full resync', (tester) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    // FlutterLocalNotificationsPlugin.cancel()/.show()/.zonedSchedule() branch
    // on defaultTargetPlatform (unlike pendingNotificationRequests(), which
    // always goes straight to FlutterLocalNotificationsPlatform.instance) —
    // the bare test VM defaults to TargetPlatform.android, which would route
    // through AndroidFlutterLocalNotificationsPlugin (never registered here)
    // instead of the generic mocked instance below, silently no-op-ing every
    // cancel call. Forcing iOS (this app's primary platform anyway) takes the
    // branch that actually reaches the mock.
    FlutterLocalNotificationsPlatform.instance =
        MethodChannelFlutterLocalNotificationsPlugin();
    final calls = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(_notificationsChannel, (call) async {
      calls.add(call);
      if (call.method == 'pendingNotificationRequests') return <dynamic>[];
      return null;
    });
    messenger.setMockMethodCallHandler(_timezoneChannel, (call) async {
      if (call.method == 'getLocalTimezone') return 'UTC';
      return null;
    });
    addTearDown(() {
      messenger.setMockMethodCallHandler(_notificationsChannel, null);
      messenger.setMockMethodCallHandler(_timezoneChannel, null);
    });

    // debugDefaultTargetPlatformOverride must be back to null before this
    // test function returns — testWidgets's post-test invariant check
    // (debugAssertAllFoundationVarsUnset) runs synchronously right after the
    // test body, ahead of any addTearDown callback (those only fire once the
    // whole test()-body Future resolves), so resetting via addTearDown here
    // is too late and trips "value of a foundation debug variable was
    // changed by the test." try/finally guarantees the reset runs even if an
    // expect() below throws.
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      final fakeService = _FakeMyHabitsService(
        config: const HabitConfig(
          cueCount: 'multi',
          cueSource: 'high_quality',
          behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
          maxHabits: null,
          srhiItems: [],
        ),
        intentions: [_activeIntention],
      );
      await tester.pumpWidget(_buildSubject(
        config: fakeService.config,
        intentions: fakeService.intentions,
        service: fakeService,
      ));
      await tester.pumpAndSettle();

      // Mark today complete — should cancel just today's reminder id (day-
      // offset 1), a cheap local call, not a full pendingNotificationRequests
      // sweep.
      await tester.tap(find.byTooltip('Log today'));
      await tester.pumpAndSettle();

      final todayId =
          ReminderSchedulerService.reminderNotificationId('intent-1', 1);
      expect(
        calls.any((c) => c.method == 'cancel' && c.arguments == todayId),
        isTrue,
        reason:
            "marking complete should cancel today's reminder notification",
      );
      expect(
        calls.any((c) => c.method == 'pendingNotificationRequests'),
        isFalse,
        reason: 'marking complete must stay a cheap single-id cancel, not a '
            'full resync sweep',
      );

      calls.clear();

      // Un-mark — should run the full sync (which queries pending requests
      // as part of cancel-and-reschedule) so today's reminder is restored.
      await tester.tap(find.byTooltip('Logged ✓').first);
      await tester.pumpAndSettle();

      expect(
        calls.any((c) => c.method == 'pendingNotificationRequests'),
        isTrue,
        reason: 'un-marking should re-run the full sync to restore the '
            "reminder if today's time hasn't passed yet",
      );
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  group('§7.1 habit stacking connector', () {
    final anchor = Intention(
      id: 'anchor-1',
      behaviorKey: 'read_before_bed',
      behaviorLabel: 'Read a book for ten minutes',
      durationMinutes: 10,
      cues: [IntentionCue(text: 'I get into bed', source: 'pre_rated')],
      intentionStatement: 'I get into bed, I will read for ten minutes.',
      status: 'active',
      createdAt: DateTime(2026, 1, 1),
    );
    final child1 = Intention(
      id: 'child-1',
      behaviorKey: 'gratitude_note',
      behaviorLabel: 'Write down one thing I am grateful for',
      durationMinutes: 2,
      cues: const [],
      intentionStatement: 'After reading, I will write a gratitude note.',
      status: 'active',
      createdAt: DateTime(2026, 1, 2),
      stackedOn: 'anchor-1',
      creationMode: 'stacked',
    );
    final child2 = Intention(
      id: 'child-2',
      behaviorKey: 'stretch',
      behaviorLabel: 'Stretch for two minutes',
      durationMinutes: 2,
      cues: const [],
      intentionStatement: 'After journaling, I will stretch.',
      status: 'active',
      createdAt: DateTime(2026, 1, 3),
      stackedOn: 'anchor-1',
      creationMode: 'stacked',
    );

    testWidgets(
        'draws a connector for each stacked habit but not the anchor or a standalone habit',
        (tester) async {
      await tester.pumpWidget(_buildSubject(
        config: const HabitConfig(
          cueCount: 'single',
          cueSource: 'high_quality',
          behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
          maxHabits: null,
          srhiItems: [],
        ),
        intentions: [anchor, child1, child2, _activeIntention],
      ));
      await tester.pumpAndSettle();

      // One IntrinsicHeight-wrapped connector per stacked child (anchor and
      // the standalone "Walking" habit get none) — see _HabitCard.build's
      // §7.1 branch in my_habits_screen.dart.
      expect(find.byType(IntrinsicHeight), findsNWidgets(2));
      expect(find.byType(CustomPaint), findsWidgets);
    });

    testWidgets('places each stacked child directly beneath its anchor',
        (tester) async {
      await tester.pumpWidget(_buildSubject(
        config: const HabitConfig(
          cueCount: 'single',
          cueSource: 'high_quality',
          behaviorOptions: [BehaviorOption(key: 'walking', label: 'Walking')],
          maxHabits: null,
          srhiItems: [],
        ),
        // Deliberately out of anchor/child order and interleaved with the
        // standalone habit, to prove _orderWithStacks re-groups them under
        // their anchor — child1/child2 stay in their relative input order,
        // since _orderWithStacks preserves that (not a canonical order) to
        // decide which stacked child is "last" for the connector.
        intentions: [_activeIntention, child1, child2, anchor],
      ));
      await tester.pumpAndSettle();

      final anchorY = tester.getTopLeft(find.text(anchor.behaviorLabel)).dy;
      final child1Y = tester.getTopLeft(find.text(child1.behaviorLabel)).dy;
      final child2Y = tester.getTopLeft(find.text(child2.behaviorLabel)).dy;
      expect(anchorY, lessThan(child1Y));
      expect(child1Y, lessThan(child2Y));
    });
  });
}
