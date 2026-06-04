/// Model representing a completed survey result submitted by a user.
class SurveyResult {
  /// Identifier of the survey that was completed.
  final String surveyId;

  /// Identifier of the user who submitted the result.
  final String userId;

  /// Map of question IDs to submitted answer values.
  final Map<String, dynamic> answers;

  /// Timestamp when the survey was completed.
  final DateTime completedAt;

  /// Creates a [SurveyResult].
  const SurveyResult({
    required this.surveyId,
    required this.userId,
    required this.answers,
    required this.completedAt,
  });

  /// Deserialises from the survey results API response.
  factory SurveyResult.fromJson(Map<String, dynamic> json) {
    return SurveyResult(
      surveyId: json['surveyId'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      answers: (json['answers'] as Map<String, dynamic>?) ?? {},
      completedAt: DateTime.parse(json['completedAt'] as String),
    );
  }

  /// Serialises to JSON.
  Map<String, dynamic> toJson() => {
        'surveyId': surveyId,
        'userId': userId,
        'answers': answers,
        'completedAt': completedAt.toIso8601String(),
      };
}
