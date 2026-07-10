/// Per-device toggles for the three local reminder channels scheduled by
/// [ReminderSchedulerService]. Device-local UX preference, not sensitive —
/// same storage tier as [HabitOnboardingPrefs].
library;

import 'package:shared_preferences/shared_preferences.dart';

const _habitRemindersKey = 'notif_habit_reminders_enabled';
const _questionnaireRemindersKey = 'notif_questionnaire_reminders_enabled';
const _studyUpdatesKey = 'notif_study_updates_enabled';

/// Reads and writes the three notification-channel preferences.
class NotificationPrefs {
  const NotificationPrefs._();

  /// Whether local habit reminders are enabled. Defaults to true.
  static Future<bool> habitRemindersEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_habitRemindersKey) ?? true;
  }

  /// Enables or disables local habit reminders.
  static Future<void> setHabitRemindersEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_habitRemindersKey, value);
  }

  /// Whether local questionnaire-due reminders are enabled. Defaults to true.
  static Future<bool> questionnaireRemindersEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_questionnaireRemindersKey) ?? true;
  }

  /// Enables or disables local questionnaire-due reminders.
  static Future<void> setQuestionnaireRemindersEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_questionnaireRemindersKey, value);
  }

  /// Whether the end-of-study notification is enabled. Defaults to true.
  static Future<bool> studyUpdatesEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_studyUpdatesKey) ?? true;
  }

  /// Enables or disables the end-of-study notification.
  static Future<void> setStudyUpdatesEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_studyUpdatesKey, value);
  }
}
