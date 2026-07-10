/// Riverpod provider wrapping [NotificationPrefs], re-running the matching
/// [ReminderSchedulerService] sync method whenever a preference changes so
/// the effect is immediate rather than waiting for the next natural trigger.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/dio_provider.dart';
import '../services/notification_prefs.dart';
import '../services/reminder_scheduler_service.dart';

/// Current state of the three notification-channel toggles.
class NotificationPrefsState {
  /// Creates a [NotificationPrefsState], defaulting every channel to enabled.
  const NotificationPrefsState({
    this.habitReminders = true,
    this.questionnaireReminders = true,
    this.studyUpdates = true,
  });

  /// Whether local habit reminders are enabled.
  final bool habitReminders;

  /// Whether local questionnaire-due reminders are enabled.
  final bool questionnaireReminders;

  /// Whether the end-of-study notification is enabled.
  final bool studyUpdates;

  /// Returns a copy with the given fields replaced.
  NotificationPrefsState copyWith({
    bool? habitReminders,
    bool? questionnaireReminders,
    bool? studyUpdates,
  }) {
    return NotificationPrefsState(
      habitReminders: habitReminders ?? this.habitReminders,
      questionnaireReminders:
          questionnaireReminders ?? this.questionnaireReminders,
      studyUpdates: studyUpdates ?? this.studyUpdates,
    );
  }
}

/// Manages the three notification-channel toggles shown in
/// Settings → Notifications.
class NotificationPrefsNotifier extends Notifier<NotificationPrefsState> {
  bool _initialized = false;

  @override
  NotificationPrefsState build() {
    if (!_initialized) {
      _initialized = true;
      scheduleMicrotask(_load);
    }
    return const NotificationPrefsState();
  }

  Future<void> _load() async {
    final habit = await NotificationPrefs.habitRemindersEnabled();
    final questionnaire = await NotificationPrefs.questionnaireRemindersEnabled();
    final study = await NotificationPrefs.studyUpdatesEnabled();
    if (!ref.mounted) return;
    state = NotificationPrefsState(
      habitReminders: habit,
      questionnaireReminders: questionnaire,
      studyUpdates: study,
    );
  }

  ReminderSchedulerService get _scheduler =>
      ReminderSchedulerService(dio: ref.read(dioProvider));

  /// Enables or disables habit reminders and immediately re-syncs.
  Future<void> setHabitReminders(bool value) async {
    state = state.copyWith(habitReminders: value);
    await NotificationPrefs.setHabitRemindersEnabled(value);
    await _scheduler.syncReminders();
  }

  /// Enables or disables questionnaire-due reminders and immediately re-syncs.
  Future<void> setQuestionnaireReminders(bool value) async {
    state = state.copyWith(questionnaireReminders: value);
    await NotificationPrefs.setQuestionnaireRemindersEnabled(value);
    await _scheduler.syncQuestionnaireReminders();
  }

  /// Enables or disables the end-of-study notification and immediately re-syncs.
  Future<void> setStudyUpdates(bool value) async {
    state = state.copyWith(studyUpdates: value);
    await NotificationPrefs.setStudyUpdatesEnabled(value);
    await _scheduler.syncEndOfStudyNotification();
  }
}

/// Provides the current [NotificationPrefsState].
final notificationPrefsProvider =
    NotifierProvider<NotificationPrefsNotifier, NotificationPrefsState>(
      NotificationPrefsNotifier.new,
    );
