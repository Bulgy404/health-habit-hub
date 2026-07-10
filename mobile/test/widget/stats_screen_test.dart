// Widget tests for StatsScreen.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/models/habit_stats.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/show_in_graph_provider.dart';
import 'package:hhh/screens/stats_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/habit_service.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

// ---------------------------------------------------------------------------
// Builder — accepts an AsyncValue<MyStats> override so tests can inject any
// state (loading, error, data) without going through async plumbing.
// ---------------------------------------------------------------------------

Widget _buildSubject(
  AsyncValue<MyStats> statsState, {
  AsyncValue<HabitStats> communityStatsState = const AsyncData(
    HabitStats(total: 0, byCategory: [], byDay: []),
  ),
}) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      myStatsProvider.overrideWithValue(statsState),
      habitStatsProvider.overrideWithValue(communityStatsState),
    ],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: const Scaffold(body: StatsScreen()),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows loading skeleton while fetching stats', (tester) async {
    await tester.pumpWidget(
      _buildSubject(const AsyncLoading()),
    );
    await tester.pump();

    // Loading skeleton uses colored Container boxes (_SkeletonBox)
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(Container), findsWidgets);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(
      _buildSubject(
        AsyncValue<MyStats>.error(Exception('Network error'), StackTrace.empty),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Failed to load your habits'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows total count and section title on success', (tester) async {
    final stats = MyStats(
      total: 42,
      byDimension: [
        const DimensionStat(dimension: 'TIME', label: 'Time', count: 5),
      ],
      habits: [],
    );
    await tester.pumpWidget(_buildSubject(AsyncData(stats)));
    await tester.pumpAndSettle();

    expect(find.text('42'), findsOneWidget);
    expect(find.text('habits donated'), findsOneWidget);
    expect(find.text('Habits by Context'), findsOneWidget);
  });

  testWidgets('shows empty habits placeholder when no habits donated',
      (tester) async {
    const stats = MyStats(total: 0, byDimension: [], habits: []);
    await tester.pumpWidget(_buildSubject(const AsyncData(stats)));
    await tester.pumpAndSettle();

    expect(find.textContaining('No habits donated yet'), findsOneWidget);
  });
}
