/// Data models for the recommendation feature.
library;

/// Source reference attached to a recommendation item.
class RecommendationSourceRef {
  /// Source filename (e.g. a research paper slug).
  final String filename;

  /// Relevant excerpt from the source document.
  final String excerpt;

  /// Creates a [RecommendationSourceRef].
  const RecommendationSourceRef({
    required this.filename,
    required this.excerpt,
  });

  /// Deserialises a [RecommendationSourceRef] from JSON.
  factory RecommendationSourceRef.fromJson(Map<String, dynamic> json) {
    return RecommendationSourceRef(
      filename: json['filename'] as String? ?? '',
      excerpt: json['excerpt'] as String? ?? '',
    );
  }
}

/// A single recommendation item.
class RecommendationItem {
  /// Short title of the recommendation.
  final String title;

  /// Full description / action body.
  final String body;

  /// Why this recommendation was made for the user's goal.
  final String rationale;

  /// Evidence sources supporting this recommendation.
  final List<RecommendationSourceRef> sources;

  /// Creates a [RecommendationItem].
  const RecommendationItem({
    required this.title,
    required this.body,
    required this.rationale,
    required this.sources,
  });

  /// Deserialises a [RecommendationItem] from JSON.
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
  /// Unique identifier for this recommendation set.
  final String recommendationId;

  /// The user's stated health goal.
  final String goal;

  /// Ordered list of recommendation items.
  final List<RecommendationItem> recommendations;

  /// Creates a [RecommendationResponse].
  const RecommendationResponse({
    required this.recommendationId,
    required this.goal,
    required this.recommendations,
  });

  /// Deserialises a [RecommendationResponse] from JSON.
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
