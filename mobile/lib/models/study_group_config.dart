/// Resolved per-group study configuration for the current participant.
///
/// Returned by GET /api/v1/study-config/me. Null means the user is not
/// enrolled in any study (public / app-store path).
library;

/// One reminder type's delivery mode.
///
///  - [off]: no reminder; [ReminderModeConfig.time] is null.
///  - [participantChoice]: the participant picks their own time; time is
///    null. Habit reminders only — no participant-facing picker exists for
///    the other 3 reminder types.
///  - [adminFixed]: the admin locks [ReminderModeConfig.time]; the
///    participant has no input at all.
enum ReminderMode { off, participantChoice, adminFixed }

ReminderMode _parseReminderMode(String? raw) {
  switch (raw) {
    case 'participant_choice':
      return ReminderMode.participantChoice;
    case 'admin_fixed':
      return ReminderMode.adminFixed;
    case 'off':
    default:
      return ReminderMode.off;
  }
}

/// One reminder type's resolved mode + time, as returned by the backend's
/// reminderConfigService.resolveEffectiveReminders.
class ReminderModeConfig {
  /// Creates a [ReminderModeConfig].
  const ReminderModeConfig({required this.mode, this.time});

  /// Delivery mode for this reminder type.
  final ReminderMode mode;

  /// "HH:MM" — present for [ReminderMode.adminFixed], null otherwise.
  final String? time;

  /// Deserialises from JSON.
  factory ReminderModeConfig.fromJson(Map<String, dynamic> json) =>
      ReminderModeConfig(
        mode: _parseReminderMode(json['mode'] as String?),
        time: json['time'] as String?,
      );
}

/// Resolved reminders for all 4 types, already merged (group override over
/// study-level default) by the backend.
class RemindersConfig {
  /// Creates a [RemindersConfig].
  const RemindersConfig({
    required this.habit,
    required this.questionnaire,
    required this.endOfStudy,
    required this.studyUpdate,
  });

  /// Habit-creation reminder-time config.
  final ReminderModeConfig habit;

  /// Questionnaire due-date reminder-time config.
  final ReminderModeConfig questionnaire;

  /// End-of-study notification config.
  final ReminderModeConfig endOfStudy;

  /// Recurring study-update broadcast config.
  final ReminderModeConfig studyUpdate;

  /// Deserialises from JSON, defaulting any missing type to off.
  factory RemindersConfig.fromJson(Map<String, dynamic>? json) {
    const off = ReminderModeConfig(mode: ReminderMode.off);
    if (json == null) {
      return const RemindersConfig(
        habit: off,
        questionnaire: off,
        endOfStudy: off,
        studyUpdate: off,
      );
    }
    ReminderModeConfig parse(String key) => json[key] != null
        ? ReminderModeConfig.fromJson(json[key] as Map<String, dynamic>)
        : off;
    return RemindersConfig(
      habit: parse('habit'),
      questionnaire: parse('questionnaire'),
      endOfStudy: parse('endOfStudy'),
      studyUpdate: parse('studyUpdate'),
    );
  }
}

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
    required this.reminders,
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

  /// Resolved reminder config for all 4 types (group override already merged
  /// over the study-level default by the backend).
  final RemindersConfig reminders;

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
        reminders:
            RemindersConfig.fromJson(json['reminders'] as Map<String, dynamic>?),
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
