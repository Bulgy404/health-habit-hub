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

String? profileAgeLabel(int? value) => profileAgeRanges
    .where((r) => r.value == value)
    .map((r) => r.label)
    .firstOrNull;

String? profileGenderLabel(String? value) => profileGenderOptions
    .where((o) => o.$1 == value)
    .map((o) => o.$2)
    .firstOrNull;
