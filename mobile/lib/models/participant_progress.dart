// Data models for the GET /api/v1/admin/participants/:id/progress response.

class ParticipantProgress {
  final ProfileStatus profile;
  final List<SurveyEntry> surveys;
  final int habitsCount;
  final RecommendationCounts recommendations;
  final List<TimelineEntry> timeline;

  const ParticipantProgress({
    required this.profile,
    required this.surveys,
    required this.habitsCount,
    required this.recommendations,
    required this.timeline,
  });

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

class ProfileStatus {
  final bool completed;
  final DateTime? completedAt;

  const ProfileStatus({required this.completed, this.completedAt});

  factory ProfileStatus.fromJson(Map<String, dynamic> json) => ProfileStatus(
        completed: (json['completed'] as bool?) ?? false,
        completedAt: json['completedAt'] != null
            ? DateTime.tryParse(json['completedAt'].toString())
            : null,
      );
}

class SurveyEntry {
  final String id;
  final String title;
  final DateTime? completedAt;

  const SurveyEntry({required this.id, required this.title, this.completedAt});

  factory SurveyEntry.fromJson(Map<String, dynamic> json) => SurveyEntry(
        id: (json['id'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        completedAt: json['completedAt'] != null
            ? DateTime.tryParse(json['completedAt'].toString())
            : null,
      );
}

class RecommendationCounts {
  final int accepted;
  final int dismissed;

  const RecommendationCounts({required this.accepted, required this.dismissed});

  factory RecommendationCounts.fromJson(Map<String, dynamic> json) =>
      RecommendationCounts(
        accepted: (json['accepted'] as num?)?.toInt() ?? 0,
        dismissed: (json['dismissed'] as num?)?.toInt() ?? 0,
      );
}

class TimelineEntry {
  final String type;
  final DateTime? timestamp;
  final String detail;

  const TimelineEntry(
      {required this.type, this.timestamp, required this.detail});

  factory TimelineEntry.fromJson(Map<String, dynamic> json) => TimelineEntry(
        type: (json['type'] ?? '').toString(),
        timestamp: json['timestamp'] != null
            ? DateTime.tryParse(json['timestamp'].toString())
            : null,
        detail: (json['detail'] ?? '').toString(),
      );
}
