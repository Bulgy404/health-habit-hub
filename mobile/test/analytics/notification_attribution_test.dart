import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/analytics/analytics_service.dart';
import 'package:hhh/analytics/notification_attribution.dart';
import 'package:hhh/services/push_notification_service.dart';

class _FakeSink implements AnalyticsSink {
  final captured = <(String, Map<String, Object>)>[];

  @override
  Future<void> capture(String eventName, Map<String, Object> properties) async {
    captured.add((eventName, properties));
  }

  @override
  Future<void> identify(
    String userId, {
    required Map<String, Object> properties,
  }) async {}

  @override
  Future<void> reset() async {}
}

void main() {
  group('notification payload attribution', () {
    test('a habit reminder round-trips its habit and tier', () {
      final payload = tagNotificationPayload(
        '/habits',
        kind: 'habit_reminder',
        intentionId: '66f0c0ffee0000000000abcd',
        reminderFrequency: 'twice_weekly',
      );
      final tap = parseNotificationPayload(payload);

      expect(tap.route, '/habits');
      expect(tap.kind, 'habit_reminder');
      expect(tap.intentionId, '66f0c0ffee0000000000abcd');
      expect(tap.reminderFrequency, 'twice_weekly');
    });

    test('navigation receives the deep link without attribution', () {
      final payload = tagNotificationPayload(
        '/habits/abc123/srhi/2',
        kind: 'questionnaire',
      );
      final tap = parseNotificationPayload(payload);

      expect(tap.route, '/habits/abc123/srhi/2');
      expect(tap.kind, 'questionnaire');
      expect(tap.intentionId, 'not_assigned');
      expect(tap.reminderFrequency, 'none');
    });

    test('a reminder scheduled before schema v2 parses as unknown', () {
      final tap = parseNotificationPayload('/habits');

      expect(tap.route, '/habits');
      expect(tap.kind, 'unknown');
      expect(tap.intentionId, 'not_assigned');
    });

    test('an unrecognised tier is not passed through', () {
      final tap = parseNotificationPayload(
        '/habits?hhh_n=habit_reminder&hhh_i=abc&hhh_f=hourly',
      );

      expect(tap.reminderFrequency, 'unknown');
    });

    test('attribution only applies to habit reminders', () {
      final tap = parseNotificationPayload(
        '/habits?hhh_n=recovery&hhh_i=abc&hhh_f=daily',
      );

      expect(tap.kind, 'recovery');
      expect(tap.intentionId, 'not_assigned');
      expect(tap.reminderFrequency, 'none');
    });
  });

  group('notification_opened capture', () {
    test('passes the registry for every tagged kind', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);
      final payloads = [
        tagNotificationPayload(
          '/habits',
          kind: 'habit_reminder',
          intentionId: '66f0c0ffee0000000000abcd',
          reminderFrequency: 'daily',
        ),
        tagNotificationPayload('/settings/profile', kind: 'questionnaire'),
        tagNotificationPayload('/settings/achievements', kind: 'praise'),
        tagNotificationPayload('/habits', kind: 'recovery'),
        '/habits',
      ];
      for (final payload in payloads) {
        captureNotificationOpened(
          analytics,
          parseNotificationPayload(payload),
          coldStart: false,
        );
      }
      captureCampaignOpened(analytics, coldStart: true);
      await Future<void>.delayed(Duration.zero);

      expect(sink.captured, hasLength(payloads.length + 1));
      expect(sink.captured.first.$2, containsPair('launch', 'running'));
      expect(sink.captured.last.$2, containsPair('kind', 'campaign'));
      expect(sink.captured.last.$2, containsPair('launch', 'cold_start'));
    });

    test('every permission status maps into the registry', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);
      for (final status in AuthorizationStatus.values) {
        expect(
          await analytics.capture('notification_permission_checked', {
            'status': permissionStatusName(status),
          }),
          isTrue,
        );
      }
    });
  });
}
