import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/contribution_graph_widget.dart';
import 'package:intl/date_symbol_data_local.dart';

Widget _wrap(
  Widget child, {
  Brightness brightness = Brightness.light,
  Locale locale = const Locale('en'),
}) {
  return MaterialApp(
    locale: locale,
    supportedLocales: const [Locale('en'), Locale('de')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    theme: ThemeData(brightness: brightness, useMaterial3: true),
    home: Scaffold(body: child),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
  });

  testWidgets('renders an empty grid when there are no counts at all', (
    tester,
  ) async {
    await tester.pumpWidget(_wrap(const ContributionGraphWidget(counts: {})));
    await tester.pump();

    expect(find.byType(ContributionGraphWidget), findsOneWidget);
    expect(find.byType(Container), findsWidgets);
  });

  testWidgets('renders without error when counts has data', (tester) async {
    final today = DateTime.now();
    await tester.pumpWidget(
      _wrap(
        ContributionGraphWidget(
          counts: {
            DateTime(today.year, today.month, today.day): 3,
            DateTime(
              today.year,
              today.month,
              today.day,
            ).subtract(const Duration(days: 1)): 1,
          },
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(ContributionGraphWidget), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('renders in dark mode without error', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const ContributionGraphWidget(counts: {}),
        brightness: Brightness.dark,
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
  });

  testWidgets('localises month labels to the active locale', (tester) async {
    // A month boundary falls inside a 60-week window with certainty, so at
    // least one rotated month label is always rendered regardless of today's
    // date.
    await tester.pumpWidget(
      _wrap(
        const ContributionGraphWidget(counts: {}, weeks: 60),
        locale: const Locale('de'),
      ),
    );
    await tester.pumpAndSettle();

    final labels = tester
        .widgetList<Text>(
          find.descendant(
            of: find.byType(RotatedBox),
            matching: find.byType(Text),
          ),
        )
        .map((t) => t.data)
        .toSet();

    expect(labels, isNotEmpty);
    // A 60-week window always spans a full year, so every German month
    // abbreviation that actually differs from its English counterpart
    // (Mär/Mar, Mai/May, Okt/Oct, Dez/Dec) must appear — proving the widget
    // used the German locale rather than the old hardcoded English list.
    expect(labels, containsAll(<String>['Mär', 'Mai', 'Okt', 'Dez']));
    expect(labels, isNot(anyElement(anyOf('Mar', 'May', 'Oct', 'Dec'))));
  });

  testWidgets('reveals more history when scrolled toward the start', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(const ContributionGraphWidget(counts: {}, weeks: 80)),
    );
    await tester.pumpAndSettle();

    final scrollable = find.byType(Scrollable).first;
    final initialCells = tester.widgetList(find.byType(Container)).length;

    for (var i = 0; i < 8; i++) {
      await tester.drag(scrollable, const Offset(600, 0));
      await tester.pumpAndSettle();
    }

    final laterCells = tester.widgetList(find.byType(Container)).length;
    expect(laterCells, greaterThan(initialCells));
  });
}
