import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/habit_graph.dart';

void main() {
  group('HabitGraph.fromJson', () {
    final rawJson = {
      'nodes': [
        {
          'id': 'h:uuid-1',
          'type': 'habit',
          'label': 'Drink water daily',
          'habitId': 'uuid-1',
          'originalText': 'Drink water daily',
          'language': 'en',
          'annotationCounts': {'helpful': 3, 'iDoThis': 1},
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
    };

    test('parses nodes and edges correctly', () {
      final graph = HabitGraph.fromJson(rawJson);
      expect(graph.nodes.length, 2);
      expect(graph.edges.length, 1);
    });

    test('habit node has correct fields', () {
      final graph = HabitGraph.fromJson(rawJson);
      final habit = graph.nodes.first;
      expect(habit.id, 'h:uuid-1');
      expect(habit.type, 'habit');
      expect(habit.label, 'Drink water daily');
      expect(habit.habitId, 'uuid-1');
      expect(habit.originalText, 'Drink water daily');
      expect(habit.language, 'en');
      expect(habit.annotationCounts['helpful'], 3);
      expect(habit.annotationCounts['iDoThis'], 1);
    });

    test('concept node has correct fields', () {
      final graph = HabitGraph.fromJson(rawJson);
      final concept = graph.nodes.last;
      expect(concept.id, 'c:bcio_001');
      expect(concept.type, 'concept');
      expect(concept.label, 'Self-monitoring');
      expect(concept.habitId, isNull);
    });

    test('habitNodes returns only habit-type nodes', () {
      final graph = HabitGraph.fromJson(rawJson);
      expect(graph.habitNodes.length, 1);
      expect(graph.habitNodes.first.type, 'habit');
    });

    test('conceptNodes returns only concept-type nodes', () {
      final graph = HabitGraph.fromJson(rawJson);
      expect(graph.conceptNodes.length, 1);
      expect(graph.conceptNodes.first.type, 'concept');
    });

    test('habitsForConcept returns correct habits', () {
      final graph = HabitGraph.fromJson(rawJson);
      final habits = graph.habitsForConcept('c:bcio_001');
      expect(habits.length, 1);
      expect(habits.first.id, 'h:uuid-1');
    });

    test('conceptForHabit returns correct concept node', () {
      final graph = HabitGraph.fromJson(rawJson);
      final concept = graph.conceptForHabit('h:uuid-1');
      expect(concept?.id, 'c:bcio_001');
    });

    test('HabitGraph.empty() has no nodes or edges', () {
      final graph = HabitGraph.empty();
      expect(graph.nodes, isEmpty);
      expect(graph.edges, isEmpty);
    });

    test('totalAnnotations sums all annotation counts', () {
      final graph = HabitGraph.fromJson(rawJson);
      // habitNode has helpful: 3, iDoThis: 1 → total = 4
      expect(graph.habitNodes.first.totalAnnotations, 4);
      // conceptNode has helpful: 0, iDoThis: 0 → total = 0
      expect(graph.conceptNodes.first.totalAnnotations, 0);
    });

    test('conceptForHabit returns null for an unconnected habit', () {
      final graph = HabitGraph.empty();
      expect(graph.conceptForHabit('h:nonexistent'), isNull);
    });
  });
}
