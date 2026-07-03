/// Data models for the recommendation feature.
library;

/// Source reference attached to a recommendation item.
///
/// Since the citation rework the backend sends one entry per academic paper:
/// [excerpt] carries the preformatted citation (e.g. "Wood & Rünger (2016) —
/// Psychology of Habit") and [url] links to the paper.
class RecommendationSourceRef {
  /// Source filename (e.g. a research paper slug).
  final String filename;

  /// Preformatted citation string (legacy field name, kept for compatibility).
  final String excerpt;

  /// Paper title, if provided by the backend.
  final String title;

  /// Link to the paper (DOI or scholar search), if provided.
  final String url;

  /// Creates a [RecommendationSourceRef].
  const RecommendationSourceRef({
    required this.filename,
    required this.excerpt,
    this.title = '',
    this.url = '',
  });

  /// Deserialises a [RecommendationSourceRef] from JSON.
  factory RecommendationSourceRef.fromJson(Map<String, dynamic> json) {
    return RecommendationSourceRef(
      filename: json['filename'] as String? ?? '',
      excerpt: json['excerpt'] as String? ?? '',
      title: json['title'] as String? ?? '',
      url: json['url'] as String? ?? '',
    );
  }

  /// Best human-readable label for display.
  String get displayLabel =>
      excerpt.isNotEmpty ? excerpt : (title.isNotEmpty ? title : filename);
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

  /// Suggested "when/where" trigger phrase for the implementation intention.
  final String suggestedCue;

  /// Creates a [RecommendationItem].
  const RecommendationItem({
    required this.title,
    required this.body,
    required this.rationale,
    required this.sources,
    this.suggestedCue = '',
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
      suggestedCue: json['suggested_cue'] as String? ?? '',
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
