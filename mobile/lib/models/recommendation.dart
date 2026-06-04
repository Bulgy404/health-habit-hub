/// RAG citation attached to a recommendation.
class RagCitation {
  /// Title of the source document.
  final String sourceTitle;

  /// Relevant excerpt from the source document.
  final String excerpt;

  /// Creates a [RagCitation].
  const RagCitation({required this.sourceTitle, required this.excerpt});

  /// Deserialises from JSON.
  factory RagCitation.fromJson(Map<String, dynamic> json) {
    return RagCitation(
      sourceTitle: (json['sourceTitle'] ?? '').toString(),
      excerpt: (json['excerpt'] ?? '').toString(),
    );
  }

  /// Serialises to JSON.
  Map<String, dynamic> toJson() => {
        'sourceTitle': sourceTitle,
        'excerpt': excerpt,
      };
}

/// A habit recommendation from the recommender service.
class Recommendation {
  /// Unique recommendation identifier.
  final String id;

  /// Human-readable habit name.
  final String habitName;

  /// Habit category label.
  final String category;

  /// Model confidence score in the range 0.0–1.0.
  final double confidenceScore;

  /// Explanation for why this habit was recommended.
  final String rationale;

  /// Optional RAG citation supporting the recommendation.
  final RagCitation? ragCitation;

  /// Creates a [Recommendation].
  const Recommendation({
    required this.id,
    required this.habitName,
    required this.category,
    required this.confidenceScore,
    required this.rationale,
    this.ragCitation,
  });

  /// Deserialises from the recommender API response.
  factory Recommendation.fromJson(Map<String, dynamic> json) {
    final ragJson = json['ragCitation'] as Map<String, dynamic>?;
    return Recommendation(
      id: (json['id'] ?? '').toString(),
      habitName: (json['habitName'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      confidenceScore: ((json['confidenceScore'] as num?) ?? 0).toDouble(),
      rationale: (json['rationale'] ?? '').toString(),
      ragCitation: ragJson != null ? RagCitation.fromJson(ragJson) : null,
    );
  }

  /// Serialises to JSON.
  Map<String, dynamic> toJson() => {
        'id': id,
        'habitName': habitName,
        'category': category,
        'confidenceScore': confidenceScore,
        'rationale': rationale,
        if (ragCitation != null) 'ragCitation': ragCitation!.toJson(),
      };
}
