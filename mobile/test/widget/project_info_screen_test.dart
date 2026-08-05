import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/screens/project_info_screen.dart';

Widget _wrap({Locale locale = const Locale('en')}) {
  return MaterialApp(
    locale: locale,
    supportedLocales: const [Locale('en'), Locale('de')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: const ProjectInfoScreen(),
  );
}

/// The page is a long ListView of static content — a tall test surface means
/// every section is actually built (ListView only builds children near the
/// visible viewport), so assertions don't need to scroll first.
void _useTallSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(400, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  testWidgets(
      'renders the About the Health Habit Hub title and all section headings',
      (tester) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap());
    // Not pumpAndSettle: the flow diagram's connector/pulse animations
    // repeat forever, so settling never completes. A couple of frames is
    // enough for the (static) text this file asserts on to be present.
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('About the Health Habit Hub'), findsOneWidget);
    expect(find.text('How your shared habit is used'), findsOneWidget);
    expect(find.text('How recommendations work'), findsOneWidget);
    expect(find.text('View on GitHub'), findsOneWidget);

    // Deliberately kept short — see CHANGELOG "keep it simple" trim.
    expect(find.text("What's a cue?"), findsNothing);
    expect(find.text('Why this matters'), findsNothing);
    expect(find.text('Adaptive reminders'), findsNothing);
    expect(find.text("What's SRHI?"), findsNothing);
  });

  testWidgets('renders the recommender data-flow diagram sources and output', (
    tester,
  ) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap());
    // Not pumpAndSettle: the flow diagram's connector/pulse animations
    // repeat forever, so settling never completes. A couple of frames is
    // enough for the (static) text this file asserts on to be present.
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Your goal'), findsOneWidget);
    expect(find.text('Your habits & answers'), findsOneWidget);
    expect(find.text('Community habits'), findsOneWidget);
    expect(find.text('Research'), findsOneWidget);
    expect(find.text('AI Recommender'), findsOneWidget);
    expect(find.text('Personalized suggestion'), findsOneWidget);
  });

  testWidgets('renders a short explanation for every diagram input', (
    tester,
  ) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap());
    await tester.pump(const Duration(milliseconds: 500));

    // Legend lines are one RichText each ("Label: explanation"), so this
    // checks the combined plain text rather than find.text on the label
    // alone (which matches the diagram's separate icon node instead).
    expect(
      find.textContaining('Your goal: what you just typed'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Community habits: anonymized habits shared'),
      findsOneWidget,
    );
  });

  testWidgets('renders German copy for a German locale', (tester) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap(locale: const Locale('de')));
    // Not pumpAndSettle — see note above.
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Über das Health Habit Hub'), findsOneWidget);
    expect(find.text('Wie deine geteilte Gewohnheit verwendet wird'),
        findsOneWidget);
    expect(find.text('KI-Empfehlungssystem'), findsOneWidget);
  });
}
