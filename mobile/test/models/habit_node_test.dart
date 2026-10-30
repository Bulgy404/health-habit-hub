// mobile/test/models/habit_node_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/habit_node.dart';

HabitNode _node(String name, String contextText) => HabitNode(
  id: 'h1',
  name: name,
  category: 'Time',
  bcioClass: '',
  annotationCounts: const {},
  contextText: contextText,
);

void main() {
  group('HabitNode.splitForCopy (#4)', () {
    test('moves the context phrase from the behaviour into the cue', () {
      final copy = _node('No phone after 10pm', 'after 10pm').splitForCopy();
      expect(copy.behavior, 'No phone');
      expect(copy.cue, 'after 10pm');
    });

    test(
      'a leading phrase leaves a capitalised behaviour without the comma',
      () {
        final copy = _node(
          'After work, go for a walk',
          'After work',
        ).splitForCopy();
        expect(copy.behavior, 'Go for a walk');
        expect(copy.cue, 'After work');
      },
    );

    test('a phrase mid-sentence closes the gap it leaves', () {
      final copy = _node(
        'Stretch at the gym, then shower',
        'at the gym',
      ).splitForCopy();
      expect(copy.behavior, 'Stretch, then shower');
      expect(copy.cue, 'at the gym');
    });

    test('no phrase, or one not in the shown text, keeps the whole text', () {
      for (final node in [
        _node('Drink water', ''),
        // The shown text is a translation of the original the phrase is from.
        _node('Kein Handy nach 22 Uhr', 'after 10pm'),
      ]) {
        final copy = node.splitForCopy();
        expect(copy.behavior, node.name);
        expect(copy.cue, isNull);
      }
    });

    test('a phrase that is the whole text stays the behaviour', () {
      final copy = _node('at the gym', 'at the gym').splitForCopy();
      expect(copy.behavior, 'at the gym');
      expect(copy.cue, isNull);
    });
  });
}
