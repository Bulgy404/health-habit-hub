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

const _endOfStudyChannelId = 'hhh_end_of_study';
const _endOfStudyChannelName = 'Study updates';
const _endOfStudyChannelDescription = 'Notice when your study concludes';
// Single dedicated id, outside both the habit-reminder (incrementing from 0)
// and questionnaire-reminder (500000..500019) ranges.
const _endOfStudyNotifId = 500100;

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

  /// Cancels only the habit-reminder notifications this method manages
  /// (ids below [_qNotifBase]), leaving the questionnaire-reminder
  /// (`_qNotifBase`..+[_qNotifMax]) and end-of-study ([_endOfStudyNotifId])
  /// ranges untouched. Queries the plugin for the actual pending ids rather
  /// than assuming a fixed count, since the number of habit reminders
  /// scheduled varies with how many intentions/offsets were active last time.
  Future<void> _cancelPendingHabitReminders() async {
    final pending = await _plugin.pendingNotificationRequests();
    for (final request in pending) {
      if (request.id < _qNotifBase) {
        await _plugin.cancel(id: request.id);
      }
    }
  }

  /// Fetches current plans and replaces all pending habit reminders.
  ///
  /// Habit reminders are part of the study protocol and always scheduled;
  /// participants cannot mute them in-app (only via OS notification settings).
  Future<void> syncReminders() async {
    await _ensureTimezone();
    await _cancelPendingHabitReminders();

    final response = await _dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/habits/intentions/reminder-plans',
    );
    final plans = (response.data?['plans'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();

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
    await _ensureTimezone();

    // Always clear the existing questionnaire reminders first, so a changed
    // reminder hour (or the study disabling them) cancels/replaces them.
    for (var i = 0; i < _qNotifMax; i++) {
      await _plugin.cancel(id: _qNotifBase + i);
    }

    final response = await _dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/questionnaires/due',
    );
    final data = response.data ?? const {};

    // Study-controlled: skip entirely when reminders are disabled. Modes
    // other than "off" all resolve to a concrete time server-side (no
    // participant-facing picker exists for this reminder type yet), so the
    // client just uses whatever time is resolved.
    final reminders = (data['reminders'] as Map<String, dynamic>?) ?? const {};
    if (reminders['mode'] == 'off') return;
    final timeStr = reminders['time']?.toString() ?? '09:00';
    final timeParts = timeStr.split(':');
    final hour = int.tryParse(timeParts[0]) ?? 9;
    final minute = int.tryParse(timeParts.length > 1 ? timeParts[1] : '0') ?? 0;

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
      // Fire on the due date at the study's configured local time.
      final localDue = tz.TZDateTime.from(parsed, tz.local);
      final fireAt = tz.TZDateTime(
        tz.local,
        localDue.year,
        localDue.month,
        localDue.day,
        hour,
        minute,
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

  /// Schedules a single local notification for the participant's study end
  /// date (`GET /questionnaires/due`, which carries `studyEndDate` and
  /// `endOfStudyNotification` regardless of whether any questionnaires are
  /// currently due). Uses a dedicated id that it clears first, so toggling
  /// the admin setting off or changing the end date replaces it cleanly.
  Future<void> syncEndOfStudyNotification() async {
    await _ensureTimezone();
    await _plugin.cancel(id: _endOfStudyNotifId);

    final response = await _dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/questionnaires/due',
    );
    final data = response.data ?? const {};

    final config =
        (data['endOfStudyNotification'] as Map<String, dynamic>?) ?? const {};
    if (config['mode'] == 'off') return;

    final endDateStr = data['studyEndDate']?.toString();
    if (endDateStr == null) return;
    final endDate = DateTime.tryParse(endDateStr);
    if (endDate == null) return;

    // Resolved server-side ("HH:MM"); no participant-facing picker exists
    // for this reminder type yet, so any non-off mode just uses this time.
    final timeStr = config['time']?.toString() ?? '09:00';
    final timeParts = timeStr.split(':');
    final hour = int.tryParse(timeParts[0]) ?? 9;
    final minute = int.tryParse(timeParts.length > 1 ? timeParts[1] : '0') ?? 0;

    final localEnd = tz.TZDateTime.from(endDate, tz.local);
    final fireAt = tz.TZDateTime(
      tz.local,
      localEnd.year,
      localEnd.month,
      localEnd.day,
      hour,
      minute,
    );
    final now = tz.TZDateTime.now(tz.local);
    if (!fireAt.isAfter(now)) return;

    final title = config['title']?.toString() ?? 'Study complete';
    final body =
        config['body']?.toString() ??
        'Thank you for participating — your study has ended.';

    await _plugin.zonedSchedule(
      id: _endOfStudyNotifId,
      title: title,
      body: body,
      scheduledDate: fireAt,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _endOfStudyChannelId,
          _endOfStudyChannelName,
          channelDescription: _endOfStudyChannelDescription,
          importance: Importance.defaultImportance,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    );
  }

  /// Cancels every pending habit reminder (e.g. on sign-out / deletion).
  Future<void> cancelAll() => _plugin.cancelAll();
}
