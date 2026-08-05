// mobile/test/widget/habit_detail_screen_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/features/my_habits/habit_detail_screen.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/widgets/contribution_graph_widget.dart';
import 'package:hhh/widgets/srhi_chart_widget.dart';

final _fakeDio = Dio();

class _FakeMyHabitsService extends MyHabitsService {
  _FakeMyHabitsService({
    required this.intentions,
    this.logs = const [],
    this.trajectory = const [],
  }) : super(dio: _fakeDio);

  final List<Intention> intentions;
  final List<DailyLog> logs;
  final List<SrhiTrajectoryPoint> trajectory;
  String? lastUpdatedStatus;
  int fetchDueSrhiCallCount = 0;

  @override
  Future<List<Intention>> listIntentions() async => intentions;

  @override
  Future<List<DailyLog>> fetchLogs(
    String intentionId, {
    String? from,
    String? to,
  }) async => logs;

  @override
  Future<List<SrhiTrajectoryPoint>> fetchTrajectory(
    String intentionId,
  ) async => trajectory;

  @override
  Future<void> updateStatus(String intentionId, String status) async {
    lastUpdatedStatus = status;
  }

  @override
  Future<List<SrhiWindow>> fetchDueSrhi() async {
    fetchDueSrhiCallCount++;
    return [];
  }
}

final _intention = Intention(
  id: 'intent-1',
  behaviorKey: 'walking',
  behaviorLabel: 'Walking',
  durationMinutes: 20,
  cues: [IntentionCue(text: 'After dinner', source: 'pre_rated')],
  intentionStatement: 'After dinner, I will walk for 20 minutes.',
  status: 'active',
  createdAt: DateTime(2026, 1, 1),
);

Widget _buildSubject(_FakeMyHabitsService service) {
  return ProviderScope(
    overrides: [myHabitsServiceProvider.overrideWithValue(service)],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const HabitDetailScreen(intentionId: 'intent-1'),
    ),
  );
}

