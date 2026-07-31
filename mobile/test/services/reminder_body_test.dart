import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/services/reminder_scheduler_service.dart';

/// Unit tests for the §7.2 rotating reminder-body builder.
void main() {
  const templates = [
    'Remember: {cue} → {behavior}',
    'Your plan for today: when {cue}, {behavior}',
    'Time to check in — {cue} means: {behavior}',
  ];

  group('ReminderSchedulerService.reminderBody', () {
    test('generic mode returns the generic nudge', () {
      final body = ReminderSchedulerService.reminderBody(
        mode: 'generic',
        templates: templates,
        templateIndex: 0,
        cue: 'After dinner',
        behavior: 'go for a walk',
      );
      expect(body, contains('stay on track'));
    });

    test('implementation_intention mode fills the template with cue/behavior',
        () {
      final body = ReminderSchedulerService.reminderBody(
        mode: 'implementation_intention',
        templates: templates,
        templateIndex: 0,
        cue: 'After dinner',
        behavior: 'go for a walk',
      );
      expect(body, 'Remember: After dinner → go for a walk');
    });

    test('rotates templates by index (modulo)', () {
      String at(int i) => ReminderSchedulerService.reminderBody(
            mode: 'implementation_intention',
            templates: templates,
            templateIndex: i,
            cue: 'X',
            behavior: 'Y',
          );
      expect(at(0), startsWith('Remember:'));
      expect(at(1), startsWith('Your plan for today:'));
      expect(at(2), startsWith('Time to check in'));
      // Wraps around.
      expect(at(3), at(0));
    });

    test('falls back to generic when cue or behavior is missing', () {
      final noCue = ReminderSchedulerService.reminderBody(
        mode: 'implementation_intention',
        templates: templates,
        templateIndex: 0,
        cue: '',
        behavior: 'go for a walk',
      );
      expect(noCue, contains('stay on track'));
    });

    test('falls back to generic when there are no templates', () {
      final body = ReminderSchedulerService.reminderBody(
        mode: 'implementation_intention',
        templates: const [],
        templateIndex: 0,
        cue: 'After dinner',
        behavior: 'go for a walk',
      );
      expect(body, contains('stay on track'));
    });
  });
}
