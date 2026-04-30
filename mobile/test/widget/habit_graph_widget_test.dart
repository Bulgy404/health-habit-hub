import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/bubble_graph.dart';
import 'package:hhh/widgets/bubble_graph_widget.dart';

BubbleGraph _sampleGraph() {
  return BubbleGraph.fromJson({
    'dimensions': [
      {
        'id': 'TIME',
        'label': 'Time',
        'habitCount': 2,
        'habits': [
          {
            'id': 'uuid-1',
            'label': 'Drink water',
            'originalText': 'Drink water',
            'language': 'en',
            'annotationCounts': {'helpful': 1, 'iDoThis': 0},
          },
          {
            'id': 'uuid-2',
            'label': 'Exercise daily',
            'originalText': 'Exercise daily',
            'language': 'en',
            'annotationCounts': {'helpful': 0, 'iDoThis': 2},
          },
        ],
      },
    ],
  });
}

void main() {
  testWidgets('BubbleGraphWidget renders without throwing', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BubbleGraphWidget(
            graph: _sampleGraph(),
            onHabitTap: (_, _) {},
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));

    expect(tester.takeException(), isNull);
  });

  testWidgets('shows dimension bubble label at overview level', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BubbleGraphWidget(
            graph: _sampleGraph(),
            onHabitTap: (_, _) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Time'), findsOneWidget);
  });
}
