// Minimal survey record as returned by GET /api/v1/admin/surveys.
class AdminSurvey {
  const AdminSurvey({
    required this.id,
    required this.title,
    required this.type,
    required this.status,
    required this.assignedGroups,
    required this.jsonSchema,
  });

  final String id;
  final String title;

  /// One of: habit-donation, profile, custom
  final String type;

  /// One of: draft, published, archived
  final String status;

  final List<String> assignedGroups;
  final Map<String, dynamic> jsonSchema;

  factory AdminSurvey.fromJson(Map<String, dynamic> json) {
    return AdminSurvey(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      type: (json['type'] ?? '').toString(),
      status: (json['status'] ?? 'draft').toString(),
      assignedGroups: (json['assignedGroups'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      jsonSchema: (json['jsonSchema'] as Map<String, dynamic>?) ?? {},
    );
  }
}
