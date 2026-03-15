/// RAG citation attached to a recommendation.
class RagCitation {
  final String sourceTitle;
  final String excerpt;

  const RagCitation({required this.sourceTitle, required this.excerpt});

  factory RagCitation.fromJson(Map<String, dynamic> json) {
    return RagCitation(
      sourceTitle: json['sourceTitle'] as String,
      excerpt: json['excerpt'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'sourceTitle': sourceTitle,
        'excerpt': excerpt,
      };
}

/// A habit recommendation from the recommender service.
class Recommendation {
  final String id;
  final String habitName;
  final String category;
  final double confidenceScore;
  final String rationale;
  final RagCitation? ragCitation;

  const Recommendation({
    required this.id,
    required this.habitName,
    required this.category,
    required this.confidenceScore,
    required this.rationale,
    this.ragCitation,
  });

  factory Recommendation.fromJson(Map<String, dynamic> json) {
    final ragJson = json['ragCitation'] as Map<String, dynamic>?;
    return Recommendation(
      id: json['id'] as String,
      habitName: json['habitName'] as String,
      category: json['category'] as String,
      confidenceScore: (json['confidenceScore'] as num).toDouble(),
      rationale: json['rationale'] as String,
      ragCitation: ragJson != null ? RagCitation.fromJson(ragJson) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'habitName': habitName,
        'category': category,
        'confidenceScore': confidenceScore,
        'rationale': rationale,
        if (ragCitation != null) 'ragCitation': ragCitation!.toJson(),
      };
}
