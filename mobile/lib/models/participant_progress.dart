/// Data models for the GET /api/v1/admin/participants/:id/progress response.
library;

/// Aggregated progress data for a single study participant.
class ParticipantProgress {
  /// Profile completion status.
  final ProfileStatus profile;

  /// Surveys the participant has completed.
  final List<SurveyEntry> surveys;

  /// Number of habits donated by this participant.
  final int habitsCount;

  /// Recommendation interaction counts.
  final RecommendationCounts recommendations;

  /// Chronological activity timeline.
  final List<TimelineEntry> timeline;

  /// Creates a [ParticipantProgress].
  const ParticipantProgress({
    required this.profile,
    required this.surveys,
    required this.habitsCount,
    required this.recommendations,
    required this.timeline,
  });

  /// Deserialises a [ParticipantProgress] from the API JSON payload.
  factory ParticipantProgress.fromJson(Map<String, dynamic> json) {
    final profileJson = (json['profile'] as Map<String, dynamic>?) ?? {};
    final surveysJson = (json['surveys'] as List<dynamic>?) ?? [];
    final recsJson = (json['recommendations'] as Map<String, dynamic>?) ?? {};
    final timelineJson = (json['timeline'] as List<dynamic>?) ?? [];

    return ParticipantProgress(
      profile: ProfileStatus.fromJson(profileJson),
      surveys: surveysJson
          .map((e) => SurveyEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      habitsCount: (json['habitsCount'] as num?)?.toInt() ?? 0,
      recommendations: RecommendationCounts.fromJson(recsJson),
      timeline: timelineJson
          .map((e) => TimelineEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// Serialises this progress object to JSON.
  Map<String, dynamic> toJson() => {
        'profile': {
          'completed': profile.completed,
          'completedAt': profile.completedAt?.toIso8601String(),
        },
        'surveys': surveys
            .map((s) => {
                  'id': s.id,
                  'title': s.title,
                  'completedAt': s.completedAt?.toIso8601String(),
                })
            .toList(),
        'habitsCount': habitsCount,
        'recommendations': {
          'accepted': recommendations.accepted,
          'dismissed': recommendations.dismissed,
        },
        'timeline': timeline
            .map((t) => {
                  'type': t.type,
                  'timestamp': t.timestamp?.toIso8601String(),
                  'detail': t.detail,
                })
            .toList(),
      };
}

/// Profile completion status for a participant.
class ProfileStatus {
  /// Whether the participant has completed their profile.
  final bool completed;

  /// Timestamp when the profile was completed (nullable).
  final DateTime? completedAt;

  /// Creates a [ProfileStatus].
  const ProfileStatus({required this.completed, this.completedAt});

  /// Deserialises a [ProfileStatus] from JSON.
  factory ProfileStatus.fromJson(Map<String, dynamic> json) => ProfileStatus(
        completed: (json['completed'] as bool?) ?? false,
        completedAt: json['completedAt'] != null
            ? DateTime.tryParse(json['completedAt'].toString())
            : null,
      );
}

/// A single survey completed by a participant.
class SurveyEntry {
  /// Survey identifier.
  final String id;

  /// Survey title.
  final String title;

  /// Timestamp when the survey was completed (nullable).
  final DateTime? completedAt;

  /// Creates a [SurveyEntry].
  const SurveyEntry({required this.id, required this.title, this.completedAt});

  /// Deserialises a [SurveyEntry] from JSON.
  factory SurveyEntry.fromJson(Map<String, dynamic> json) => SurveyEntry(
        id: (json['id'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        completedAt: json['completedAt'] != null
            ? DateTime.tryParse(json['completedAt'].toString())
            : null,
      );
}

/// Counts of accepted and dismissed recommendations for a participant.
class RecommendationCounts {
  /// Number of recommendations the participant accepted.
  final int accepted;

  /// Number of recommendations the participant dismissed.
  final int dismissed;

  /// Creates a [RecommendationCounts].
  const RecommendationCounts({required this.accepted, required this.dismissed});

  /// Deserialises [RecommendationCounts] from JSON.
  factory RecommendationCounts.fromJson(Map<String, dynamic> json) =>
      RecommendationCounts(
        accepted: (json['accepted'] as num?)?.toInt() ?? 0,
        dismissed: (json['dismissed'] as num?)?.toInt() ?? 0,
      );
}

/// A single entry in a participant's activity timeline.
class TimelineEntry {
  /// Event type identifier (e.g. `'habit_donated'`, `'survey_completed'`).
  final String type;

  /// Timestamp of the event (nullable).
  final DateTime? timestamp;

  /// Human-readable detail string for the event.
  final String detail;

  /// Creates a [TimelineEntry].
  const TimelineEntry(
      {required this.type, this.timestamp, required this.detail});

  /// Deserialises a [TimelineEntry] from JSON.
  factory TimelineEntry.fromJson(Map<String, dynamic> json) => TimelineEntry(
        type: (json['type'] ?? '').toString(),
        timestamp: json['timestamp'] != null
            ? DateTime.tryParse(json['timestamp'].toString())
            : null,
        detail: (json['detail'] ?? '').toString(),
      );
}
