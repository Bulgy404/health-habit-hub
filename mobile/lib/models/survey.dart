/// Model representing a survey definition from the backend.
class Survey {
  /// Unique survey identifier.
  final String id;

  /// Human-readable survey title.
  final String title;

  /// Survey type key (e.g. `'questionnaire'`, `'srhi'`).
  final String type;

  /// JSON Schema defining the survey's questions and structure.
  final Map<String, dynamic> jsonSchema;

  /// Study group IDs this survey is assigned to.
  final List<String> assignedGroups;

  /// Lifecycle status: `'active'` or `'archived'`.
  final String status;

  /// Creates a [Survey].
  const Survey({
    required this.id,
    required this.title,
    required this.type,
    required this.jsonSchema,
    required this.assignedGroups,
    required this.status,
  });

  /// Deserialises from the surveys API response.
  factory Survey.fromJson(Map<String, dynamic> json) {
    return Survey(
      id: (json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      type: (json['type'] ?? '').toString(),
      jsonSchema: (json['jsonSchema'] as Map<String, dynamic>?) ?? {},
      assignedGroups: (json['assignedGroups'] as List<dynamic>?)
              ?.cast<String>() ??
          [],
      status: json['status'] as String? ?? 'active',
    );
  }

  /// Serialises to JSON.
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'type': type,
        'jsonSchema': jsonSchema,
        'assignedGroups': assignedGroups,
        'status': status,
      };
}
