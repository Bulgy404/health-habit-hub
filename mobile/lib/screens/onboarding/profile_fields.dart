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

// Used by personal_info_screen.dart (settings) which retains hardcoded age/gender pickers.
/// Available gender options as `(value, label)` pairs.
const profileGenderOptions = [
  ('male', 'Male'),
  ('female', 'Female'),
  ('non_binary', 'Non-binary'),
  ('prefer_not_to_say', 'Prefer not to say'),
];

/// Returns a human-readable age bucket label for [age] (e.g. `'18–24'`).
String profileAgeBucketLabel(int age) {
  if (age < 18) return 'Under 18';
  if (age <= 24) return '18–24';
  if (age <= 34) return '25–34';
  if (age <= 44) return '35–44';
  if (age <= 54) return '45–54';
  if (age <= 64) return '55–64';
  return '65+';
}

/// Returns the display label for the given gender [value], or null if not found.
String? profileGenderLabel(String? value) => profileGenderOptions
    .where((o) => o.$1 == value)
    .map((o) => o.$2)
    .firstOrNull;
