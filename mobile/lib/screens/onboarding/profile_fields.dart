class ProfileFieldDefinition {
  final String fieldId;
  final String label;
  final String type; // 'text', 'number', 'date', 'select'
  final List<String> options;
  final bool required;
  final int order;

  const ProfileFieldDefinition({
    required this.fieldId,
    required this.label,
    required this.type,
    required this.options,
    required this.required,
    required this.order,
  });

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

String formatDate(DateTime d) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

String isoDate(DateTime d) {
  final y = d.year.toString().padLeft(4, '0');
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}

// Used by personal_info_screen.dart (settings) which retains hardcoded age/gender pickers.
const profileGenderOptions = [
  ('male', 'Male'),
  ('female', 'Female'),
  ('non_binary', 'Non-binary'),
  ('prefer_not_to_say', 'Prefer not to say'),
];

String profileAgeBucketLabel(int age) {
  if (age < 18) return 'Under 18';
  if (age <= 24) return '18–24';
  if (age <= 34) return '25–34';
  if (age <= 44) return '35–44';
  if (age <= 54) return '45–54';
  if (age <= 64) return '55–64';
  return '65+';
}

String? profileGenderLabel(String? value) => profileGenderOptions
    .where((o) => o.$1 == value)
    .map((o) => o.$2)
    .firstOrNull;
