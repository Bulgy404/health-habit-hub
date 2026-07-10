// mobile/test/widget/my_habits_screen_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_screen.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/widgets/contribution_graph_widget.dart';

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
        behaviorOptions: ['walking'],
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
        behaviorOptions: ['walking'],
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
        behaviorOptions: ['walking'],
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
        behaviorOptions: ['walking'],
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
        behaviorOptions: ['walking'],
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

    expect(find.text('Log today'), findsOneWidget);
    // Before logging, the page-level graph (fed by allHabitsActivityProvider)
    // has no data yet.
    expect(
      tester.widget<ContributionGraphWidget>(
        find.byType(ContributionGraphWidget),
      ).counts,
      isEmpty,
    );

    await tester.tap(find.text('Log today'));
    // Lets the logDay POST, the intentionLogsProvider + allHabitsActivityProvider
    // invalidation, and the resulting refetch all settle — with no manual
    // RefreshIndicator pull in between.
    await tester.pumpAndSettle();

    expect(find.text('Logged ✓'), findsWidgets);
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
}
