import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/contribution_graph_widget.dart';

Widget _wrap(Widget child, {Brightness brightness = Brightness.light}) {
  return MaterialApp(
    theme: ThemeData(brightness: brightness, useMaterial3: true),
    home: Scaffold(body: child),
  );
}

void main() {
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
}
