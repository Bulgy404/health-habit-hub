import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import '../config/app_config.dart';
import 'event_registry.g.dart';

const _notAssigned = 'not_assigned';
const _analyticsOperationTimeout = Duration(seconds: 3);

abstract interface class AnalyticsSink {
  Future<void> capture(String eventName, Map<String, Object> properties);
  Future<void> identify(
    String userId, {
    required Map<String, Object> properties,
  });
  Future<void> reset();
}

final class PostHogAnalyticsSink implements AnalyticsSink {
  const PostHogAnalyticsSink();

  @override
  Future<void> capture(String eventName, Map<String, Object> properties) =>
      Posthog().capture(eventName: eventName, properties: properties);

  @override
  Future<void> identify(
    String userId, {
    required Map<String, Object> properties,
  }) => Posthog().identify(userId: userId, userProperties: properties);

  @override
  Future<void> reset() => Posthog().reset();
}

/// Privacy-safe context attached to every allowlisted event.
final class AnalyticsContext {
  const AnalyticsContext({
    required this.appVersion,
    required this.platform,
    required this.locale,
    this.studyId = _notAssigned,
    this.groupId = _notAssigned,
  });

  final String appVersion;
  final String platform;
  final String locale;
  final String studyId;
  final String groupId;

  AnalyticsContext copyWith({
    String? locale,
    String? studyId,
    String? groupId,
  }) => AnalyticsContext(
    appVersion: appVersion,
    platform: platform,
    locale: locale ?? this.locale,
    studyId: studyId ?? this.studyId,
    groupId: groupId ?? this.groupId,
  );

  Map<String, Object> toProperties() => {
    'study_id': studyId,
    'group_id': groupId,
    'app_version': appVersion,
    'platform': platform,
    'locale': locale,
    'schema_version': analyticsSchemaVersion,
  };
}

/// Privacy boundary for analytics. Unknown events, unknown keys, free-form
/// values and unsupported property types are rejected before reaching the SDK.
class AnalyticsService {
  AnalyticsService._({required AnalyticsContext context, this.sink})
    : _context = context;

  AnalyticsService.disabled()
    : sink = null,
      _context = const AnalyticsContext(
        appVersion: '0.0.0',
        platform: 'unknown',
        locale: 'unknown',
      );

  /// Test seam for verifying callers without initialising the native SDK.
  AnalyticsService.withSink(
    AnalyticsSink this.sink, {
    AnalyticsContext context = const AnalyticsContext(
      appVersion: '1.0.0',
      platform: 'unknown',
      locale: 'en',
    ),
  }) : _context = context;

  final AnalyticsSink? sink;
  AnalyticsContext _context;

  bool get enabled => sink != null;

  void setLocale(String locale) {
    _context = _context.copyWith(locale: _normaliseLocale(locale));
  }

  Future<bool> capture(
    String eventName, [
    Map<String, Object> properties = const {},
  ]) async {
    final activeSink = sink;
    final eventRules = analyticsEventRegistry[eventName];
    if (activeSink == null || eventRules == null) return false;
    if (!_propertiesAreAllowed(properties, eventRules)) return false;

    final enriched = <String, Object>{
      ..._context.toProperties(),
      ...properties,
    };
    if (!_propertiesAreAllowed(enriched, {
      ...analyticsCommonPropertyRegistry,
      ...eventRules,
    })) {
      return false;
    }
    try {
      await activeSink
          .capture(eventName, enriched)
          .timeout(_analyticsOperationTimeout);
      return true;
    } catch (_) {
      // Analytics must never break a participant flow.
      return false;
    }
  }

