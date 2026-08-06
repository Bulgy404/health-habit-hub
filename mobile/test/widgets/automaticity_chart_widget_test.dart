import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/widgets/automaticity_chart_widget.dart';

void main() {
  testWidgets(
      'renders without overflow and stays horizontally scrollable at phone width',
      (tester) async {
    final trajectory = List.generate(
      6,
      (i) => SrhiTrajectoryPoint(
        weekNumber: i + 1,
        score: 5,
        autonomyScore: 0.3 + i * 0.1,
      ),
    );

    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('en')],
        home: Scaffold(
          body: AutomaticityChartWidget(trajectory: trajectory, height: 220),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);

    // 6 weeks * 60px/week of plot content is wider than a 390px phone
    // viewport minus the y-axis gutter — confirms the timeline actually
    // scrolls, not just that it renders.
    final scrollable = find.byType(SingleChildScrollView);
    expect(scrollable, findsOneWidget);
    final scrollableState = tester.state<ScrollableState>(
      find.descendant(of: scrollable, matching: find.byType(Scrollable)),
    );
    expect(scrollableState.position.maxScrollExtent, greaterThan(0));
  });
}
