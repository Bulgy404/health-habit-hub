// mobile/test/widget/habit_detail_screen_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/habit_detail_screen.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
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
}
