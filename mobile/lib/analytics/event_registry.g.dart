// GENERATED FILE — source: app/analytics/event-registry.json
// Run: node scripts/generate-analytics-registry.mjs

final class AnalyticsPropertyRule {
  const AnalyticsPropertyRule({required this.type, this.values});

  final String type;
  final Set<String>? values;
}

const analyticsSchemaVersion = 1;

const analyticsCommonPropertyRegistry = <String, AnalyticsPropertyRule>{
  'study_id': AnalyticsPropertyRule(type: 'opaque_id', values: null),
  'group_id': AnalyticsPropertyRule(type: 'opaque_id', values: null),
  'app_version': AnalyticsPropertyRule(type: 'version', values: null),
  'platform': AnalyticsPropertyRule(
    type: 'enum',
    values: <String>{
      'android',
      'ios',
      'web',
      'macos',
      'windows',
      'linux',
      'server',
      'unknown',
    },
  ),
  'locale': AnalyticsPropertyRule(
    type: 'enum',
    values: <String>{'de', 'en', 'fr', 'ja', 'nl', 'unknown'},
  ),
  'schema_version': AnalyticsPropertyRule(type: 'integer', values: null),
};

const analyticsEventRegistry = <String, Map<String, AnalyticsPropertyRule>>{
  'app_opened': <String, AnalyticsPropertyRule>{},
  'onboarding_started': <String, AnalyticsPropertyRule>{
    'entry_point': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'fresh_install', 'signed_out'},
    ),
  },
  'onboarding_step_viewed': <String, AnalyticsPropertyRule>{
    'step': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{
        'welcome',
        'consent',
        'passphrase',
        'profile_setup',
        'study_code',
      },
    ),
  },
  'onboarding_step_completed': <String, AnalyticsPropertyRule>{
    'step': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{
        'welcome',
        'consent',
        'passphrase',
        'profile_setup',
        'study_code',
      },
    ),
  },
  'onboarding_completed': <String, AnalyticsPropertyRule>{
    'study_code_used': AnalyticsPropertyRule(type: 'boolean', values: null),
  },
  'habit_creation_started': <String, AnalyticsPropertyRule>{
    'entry_point': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'my_habits', 'recommendation', 'auto'},
    ),
  },
  'habit_behavior_selected': <String, AnalyticsPropertyRule>{
    'habit_type': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'build', 'quit'},
    ),
    'behavior_source': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'catalog', 'free_text', 'recommendation'},
    ),
  },
  'habit_cue_selected': <String, AnalyticsPropertyRule>{
    'cue_source': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{
        'self_selected',
        'pre_rated',
        'recommendation',
        'stacked',
      },
    ),
  },
  'habit_stitch_shown': <String, AnalyticsPropertyRule>{
    'creation_mode': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'standalone', 'stacked'},
    ),
  },
  'habit_stitch_accepted': <String, AnalyticsPropertyRule>{
    'creation_mode': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'standalone', 'stacked'},
    ),
  },
  'habit_created': <String, AnalyticsPropertyRule>{
    'creation_mode': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'standalone', 'stacked'},
    ),
    'from_recommendation': AnalyticsPropertyRule(type: 'boolean', values: null),
  },
  'habit_creation_blocked': <String, AnalyticsPropertyRule>{
    'reason': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'information_overload', 'study_limit', 'study_disabled'},
    ),
  },
  'recommendation_viewed': <String, AnalyticsPropertyRule>{
    'recommendation_id': AnalyticsPropertyRule(type: 'opaque_id', values: null),
    'count': AnalyticsPropertyRule(type: 'integer', values: null),
  },
  'recommendation_requested': <String, AnalyticsPropertyRule>{},
  'recommendation_adopted': <String, AnalyticsPropertyRule>{
    'recommendation_id': AnalyticsPropertyRule(type: 'opaque_id', values: null),
  },
  'recommendation_feedback_submitted': <String, AnalyticsPropertyRule>{
    'recommendation_id': AnalyticsPropertyRule(type: 'opaque_id', values: null),
  },
  'recommendation_generated': <String, AnalyticsPropertyRule>{
    'latency_ms': AnalyticsPropertyRule(type: 'integer', values: null),
    'count': AnalyticsPropertyRule(type: 'integer', values: null),
    'cache_hit': AnalyticsPropertyRule(type: 'boolean', values: null),
  },
  'recommendation_failed': <String, AnalyticsPropertyRule>{
    'latency_ms': AnalyticsPropertyRule(type: 'integer', values: null),
    'reason': AnalyticsPropertyRule(
      type: 'enum',
      values: <String>{'timeout', 'upstream_error', 'unavailable'},
    ),
  },
  'enrollment_completed': <String, AnalyticsPropertyRule>{
    'study_code_used': AnalyticsPropertyRule(type: 'boolean', values: null),
  },
};
