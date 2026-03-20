// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'Health Habit Hub';

  @override
  String get donateHabit => 'Gewohnheit spenden';

  @override
  String get exploreHabits => 'Gewohnheiten entdecken';

  @override
  String get settings => 'Einstellungen';

  @override
  String get profile => 'Profil';

  @override
  String get habitDonatedSuccess => 'Gewohnheit erfolgreich gespendet!';

  @override
  String get submissionFailed =>
      'Übermittlung fehlgeschlagen — bitte erneut versuchen.';

  @override
  String get noConnection => 'Keine Verbindung';

  @override
  String get couldNotLoadSurvey =>
      'Umfrage konnte nicht geladen werden.\nBitte überprüfen Sie Ihre Verbindung.';

  @override
  String get retry => 'Erneut versuchen';

  @override
  String get refresh => 'Aktualisieren';

  @override
  String get graphTab => 'Graph';

  @override
  String get statsTab => 'Statistik';

  @override
  String get failedToLoadHabits => 'Gewohnheiten konnten nicht geladen werden';

  @override
  String get noHabitDataYet => 'Noch keine Gewohnheitsdaten verfügbar.';

  @override
  String get couldNotSubmitAnnotation =>
      'Annotation konnte nicht übermittelt werden';

  @override
  String get communityAnnotations => 'Community-Annotationen';

  @override
  String get unknown => 'Unbekannt';

  @override
  String iDoThisCount(String count) {
    return 'Das mache ich auch: $count';
  }

  @override
  String helpfulCount(String count) {
    return 'Hilfreich: $count';
  }

  @override
  String get iDoThisToo => 'Das mache ich auch';

  @override
  String get helpful => 'Hilfreich';

  @override
  String get failedToLoadSettings =>
      'Einstellungen konnten nicht geladen werden';

  @override
  String get tokenCardFormat => 'Token-Karten-Format';

  @override
  String get tokenCardFormatDescription =>
      'Wählen Sie das Format für die Erstellung von Token-Karten für neue Teilnehmer.';

  @override
  String get settingsSaved => 'Einstellungen gespeichert';

  @override
  String get failedToSaveSettings =>
      'Einstellungen konnten nicht gespeichert werden';

  @override
  String get save => 'Speichern';

  @override
  String get qrOnly => 'Nur QR';

  @override
  String get qrOnlyDescription => 'Nur QR-Code-Token generieren';

  @override
  String get printOnly => 'Nur Druck';

  @override
  String get printOnlyDescription => 'Nur druckbare Token-Karten generieren';

  @override
  String get both => 'Beides';

  @override
  String get bothDescription => 'QR-Code und druckbare Token-Karten generieren';

  @override
  String get myProfile => 'Mein Profil';

  @override
  String get profileSavedSuccess => 'Profil erfolgreich gespeichert!';

  @override
  String get couldNotLoadProfile =>
      'Profil konnte nicht geladen werden.\nBitte überprüfen Sie Ihre Verbindung.';

  @override
  String get healthQuestionnaires => 'Gesundheitsfragebögen';

  @override
  String get sliqLifestyleIndex => 'SLIQ — Lebensstil-Index';

  @override
  String get rand36HealthSurvey => 'RAND-36 — Gesundheitsumfrage';

  @override
  String get restoreAccountOnDevice =>
      'Konto auf diesem Gerät wiederherstellen';

  @override
  String get profileCompleted => 'Profil ausgefüllt';

  @override
  String completedOn(String date) {
    return 'Ausgefüllt am $date';
  }

  @override
  String get edit => 'Bearbeiten';

  @override
  String get appearance => 'Erscheinungsbild';

  @override
  String get light => 'Hell';

  @override
  String get system => 'System';

  @override
  String get dark => 'Dunkel';
}
