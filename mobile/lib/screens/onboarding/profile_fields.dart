import '../../utils/date_format.dart';

/// A selectable option for a `'select'`-type profile field.
///
/// [value] is a stable machine key (stored as the participant's answer and
/// synced to Neo4j — see `user_profiles` on the backend), independent of the
/// display language; [label] is the localized text shown to the participant,
/// already resolved server-side to the app's current language.
class ProfileFieldOption {
  /// Stable, language-independent answer value.
  final String value;

  /// Display label, resolved to the requested language.
  final String label;

  /// Creates a [ProfileFieldOption].
  const ProfileFieldOption({required this.value, required this.label});

  /// Deserialises from the profile-field-definitions API response.
  factory ProfileFieldOption.fromJson(Map<String, dynamic> json) =>
      ProfileFieldOption(
        value: json['value'] as String,
        label: json['label'] as String,
      );
}

/// Definition of a dynamic profile field returned by the backend.
class ProfileFieldDefinition {
  /// Unique field identifier (e.g. `'birthday'`, `'gender'`).
  final String fieldId;

  /// Human-readable label shown above the input, resolved to the current
  /// app language.
  final String label;

  /// Input type: `'text'`, `'number'`, `'date'`, or `'select'`.
  final String type;

  /// Allowed options for `'select'` fields (empty for other types).
  final List<ProfileFieldOption> options;

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
      options: (json['options'] as List<dynamic>?)
              ?.cast<Map<String, dynamic>>()
              .map(ProfileFieldOption.fromJson)
              .toList() ??
          const [],
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
String isoDate(DateTime d) => formatDateYmd(d);

