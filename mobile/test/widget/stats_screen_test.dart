// Widget tests for StatsScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/models/habit_stats.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/stats_screen.dart';
import 'package:dio/dio.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/habit_service.dart';

final _fakeDio = Dio();

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

class _FakeHabitService extends HabitService {
  final bool shouldThrow;
  final HabitStats? stats;

  _FakeHabitService.throwing()
      : shouldThrow = true,
        stats = null,
        super(dio: _fakeDio);

  _FakeHabitService.withStats(this.stats)
      : shouldThrow = false,
        super(dio: _fakeDio);

  @override
  Future<HabitStats> fetchStats() async {
    if (shouldThrow) throw Exception('Network error');
    return stats ??
        const HabitStats(total: 0, byCategory: [], byDay: []);
  }
}

class _LoadingHabitService extends HabitService {
  final Completer<HabitStats> _completer;

  _LoadingHabitService(this._completer) : super(dio: _fakeDio);

  @override
  Future<HabitStats> fetchStats() => _completer.future;
}

Widget _buildSubject(HabitService service) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      habitServiceProvider.overrideWithValue(service),
    ],
    // StatsScreen is normally nested inside ExploreScreen's TabBarView.
    // Wrap in a large SizedBox to prevent layout overflow in tests.
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: Scaffold(
        body: SizedBox(
          height: 2400,
          child: OverflowBox(
            maxHeight: double.infinity,
            alignment: Alignment.topCenter,
            child: const StatsScreen(),
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows loading skeleton while fetching stats', (tester) async {
    final completer = Completer<HabitStats>();
    await tester.pumpWidget(_buildSubject(_LoadingHabitService(completer)));
    await tester.pump();

    // Loading skeleton uses colored Container boxes (_SkeletonBox)
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(Container), findsWidgets);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeHabitService.throwing()));
    await tester.pumpAndSettle();

    expect(find.text('Failed to load stats'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows total count and section titles on success', (tester) async {
    const stats = HabitStats(
      total: 42,
      byCategory: [],
      byDay: [],
    );
    await tester
        .pumpWidget(_buildSubject(_FakeHabitService.withStats(stats)));
    await tester.pumpAndSettle();

    expect(find.text('42'), findsOneWidget);
    expect(find.text('habits donated'), findsOneWidget);
    expect(find.text('Habits by Category'), findsOneWidget);
  });

  testWidgets('shows empty chart placeholder when no category data',
      (tester) async {
    const stats = HabitStats(total: 0, byCategory: [], byDay: []);
    await tester
        .pumpWidget(_buildSubject(_FakeHabitService.withStats(stats)));
    await tester.pumpAndSettle();

    expect(find.text('No category data'), findsOneWidget);
  });
}
