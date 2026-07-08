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
  testWidgets('renders the About HabConnect title and all section headings', (
    tester,
  ) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap());
    await tester.pumpAndSettle();

    expect(find.text('About HabConnect'), findsOneWidget);
    expect(find.text('How your shared habit is used'), findsOneWidget);
    expect(find.text("What's a cue?"), findsOneWidget);
    expect(find.text('Why this matters'), findsOneWidget);
    expect(find.text('How recommendations work'), findsOneWidget);
    expect(find.text('Adaptive reminders'), findsOneWidget);
    expect(find.text("What's SRHI?"), findsOneWidget);
    expect(find.text('View on GitHub'), findsOneWidget);
  });

  testWidgets('renders the recommender flow diagram steps in order', (
    tester,
  ) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap());
    await tester.pumpAndSettle();

    expect(find.text('Your goal'), findsOneWidget);
    expect(find.text('Similar shared habits'), findsOneWidget);
    expect(find.text('Behaviour-change technique'), findsOneWidget);
    expect(find.text('Personalized suggestion'), findsOneWidget);
  });

  testWidgets('renders German copy for a German locale', (tester) async {
    _useTallSurface(tester);
    await tester.pumpWidget(_wrap(locale: const Locale('de')));
    await tester.pumpAndSettle();

    expect(find.text('Über HabConnect'), findsOneWidget);
    expect(find.text('Was ist ein Auslöser?'), findsOneWidget);
  });
}
