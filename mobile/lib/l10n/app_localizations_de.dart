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
  String get shareHabit => 'Gewohnheit teilen';

  @override
  String get exploreHabits => 'Gewohnheiten entdecken';

  @override
  String get settings => 'Einstellungen';

  @override
  String get profile => 'Profil';

  @override
  String get habitSharedSuccess => 'Gewohnheit erfolgreich geteilt!';

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
  String get privacyStatement => 'Datenschutzerklärung';

  @override
  String get accessibilityStatement => 'Erklärung zur Barrierefreiheit';

  @override
  String get imprint => 'Impressum';

  @override
  String get couldNotLoadLegalDocument =>
      'Dieses Dokument konnte nicht geladen werden.\nBitte überprüfen Sie Ihre Verbindung.';

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

  @override
  String get cancel => 'Abbrechen';

  @override
  String get delete => 'Löschen';

  @override
  String get create => 'Erstellen';

  @override
  String get apply => 'Anwenden';

  @override
  String get adminDeviceSessions => 'Gerätesitzungen';

  @override
  String get adminRevokeSessionTitle => 'Sitzung widerrufen?';

  @override
  String adminRevokeSessionContent(String participantId) {
    return 'Sitzung für Teilnehmer $participantId widerrufen?\nDieser wird sofort abgemeldet.';
  }

  @override
  String get adminRevoke => 'Widerrufen';

  @override
  String get adminSessionRevoked => 'Sitzung widerrufen';

  @override
  String get adminFailedToRevokeSession =>
      'Sitzung konnte nicht widerrufen werden';

  @override
  String get adminNoActiveSessions => 'Keine aktiven Sitzungen';

  @override
  String get adminFailedToLoadSessions =>
      'Sitzungen konnten nicht geladen werden';

  @override
  String get adminColParticipantId => 'Teilnehmer-ID';

  @override
  String get adminColDeviceType => 'Gerätetyp';

  @override
  String get adminColAppVersion => 'App-Version';

  @override
  String get adminColLastSeen => 'Zuletzt gesehen';

  @override
  String get adminColSessionId => 'Sitzungs-ID';

  @override
  String get adminColActions => 'Aktionen';

  @override
  String get adminDonatedHabits => 'Geteilte Gewohnheiten';

  @override
  String get adminAutoRefreshOn => 'Auto-Aktualisierung ein';

  @override
  String get adminAutoRefreshOff => 'Auto-Aktualisierung aus';

  @override
  String get adminCouldNotOpenExportUrl =>
      'Export-URL konnte nicht geöffnet werden';

  @override
  String get adminCsvExportFailed => 'CSV-Export fehlgeschlagen';

  @override
  String get adminAllDates => 'Alle Daten';

  @override
  String get adminGroup => 'Gruppe';

  @override
  String get adminCategory => 'Kategorie';

  @override
  String get adminAll => 'Alle';

  @override
  String get adminClearDateRange => 'Datumsbereich löschen';

  @override
  String get adminCsv => 'CSV';

  @override
  String get adminNoHabitDonationsFound =>
      'Keine geteilten Gewohnheiten gefunden';

  @override
  String get adminFailedToLoadHabitDonations =>
      'Geteilte Gewohnheiten konnten nicht geladen werden';

  @override
  String adminParticipantTitle(String participantId) {
    return 'Teilnehmer $participantId';
  }

  @override
  String get adminExportJson => 'JSON exportieren';

  @override
  String get adminFailedToExportProgress =>
      'Fortschrittsdaten konnten nicht exportiert werden.';

  @override
  String get adminProfileCard => 'Profil';

  @override
  String get adminProfileNotYetCompleted => 'Noch nicht abgeschlossen';

  @override
  String adminSurveysCompleted(int count) {
    return 'Abgeschlossene Umfragen ($count)';
  }

  @override
  String get adminNoSurveysCompletedYet => 'Noch keine Umfragen abgeschlossen.';

  @override
  String adminHabitsDonated(int count) {
    return 'Geteilte Gewohnheiten ($count)';
  }

  @override
  String get adminNoHabitsDonatedYet => 'Noch keine Gewohnheiten geteilt.';

  @override
  String adminHabitsDonatedDetail(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count Gewohnheiten geteilt. Einzelheiten sind im Gewohnheits-Monitor verfügbar.',
      one:
          '1 Gewohnheit geteilt. Einzelheiten sind im Gewohnheits-Monitor verfügbar.',
    );
    return '$_temp0';
  }

  @override
  String get adminRecommendations => 'Empfehlungen';

  @override
  String get adminAccepted => 'Akzeptiert';

  @override
  String get adminDismissed => 'Abgelehnt';

  @override
  String get adminTimeline => 'Zeitverlauf';

  @override
  String get adminNoTimelineEventsYet => 'Noch keine Zeitverlauf-Ereignisse.';

  @override
  String get adminTimelineEnrolled => 'Eingeschrieben';

  @override
  String get adminTimelineSurveyCompleted => 'Umfrage abgeschlossen';

  @override
  String get adminTimelineRecommendationAccepted => 'Empfehlung akzeptiert';

  @override
  String get adminTimelineRecommendationDismissed => 'Empfehlung abgelehnt';

  @override
  String get adminFailedToLoadParticipantProgress =>
      'Teilnehmerfortschritt konnte nicht geladen werden.';

  @override
  String get adminParticipants => 'Teilnehmer';

  @override
  String get adminNoParticipantsFound => 'Keine Teilnehmer gefunden.';

  @override
  String get adminSearchByUsername => 'Nach Benutzername suchen…';

  @override
  String get adminAllGroups => 'Alle Gruppen';

  @override
  String get adminColUsername => 'Benutzername';

  @override
  String get adminColEnrolled => 'Eingeschrieben';

  @override
  String get adminColLastActive => 'Zuletzt aktiv';

  @override
  String get adminColSurveysPercent => 'Umfragen %';

  @override
  String get adminDeleteParticipant => 'Teilnehmer löschen';

  @override
  String get adminFailedToUpdateGroup =>
      'Gruppe konnte nicht aktualisiert werden.';

  @override
  String get adminDeleteParticipantTitle => 'Teilnehmer löschen';

  @override
  String get adminDeleteParticipantContent =>
      'Dadurch werden die Teilnehmerdaten anonymisiert. Dies kann nicht rückgängig gemacht werden.';

  @override
  String get adminFailedToDeleteParticipant =>
      'Teilnehmer konnte nicht gelöscht werden.';

  @override
  String adminParticipantCreated(String username) {
    return 'Teilnehmer $username erstellt';
  }

  @override
  String get adminCreateParticipantTooltip => 'Teilnehmer erstellen';

  @override
  String get adminFailedToLoadParticipants =>
      'Teilnehmer konnten nicht geladen werden.';

  @override
  String get adminPrevious => 'Zurück';

  @override
  String get adminNext => 'Weiter';

  @override
  String get adminCreateParticipantTitle => 'Teilnehmer erstellen';

  @override
  String get adminStudyGroup => 'Studiengruppe';

  @override
  String get adminTokenCardFormat => 'Token-Karten-Format';

  @override
  String get adminQrAndPrint => 'QR + Druck';

  @override
  String get adminFailedToCreateParticipant =>
      'Teilnehmer konnte nicht erstellt werden. Bitte erneut versuchen.';

  @override
  String get adminSurveys => 'Umfragen';

  @override
  String get adminFailedToUpdateStatus =>
      'Status konnte nicht aktualisiert werden';

  @override
  String get adminNewSurveyTooltip => 'Neue Umfrage';

  @override
  String get adminNoSurveysFound => 'Keine Umfragen gefunden';

  @override
  String get adminFailedToLoadSurveys =>
      'Umfragen konnten nicht geladen werden';

  @override
  String get adminPublish => 'Veröffentlichen';

  @override
  String get adminArchive => 'Archivieren';

  @override
  String get adminNewSurveyTitle => 'Neue Umfrage';

  @override
  String get adminSurveyTitleLabel => 'Titel';

  @override
  String get adminSurveyTypeLabel => 'Typ';

  @override
  String get adminTitleIsRequired => 'Titel ist erforderlich';

  @override
  String get adminFailedToCreateSurvey =>
      'Umfrage konnte nicht erstellt werden';

  @override
  String get adminSurveyEditor => 'Umfrage-Editor';

  @override
  String get adminInvalidJson =>
      'Ungültiges JSON — bitte vor dem Speichern korrigieren';

  @override
  String get adminSurveySaved => 'Umfrage gespeichert';

  @override
  String get adminFailedToSaveSurvey =>
      'Umfrage konnte nicht gespeichert werden';

  @override
  String get adminFailedToLoadSurvey => 'Umfrage konnte nicht geladen werden';

  @override
  String get adminJsonSchema => 'JSON-Schema';

  @override
  String get adminAssignToGroups => 'Gruppen zuweisen';

  @override
  String get failedToLoadStats => 'Statistiken konnten nicht geladen werden';

  @override
  String get failedToLoadQuestionnaire =>
      'Fragebogen konnte nicht geladen werden.';

  @override
  String get getRecommendations => 'Empfehlungen erhalten';

  @override
  String get healthGoalPrompt =>
      'An welchem Gesundheitsziel möchten Sie arbeiten?';

  @override
  String get questionnaireResponseSubmitted => 'Antwort eingereicht!';

  @override
  String get questionnaireThankYou =>
      'Vielen Dank für das Ausfüllen des Fragebogens. Ihre Antworten helfen dabei, Ihre Gewohnheitsempfehlungen zu personalisieren.';

  @override
  String get backToProfile => 'Zurück zum Profil';

  @override
  String get thankYou => 'Vielen Dank';

  @override
  String get noQuestionnairesAssigned =>
      'Keine Fragebögen für Ihre Studie zugewiesen.';
}
