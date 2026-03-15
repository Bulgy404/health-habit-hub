/// Minimal participant record as returned by
/// GET /api/v1/admin/participants.
class AdminParticipant {
  const AdminParticipant({
    required this.id,
    required this.username,
    required this.group,
    this.enrolledAt,
    this.lastActiveAt,
    this.surveysCompleted,
    this.surveysTotal,
  });

  final String id;
  final String username;
  final String group;
  final DateTime? enrolledAt;
  final DateTime? lastActiveAt;
  final int? surveysCompleted;
  final int? surveysTotal;

  factory AdminParticipant.fromJson(Map<String, dynamic> json) {
    return AdminParticipant(
      id: (json['userId'] ?? json['_id'] ?? '').toString(),
      username: (json['username'] ?? '').toString(),
      group: (json['group'] ?? '').toString(),
      enrolledAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      lastActiveAt: json['lastActiveAt'] != null
          ? DateTime.tryParse(json['lastActiveAt'].toString())
          : null,
      surveysCompleted: json['surveysCompleted'] as int?,
      surveysTotal: json['surveysTotal'] as int?,
    );
  }
}
