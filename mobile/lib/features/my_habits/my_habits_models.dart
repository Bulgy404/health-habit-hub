/// Data models for the My Habits feature.
library;

// mobile/lib/features/my_habits/my_habits_models.dart

/// A single SRHI item (id, English text, German text).
class SrhiItem {
  /// Creates a [SrhiItem].
  const SrhiItem({
    required this.id,
    required this.en,
    required this.de,
  });

  /// Unique question identifier.
  final String id;

  /// Question text in English.
  final String en;

  /// Question text in German.
  final String de;

  /// Deserialises from JSON.
  factory SrhiItem.fromJson(Map<String, dynamic> json) => SrhiItem(
        id: json['id'] as String,
        en: json['en'] as String,
        de: json['de'] as String,
      );
}

/// Resolved cue configuration returned by GET /api/v1/me/habit-config.
class HabitConfig {
  /// Creates a [HabitConfig].
  const HabitConfig({
    required this.cueCount,
    required this.cueSource,
    this.cuePoolId,
    required this.behaviorOptions,
    this.maxHabits,
    required this.srhiItems,
    this.assignedCues = const [],
    this.recommenderEnabled = true,
    this.guidedHabitCreationEnabled = true,
    this.communityShareDefault = true,
    this.onboardingEnabled = true,
    this.selfHabitCreationEnabled = true,
  });

  /// Cue count mode: `'single'` or `'multi'`.
  final String cueCount;

  /// Cue source: `'low_quality'`, `'high_quality'`, or `'self_selected'`.
  final String cueSource;

  /// Optional pool ID for pre-rated cues.
  final String? cuePoolId;

  /// Behaviour keys the participant may choose from.
  final List<String> behaviorOptions;

  /// Maximum allowed intentions; `null` = unlimited (public user).
  final int? maxHabits;

  /// SRHI question items to present at each weekly check-in.
  final List<SrhiItem> srhiItems;

  /// Cues pre-assigned by the study coordinator (empty for self-selected).
  final List<IntentionCue> assignedCues;

  /// Whether the recommender feature is enabled for this participant's study.
  /// Defaults to `true` (enabled) when absent, for backward compatibility.
  final bool recommenderEnabled;

  /// Whether the guided implementation-intention wizard (LLM stitch step) is
  /// enabled. When false, users compose their plan sentence as free text.
  /// Platform-wide flag set in the admin portal (Public App settings).
  /// Defaults to `true` when absent, for backward compatibility.
  final bool guidedHabitCreationEnabled;

  /// Whether the community-sharing opt-in is shown (pre-selected) at the end
  /// of habit creation. Platform-wide flag set in the admin portal (Public
  /// App settings). Defaults to `true` when absent, for backward
  /// compatibility.
  final bool communityShareDefault;

  /// Whether the first-time habit-creation onboarding (educational explainers
  /// for what a habit is and what cues are) should be shown. Resolved from the
  /// participant's study/group; defaults to `true` for public users.
  final bool onboardingEnabled;

  /// Whether the participant may create their own habits. When `false`, the
  /// "add habit" entry point is hidden. Resolved from the participant's
  /// study/group; defaults to `true` for public users.
  final bool selfHabitCreationEnabled;

