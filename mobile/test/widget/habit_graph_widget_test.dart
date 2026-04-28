import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/habit_graph.dart';
import 'package:hhh/widgets/habit_graph_widget.dart';

HabitGraph _twoNodeGraph() {
  return HabitGraph.fromJson({
    'nodes': [
      {
        'id': 'h:uuid-1',
        'type': 'habit',
        'label': 'Drink water',
        'habitId': 'uuid-1',
        'originalText': 'Drink water',
        'language': 'en',
        'annotationCounts': {'helpful': 0, 'iDoThis': 0},
      },
      {
        'id': 'c:bcio_001',
        'type': 'concept',
        'label': 'Self-monitoring',
        'habitId': null,
        'originalText': '',
        'language': '',
        'annotationCounts': {'helpful': 0, 'iDoThis': 0},
      },
    ],
    'edges': [
      {'source': 'h:uuid-1', 'target': 'c:bcio_001'},
    ],
  });
}

void main() {
  testWidgets('HabitGraphWidget renders without throwing', (tester) async {
    bool habitTapped = false;
    bool conceptTapped = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HabitGraphWidget(
            graph: _twoNodeGraph(),
            onHabitTap: (_) => habitTapped = true,
            onConceptTap: (_) => conceptTapped = true,
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));

    // Widget tree renders without error
    expect(tester.takeException(), isNull);
    expect(habitTapped, isFalse);
    expect(conceptTapped, isFalse);
  });
}
