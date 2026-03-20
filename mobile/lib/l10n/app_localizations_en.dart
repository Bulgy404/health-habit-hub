// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Health Habit Hub';

  @override
  String get donateHabit => 'Donate a Habit';

  @override
  String get exploreHabits => 'Explore Habits';

  @override
  String get settings => 'Settings';

  @override
  String get profile => 'Profile';

  @override
  String get habitDonatedSuccess => 'Habit donated successfully!';

  @override
  String get submissionFailed => 'Submission failed — please try again.';

  @override
  String get noConnection => 'No connection';

  @override
  String get couldNotLoadSurvey =>
      'Could not load survey.\nPlease check your connection.';

  @override
  String get retry => 'Retry';

  @override
  String get refresh => 'Refresh';

  @override
  String get graphTab => 'Graph';

  @override
  String get statsTab => 'Stats';

  @override
  String get failedToLoadHabits => 'Failed to load habits';

  @override
  String get noHabitDataYet => 'No habit data available yet.';

  @override
  String get couldNotSubmitAnnotation => 'Could not submit annotation';

  @override
  String get communityAnnotations => 'Community annotations';

  @override
  String get unknown => 'Unknown';

  @override
  String iDoThisCount(String count) {
    return 'I do this too: $count';
  }

  @override
  String helpfulCount(String count) {
    return 'Helpful: $count';
  }

  @override
  String get iDoThisToo => 'I do this too';

  @override
  String get helpful => 'Helpful';

  @override
  String get failedToLoadSettings => 'Failed to load settings';

  @override
  String get tokenCardFormat => 'Token Card Format';

  @override
  String get tokenCardFormatDescription =>
      'Select the format used when generating token cards for new participants.';

  @override
  String get settingsSaved => 'Settings saved';

  @override
  String get failedToSaveSettings => 'Failed to save settings';

  @override
  String get save => 'Save';

  @override
  String get qrOnly => 'QR only';

  @override
  String get qrOnlyDescription => 'Generate QR code tokens only';

  @override
  String get printOnly => 'Print only';

  @override
  String get printOnlyDescription => 'Generate printable token cards only';

  @override
  String get both => 'Both';

  @override
  String get bothDescription => 'Generate QR code and printable token cards';

  @override
  String get myProfile => 'My Profile';

  @override
  String get profileSavedSuccess => 'Profile saved successfully!';

  @override
  String get couldNotLoadProfile =>
      'Could not load profile.\nPlease check your connection.';

  @override
  String get healthQuestionnaires => 'Health Questionnaires';

  @override
  String get sliqLifestyleIndex => 'SLIQ — Lifestyle Index';

  @override
  String get rand36HealthSurvey => 'RAND-36 — Health Survey';

  @override
  String get restoreAccountOnDevice => 'Restore account on this device';

  @override
  String get profileCompleted => 'Profile Completed';

  @override
  String completedOn(String date) {
    return 'Completed on $date';
  }

  @override
  String get edit => 'Edit';

  @override
  String get appearance => 'Appearance';

  @override
  String get light => 'Light';

  @override
  String get system => 'System';

  @override
  String get dark => 'Dark';
}
