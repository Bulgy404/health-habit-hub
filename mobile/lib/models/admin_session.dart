/// Model for an active device session returned by GET /api/v1/admin/sessions.
class AdminSession {
  /// Creates an [AdminSession].
  const AdminSession({
    required this.id,
    required this.participantId,
    required this.deviceType,
    required this.appVersion,
    required this.lastSeen,
  });

  /// Deserialises an [AdminSession] from JSON.
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

  /// Unique session identifier.
  final String id;

  /// Identifier of the participant who owns this session.
  final String participantId;

  /// Device platform string (e.g. `'android'`, `'ios'`).
  final String deviceType;

  /// App version string reported by the device.
  final String appVersion;

  /// Timestamp of the most recent activity for this session.
  final DateTime lastSeen;
}
