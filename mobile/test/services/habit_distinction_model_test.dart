import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';

/// Unit tests for the model changes introduced by §7.1/§7.4/§7.5.
void main() {
  group('HabitType', () {
    test('fromWire maps quit and defaults everything else to build', () {
      expect(HabitType.fromWire('quit'), HabitType.quit);
      expect(HabitType.fromWire('build'), HabitType.build);
      expect(HabitType.fromWire('nonsense'), HabitType.build);
      expect(HabitType.fromWire(null), HabitType.build);
    });

    test('wire round-trips the enum name', () {
      expect(HabitType.build.wire, 'build');
      expect(HabitType.quit.wire, 'quit');
    });
  });

  group('Intention.fromJson', () {
    test('parses habitType, stacking metadata, and badges (§7.4/§7.1/§7.5)', () {
      final intention = Intention.fromJson(const {
        'id': 'i1',
        'behaviorKey': 'flossing',
        'behaviorLabel': 'Flossing',
        'durationMinutes': 2,
        'cues': [
          {'text': 'After brushing', 'source': 'self_selected'},
        ],
        'intentionStatement': 'After I brush, I will floss.',
        'status': 'active',
        'createdAt': '2026-07-31T10:00:00.000Z',
        'habitType': 'quit',
        'stackedOn': 'anchor-1',
        'creationMode': 'stacked',
        'earnedBadges': [
          {'badgeKey': 'first_step', 'earnedAt': '2026-07-31T10:00:00.000Z'},
        ],
      });

      expect(intention.habitType, HabitType.quit);
      expect(intention.stackedOn, 'anchor-1');
      expect(intention.creationMode, 'stacked');
      expect(intention.isStacked, true);
      expect(intention.earnedBadges.single.badgeKey, 'first_step');
    });

    test('defaults new fields for legacy documents (backward compat)', () {
      final intention = Intention.fromJson(const {
        'id': 'i2',
        'behaviorKey': 'walking',
        'behaviorLabel': 'Walking',
        'durationMinutes': 20,
        'cues': [
          {'text': 'After dinner', 'source': 'self_selected'},
        ],
        'intentionStatement': 'After dinner, I will walk.',
        'status': 'active',
        'createdAt': '2026-07-31T10:00:00.000Z',
      });

      expect(intention.habitType, HabitType.build);
      expect(intention.stackedOn, isNull);
      expect(intention.creationMode, 'standalone');
      expect(intention.isStacked, false);
      expect(intention.earnedBadges, isEmpty);
    });
  });

  group('HabitConfig.fromJson (§7.1/§7.2/§7.3 config)', () {
    test('parses stacking, reminder mode, and overload guard', () {
      final config = HabitConfig.fromJson(const {
        'cueCount': 'multi',
        'cueSource': 'self_selected',
        'behaviorOptions': [],
        'habitStackingEnabled': false,
        'reminderContentMode': 'implementation_intention',
        'informationOverloadGuard': {
          'enabled': true,
          'userOptOutAllowed': true,
        },
      });

      expect(config.habitStackingEnabled, false);
      expect(config.reminderContentMode, 'implementation_intention');
      expect(config.informationOverloadEnabled, true);
      expect(config.informationOverloadOptOutAllowed, true);
    });

    test('defaults the §7 config to safe values when absent', () {
      final config = HabitConfig.fromJson(const {
        'cueCount': 'multi',
        'cueSource': 'high_quality',
        'behaviorOptions': [],
      });

      expect(config.habitStackingEnabled, true);
      expect(config.reminderContentMode, 'generic');
      expect(config.informationOverloadEnabled, false);
      expect(config.informationOverloadOptOutAllowed, false);
    });
  });
}
