/// Model representing a completed survey result submitted by a user.
class SurveyResult {
  final String surveyId;
  final String userId;
  final Map<String, dynamic> answers;
  final DateTime completedAt;

  const SurveyResult({
    required this.surveyId,
    required this.userId,
    required this.answers,
    required this.completedAt,
  });

  factory SurveyResult.fromJson(Map<String, dynamic> json) {
    return SurveyResult(
      surveyId: json['surveyId'] as String,
      userId: json['userId'] as String,
      answers: (json['answers'] as Map<String, dynamic>?) ?? {},
      completedAt: DateTime.parse(json['completedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'surveyId': surveyId,
        'userId': userId,
        'answers': answers,
        'completedAt': completedAt.toIso8601String(),
      };
}
