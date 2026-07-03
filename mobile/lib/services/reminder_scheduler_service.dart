import 'package:dio/dio.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../config/app_config.dart';

const _channelId = 'hhh_habit_reminders';
const _channelName = 'Habit reminders';
const _channelDescription =
    'Adaptive reminders for your implementation intentions';

const _qChannelId = 'hhh_questionnaire_reminders';
const _qChannelName = 'Questionnaire reminders';
const _qChannelDescription = 'Reminders when a study questionnaire is due';
// Dedicated notification-id range so questionnaire reminders never collide with
// habit reminders (which use low ids). Capped at 20 to stay well within iOS's
// 64-pending-notification limit alongside the habit reminders.
const _qNotifBase = 500000;
const _qNotifMax = 20;

final _plugin = FlutterLocalNotificationsPlugin();
bool _tzReady = false;

/// Adaptive local habit reminders (UC-33).
///
/// Fetches the per-intention reminder plan from the backend
/// (`GET /habits/intentions/reminder-plans`) and schedules local
/// notifications for the next 14 days. The backend fades the frequency as
/// habit strength (SRHI) and adherence rise — see
/// `app/services/reminderPlanService.js` for the autonomy-score algorithm.
///
/// Re-run [syncReminders] after intention creation, daily logging, SRHI
/// submission, and on app start so the schedule tracks the latest plan.
class ReminderSchedulerService {
  ReminderSchedulerService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Day offsets (from today) per backend frequency tier for a 14-day window.
  static const Map<String, List<int>> offsetsForFrequency = {
    'daily': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    'every_2_days': [2, 4, 6, 8, 10, 12, 14],
    'twice_weekly': [3, 7, 10, 14],
    'weekly': [7, 14],
    'off': [],
  };

  static Future<void> _ensureTimezone() async {
    if (_tzReady) return;
    tzdata.initializeTimeZones();
    try {
      // flutter_timezone >= 5 returns a TimezoneInfo object.
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      // Fall back to UTC — reminders still fire, possibly offset.
    }
    _tzReady = true;
  }

  /// Fetches current plans and replaces all pending habit reminders.
  Future<void> syncReminders() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/habits/intentions/reminder-plans',
    );
    final plans = (response.data?['plans'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    await _ensureTimezone();
    await _plugin.cancelAll();

    var notificationId = 0;
    for (final plan in plans) {
      final reminderTime = plan['reminderTime']?.toString();
      final frequency = plan['frequency']?.toString() ?? 'daily';
      if (reminderTime == null) continue;

      final parts = reminderTime.split(':');
      final hour = int.tryParse(parts[0]) ?? 19;
      final minute = int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0;

      for (final offset in offsetsForFrequency[frequency] ?? const <int>[]) {
        final now = tz.TZDateTime.now(tz.local);
        var fireAt = tz.TZDateTime(
          tz.local,
          now.year,
          now.month,
          now.day,
          hour,
          minute,
        ).add(Duration(days: offset - 1));
        if (!fireAt.isAfter(now)) fireAt = fireAt.add(const Duration(days: 1));

        await _plugin.zonedSchedule(
          id: notificationId++,
          title: 'Time for your habit',
          body: 'Your plan: stay on track today. Open the app to log it.',
          scheduledDate: fireAt,
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              _channelId,
              _channelName,
              channelDescription: _channelDescription,
              importance: Importance.defaultImportance,
            ),
            iOS: DarwinNotificationDetails(),
          ),
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        );
      }
    }
  }

  /// Schedules a local notification at each upcoming scheduled questionnaire
  /// due date (`GET /questionnaires/due`). Due-now questionnaires are shown as
  /// "today's task" cards instead, so only future occurrences are notified.
  /// Uses a dedicated id range that it clears first, so it never disturbs the
  /// habit reminders.
  Future<void> syncQuestionnaireReminders() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/questionnaires/due',
    );
    final data = response.data ?? const {};
    await _ensureTimezone();

    // Always clear the existing questionnaire reminders first, so toggling the
    // study setting off (or changing the hour) cancels/replaces them.
    for (var i = 0; i < _qNotifMax; i++) {
      await _plugin.cancel(id: _qNotifBase + i);
    }

    // Study-controlled: skip entirely when reminders are disabled.
    final reminders = (data['reminders'] as Map<String, dynamic>?) ?? const {};
    if (reminders['enabled'] == false) return;
    final hour = (reminders['hour'] as num?)?.toInt() ?? 9;

    final items = (data['questionnaires'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>();
    final now = tz.TZDateTime.now(tz.local);
    var idx = 0;
    for (final it in items) {
      if (idx >= _qNotifMax) break;
      final scheduledStr = it['scheduledFor']?.toString();
      if (scheduledStr == null) continue;
      final parsed = DateTime.tryParse(scheduledStr);
      if (parsed == null) continue;
      // Fire on the due date at the study's configured local hour.
      final localDue = tz.TZDateTime.from(parsed, tz.local);
      final fireAt = tz.TZDateTime(
        tz.local,
        localDue.year,
        localDue.month,
        localDue.day,
        hour,
      );
      if (!fireAt.isAfter(now)) continue; // already passed → shown as a card
      final title = it['questionnaireTitle']?.toString() ?? 'Questionnaire';

      await _plugin.zonedSchedule(
        id: _qNotifBase + idx++,
        title: 'Questionnaire ready',
        body: '$title is ready to complete.',
        scheduledDate: fireAt,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            _qChannelId,
            _qChannelName,
            channelDescription: _qChannelDescription,
            importance: Importance.defaultImportance,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    }
  }

  /// Cancels every pending habit reminder (e.g. on sign-out / deletion).
  Future<void> cancelAll() => _plugin.cancelAll();
}