  Future<bool> identify(
    String userId, {
    String? studyId,
    String? groupId,
  }) async {
    final activeSink = sink;
    if (activeSink == null || !_isOpaqueId(userId)) return false;
    _context = _context.copyWith(
      studyId: _normaliseId(studyId),
      groupId: _normaliseId(groupId),
    );
    final properties = <String, Object>{
      'study_id': _context.studyId,
      'group_id': _context.groupId,
    };
    try {
      await activeSink
          .identify(userId, properties: properties)
          .timeout(_analyticsOperationTimeout);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> reset() async {
    _context = _context.copyWith(studyId: _notAssigned, groupId: _notAssigned);
    try {
      await sink?.reset().timeout(_analyticsOperationTimeout);
    } catch (_) {
      // Logout must complete even if analytics storage is unavailable.
    }
  }

  static bool _propertiesAreAllowed(
    Map<String, Object> properties,
    Map<String, AnalyticsPropertyRule> rules,
  ) {
    if (properties.length != rules.length) return false;
    for (final entry in properties.entries) {
      final rule = rules[entry.key];
      if (rule == null || !_valueIsAllowed(entry.value, rule)) return false;
    }
    return true;
  }

  static bool _valueIsAllowed(Object value, AnalyticsPropertyRule rule) {
    return switch (rule.type) {
      'boolean' => value is bool,
      'integer' => value is int && value >= 0,
      'enum' => value is String && rule.values!.contains(value),
      'opaque_id' => value is String && _isOpaqueId(value),
      'version' =>
        value is String &&
            RegExp(r'^\d+\.\d+\.\d+(?:\+[A-Za-z0-9.-]+)?$').hasMatch(value),
      _ => false,
    };
  }

  static bool _isOpaqueId(String value) =>
      value == _notAssigned ||
      RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(value);

  static String _normaliseId(String? value) {
    final trimmed = value?.trim();
    return trimmed != null && _isOpaqueId(trimmed) ? trimmed : _notAssigned;
  }

  static String _normaliseLocale(String locale) {
    final code = locale.toLowerCase().split(RegExp('[-_]')).first;
    return analyticsCommonPropertyRegistry['locale']!.values!.contains(code)
        ? code
        : 'unknown';
  }
}

final analyticsProvider = Provider<AnalyticsService>(
  (ref) => AnalyticsService.disabled(),
);

Future<AnalyticsService> createConfiguredAnalyticsService() async {
  if (!AppConfig.analyticsConfigured) return AnalyticsService.disabled();

  PackageInfo packageInfo;
  try {
    packageInfo = await PackageInfo.fromPlatform();
  } catch (_) {
    packageInfo = PackageInfo(
      appName: 'Health Habit Hub',
      packageName: 'hhh',
      version: '0.0.0',
      buildNumber: '',
    );
  }
  final context = AnalyticsContext(
    appVersion: packageInfo.buildNumber.isEmpty
        ? packageInfo.version
        : '${packageInfo.version}+${packageInfo.buildNumber}',
    platform: _analyticsPlatform(),
    locale: AnalyticsService._normaliseLocale(
      PlatformDispatcher.instance.locale.languageCode,
    ),
  );

  final config = PostHogConfig(AppConfig.posthogProjectKey)
    ..host = AppConfig.posthogHost
    ..captureApplicationLifecycleEvents = false
    ..rageClickConfig.enabled = false
    ..sendFeatureFlagEvents = false
    ..preloadFeatureFlags = false
    ..surveys = false
    ..sessionReplay = false
    ..capturePushNotificationSubscriptions = false
    ..capturePushNotificationOpened = false
    ..personProfiles = PostHogPersonProfiles.identifiedOnly
    ..beforeSend = [
      (event) {
        final properties = <String, Object>{...?event.properties};
        final eventRules = analyticsEventRegistry[event.event];
        return eventRules != null &&
                AnalyticsService._propertiesAreAllowed(properties, {
                  ...analyticsCommonPropertyRegistry,
                  ...eventRules,
                })
            ? event
            : null;
      },
    ];
  config.errorTrackingConfig.exceptionSteps.enabled = false;

  try {
    await Posthog().setup(config).timeout(_analyticsOperationTimeout);
    return AnalyticsService._(
      sink: const PostHogAnalyticsSink(),
      context: context,
    );
  } catch (_) {
    return AnalyticsService.disabled();
  }
}

String _analyticsPlatform() {
  if (kIsWeb) return 'web';
  return switch (defaultTargetPlatform) {
    TargetPlatform.android => 'android',
    TargetPlatform.iOS => 'ios',
    TargetPlatform.macOS => 'macos',
    TargetPlatform.windows => 'windows',
    TargetPlatform.linux => 'linux',
    TargetPlatform.fuchsia => 'unknown',
  };
}

class AnalyticsNavigationObserver extends NavigatorObserver {
  AnalyticsNavigationObserver(this.analytics);

  final AnalyticsService analytics;
  bool _onboardingStarted = false;

  static const _steps = <String, String>{
    'onboarding_welcome': 'welcome',
    'onboarding_consent': 'consent',
    'onboarding_passphrase': 'passphrase',
    'onboarding_profile_setup': 'profile_setup',
    'onboarding_study_code': 'study_code',
  };
  static const _stepOrder = <String>[
    'welcome',
    'consent',
    'passphrase',
    'profile_setup',
    'study_code',
  ];

  void _captureTransition(
    Route<dynamic>? previousRoute,
    Route<dynamic>? route,
  ) {
    final previousStep = _steps[previousRoute?.settings.name];
    final step = _steps[route?.settings.name];
    if (step == null) return;
    if (previousStep != null &&
        _stepOrder.indexOf(step) > _stepOrder.indexOf(previousStep)) {
      analytics.capture('onboarding_step_completed', {'step': previousStep});
    }
    if (!_onboardingStarted) {
      _onboardingStarted = true;
      analytics.capture('onboarding_started', {'entry_point': 'fresh_install'});
    }
    analytics.capture('onboarding_step_viewed', {'step': step});
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPush(route, previousRoute);
    _captureTransition(previousRoute, route);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    super.didReplace(newRoute: newRoute, oldRoute: oldRoute);
    _captureTransition(oldRoute, newRoute);
  }
}
