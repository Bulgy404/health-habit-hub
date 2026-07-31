import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/gamification_ui.dart';

/// Unit tests for the §7.5 gamification presentation helpers.
void main() {
  group('badgeMetaFor', () {
    test('returns known metadata for a defined badge key', () {
      final meta = badgeMetaFor('second_nature');
      expect(meta.label, 'Second Nature');
    });

    test('falls back to a humanised label for an unknown key', () {
      final meta = badgeMetaFor('some_new_badge');
      expect(meta.label, 'some new badge');
    });
  });

  group('praiseFor', () {
    test('returns a badge-specific line', () {
      final line = praiseFor('first_step', rotation: 0);
      expect(line, isNotEmpty);
      expect(line.toLowerCase(), contains('step'));
    });

    test('rotates through the available lines (modulo)', () {
      final a0 = praiseFor('building_momentum', rotation: 0);
      final a1 = praiseFor('building_momentum', rotation: 1);
      final a2 = praiseFor('building_momentum', rotation: 2);
      expect(a0, isNot(equals(a1)));
      // Two lines defined → rotation 2 wraps back to rotation 0.
      expect(a2, equals(a0));
    });

    test('falls back to a generic congratulation for unknown keys', () {
      final line = praiseFor('mystery_badge');
      expect(line, isNotEmpty);
    });
  });
}
