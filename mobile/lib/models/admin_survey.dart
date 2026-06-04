/// Minimal survey record as returned by GET /api/v1/admin/surveys.
class AdminSurvey {
  /// Creates an [AdminSurvey].
  const AdminSurvey({
    required this.id,
    required this.title,
    required this.type,
    required this.status,
    required this.targetMode,
    required this.assignedGroups,
    required this.jsonSchema,
  });

  /// Unique survey identifier.
  final String id;

  /// Human-readable survey title.
  final String title;

  /// One of: `habit-donation`, `profile`, `custom`.
  final String type;

  /// One of: `draft`, `published`, `archived`.
  final String status;

  /// One of: `all_participants`, `unassigned_only`, `group_assigned`.
  final String targetMode;

  /// Study group identifiers this survey is restricted to (when [targetMode]
  /// is `group_assigned`).
  final List<String> assignedGroups;

  /// Raw JSON schema defining the survey structure.
  final Map<String, dynamic> jsonSchema;

  /// Deserialises an [AdminSurvey] from the API JSON payload.
  factory AdminSurvey.fromJson(Map<String, dynamic> json) {
    return AdminSurvey(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      type: (json['type'] ?? '').toString(),
      status: (json['status'] ?? 'draft').toString(),
      targetMode: (json['targetMode'] ??
              (((json['assignedGroups'] as List<dynamic>?) ?? []).isNotEmpty
                  ? 'group_assigned'
                  : ((json['type'] ?? '').toString() == 'habit-donation'
                      ? 'all_participants'
                      : 'unassigned_only')))
          .toString(),
      assignedGroups: (json['assignedGroups'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      jsonSchema: (json['jsonSchema'] as Map<String, dynamic>?) ?? {},
    );
  }
}
