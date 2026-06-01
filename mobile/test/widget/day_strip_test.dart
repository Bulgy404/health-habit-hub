// mobile/test/widget/day_strip_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/day_strip_widget.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('DayStripWidget renders 7 day cells', (tester) async {
    await tester.pumpWidget(_wrap(
      const DayStripWidget(logs: {}, startDate: null),
    ));
    // 7 day cells
    expect(find.byType(DayCell), findsNWidgets(7));
  });

  testWidgets('DayStripWidget handles partial week (< 7 days since creation)',
      (tester) async {
    final today = DateTime.now();
    final threeDaysAgo = today.subtract(const Duration(days: 3));
    await tester.pumpWidget(_wrap(
      DayStripWidget(logs: {}, startDate: threeDaysAgo),
    ));
    // Only 4 cells rendered (day 0 through today = 4 days)
    expect(find.byType(DayCell), findsNWidgets(4));
  });

  testWidgets('DayStripWidget shows enacted cell as green', (tester) async {
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    await tester.pumpWidget(_wrap(
      DayStripWidget(logs: {dateStr: true}, startDate: null),
    ));
    final cell = tester.widget<DayCell>(find.byType(DayCell).last);
    expect(cell.enacted, true);
  });
}
