// Summary record returned by GET /api/v1/admin/questionnaires.
class AdminQuestionnaire {
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

  final String id;
  final String? slug;
  final String title;
  final String description;
  final String version;
  final bool active;
  final bool isLibrary;
  final int questionCount;
  final String? updatedAt;

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

// A single question inside a questionnaire definition.
class QuestionDefinition {
  const QuestionDefinition({
    required this.id,
    required this.text,
    required this.type,
    required this.required,
    this.options = const [],
  });

  final String id;
  final String text;

  /// One of: single_choice, multi_choice, scale, text
  final String type;
  final bool required;
  final List<Map<String, String>> options;

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

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'type': type,
        'required': required,
        if (options.isNotEmpty) 'options': options,
      };
}
