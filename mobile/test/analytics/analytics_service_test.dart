import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/analytics/analytics_service.dart';

class _FakeSink implements AnalyticsSink {
  final captured = <(String, Map<String, Object>)>[];
  String? identifiedUserId;
  Map<String, Object>? identifiedProperties;
  var resetCount = 0;

  @override
  Future<void> capture(String eventName, Map<String, Object> properties) async {
    captured.add((eventName, properties));
  }

  @override
  Future<void> identify(
    String userId, {
    required Map<String, Object> properties,
  }) async {
    identifiedUserId = userId;
    identifiedProperties = properties;
  }

  @override
  Future<void> reset() async => resetCount += 1;
}

void main() {
  group('AnalyticsService privacy boundary', () {
    test('accepts a registered event with an allowed enum value', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);

      final accepted = await analytics.capture('onboarding_step_viewed', {
        'step': 'passphrase',
      });

      expect(accepted, isTrue);
      expect(sink.captured, hasLength(1));
      expect(sink.captured.single.$1, 'onboarding_step_viewed');
      expect(sink.captured.single.$2, {
        'study_id': 'not_assigned',
        'group_id': 'not_assigned',
        'app_version': '1.0.0',
        'platform': 'unknown',
        'locale': 'en',
        'schema_version': 1,
        'step': 'passphrase',
      });
    });

    test('rejects unknown events and properties', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);

      expect(await analytics.capture('free_text_event'), isFalse);
      expect(
        await analytics.capture('onboarding_step_viewed', {
          'step': 'welcome',
          'habit_name': 'private free text',
        }),
        isFalse,
      );
      expect(sink.captured, isEmpty);
    });

    test('rejects missing properties and free-form enum values', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);

      expect(await analytics.capture('onboarding_step_viewed'), isFalse);
      expect(
        await analytics.capture('onboarding_step_viewed', {
          'step': 'a habit name typed by a participant',
        }),
        isFalse,
      );
      expect(sink.captured, isEmpty);
    });

    test('identify exposes only pseudonymous study and group ids', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);

      expect(
        await analytics.identify(
          'keycloak-sub',
          studyId: 'study-id',
          groupId: 'group-id',
        ),
        isTrue,
      );
      expect(sink.identifiedUserId, 'keycloak-sub');
      expect(sink.identifiedProperties, {
        'study_id': 'study-id',
        'group_id': 'group-id',
      });
    });

    test('updates locale and enrollment context on later events', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);

      analytics.setLocale('de-DE');
      await analytics.identify(
        'keycloak-sub',
        studyId: 'study-id',
        groupId: 'group-id',
      );
      expect(await analytics.capture('app_opened'), isTrue);

      expect(sink.captured.single.$2, containsPair('locale', 'de'));
      expect(sink.captured.single.$2, containsPair('study_id', 'study-id'));
      expect(sink.captured.single.$2, containsPair('group_id', 'group-id'));
    });

    test('reset removes enrollment context before another capture', () async {
      final sink = _FakeSink();
      final analytics = AnalyticsService.withSink(sink);

      await analytics.identify(
        'keycloak-sub',
        studyId: 'study-id',
        groupId: 'group-id',
      );
      await analytics.reset();
      await analytics.capture('app_opened');

      expect(sink.resetCount, 1);
      expect(sink.captured.single.$2, containsPair('study_id', 'not_assigned'));
      expect(sink.captured.single.$2, containsPair('group_id', 'not_assigned'));
    });

    test('disabled service never calls a sink', () async {
      final analytics = AnalyticsService.disabled();

      expect(await analytics.capture('app_opened'), isFalse);
      expect(await analytics.identify('keycloak-sub'), isFalse);
      await analytics.reset();
    });
  });
}
