import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';

void main() {
  group('HabitConfig.fromJson', () {
    test('parses the platform feature flags from the response', () {
      final config = HabitConfig.fromJson(const {
        'cueCount': 'single',
        'cueSource': 'self_selected',
        'behaviorOptions': ['walking'],
        'guidedHabitCreationEnabled': false,
        'communityShareDefault': false,
      });

      expect(config.guidedHabitCreationEnabled, false);
      expect(config.communityShareDefault, false);
    });

    test('defaults the feature flags to true when absent (backward compat)',
        () {
      final config = HabitConfig.fromJson(const {
        'cueCount': 'multi',
        'cueSource': 'high_quality',
        'behaviorOptions': ['walking'],
      });

      expect(config.guidedHabitCreationEnabled, true);
      expect(config.communityShareDefault, true);
    });
  });
}
