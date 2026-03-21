/// Model representing a survey definition from the backend.
class Survey {
  final String id;
  final String title;
  final String type;
  final Map<String, dynamic> jsonSchema;
  final List<String> assignedGroups;
  final String status;

  const Survey({
    required this.id,
    required this.title,
    required this.type,
    required this.jsonSchema,
    required this.assignedGroups,
    required this.status,
  });

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

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'type': type,
        'jsonSchema': jsonSchema,
        'assignedGroups': assignedGroups,
        'status': status,
      };
}
