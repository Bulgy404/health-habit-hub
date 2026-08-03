import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/bubble_graph.dart';

void main() {
  group('HabitBubble.fromJson', () {
    test('parses healthBenefit/wellbeingImpact when present', () {
      final bubble = HabitBubble.fromJson({
        'id': 'uuid-1',
        'label': 'Meditate',
        'originalText': 'Meditate',
        'language': 'en',
        'annotationCounts': {'helpful': 0, 'iDoThis': 0},
        'healthBenefit': 5,
        'wellbeingImpact': 4,
      });
      expect(bubble.healthBenefit, 5);
      expect(bubble.wellbeingImpact, 4);
    });

    test('defaults healthBenefit/wellbeingImpact to null when absent', () {
      final bubble = HabitBubble.fromJson({
        'id': 'uuid-1',
        'label': 'Meditate',
        'originalText': 'Meditate',
        'language': 'en',
        'annotationCounts': {'helpful': 0, 'iDoThis': 0},
      });
      expect(bubble.healthBenefit, isNull);
      expect(bubble.wellbeingImpact, isNull);
    });
  });
}
