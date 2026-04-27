class ProfileAgeRange {
  final String label;
  final int value;
  const ProfileAgeRange(this.label, this.value);
}

const profileAgeRanges = [
  ProfileAgeRange('Under 18', 15),
  ProfileAgeRange('18–24', 21),
  ProfileAgeRange('25–34', 29),
  ProfileAgeRange('35–44', 39),
  ProfileAgeRange('45–54', 49),
  ProfileAgeRange('55–64', 59),
  ProfileAgeRange('65+', 67),
];

const profileGenderOptions = [
  ('male', 'Male'),
  ('female', 'Female'),
  ('non_binary', 'Non-binary'),
  ('prefer_not_to_say', 'Prefer not to say'),
];

// Range-classification lookup — maps any raw integer age to its display bucket label.
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
