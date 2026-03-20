/// Source reference attached to a recommendation item.
class RecommendationSourceRef {
  final String filename;
  final String excerpt;

  const RecommendationSourceRef({
    required this.filename,
    required this.excerpt,
  });

  factory RecommendationSourceRef.fromJson(Map<String, dynamic> json) {
    return RecommendationSourceRef(
      filename: json['filename'] as String? ?? '',
      excerpt: json['excerpt'] as String? ?? '',
    );
  }
}

/// A single recommendation item.
class RecommendationItem {
  final String title;
  final String body;
  final String rationale;
  final List<RecommendationSourceRef> sources;

  const RecommendationItem({
    required this.title,
    required this.body,
    required this.rationale,
    required this.sources,
  });

  factory RecommendationItem.fromJson(Map<String, dynamic> json) {
    final sourcesJson = json['sources'] as List<dynamic>? ?? [];
    return RecommendationItem(
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      rationale: json['rationale'] as String? ?? '',
      sources: sourcesJson
          .cast<Map<String, dynamic>>()
          .map(RecommendationSourceRef.fromJson)
          .toList(),
    );
  }
}

/// Full response from the recommendation API.
class RecommendationResponse {
  final String recommendationId;
  final String goal;
  final List<RecommendationItem> recommendations;

  const RecommendationResponse({
    required this.recommendationId,
    required this.goal,
    required this.recommendations,
  });

  factory RecommendationResponse.fromJson(Map<String, dynamic> json) {
    final recsJson = json['recommendations'] as List<dynamic>? ?? [];
    return RecommendationResponse(
      recommendationId: json['recommendation_id'] as String? ?? '',
      goal: json['goal'] as String? ?? '',
      recommendations: recsJson
          .cast<Map<String, dynamic>>()
          .map(RecommendationItem.fromJson)
          .toList(),
    );
  }
}
