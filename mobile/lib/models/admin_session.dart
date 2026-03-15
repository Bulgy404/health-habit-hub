// Model for an active device session returned by GET /api/v1/admin/sessions.
class AdminSession {
  const AdminSession({
    required this.id,
    required this.participantId,
    required this.deviceType,
    required this.appVersion,
    required this.lastSeen,
  });

  factory AdminSession.fromJson(Map<String, dynamic> json) {
    return AdminSession(
      id: (json['id'] ?? json['sessionId'] ?? '') as String,
      participantId: (json['participantId'] ?? json['userId'] ?? '') as String,
      deviceType: (json['deviceType'] ?? 'unknown') as String,
      appVersion: (json['appVersion'] ?? '') as String,
      lastSeen: json['lastSeen'] != null
          ? DateTime.tryParse(json['lastSeen'] as String) ?? DateTime(0)
          : DateTime(0),
    );
  }

  final String id;
  final String participantId;
  final String deviceType;
  final String appVersion;
  final DateTime lastSeen;
}
