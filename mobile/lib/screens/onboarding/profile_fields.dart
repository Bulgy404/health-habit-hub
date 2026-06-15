/// Definition of a dynamic profile field returned by the backend.
class ProfileFieldDefinition {
  /// Unique field identifier (e.g. `'birthday'`, `'gender'`).
  final String fieldId;

  /// Human-readable label shown above the input.
  final String label;

  /// Input type: `'text'`, `'number'`, `'date'`, or `'select'`.
  final String type;

  /// Allowed options for `'select'` fields (empty for other types).
  final List<String> options;

  /// Whether the field must be filled before the form can be submitted.
  final bool required;

  /// Display order relative to other fields (ascending).
  final int order;

  /// Creates a [ProfileFieldDefinition].
  const ProfileFieldDefinition({
    required this.fieldId,
    required this.label,
    required this.type,
    required this.options,
    required this.required,
    required this.order,
  });

  /// Deserialises from the profile-field-definitions API response.
  factory ProfileFieldDefinition.fromJson(Map<String, dynamic> json) {
    return ProfileFieldDefinition(
      fieldId: json['fieldId'] as String,
      label: json['label'] as String,
      type: json['type'] as String,
      options: (json['options'] as List<dynamic>?)?.cast<String>() ?? const [],
      required: json['required'] as bool? ?? false,
      order: (json['order'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Formats [d] as a long-form human-readable date (e.g. `'January 1, 2000'`).
String formatDate(DateTime d) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

/// Formats [d] as an ISO 8601 date string (`'YYYY-MM-DD'`).
String isoDate(DateTime d) {
  final y = d.year.toString().padLeft(4, '0');
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}

