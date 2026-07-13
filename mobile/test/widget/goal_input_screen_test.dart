// Widget tests for GoalInputScreen.
//
// Tests cover: initial render, empty-submission validation, and navigation
// to /recommend/loading with the goal text passed as `extra`.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/features/recommendation/goal_input_screen.dart';
import 'package:hhh/l10n/app_localizations.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps [GoalInputScreen] in the minimal widget tree needed for tests.
///
/// The `/recommend/loading` destination is a stub that renders the `extra`
/// payload as text so tests can assert on exactly what was passed.
Widget _buildSubject() {
  final router = GoRouter(
    initialLocation: '/recommend',
    routes: [
      GoRoute(
        path: '/recommend',
        builder: (context, state) => const GoalInputScreen(),
      ),
      GoRoute(
        path: '/recommend/loading',
        builder: (context, state) => Scaffold(
          body: Text('Loading: ${state.extra as String? ?? ''}'),
        ),
      ),
    ],
  );

  return ProviderScope(
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows the goal prompt, subtitle, and text field', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    expect(
      find.text('What health goal would you like to work on?'),
      findsOneWidget,
    );
    expect(
      find.text(
        "The more context you share (your lifestyle, what you've tried, and what gets in the way), the better your recommendation will be.",
      ),
      findsOneWidget,
    );
    expect(find.byType(TextFormField), findsOneWidget);
  });

  testWidgets('shows "Get Recommendations" as both the app bar title and submit button',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    // Appears once in the AppBar title and once as the FilledButton label.
    expect(find.text('Get Recommendations'), findsNWidgets(2));
    expect(find.byType(FilledButton), findsOneWidget);
  });

  testWidgets('submitting an empty goal shows a validation error and does not navigate',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    expect(find.text('Please describe your goal'), findsOneWidget);
    expect(find.textContaining('Loading:'), findsNothing);
  });

  testWidgets('submitting a valid goal navigates to /recommend/loading with the goal as extra',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.enterText(
      find.byType(TextFormField),
      '  I want to sleep better  ',
    );
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    // GoalInputScreen trims the input before passing it as `extra`.
    expect(find.text('Loading: I want to sleep better'), findsOneWidget);
  });

  testWidgets('icon box uses the theme-aware green, not the old hardcoded pink accent',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    final container = tester.widget<Container>(
      find
          .ancestor(
            of: find.byIcon(Icons.lightbulb),
            matching: find.byType(Container),
          )
          .first,
    );
    final decoration = container.decoration as BoxDecoration;

    expect(decoration.color, isNot(equals(const Color(0xFFE679AB))));
  });
}
