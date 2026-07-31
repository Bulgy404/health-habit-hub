import 'package:dio/dio.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../config/app_config.dart';
import '../features/my_habits/gamification_ui.dart';

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

// §7.5 Gamification praise notifications — their own channel + id range so they
// never collide with (or get cancelled by) the reminder ranges above.
const _praiseChannelId = 'hhh_praise';
const _praiseChannelName = 'Achievements';
const _praiseChannelDescription = 'Congratulations when you earn a badge';
const _praiseNotifBase = 600000;
const _praiseNotifMax = 20;

// "Get back on track" notifications for revoked badges — a distinct channel
// (supportive tone, not an achievement) and its own id range so it can never
// collide with the praise range above.
const _recoveryChannelId = 'hhh_recovery';
const _recoveryChannelName = 'Habit support';
const _recoveryChannelDescription =
    'A supportive nudge when a habit needs help getting back on track';
const _recoveryNotifBase = 700000;
const _recoveryNotifMax = 20;

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

  /// §7.5 Gamification — fire a one-time praise notification for each newly
  /// earned badge, drawing a rotating praise line per badge (via [praiseFor])
  /// so repeated milestones don't reuse identical copy. Deliberately scoped to
  /// real milestones, not every log. Best-effort; failures are swallowed.
  Future<void> showPraiseNotifications(List<String> badgeKeys) async {
    if (badgeKeys.isEmpty) return;
    await _ensureTimezone();
    var i = 0;
    for (final key in badgeKeys.take(_praiseNotifMax)) {
      final meta = badgeMetaFor(key);
      final body = praiseFor(key, rotation: i);
      try {
        await _plugin.show(
          id: _praiseNotifBase + i,
          title: '🏅 ${meta.label}',
          body: body,
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              _praiseChannelId,
              _praiseChannelName,
              channelDescription: _praiseChannelDescription,
              importance: Importance.defaultImportance,
            ),
            iOS: DarwinNotificationDetails(),
          ),
          payload: '/profile',
        );
      } catch (_) {
        // Non-fatal: a praise notification is a nicety, never a blocker.
      }
      i++;
    }
  }

  /// Fire a one-time, supportively-worded notification for each badge that
  /// was just *revoked* (its tier/streak regressed — see `REVOCABLE_BADGES`
  /// in `gamificationService.js`), rotating copy via [getBackOnTrackFor] the
  /// same way [showPraiseNotifications] rotates praise. Uses its own channel
  /// so it never reads as a celebration. Best-effort; failures are swallowed.
  Future<void> showGetBackOnTrackNotifications(List<String> badgeKeys) async {
    if (badgeKeys.isEmpty) return;
    await _ensureTimezone();
    var i = 0;
    for (final key in badgeKeys.take(_recoveryNotifMax)) {
      final meta = badgeMetaFor(key);
      final body = getBackOnTrackFor(key, rotation: i);
      try {
        await _plugin.show(
          id: _recoveryNotifBase + i,
          title: 'Let\'s get back on track',
          body: '${meta.label}: $body',
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              _recoveryChannelId,
              _recoveryChannelName,
              channelDescription: _recoveryChannelDescription,
              importance: Importance.defaultImportance,
            ),
            iOS: DarwinNotificationDetails(),
          ),
          payload: '/habits',
        );
      } catch (_) {
        // Non-fatal: this is a nicety, never a blocker.
      }
      i++;
    }
  }

  /// §7.2 — builds a reminder body. In `implementation_intention` mode it
  /// fills the rotating template at [templateIndex] with the plan's cue and
  /// behavior ("when {cue}, {behavior}"); otherwise (or when cue/behavior are
  /// missing) it returns the generic nudge. Pure and static so it is unit
  /// testable without the notification plugin.
  static String reminderBody({
    required String mode,
    required List<String> templates,
    required int templateIndex,
    String? cue,
    String? behavior,
  }) {
    const generic = 'Your plan: stay on track today. Open the app to log it.';
    // Normalise to non-nullable locals up front, so the emptiness checks below
    // double as the null checks and no `!` assertions are needed.
    final trimmedCue = cue?.trim() ?? '';
    final trimmedBehavior = behavior?.trim() ?? '';
    if (mode != 'implementation_intention' ||
        trimmedCue.isEmpty ||
        trimmedBehavior.isEmpty ||
        templates.isEmpty) {
      return generic;
    }
    final template = templates[templateIndex % templates.length];
    return template
        .replaceAll('{cue}', trimmedCue)
        .replaceAll('{behavior}', trimmedBehavior);
  }

  /// Day offsets (from today) per backend frequency tier for a 14-day window.
  static const Map<String, List<int>> offsetsForFrequency = {
    'daily': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    'every_2_days': [2, 4, 6, 8, 10, 12, 14],
    'twice_weekly': [3, 7, 10, 14],
    'weekly': [7, 14],
    'off': [],
  };

  // Every offsetsForFrequency list tops out at day 14 ('daily'), so 20 slots
  // per intention leaves headroom without wasting id space.
  static const _maxOffsetsPerIntention = 20;

  /// Deterministic notification id for a habit reminder, derived from the
  /// intention id + day offset instead of iteration order.
  ///
  /// Scheduling is idempotent by construction: the same (intentionId,
  /// offset) pair always maps to the same id, so if [syncReminders] ever
  /// runs twice for the same reminder (e.g. two call sites racing — see the
  /// in-flight guard below), the second `zonedSchedule` call *replaces* the
  /// first's notification instead of adding a second pending one. Stays
  /// within [0, _qNotifBase) so it never collides with the questionnaire/
  /// end-of-study/praise/recovery ranges above. Public + static (like
  /// [reminderBody]) so it's unit-testable without the notification plugin.
  static int reminderNotificationId(String intentionId, int dayOffset) {
    final bucketCount = _qNotifBase ~/ _maxOffsetsPerIntention;
    final bucket = stableHash(intentionId) % bucketCount;
    return bucket * _maxOffsetsPerIntention +
        (dayOffset - 1) % _maxOffsetsPerIntention;
  }

  /// FNV-1a string hash — deterministic across app runs and platforms
  /// (unlike relying on [Object.hashCode], whose exact algorithm isn't a
  /// public contract), used to spread intention ids across the id range in
  /// [reminderNotificationId].
  static int stableHash(String input) {
    var hash = 0x811c9dc5;
    for (final unit in input.codeUnits) {
      hash = ((hash ^ unit) * 0x01000193) & 0xFFFFFFFF;
    }
    return hash;
  }

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

  // ReminderSchedulerService is constructed fresh at every call site
  // (new_habit_screen_3_confirm.dart, srhi_form_screen.dart, shell_screen.dart
  // all `ReminderSchedulerService(dio: ...)` their own instance) rather than
  // being a shared singleton, so an instance field can't coordinate between
  // them — this has to be static, shared across every instance in the
  // process, to actually prevent two of those call sites racing each other.
  static Future<void>? _syncInFlight;

  /// Fetches current plans and replaces all pending habit reminders.
  ///
  /// Habit reminders are part of the study protocol and always scheduled;
  /// participants cannot mute them in-app (only via OS notification settings).
  ///
  /// Coalesces overlapping calls: if a sync is already running (e.g. the app
  /// starting up in ShellScreen races a sync fired right after habit
  /// creation), a second call joins the in-flight one instead of running its
  /// own concurrent cancel→fetch→schedule cycle — that race was the root
  /// cause of duplicate reminders, since each concurrent run's cancel could
  /// land after the other's schedule. [reminderNotificationId] being
  /// deterministic is a second, independent guard against duplicates even if
  /// two calls do end up back-to-back rather than truly concurrent.
  Future<void> syncReminders() {
    final inFlight = _syncInFlight;
    if (inFlight != null) return inFlight;
    final future = _doSyncReminders();
    _syncInFlight = future;
    future.whenComplete(() {
      if (identical(_syncInFlight, future)) _syncInFlight = null;
    });
    return future;
  }

  Future<void> _doSyncReminders() async {
    await _ensureTimezone();
    await _cancelPendingHabitReminders();

    final response = await _dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/habits/intentions/reminder-plans',
    );
    final plans = (response.data?['plans'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();

    // §7.2 Implementation Intention Reminder — when the study condition is
    // 'implementation_intention', reminders spell out "when {cue}, {behavior}"
    // instead of a generic nudge, rotating through admin-editable phrasing
    // templates so the copy itself doesn't habituate.
    final reminderContentMode =
        response.data?['reminderContentMode']?.toString() ?? 'generic';
    final templates = (response.data?['reminderTemplates'] as List<dynamic>?)
            ?.whereType<String>()
            .toList() ??
        const <String>[];

    // Rotating index across every scheduled reminder so consecutive nudges use
    // different phrasings rather than repeating one template.
    var templateIndex = 0;
    for (final plan in plans) {
      final reminderTime = plan['reminderTime']?.toString();
      final frequency = plan['frequency']?.toString() ?? 'daily';
      final intentionId = plan['intentionId']?.toString();
      if (reminderTime == null || intentionId == null) continue;

      final cue = plan['cueText']?.toString();
      final behavior = plan['behaviorLabel']?.toString();

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

        final body = reminderBody(
          mode: reminderContentMode,
          templates: templates,
          templateIndex: templateIndex,
          cue: cue,
          behavior: behavior,
        );
        templateIndex++;

        await _plugin.zonedSchedule(
          id: reminderNotificationId(intentionId, offset),
          title: 'Time for your habit',
          body: body,
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
          payload: '/habits',
        );
      }
    }
  }

  /// Schedules a local notification at each upcoming scheduled questionnaire
  /// due date (`GET /questionnaires/due`), including weekly per-habit SRHI
  /// check-ins (`questionnaireSlug == 'srhi'`), which the backend keeps
  /// generating for as long as the habit stays active. Due-now questionnaires
  /// are shown as "today's task" cards instead, so only future occurrences
  /// are notified. Uses a dedicated id range that it clears first, so it
  /// never disturbs the habit reminders.
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
      final isSrhi = it['questionnaireSlug']?.toString() == 'srhi';

      await _plugin.zonedSchedule(
        id: _qNotifBase + idx++,
        title: isSrhi ? 'Weekly check-in ready' : 'Questionnaire ready',
        body: isSrhi
            ? '$title — a quick check-in is ready.'
            : '$title is ready to complete.',
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
        // SRHI is habit-scoped — route to that habit's detail screen (shows
        // the check-in prompt), where a plain path-only deep link is enough.
        // Non-SRHI questionnaires live in the Profile tab (My Profile →
        // Health Questionnaires) — route there rather than deep-linking into
        // a specific questionnaire, since the form itself needs question data
        // that a bare route string can't carry.
        payload: isSrhi
            ? '/habits/${it['intentionId']}'
            : '/settings/profile',
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
