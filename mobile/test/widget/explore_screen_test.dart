// Widget tests for ExploreScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/habit_node.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/explore_screen.dart';
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

class _FakeHabitService extends HabitService {
  final bool shouldThrow;
  final List<HabitNode> habits;

  _FakeHabitService.throwing()
      : shouldThrow = true,
        habits = const [],
        super(authService: _FakeAuthService());

  _FakeHabitService.empty()
      : shouldThrow = false,
        habits = const [],
        super(authService: _FakeAuthService());

  @override
  Future<List<HabitNode>> fetchPublicHabits() {
    if (shouldThrow) return Future.error(Exception('Network error'));
    return Future.value(habits);
  }
}

// Service that returns a future that never completes (loading state test).
class _LoadingHabitService extends HabitService {
  final Completer<List<HabitNode>> _completer;

  _LoadingHabitService(this._completer)
      : super(authService: _FakeAuthService());

  @override
  Future<List<HabitNode>> fetchPublicHabits() => _completer.future;
}

Widget _buildSubject(HabitService habitService) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      habitServiceProvider.overrideWithValue(habitService),
    ],
    child: const MaterialApp(home: ExploreScreen()),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows Explore Habits AppBar title', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeHabitService.empty()));
    await tester.pump();

    expect(find.text('Explore Habits'), findsOneWidget);
  });

  testWidgets('shows loading indicator while fetching habits', (tester) async {
    final service = _LoadingHabitService(Completer<List<HabitNode>>());

    await tester.pumpWidget(_buildSubject(service));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeHabitService.throwing()));
    await tester.pumpAndSettle();

    expect(find.text('Failed to load habits'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when no habits', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeHabitService.empty()));
    await tester.pumpAndSettle();

    expect(find.text('No habit data available yet.'), findsOneWidget);
  });

  testWidgets('shows TabBar with Graph and Stats tabs', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeHabitService.empty()));
    await tester.pump();

    expect(find.text('Graph'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
  });
}
