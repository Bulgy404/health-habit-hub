// mobile/lib/features/my_habits/my_habits_models.dart

/// A single SRHI item (id, English text, German text).
class SrhiItem {
  const SrhiItem({
    required this.id,
    required this.en,
    required this.de,
  });

  final String id;
  final String en;
  final String de;

  factory SrhiItem.fromJson(Map<String, dynamic> json) => SrhiItem(
        id: json['id'] as String,
        en: json['en'] as String,
        de: json['de'] as String,
      );
}

/// Resolved cue configuration returned by GET /api/v1/me/habit-config.
class HabitConfig {
  const HabitConfig({
    required this.cueCount,
    required this.cueSource,
    this.cuePoolId,
    required this.behaviorOptions,
    this.maxHabits,
    required this.srhiItems,
    this.assignedCues = const [],
  });

  /// 'single' or 'multi'
  final String cueCount;

  /// 'low_quality', 'high_quality', or 'self_selected'
  final String cueSource;

  final String? cuePoolId;
  final List<String> behaviorOptions;

  /// null = unlimited (public user). 1 = study participant.
  final int? maxHabits;

  final List<SrhiItem> srhiItems;

  /// Cues pre-assigned by the study coordinator (empty for self-selected).
  final List<IntentionCue> assignedCues;

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
      );
}

/// A single cue attached to an implementation intention.
class IntentionCue {
  const IntentionCue({
    required this.text,
    required this.source,
    this.cueId,
  });

  final String text;

  /// 'pre_rated' or 'self_selected'
  final String source;

  final String? cueId;

  factory IntentionCue.fromJson(Map<String, dynamic> json) => IntentionCue(
        text: json['text'] as String,
        source: json['source'] as String,
        cueId: json['cueId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'text': text,
        'source': source,
        if (cueId != null) 'cueId': cueId,
      };
}

/// An implementation intention created by the user.
class Intention {
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

  final String id;
  final String behaviorKey;
  final String behaviorLabel;
  final int durationMinutes;
  final List<IntentionCue> cues;
  final String intentionStatement;

  /// 'active', 'paused', 'completed', or 'abandoned'
  final String status;

  final DateTime createdAt;

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
  const DailyLog({
    required this.intentionId,
    required this.date,
    required this.enacted,
    required this.loggedAt,
  });

  final String intentionId;

  /// 'YYYY-MM-DD'
  final String date;
  final bool enacted;
  final DateTime loggedAt;

  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
        intentionId: json['intentionId'] as String,
        date: json['date'] as String,
        enacted: json['enacted'] as bool,
        loggedAt: DateTime.parse(json['loggedAt'] as String),
      );
}

/// An open SRHI measurement window (due for submission).
class SrhiWindow {
  const SrhiWindow({
    required this.id,
    required this.intentionId,
    required this.weekNumber,
    required this.scheduledFor,
    this.submittedAt,
    this.score,
  });

  final String id;
  final String intentionId;
  final int weekNumber;
  final DateTime scheduledFor;
  final DateTime? submittedAt;
  final double? score;

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
  const SrhiTrajectoryPoint({
    required this.weekNumber,
    this.score,
    this.submittedAt,
  });

  final int weekNumber;
  final double? score;
  final DateTime? submittedAt;

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
