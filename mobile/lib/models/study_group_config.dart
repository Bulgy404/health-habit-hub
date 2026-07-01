/// Resolved per-group study configuration for the current participant.
///
/// Returned by GET /api/v1/study-config/me. Null means the user is not
/// enrolled in any study (public / app-store path).
library;

class StudyGroupConfig {
  /// Creates a [StudyGroupConfig].
  const StudyGroupConfig({
    required this.studyId,
    required this.studyName,
    this.groupId,
    this.groupLabel,
    this.recommenderEnabled = true,
    this.cueConfig,
    this.activityTypeConfig,
    this.reminderConfig,
    this.autoDonate = false,
  });

  /// MongoDB study ID.
  final String studyId;

  /// Human-readable study name.
  final String studyName;

  /// Assigned group ID within the study.
  final String? groupId;

  /// Human-readable group label.
  final String? groupLabel;

  /// Whether the recommender screen is shown in this study.
  final bool recommenderEnabled;

  /// Cue configuration override (null = use platform defaults).
  final CueGroupConfig? cueConfig;

  /// Activity type restriction config (null = all types allowed).
  final ActivityTypeGroupConfig? activityTypeConfig;

  /// Reminder settings override (null = user chooses their own time).
  final ReminderGroupConfig? reminderConfig;

  /// When true, habits are automatically donated to the community on creation.
  final bool autoDonate;

  factory StudyGroupConfig.fromJson(Map<String, dynamic> json) =>
      StudyGroupConfig(
        studyId: json['studyId'] as String,
        studyName: json['studyName'] as String,
        groupId: json['groupId'] as String?,
        groupLabel: json['groupLabel'] as String?,
        recommenderEnabled: json['recommenderEnabled'] as bool? ?? true,
        cueConfig: json['cueConfig'] != null
            ? CueGroupConfig.fromJson(
                json['cueConfig'] as Map<String, dynamic>)
            : null,
        activityTypeConfig: json['activityTypeConfig'] != null
            ? ActivityTypeGroupConfig.fromJson(
                json['activityTypeConfig'] as Map<String, dynamic>)
            : null,
        reminderConfig: json['reminderConfig'] != null
            ? ReminderGroupConfig.fromJson(
                json['reminderConfig'] as Map<String, dynamic>)
            : null,
        autoDonate: json['autoDonate'] as bool? ?? false,
      );
}

/// Cue configuration from the study group.
class CueGroupConfig {
  const CueGroupConfig({
    required this.restricted,
    this.cueCount,
    this.cueSource,
    this.cuePoolId,
    this.behaviorOptions,
    this.maxHabits,
  });

  /// Whether cue selection is restricted to the configured pool.
  final bool restricted;
  final String? cueCount;
  final String? cueSource;
  final String? cuePoolId;
  final List<String>? behaviorOptions;
  final int? maxHabits;

  factory CueGroupConfig.fromJson(Map<String, dynamic> json) => CueGroupConfig(
        restricted: json['restricted'] as bool? ?? false,
        cueCount: json['cueCount'] as String?,
        cueSource: json['cueSource'] as String?,
        cuePoolId: json['cuePoolId'] as String?,
        behaviorOptions:
            (json['behaviorOptions'] as List<dynamic>?)?.cast<String>(),
        maxHabits: json['maxHabits'] as int?,
      );
}

/// Activity type restriction config from the study group.
class ActivityTypeGroupConfig {
  const ActivityTypeGroupConfig({
    required this.restricted,
    this.allowedActivityTypeIds = const [],
  });

  /// Whether activity types are restricted to [allowedActivityTypeIds].
  final bool restricted;

  /// IDs of activity types the participant may choose from.
  final List<String> allowedActivityTypeIds;

  factory ActivityTypeGroupConfig.fromJson(Map<String, dynamic> json) =>
      ActivityTypeGroupConfig(
        restricted: json['restricted'] as bool? ?? false,
        allowedActivityTypeIds:
            (json['allowedActivityTypeIds'] as List<dynamic>?)?.cast<String>() ??
                const [],
      );
}

/// Reminder configuration from the study group.
class ReminderGroupConfig {
  const ReminderGroupConfig({
    required this.enabled,
    this.fixedTime,
  });

  /// Whether reminders are enabled for this group.
  final bool enabled;

  /// Fixed reminder time in "HH:MM" format, or null if user chooses their own.
  final String? fixedTime;

  factory ReminderGroupConfig.fromJson(Map<String, dynamic> json) =>
      ReminderGroupConfig(
        enabled: json['enabled'] as bool? ?? true,
        fixedTime: json['fixedTime'] as String?,
      );
}
