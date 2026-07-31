import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/bubble_graph.dart';

HabitBubble _bubble({int? healthBenefit, int? wellbeingImpact}) {
  return HabitBubble(
    id: 'uuid-1',
    label: 'Test habit',
    originalText: 'Test habit',
    language: 'en',
    annotationCounts: const {},
    healthBenefit: healthBenefit,
    wellbeingImpact: wellbeingImpact,
  );
}

void main() {
  group('HabitBubble.impactScore', () {
    test('is null when neither rating is present', () {
      expect(_bubble().impactScore, isNull);
    });

    test('is the higher of the two ratings when both are present', () {
      expect(
        _bubble(healthBenefit: 2, wellbeingImpact: 5).impactScore,
        5,
      );
      expect(
        _bubble(healthBenefit: 4, wellbeingImpact: 1).impactScore,
        4,
      );
    });

    test('falls back to whichever single rating is present', () {
      expect(_bubble(healthBenefit: 3).impactScore, 3);
      expect(_bubble(wellbeingImpact: 3).impactScore, 3);
    });
  });

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