  /// Deserialises from the habit-config API response.
  factory HabitConfig.fromJson(Map<String, dynamic> json) => HabitConfig(
        cueCount: json['cueCount'] as String? ?? 'multi',
        cueSource: json['cueSource'] as String? ?? 'high_quality',
        cuePoolId: json['cuePoolId'] as String?,
        behaviorOptions: (json['behaviorOptions'] as List<dynamic>?)
                ?.cast<String>() ??
            const [],
        maxHabits: json['maxHabits'] as int?,
        srhiItems: (json['srhiItems'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(SrhiItem.fromJson)
                .toList() ??
            const [],
        assignedCues: (json['assignedCues'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(IntentionCue.fromJson)
                .toList() ??
            const [],
        recommenderEnabled: json['recommenderEnabled'] as bool? ?? true,
        guidedHabitCreationEnabled:
            json['guidedHabitCreationEnabled'] as bool? ?? true,
        communityShareDefault:
            json['communityShareDefault'] as bool? ?? true,
        onboardingEnabled: json['onboardingEnabled'] as bool? ?? true,
        selfHabitCreationEnabled:
            json['selfHabitCreationEnabled'] as bool? ?? true,
      );
}

/// A single cue attached to an implementation intention.
class IntentionCue {
  /// Creates an [IntentionCue].
  const IntentionCue({
    required this.text,
    required this.source,
    this.cueId,
  });

  /// Human-readable cue text (e.g. `'After my morning coffee'`).
  final String text;

  /// Cue provenance: `'pre_rated'` or `'self_selected'`.
  final String source;

  /// Backend ID of the cue when sourced from a cue pool.
  final String? cueId;

  /// Deserialises from JSON.
  factory IntentionCue.fromJson(Map<String, dynamic> json) => IntentionCue(
        text: json['text'] as String,
        source: json['source'] as String,
        cueId: json['cueId'] as String?,
      );

  /// Serialises to JSON.
  Map<String, dynamic> toJson() => {
        'text': text,
        'source': source,
        if (cueId != null) 'cueId': cueId,
      };
}

/// An implementation intention created by the user.
class Intention {
  /// Creates an [Intention].
  const Intention({
    required this.id,
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.durationMinutes,
    required this.cues,
    required this.intentionStatement,
    required this.status,
    required this.createdAt,
  });

  /// Unique intention identifier.
  final String id;

  /// Key identifying the target behaviour (e.g. `'walking'`).
  final String behaviorKey;

  /// Human-readable behaviour label shown in the UI.
  final String behaviorLabel;

  /// Planned duration of each session in minutes.
  final int durationMinutes;

  /// Implementation intention cues attached to this intention.
  final List<IntentionCue> cues;

  /// Full if-then implementation intention statement.
  final String intentionStatement;

  /// Lifecycle status: `'active'`, `'paused'`, `'completed'`, or `'abandoned'`.
  final String status;

  /// Timestamp when the intention was created.
  final DateTime createdAt;

  /// Deserialises from the intentions API response.
  factory Intention.fromJson(Map<String, dynamic> json) => Intention(
        id: (json['_id'] ?? json['id']) as String,
        behaviorKey: json['behaviorKey'] as String,
        behaviorLabel: json['behaviorLabel'] as String,
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        cues: (json['cues'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .map(IntentionCue.fromJson)
            .toList(),
        intentionStatement: json['intentionStatement'] as String,
        status: json['status'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

/// A single daily behavior log entry.
class DailyLog {
  /// Creates a [DailyLog].
  const DailyLog({
    required this.intentionId,
    required this.date,
    required this.enacted,
    required this.loggedAt,
  });

  /// Identifier of the intention this log belongs to.
  final String intentionId;

  /// Date of the log in `'YYYY-MM-DD'` format.
  final String date;

  /// Whether the habit was enacted on this day.
  final bool enacted;

  /// Timestamp when the log was submitted.
  final DateTime loggedAt;

  /// Deserialises from the daily logs API response.
  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
        intentionId: json['intentionId'] as String,
        date: json['date'] as String,
        enacted: json['enacted'] as bool,
        loggedAt: DateTime.parse(json['loggedAt'] as String),
      );
}

/// An open SRHI measurement window (due for submission).
class SrhiWindow {
  /// Creates an [SrhiWindow].
  const SrhiWindow({
    required this.id,
    required this.intentionId,
    required this.weekNumber,
    required this.scheduledFor,
    this.submittedAt,
    this.score,
  });

  /// Unique window identifier.
  final String id;

  /// Identifier of the intention this window belongs to.
  final String intentionId;

  /// Study week number for this check-in.
  final int weekNumber;

  /// Scheduled submission date.
  final DateTime scheduledFor;

  /// Timestamp when this window was submitted (null if still open).
  final DateTime? submittedAt;

  /// Computed SRHI score after submission (null if not yet submitted).
  final double? score;

  /// Deserialises from the SRHI windows API response.
  factory SrhiWindow.fromJson(Map<String, dynamic> json) => SrhiWindow(
        id: json['id'] as String,
        intentionId: json['intentionId'] as String,
        weekNumber: (json['weekNumber'] as num).toInt(),
        scheduledFor: DateTime.parse(json['scheduledFor'] as String),
        submittedAt: json['submittedAt'] != null
            ? DateTime.parse(json['submittedAt'] as String)
            : null,
        score: json['score'] != null ? (json['score'] as num).toDouble() : null,
      );
}

/// One data point in the SRHI trajectory for a habit.
class SrhiTrajectoryPoint {
  /// Creates an [SrhiTrajectoryPoint].
  const SrhiTrajectoryPoint({
    required this.weekNumber,
    this.score,
    this.submittedAt,
  });

  /// Study week number for this data point.
  final int weekNumber;

  /// SRHI score (1–7 scale average) for this week, or `null` if missing.
  final double? score;

  /// Timestamp when this measurement was submitted.
  final DateTime? submittedAt;

  /// Deserialises from JSON.
  factory SrhiTrajectoryPoint.fromJson(Map<String, dynamic> json) =>
      SrhiTrajectoryPoint(
        weekNumber: (json['weekNumber'] as num).toInt(),
        score:
            json['score'] != null ? (json['score'] as num).toDouble() : null,
        submittedAt: json['submittedAt'] != null
            ? DateTime.parse(json['submittedAt'] as String)
            : null,
      );
}
