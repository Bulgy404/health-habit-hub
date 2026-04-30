import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/bubble_graph.dart';

void main() {
  group('BubbleGraph.fromJson', () {
    final rawJson = {
      'dimensions': [
        {
          'id': 'TIME',
          'label': 'Time',
          'habitCount': 1,
          'habits': [
            {
              'id': 'uuid-1',
              'label': 'Drink water daily',
              'originalText': 'Drink water daily',
              'language': 'en',
              'annotationCounts': {'helpful': 3, 'iDoThis': 1},
            },
          ],
        },
        {
          'id': 'BEHAVIOR',
          'label': 'Behavior',
          'habitCount': 0,
          'habits': [],
        },
      ],
    };

    test('parses dimensions correctly', () {
      final graph = BubbleGraph.fromJson(rawJson);
      expect(graph.dimensions.length, 2);
    });

    test('dimension has correct fields', () {
      final graph = BubbleGraph.fromJson(rawJson);
      final dim = graph.dimensions.first;
      expect(dim.id, 'TIME');
      expect(dim.label, 'Time');
      expect(dim.habitCount, 1);
    });

    test('habit has correct fields', () {
      final graph = BubbleGraph.fromJson(rawJson);
      final habit = graph.dimensions.first.habits.first;
      expect(habit.id, 'uuid-1');
      expect(habit.label, 'Drink water daily');
      expect(habit.originalText, 'Drink water daily');
      expect(habit.language, 'en');
      expect(habit.annotationCounts['helpful'], 3);
      expect(habit.annotationCounts['iDoThis'], 1);
    });

    test('totalAnnotations sums annotation counts', () {
      final graph = BubbleGraph.fromJson(rawJson);
      final habit = graph.dimensions.first.habits.first;
      expect(habit.totalAnnotations, 4);
    });

    test('empty dimensions list when absent', () {
      final graph = BubbleGraph.fromJson({});
      expect(graph.dimensions, isEmpty);
    });

    test('empty habits list when key is absent', () {
      final graph = BubbleGraph.fromJson({
        'dimensions': [
          {'id': 'TIME', 'label': 'Time', 'habitCount': 0},
        ],
      });
      expect(graph.dimensions.first.habits, isEmpty);
    });
  });
}
