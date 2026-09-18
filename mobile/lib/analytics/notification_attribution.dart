import 'dart:async';

import 'analytics_service.dart';

/// Attribution for a tapped local notification.
///
/// A local notification carries exactly one string back to the app — its
/// payload — and until schema v2 that was a bare route such as `/habits`, so
/// a tap could not be tied to the habit or to the reminder tier the adaptive
/// algorithm had chosen. [tagNotificationPayload] appends that attribution as
/// query parameters; [parseNotificationPayload] splits it back off so
/// navigation still receives the plain route.
///
/// Reminders scheduled by an app version before this existed still carry the
/// bare route. They parse as kind `unknown` rather than being guessed at.
final class NotificationTap {
  const NotificationTap({
    required this.route,
    required this.kind,
    this.intentionId = 'not_assigned',
    this.reminderFrequency = 'none',
  });

  /// The GoRouter location to navigate to, without attribution parameters.
  final String route;
  final String kind;
  final String intentionId;
  final String reminderFrequency;
}

const _kindParam = 'hhh_n';
const _intentionParam = 'hhh_i';
const _frequencyParam = 'hhh_f';

const _kinds = {'habit_reminder', 'questionnaire', 'praise', 'recovery'};
const _frequencies = {'daily', 'every_2_days', 'twice_weekly', 'weekly'};

/// Returns [route] with notification attribution appended.
String tagNotificationPayload(
  String route, {
  required String kind,
  String? intentionId,
  String? reminderFrequency,
}) {
  final uri = Uri.parse(route);
  return uri
      .replace(
        queryParameters: {
          ...uri.queryParameters,
          _kindParam: kind,
          _intentionParam: ?intentionId,
          _frequencyParam: ?reminderFrequency,
        },
      )
      .toString();
}

/// Splits a payload produced by [tagNotificationPayload] (or a legacy bare
/// route) into the route to navigate to and its attribution.
NotificationTap parseNotificationPayload(String payload) {
  final uri = Uri.tryParse(payload);
  if (uri == null) return NotificationTap(route: payload, kind: 'unknown');

  final params = Map.of(uri.queryParameters);
  final kind = params.remove(_kindParam);
  final intentionId = params.remove(_intentionParam);
  final frequency = params.remove(_frequencyParam);
  // Rebuilt rather than Uri.replace(queryParameters: null), which keeps the
  // original query — attribution would then leak into navigation.
  final route = params.isEmpty
      ? uri.path
      : '${uri.path}?${Uri(queryParameters: params).query}';

  if (kind == null || !_kinds.contains(kind)) {
    return NotificationTap(route: route, kind: 'unknown');
  }
  final isHabitReminder = kind == 'habit_reminder';
  return NotificationTap(
    route: route,
    kind: kind,
    intentionId: isHabitReminder && intentionId != null
        ? intentionId
        : 'not_assigned',
    reminderFrequency: !isHabitReminder
        ? 'none'
        : _frequencies.contains(frequency)
        ? frequency!
        : 'unknown',
  );
}

/// Records a notification tap. [coldStart] is true when the tap launched the
/// app rather than reaching an already-running one.
void captureNotificationOpened(
  AnalyticsService analytics,
  NotificationTap tap, {
  required bool coldStart,
}) {
  unawaited(
    analytics.capture('notification_opened', {
      'kind': tap.kind,
      'intention_id': tap.intentionId,
      'reminder_frequency': tap.reminderFrequency,
      'launch': coldStart ? 'cold_start' : 'running',
    }),
  );
}

/// Records an opened FCM campaign push. Campaign pushes carry no per-send id
/// yet, so this counts opens per participant without naming the campaign.
void captureCampaignOpened(
  AnalyticsService analytics, {
  required bool coldStart,
}) {
  captureNotificationOpened(
    analytics,
    const NotificationTap(route: '', kind: 'campaign'),
    coldStart: coldStart,
  );
}
