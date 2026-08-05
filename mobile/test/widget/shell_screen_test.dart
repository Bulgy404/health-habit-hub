// Widget tests for ShellScreen (bottom navigation shell).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
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

Widget _buildSubject(
  GoRouter router,
  List<String> roles, {
  bool recommenderEnabled = true,
  bool habitCreationEnabled = true,
}) {
  return ProviderScope(
    overrides: [
      userRolesProvider.overrideWith((ref) async => roles),
      reconsentRequiredProvider.overrideWithValue((_) async => false),
      habitReminderSyncProvider.overrideWithValue(() async {}),
      recommenderEnabledProvider.overrideWithValue(recommenderEnabled),
      habitCreationEnabledProvider.overrideWithValue(habitCreationEnabled),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    ),
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
    expect(find.text('My Habits'), findsOneWidget);
    expect(find.text('Recommend'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });

  testWidgets('never shows an Admin tab (admin moved to web portal)',
      (tester) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(_buildSubject(router, ['admin']));
    await tester.pump();

    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('shows Recs tab when recommender enabled', (tester) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(
      _buildSubject(router, const [], recommenderEnabled: true),
    );
    await tester.pump();

    expect(find.text('Recommend'), findsOneWidget);
  });

  testWidgets('hides Recs tab when recommender disabled for the study', (
    tester,
  ) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(
      _buildSubject(router, const [], recommenderEnabled: false),
    );
    await tester.pump();

    expect(find.text('Recommend'), findsNothing);
    // Other tabs remain.
    expect(find.text('My Habits'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });

  testWidgets('shows My Habits tab when habit creation enabled', (
    tester,
  ) async {
    final router = _buildTestRouter();
    await tester.pumpWidget(
      _buildSubject(router, const [], habitCreationEnabled: true),
    );
    await tester.pump();

    expect(find.text('My Habits'), findsOneWidget);
  });

  testWidgets(
      'hides My Habits tab when the study disables habit creation entirely',
      (tester) async {
    // Regression test: previously only the "add habit" button inside the My
    // Habits screen was hidden, leaving a permanently-empty screen reachable
    // via the tab — there's no other way for such a participant to ever get
    // a habit. The whole tab should be hidden instead.
    final router = _buildTestRouter();
    await tester.pumpWidget(
      _buildSubject(router, const [], habitCreationEnabled: false),
    );
    await tester.pump();

    expect(find.text('My Habits'), findsNothing);
    // Other tabs remain.
    expect(find.text('Share'), findsOneWidget);
    expect(find.text('Explore'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
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
          recommenderEnabledProvider.overrideWithValue(true),
          habitCreationEnabledProvider.overrideWithValue(true),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      ),
    );
    await tester.pump();

    // Even while loading roles, the NavigationBar renders (with empty roles = no admin tab)
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
