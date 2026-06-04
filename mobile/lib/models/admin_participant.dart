/// Minimal participant record as returned by
/// GET /api/v1/admin/participants.
class AdminParticipant {
  /// Creates an [AdminParticipant].
  const AdminParticipant({
    required this.id,
    required this.username,
    required this.group,
    this.enrolledAt,
    this.lastActiveAt,
    this.surveysCompleted,
    this.surveysTotal,
  });

  /// Unique user identifier.
  final String id;

  /// Keycloak username for this participant.
  final String username;

  /// Study group the participant belongs to.
  final String group;

  /// Timestamp when the participant enrolled, or null if unknown.
  final DateTime? enrolledAt;

  /// Timestamp of the participant's most recent activity, or null if unknown.
  final DateTime? lastActiveAt;

  /// Number of surveys the participant has completed.
  final int? surveysCompleted;

  /// Total number of surveys assigned to this participant.
  final int? surveysTotal;

  /// Deserialises from the admin participants list API response.
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