/// A [GoRouter]-backed variant so tapping the anchor tile's navigation
/// (`context.push('/habits/:id')`) can actually be exercised.
Widget _buildRoutedSubject(_FakeMyHabitsService service, {required String initialIntentionId}) {
  final router = GoRouter(
    initialLocation: '/habits/$initialIntentionId',
    routes: [
      GoRoute(
        path: '/habits/:intentionId',
        builder: (context, state) => HabitDetailScreen(
          intentionId: state.pathParameters['intentionId']!,
        ),
      ),
    ],
  );
  return ProviderScope(
    overrides: [myHabitsServiceProvider.overrideWithValue(service)],
    child: MaterialApp.router(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
}

void main() {
  testWidgets(
    'shows the contribution graph (once there are logs) and "not yet available" before any SRHI submission',
    (tester) async {
      await tester.pumpWidget(
        _buildSubject(
          _FakeMyHabitsService(
            intentions: [_intention],
            logs: [
              DailyLog(
                intentionId: 'intent-1',
                date: '2026-01-02',
                enacted: true,
                loggedAt: DateTime(2026, 1, 2),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ContributionGraphWidget), findsOneWidget);
      expect(find.text('Not yet available'), findsOneWidget);
      expect(find.text('None scheduled'), findsOneWidget);
      expect(find.text("What's SRHI?"), findsOneWidget);
    },
  );

  testWidgets('shows "No activity logged yet" empty state when there are no logs', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildSubject(_FakeMyHabitsService(intentions: [_intention])),
    );
    await tester.pumpAndSettle();

    expect(find.byType(ContributionGraphWidget), findsNothing);
    expect(find.text('No activity logged yet.'), findsOneWidget);
  });

  testWidgets('shows the latest submitted SRHI score', (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeMyHabitsService(
          intentions: [_intention],
          trajectory: const [
            SrhiTrajectoryPoint(weekNumber: 1, score: 3.5),
            SrhiTrajectoryPoint(weekNumber: 2, score: 5.25),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('5.3'), findsOneWidget);
    // The labelled trajectory chart replaces the axis-less sparkline.
    expect(find.byType(SrhiChartWidget), findsOneWidget);
  });

  testWidgets('renders the SRHI chart with a single submitted point', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeMyHabitsService(
          intentions: [_intention],
          trajectory: const [
            SrhiTrajectoryPoint(weekNumber: 1, score: 4.0),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    // A single fill should read as a chart (axes + point), not a lone dot.
    expect(find.byType(SrhiChartWidget), findsOneWidget);
    expect(find.text('Study week'), findsOneWidget);
    expect(find.text('SRHI score (1–7)'), findsOneWidget);
    expect(
      find.text('SRHI data will appear after your first weekly check-in.'),
      findsNothing,
    );
  });

  testWidgets('shows "Due now" when the next check-in is not in the future', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildSubject(
        _FakeMyHabitsService(
          intentions: [_intention],
          trajectory: [
            SrhiTrajectoryPoint(
              weekNumber: 1,
              scheduledFor: DateTime.now().subtract(const Duration(days: 1)),
            ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Due now'), findsOneWidget);
  });

  testWidgets(
    'shows a "Start check-in" button when a check-in is due for this habit',
    (tester) async {
      await tester.pumpWidget(
        _buildSubject(
          _FakeMyHabitsService(
            intentions: [_intention],
            trajectory: [
              SrhiTrajectoryPoint(
                weekNumber: 3,
                scheduledFor: DateTime.now().subtract(const Duration(days: 1)),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Start check-in'), findsOneWidget);
    },
  );

  testWidgets(
    'hides the "Start check-in" button when nothing is due yet',
    (tester) async {
      await tester.pumpWidget(
        _buildSubject(
          _FakeMyHabitsService(
            intentions: [_intention],
            trajectory: const [
              SrhiTrajectoryPoint(weekNumber: 1, score: 4.0),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Start check-in'), findsNothing);
    },
  );

  testWidgets(
    "tapping \"Start check-in\" routes to this habit's SRHI form at the due week number",
    (tester) async {
      final router = GoRouter(
        initialLocation: '/habits/intent-1',
        routes: [
          GoRoute(
            path: '/habits/:intentionId',
            builder: (context, state) => HabitDetailScreen(
              intentionId: state.pathParameters['intentionId']!,
            ),
            routes: [
              GoRoute(
                path: 'srhi/:weekNumber',
                builder: (context, state) => Scaffold(
                  body: Text(
                    'srhi-form:${state.pathParameters['intentionId']}'
                    ':${state.pathParameters['weekNumber']}',
                  ),
                ),
              ),
            ],
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            myHabitsServiceProvider.overrideWithValue(
              _FakeMyHabitsService(
                intentions: [_intention],
                trajectory: [
                  SrhiTrajectoryPoint(
                    weekNumber: 3,
                    scheduledFor:
                        DateTime.now().subtract(const Duration(days: 1)),
                  ),
                ],
              ),
            ),
          ],
          child: MaterialApp.router(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start check-in'));
      await tester.pumpAndSettle();

      expect(find.text('srhi-form:intent-1:3'), findsOneWidget);
    },
  );

  testWidgets('dismissing the SRHI explanation hides it', (tester) async {
    await tester.pumpWidget(
      _buildSubject(_FakeMyHabitsService(intentions: [_intention])),
    );
    await tester.pumpAndSettle();

    expect(find.text("What's SRHI?"), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pump();

    expect(find.text("What's SRHI?"), findsNothing);
  });

  // ── §7.1 Habit Stacking ──────────────────────────────────────────────────

  testWidgets('shows a "Stacked onto" chip for a stacked habit', (
    tester,
  ) async {
    final stacked = Intention(
      id: 'intent-1',
      behaviorKey: 'flossing',
      behaviorLabel: 'Flossing',
      durationMinutes: 2,
      cues: const [],
      intentionStatement: 'After I brush my teeth, I will floss.',
      status: 'active',
      createdAt: DateTime(2026, 1, 1),
      stackedOn: 'anchor-1',
      anchorLabel: 'Brush my teeth',
      creationMode: 'stacked',
    );
    await tester.pumpWidget(
      _buildSubject(_FakeMyHabitsService(intentions: [stacked])),
    );
    await tester.pumpAndSettle();

    expect(find.text('Stacked onto: Brush my teeth'), findsOneWidget);
  });

  testWidgets('shows no "Stacked onto" chip for a standalone habit', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildSubject(_FakeMyHabitsService(intentions: [_intention])),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Stacked onto'), findsNothing);
  });

  testWidgets(
      'shows a tappable anchor tile (not a plain chip) when the anchor is itself a tracked habit',
      (tester) async {
    final anchor = Intention(
      id: 'anchor-1',
      behaviorKey: 'brush_teeth',
      behaviorLabel: 'Brush my teeth',
      durationMinutes: 3,
      cues: const [],
      intentionStatement: 'Every morning, I will brush my teeth.',
      status: 'active',
      createdAt: DateTime(2026, 1, 1),
    );
    final stacked = Intention(
      id: 'intent-1',
      behaviorKey: 'flossing',
      behaviorLabel: 'Flossing',
      durationMinutes: 2,
      cues: const [],
      intentionStatement: 'After I brush my teeth, I will floss.',
      status: 'active',
      createdAt: DateTime(2026, 1, 1),
      stackedOn: 'anchor-1',
      anchorLabel: 'Brush my teeth',
      creationMode: 'stacked',
    );
    await tester.pumpWidget(
      _buildRoutedSubject(
        _FakeMyHabitsService(intentions: [stacked, anchor]),
        initialIntentionId: 'intent-1',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Stacked onto: Brush my teeth'), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right), findsOneWidget);

    await tester.tap(find.text('Stacked onto: Brush my teeth'));
    await tester.pumpAndSettle();

    // Navigated to the anchor's own detail page.
    expect(find.text('Every morning, I will brush my teeth.'), findsOneWidget);
  });

  testWidgets(
    'abandoning a habit invalidates dueSrhiProvider so a stale check-in for it disappears',
    (tester) async {
      final service = _FakeMyHabitsService(intentions: [_intention]);
      final container = ProviderContainer(
        overrides: [
          myHabitsServiceProvider.overrideWithValue(service),
          // Without this, habitConfigProvider hits the fake service's real
          // (network-backed) fetchHabitConfig, which fails in the test
          // sandbox and — under Riverpod 3's default retry-with-backoff —
          // leaves a pending Timer behind once the screen is popped and
          // nothing pumps again to let it fire, tripping flutter_test's
          // "Timer still pending" teardown check.
          habitConfigProvider.overrideWith(
            (ref) async => const HabitConfig(
              cueCount: 'single',
              cueSource: 'pre_rated',
              behaviorOptions: [],
              srhiItems: [],
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      // Read once up front, like My Habits screen does, so there's a cached
      // value that must be invalidated (not just left never-fetched).
      await container.read(dueSrhiProvider.future);
      expect(service.fetchDueSrhiCallCount, 1);

      // A real GoRouter (with a route beneath it) so the screen's
      // `context.pop()` on successful abandon has somewhere to go —
      // `home:` under a plain MaterialApp has no GoRouter in context.
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(path: '/', builder: (context, state) => const Scaffold()),
          GoRoute(
            path: '/habits/:intentionId',
            builder: (context, state) => HabitDetailScreen(
              intentionId: state.pathParameters['intentionId']!,
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            routerConfig: router,
          ),
        ),
      );
      router.push('/habits/intent-1');
      await tester.pumpAndSettle();

      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Abandon habit'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(service.lastUpdatedStatus, 'abandoned');
      // dueSrhiProvider was invalidated, so reading it again re-fetches
      // instead of serving the stale cached list.
      await container.read(dueSrhiProvider.future);
      expect(service.fetchDueSrhiCallCount, 2);
    },
  );
}
