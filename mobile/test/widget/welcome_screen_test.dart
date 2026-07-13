// Widget tests for WelcomeScreen.
//
// The screen has no riverpod/provider dependencies and touches secure
// storage only outside the widget tree (in isOnboardingComplete(), used by
// the router redirect, not by the widget itself), so no ProviderScope or
// secure-storage mock is needed here — just a GoRouter harness for the two
// destinations the screen can navigate to.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/onboarding/welcome_screen.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps [WelcomeScreen] in the minimal widget tree needed for tests.
Widget _buildSubject() {
  final router = GoRouter(
    initialLocation: '/onboarding/welcome',
    routes: [
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/onboarding/consent',
        builder: (context, state) => const Scaffold(body: Text('Consent')),
      ),
      GoRoute(
        path: '/onboarding/restore',
        builder: (context, state) => const Scaffold(body: Text('Restore')),
      ),
    ],
  );

  return MaterialApp.router(
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: const [Locale('en')],
    routerConfig: router,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets(
      'shows the welcome splash with title, subtitle, Get Started, and '
      'Restore link, with no page indicator dots', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    // appTitle's first space is replaced with a line break in the splash.
    expect(find.text('Health\nHabit Hub'), findsOneWidget);
    expect(
      find.text(
        'A citizen-science platform where your habits help build a richer '
        'understanding of everyday behaviour.',
      ),
      findsOneWidget,
    );
    expect(find.text('Get Started'), findsOneWidget);
    expect(find.text('Restore existing account'), findsOneWidget);
    // Dots (AnimatedContainer) are only shown once the walkthrough starts.
    expect(find.byType(AnimatedContainer), findsNothing);
  });

  testWidgets(
      'tapping Get Started advances to the first walkthrough step and '
      'shows the page indicator dots', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();

    expect(find.text('Share a Habit'), findsOneWidget);
    // 3 walkthrough steps => 3 indicator dots.
    expect(find.byType(AnimatedContainer), findsNWidgets(3));
    // Not the last step, so Skip is shown and the button says "Next".
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
  });

  testWidgets('swiping the PageView advances from the splash to step one',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.drag(find.byType(PageView), const Offset(-400, 0));
    await tester.pumpAndSettle();

    expect(find.text('Share a Habit'), findsOneWidget);
  });

  testWidgets('tapping Next advances through subsequent walkthrough steps',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    expect(find.text('Share a Habit'), findsOneWidget);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('Explore & Annotate'), findsOneWidget);
  });

  testWidgets('tapping Skip jumps straight to the final walkthrough step',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(find.text('Get Recommendations'), findsOneWidget);
    // Last page has no Skip button, and the button reads "Continue".
    expect(find.text('Skip'), findsNothing);
    expect(find.text('Continue'), findsOneWidget);
  });

  testWidgets(
      '"Get Started" (rendered as Continue) on the final step navigates to '
      'consent', (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Consent'), findsOneWidget);
  });

  testWidgets('"Restore existing account" link navigates to the restore route',
      (tester) async {
    await tester.pumpWidget(_buildSubject());
    await tester.pump();

    await tester.tap(find.text('Restore existing account'));
    await tester.pumpAndSettle();

    expect(find.text('Restore'), findsOneWidget);
  });
}
