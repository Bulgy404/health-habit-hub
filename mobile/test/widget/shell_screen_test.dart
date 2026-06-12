// Widget tests for ShellScreen (bottom navigation shell).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/shell_screen.dart';

// ---------------------------------------------------------------------------
// Test router factory
// ---------------------------------------------------------------------------

GoRouter _buildTestRouter() {
  return GoRouter(
    initialLocation: '/share',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => ShellScreen(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/share',
                builder: (_, _) => const Scaffold(body: Text('Share Tab')),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/explore',
                builder: (_, _) => const Scaffold(body: Text('Explore Tab')),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/habits',
                builder: (_, _) => const Scaffold(body: Text('Habits Tab')),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/recommend',
                builder: (_, _) => const Scaffold(body: Text('Recommend Tab')),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, _) => const Scaffold(body: Text('Settings Tab')),
              ),
            ],
          ),
          StatefulShellBranch(
            initialLocation: '/admin/participants',
            routes: [
              GoRoute(
                path: '/admin/participants',
                builder: (_, _) =>
                    const Scaffold(body: Text('Admin Participants')),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

Widget _buildSubject(GoRouter router, List<String> roles) {
  return ProviderScope(
    overrides: [
      userRolesProvider.overrideWith((ref) async => roles),
      reconsentRequiredProvider.overrideWithValue((_) async => false),
      habitReminderSyncProvider.overrideWithValue(() async {}),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows NavigationBar and Share tab', (tester) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(_buildSubject(router, const []));
    await tester.pump(); // allow StatefulShellRoute to settle

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Share'), findsOneWidget);
    expect(find.text('Explore'), findsOneWidget);
    expect(find.text('Habits'), findsOneWidget);
    expect(find.text('Recs'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });

  testWidgets('hides Admin tab for regular users', (tester) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(_buildSubject(router, const []));
    await tester.pump();

    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('shows Admin tab for admin users', (tester) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(_buildSubject(router, ['admin']));
    await tester.pump();

    expect(find.text('Admin'), findsOneWidget);
  });

  testWidgets('shows loading state (NavigationBar still visible)', (
    tester,
  ) async {
    final router = _buildTestRouter();
    // Use a Completer that never completes to simulate a long-running roles load.
    // Completer.future does NOT create a pending timer (unlike Future.delayed).
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          userRolesProvider.overrideWith(
            (ref) => Completer<List<String>>().future,
          ),
          reconsentRequiredProvider.overrideWithValue((_) async => false),
          habitReminderSyncProvider.overrideWithValue(() async {}),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();

    // Even while loading roles, the NavigationBar renders (with empty roles = no admin tab)
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
