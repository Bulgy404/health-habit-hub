/// Summary record returned by GET /api/v1/admin/questionnaires.
class AdminQuestionnaire {
  /// Creates an [AdminQuestionnaire].
  const AdminQuestionnaire({
    required this.id,
    this.slug,
    required this.title,
    required this.description,
    required this.version,
    required this.active,
    required this.isLibrary,
    required this.questionCount,
    this.updatedAt,
  });

  /// Unique questionnaire identifier.
  final String id;

  /// Optional URL-friendly slug.
  final String? slug;

  /// Human-readable questionnaire title.
  final String title;

  /// Brief description of the questionnaire's purpose.
  final String description;

  /// Version string (e.g. `'1'`, `'2.0'`).
  final String version;

  /// Whether the questionnaire is active and can be assigned to surveys.
  final bool active;

  /// True for pre-loaded validated instruments (SLIQ, RAND-36, SRHI).
  final bool isLibrary;

  /// Number of questions in this questionnaire.
  final int questionCount;

  /// ISO 8601 timestamp of the last update (nullable).
  final String? updatedAt;

  /// Deserialises an [AdminQuestionnaire] from the API JSON payload.
  factory AdminQuestionnaire.fromJson(Map<String, dynamic> json) {
    return AdminQuestionnaire(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      slug: json['slug']?.toString(),
      title: (json['title'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      version: (json['version'] ?? '1').toString(),
      active: json['active'] != false,
      isLibrary: json['isLibrary'] == true,
      questionCount: (json['questionCount'] as num?)?.toInt() ?? 0,
      updatedAt: json['updatedAt']?.toString(),
    );
  }
}

/// A single question inside a questionnaire definition.
class QuestionDefinition {
  /// Creates a [QuestionDefinition].
  const QuestionDefinition({
    required this.id,
    required this.text,
    required this.type,
    required this.required,
    this.options = const [],
  });

  /// Unique question identifier within this questionnaire.
  final String id;

  /// Question text shown to the participant.
  final String text;

  /// One of: `single_choice`, `multi_choice`, `scale`, `text`.
  final String type;

  /// Whether an answer is required before the form can be submitted.
  final bool required;

  /// Answer options for choice and scale question types.
  final List<Map<String, String>> options;

  /// Deserialises a [QuestionDefinition] from JSON.
  factory QuestionDefinition.fromJson(Map<String, dynamic> json) {
    return QuestionDefinition(
      id: (json['id'] ?? '').toString(),
      text: (json['text'] ?? '').toString(),
      type: (json['type'] ?? 'text').toString(),
      required: json['required'] != false,
      options: (json['options'] as List<dynamic>? ?? [])
          .map((o) => (o as Map<String, dynamic>)
              .map((k, v) => MapEntry(k, v.toString())))
          .toList(),
    );
  }

  /// Serialises this question definition to JSON.
  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'type': type,
        'required': required,
        if (options.isNotEmpty) 'options': options,
      };
}
