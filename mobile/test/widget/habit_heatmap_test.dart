// mobile/test/widget/habit_heatmap_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/widgets/habit_heatmap_widget.dart';

Widget _wrap(Widget child) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets('HabitHeatmapWidget renders grey cells for days with no log',
      (tester) async {
    final startDate = DateTime.now().subtract(const Duration(days: 13));
    await tester.pumpWidget(_wrap(
      HabitHeatmapWidget(logs: const {}, startDate: startDate),
    ));
    // All HeatmapCell widgets should have no enacted value
    final cells = tester.widgetList<HeatmapCell>(find.byType(HeatmapCell));
    expect(cells.every((c) => c.enacted == null), isTrue);
  });

  testWidgets('HabitHeatmapWidget colours enacted cells green', (tester) async {
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    await tester.pumpWidget(_wrap(
      HabitHeatmapWidget(
        logs: {dateStr: true},
        startDate: today.subtract(const Duration(days: 6)),
      ),
    ));
    final enactedCells =
        tester.widgetList<HeatmapCell>(find.byType(HeatmapCell))
            .where((c) => c.enacted == true);
    expect(enactedCells.length, 1);
  });
}
