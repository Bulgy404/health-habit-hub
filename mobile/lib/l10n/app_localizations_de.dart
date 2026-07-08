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
      'Übermittlung fehlgeschlagen. Bitte erneut versuchen.';

  @override
  String get noConnection => 'Keine Verbindung';

  @override
  String get couldNotLoadSurvey =>
      'Umfrage konnte nicht geladen werden.\nBitte überprüfe deine Verbindung.';

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
    return 'Gemerkt: $count';
  }

  @override
  String get iDoThisToo => 'Das mache ich auch';

  @override
  String get helpful => 'Merken';

  @override
  String get savedSection => 'Gemerkt';

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
      'Dieses Dokument konnte nicht geladen werden.\nBitte überprüfe deine Verbindung.';

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
  String get profileEnterNumber => 'Zahl eingeben';

  @override
  String get profileEnterText => 'Text eingeben';

  @override
  String get couldNotLoadProfile =>
      'Profil konnte nicht geladen werden.\nBitte überprüfe deine Verbindung.';

  @override
  String get healthQuestionnaires => 'Gesundheitsfragebögen';

  @override
  String get sliqLifestyleIndex => 'SLIQ: Lebensstil-Index';

  @override
  String get rand36HealthSurvey => 'RAND-36: Gesundheitsumfrage';

  @override
  String get restoreAccountOnDevice =>
      'Konto auf diesem Gerät wiederherstellen';

  @override
  String get studyMembershipTitle => 'Studie';

  @override
  String get studyMembershipCurrentLabel => 'Aktuelle Studie';

  @override
  String get studyMembershipDefaultLabel =>
      'Allgemeine Studie (ohne Studiencode)';

  @override
  String studyMembershipGroupLabel(String groupLabel) {
    return 'Gruppe: $groupLabel';
  }

  @override
  String get studyMembershipLoadFailed =>
      'Deine Studieninformationen konnten nicht geladen werden.';

  @override
  String get studyMembershipJoinButton => 'Einer anderen Studie beitreten';

  @override
  String get studyMembershipLeaveButton => 'Studie verlassen';

  @override
  String get studyMembershipJoinDialogTitle => 'Studie beitreten';

  @override
  String get studyMembershipJoinDialogBody =>
      'Gib den Studiencode ein, den dir eine Forscherin oder ein Forscher gegeben hat. Bereits geteilte Gewohnheiten, Protokolle und Antworten bleiben bei deiner aktuellen Studie; nur was du ab jetzt tust, zählt für die neue Studie.';

  @override
  String get studyMembershipCodeLabel => 'Studiencode';

  @override
  String get studyMembershipJoinConfirm => 'Beitreten';

  @override
  String studyMembershipJoinSuccess(String studyName) {
    return 'Du bist $studyName beigetreten.';
  }

  @override
  String get studyMembershipAlreadyInStudy =>
      'Du bist bereits in dieser Studie.';

  @override
  String get studyMembershipInvalidCode =>
      'Ungültiger Code. Bitte überprüfen und erneut versuchen.';

  @override
  String get studyMembershipCodeExpired => 'Dieser Code ist abgelaufen.';

  @override
  String get studyMembershipCodeUsedUp =>
      'Dieser Code wurde bereits vollständig eingelöst.';

  @override
  String get studyMembershipJoinFailed =>
      'Beitritt zur Studie fehlgeschlagen. Bitte überprüfe deine Verbindung.';

  @override
  String get studyMembershipLeaveConfirmTitle => 'Diese Studie verlassen?';

  @override
  String get studyMembershipLeaveConfirmBody =>
      'Du wechselst in die allgemeine Studie. Es wird nichts gelöscht: Deine bisherigen Gewohnheiten, Protokolle und Fragebogenantworten bleiben genau erhalten und weiterhin dieser Studie zugeordnet.';

  @override
  String get studyMembershipLeaveSuccess => 'Du hast die Studie verlassen.';

  @override
  String get studyMembershipLeaveFailed =>
      'Verlassen der Studie fehlgeschlagen. Bitte überprüfe deine Verbindung.';

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
  String get adminAllDates => 'Alle Zeiträume';

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
      'Ungültiges JSON, bitte vor dem Speichern korrigieren';

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
      'An welchem Gesundheitsziel möchtest du arbeiten?';

  @override
  String get goalInputSubtitle =>
      'Je mehr Kontext du teilst (dein Alltag, was du schon probiert hast, was dir im Weg steht), desto besser wird deine Empfehlung.';

  @override
  String get goalInputHint =>
      'z. B. Ich bin 34 und sitze lange im Büro. Ich habe Mühe, vor Mitternacht einzuschlafen, und wache erschöpft auf. Abendliches Joggen habe ich versucht, aber nach einer Woche wieder aufgegeben. Ich möchte eine realistische Routine, die mir hilft, abzuschalten und ausgeruhter zu sein.';

  @override
  String get goalInputValidationError => 'Bitte beschreibe dein Ziel';

  @override
  String get questionnaireResponseSubmitted => 'Antwort eingereicht!';

  @override
  String get questionnaireThankYou =>
      'Vielen Dank für das Ausfüllen des Fragebogens. Deine Antworten helfen dabei, deine Gewohnheitsempfehlungen zu personalisieren.';

  @override
  String get backToProfile => 'Zurück zum Profil';

  @override
  String get thankYou => 'Vielen Dank';

  @override
  String get noQuestionnairesAssigned =>
      'Keine Fragebögen für deine Studie zugewiesen.';

  @override
  String get questionnaireReminderMessage =>
      'Ein Gesundheitsfragebogen wartet auf deine Antworten.';

  @override
  String get questionnaireReminderAction => 'Ausfüllen';

  @override
  String get myHabitsTab => 'Meine Gewohnheiten';

  @override
  String get newHabit => 'Neue Gewohnheit';

  @override
  String get noHabitsYet =>
      'Noch keine Gewohnheiten.\nTippe auf „Neue Gewohnheit“, um eine zu beginnen.';

  @override
  String get logToday => 'Heute eintragen';

  @override
  String get loggedToday => 'Eingetragen ✓';

  @override
  String get pickBehaviorTitle => 'Welche Gewohnheit möchtest du aufbauen?';

  @override
  String get setCueTitle => 'Leg deinen Auslöser fest';

  @override
  String get setCuePreRatedInstruction =>
      'Deine Studienbedingung gibt dir folgende(n) Auslöser vor. Lies sie sorgfältig: das ist der Moment, in dem du handeln wirst.';

  @override
  String get setCueSelfSelectedInstruction =>
      'Beschreibe einen konkreten Moment, der regelmäßig in deinem Alltag vorkommt.';

  @override
  String get setCuePlaceholder => 'z.B. Nach dem Abendessen';

  @override
  String get setCueTooShort =>
      'Bitte beschreibe deinen Auslöser mit mindestens 10 Zeichen.';

  @override
  String get confirmPlanTitle => 'Dein Plan';

  @override
  String get confirmPlanSubtitle =>
      'Lies deine Implementierungsintention und bestätige sie.';

  @override
  String get confirmPlanEditHint => 'Passe deine Intention an…';

  @override
  String confirmPlanReminderAtTime(String time) {
    return 'Erinnerung um $time (von der Studie festgelegt)';
  }

  @override
  String get confirmPlanRemindersEnabledByStudy =>
      'Erinnerungen aktiviert (von der Studie festgelegt)';

  @override
  String get confirmPlanNoRemindersByStudy =>
      'Keine Erinnerungen (von der Studie festgelegt)';

  @override
  String get confirmPlanShareWithCommunity =>
      'Diese Gewohnheit anonym mit der Community teilen';

  @override
  String get durationLabel => 'Dauer (Minuten)';

  @override
  String get createHabit => 'Gewohnheit erstellen';

  @override
  String get habitLimitReached =>
      'Du hast die Gewohnheitsgrenze für deine Studienbedingung erreicht.';

  @override
  String get srhiCheckInTitle => 'Wöchentliches Gewohnheits-Check-in';

  @override
  String get srhiCheckInSubtitle => 'Dauert ca. 2 Minuten.';

  @override
  String get srhiStartButton => 'Check-in starten';

  @override
  String get srhiFormTitle => 'Gewohnheits-Check-in';

  @override
  String srhiStem(String behavior) {
    return '$behavior ist etwas,';
  }

  @override
  String get srhiScaleMin => '1 = Stimme gar nicht zu';

  @override
  String get srhiScaleMax => '7 = Stimme voll zu';

  @override
  String get srhiSubmit => 'Absenden';

  @override
  String get srhiSubmitIncomplete =>
      'Bitte bewerte alle 12 Aussagen, bevor du absendest.';

  @override
  String weekLabel(int n) {
    return 'Woche $n';
  }

  @override
  String get habitDetailTitle => 'Gewohnheitsdetails';

  @override
  String get abandonHabit => 'Gewohnheit aufgeben';

  @override
  String get abandonConfirm =>
      'Bist du sicher, dass du diese Gewohnheit aufgeben möchtest? Dies kann nicht rückgängig gemacht werden.';

  @override
  String get confirm => 'Bestätigen';

  @override
  String get heatmapTitle => 'Aktivitätsprotokoll';

  @override
  String get trajectoryTitle => 'Gewohnheitsstärke';

  @override
  String get enactedLabel => 'Umgesetzt';

  @override
  String get missedLabel => 'Verpasst';

  @override
  String get noLogsYet => 'Noch keine Aktivität eingetragen.';

  @override
  String get noTrajectoryYet =>
      'SRHI-Daten erscheinen nach deinem ersten wöchentlichen Check-in.';

  @override
  String get srhiExplanationTitle => 'Was ist SRHI?';

  @override
  String get srhiExplanationBody =>
      'Der Self-Report Habit Index (SRHI) misst, wie automatisch sich dieses Verhalten für dich anfühlt, auf einer Skala von 1 bis 7. Ein höherer Wert bedeutet weniger bewussten Aufwand: ein Zeichen dafür, dass die Gewohnheit Teil deiner Routine wird.';

  @override
  String get srhiScoreLabel => 'Aktueller SRHI-Wert';

  @override
  String get srhiScoreUnavailable => 'Noch nicht verfügbar';

  @override
  String get srhiNextCheckInLabel => 'Nächster Check-in';

  @override
  String get srhiNextCheckInDue => 'Jetzt fällig';

  @override
  String get srhiNextCheckInNone => 'Nicht geplant';

  @override
  String get consentTitle => 'Studieninformation & Einwilligung';

  @override
  String get consentUpdatedTitle => 'Aktualisierte Einwilligung';

  @override
  String get consentConfirmText =>
      'Mit \"Ich willige ein\" bestätigst du, dass du die Studieninformation gelesen und verstanden hast und freiwillig teilnehmen möchtest.';

  @override
  String get consentAccept => 'Ich willige ein';

  @override
  String get consentDecline => 'Ich willige nicht ein';

  @override
  String get consentCouldNotLoad =>
      'Die Einwilligungserklärung konnte nicht geladen werden. Bitte prüfe deine Verbindung.';

  @override
  String get deleteAccount => 'Konto löschen';

  @override
  String get deleteAccountTitle => 'Konto löschen?';

  @override
  String get deleteAccountContent =>
      'Dadurch werden dein Konto und alle damit verknüpften Daten dauerhaft gelöscht: Profil, Studienteilnahme, Gewohnheitspläne, tägliche Einträge, Fragebogenantworten und Empfehlungen.\n\nGespendete Gewohnheiten sind anonym gespeichert und können nicht auf dich zurückgeführt werden.\n\nDies kann nicht rückgängig gemacht werden.';

  @override
  String get deleteAccountConfirm => 'Endgültig löschen';

  @override
  String get deleteAccountFailed =>
      'Kontolöschung fehlgeschlagen. Bitte prüfe deine Verbindung und versuche es erneut.';

  @override
  String get exportMyData => 'Meine Daten exportieren';

  @override
  String get exportFailed =>
      'Export fehlgeschlagen. Bitte prüfe deine Verbindung und versuche es erneut.';

  @override
  String get myDataSection => 'Meine Daten';

  @override
  String get studyConsent => 'Studieneinwilligung';

  @override
  String get legalSection => 'Rechtliches';

  @override
  String get language => 'Sprache';

  @override
  String get signOut => 'Abmelden';

  @override
  String get signOutConfirm => 'Möchtest du dich wirklich abmelden?';

  @override
  String get aiDisclaimer =>
      'KI-generierte Vorschläge auf Basis deiner Studiendaten. Dies ist keine medizinische Beratung; wende dich bei gesundheitlichen Fragen an einen Arzt.';

  @override
  String get dailyReminderLabel => 'Tägliche Erinnerung';

  @override
  String get noReminders => 'Keine Erinnerungen';

  @override
  String get reminderFadingHint =>
      'Erinnerungen werden seltener, je stärker deine Gewohnheit wird.';

  @override
  String get doneButton => 'Fertig';

  @override
  String get habitStrengthLabel => 'Gewohnheitsstärke';

  @override
  String get commentsTitle => 'Kommentare';

  @override
  String get commentHint => 'Teile einen Gedanken (anonym) …';

  @override
  String get noCommentsYet => 'Noch keine Kommentare. Sei die/der Erste.';

  @override
  String get couldNotPostComment => 'Kommentar konnte nicht gesendet werden';

  @override
  String get likeTooltip => '';

  @override
  String get adminComments => 'Kommentare';

  @override
  String get adminDeleteCommentTitle => 'Kommentar löschen?';

  @override
  String get adminDeleteCommentContent =>
      'Der Kommentar wird für alle Teilnehmenden entfernt. Kann nicht rückgängig gemacht werden.';

  @override
  String get adminFailedToDeleteComment =>
      'Kommentar konnte nicht gelöscht werden';

  @override
  String get adminFailedToLoadComments =>
      'Kommentare konnten nicht geladen werden';

  @override
  String get adminNoCommentsYet => 'Noch keine Kommentare.';

  @override
  String get onboardingShareHabitTitle => 'Teile eine Gewohnheit';

  @override
  String get onboardingShareHabitDescription =>
      'Teile deine persönlichen Gewohnheiten mit Forschenden und hilf so, ein umfassenderes Verständnis des Alltagsverhaltens aufzubauen. Deine Beiträge werden anonymisiert und ausschließlich für wissenschaftliche Forschung verwendet. Jede geteilte Gewohnheit macht den Datensatz für alle wertvoller.';

  @override
  String get onboardingExploreAnnotateTitle => 'Entdecken & Kommentieren';

  @override
  String get onboardingExploreAnnotateDescription =>
      'Durchstöbere den interaktiven Gewohnheitsgraphen und entdecke, wie Gewohnheiten in der Community miteinander zusammenhängen. Du kannst Verbindungen kommentieren und Kontext hinzufügen, um die gemeinsame Wissensbasis zu verbessern. Je mehr du entdeckst, desto reichhaltiger wird der Graph.';

  @override
  String get onboardingRecommendationsTitle => 'Empfehlungen erhalten';

  @override
  String get onboardingRecommendationsDescription =>
      'Erhalte personalisierte Gewohnheitsempfehlungen auf Basis deines Profils und des gesamten Datensatzes. Unsere Empfehlungs-Engine lernt aus den Beiträgen der Community, um Gewohnheiten vorzuschlagen, die zu deinem Lebensstil passen. Entdecke neue Gewohnheiten, die andere mit ähnlichem Profil bereits hilfreich fanden.';

  @override
  String get onboardingSubtitle =>
      'Eine Citizen-Science-Plattform, auf der deine Gewohnheiten helfen, ein umfassenderes Verständnis des Alltagsverhaltens aufzubauen.';

  @override
  String get onboardingGetStarted => 'Loslegen';

  @override
  String get onboardingRestoreAccount => 'Bestehendes Konto wiederherstellen';

  @override
  String get onboardingSkip => 'Überspringen';

  @override
  String get onboardingContinue => 'Fortfahren';

  @override
  String get onboardingNext => 'Weiter';

  @override
  String get studyCodeAppBarTitle => 'Studiencode';

  @override
  String get studyCodeQuestion => 'Hast du einen Studiencode?';

  @override
  String get studyCodeSubtitle =>
      'Wenn dir eine Forscherin oder ein Forscher einen Studiencode gegeben hat, gib ihn hier ein, um der Studie beizutreten. Du kannst diesen Schritt auch überspringen.';

  @override
  String get studyCodeLabel => 'Studiencode';

  @override
  String get studyCodeInvalidFormat =>
      'Gib einen gültigen Code im Format HHH-XXXXX ein.';

  @override
  String get studyCodeInvalid =>
      'Ungültiger Code. Bitte überprüfe ihn und versuche es erneut.';

  @override
  String get studyCodeExpired => 'Dieser Code ist abgelaufen.';

  @override
  String get studyCodeAlreadyUsed => 'Dieser Code wurde bereits verwendet.';

  @override
  String get studyCodeGenericError =>
      'Code konnte nicht eingelöst werden. Bitte überprüfe deine Verbindung.';

  @override
  String get studyCodeContinueButton => 'Mit Code fortfahren';

  @override
  String get studyCodeSkipButton => 'Überspringen: ohne Studiencode beitreten';

  @override
  String get adminQuestionnairesDeleteConfirmTitle => 'Fragebogen löschen?';

  @override
  String adminQuestionnairesDeleteConfirmMessage(String title) {
    return '„$title“ löschen? Dies kann nicht rückgängig gemacht werden.';
  }

  @override
  String get adminQuestionnairesDeleteConflict =>
      'Löschen nicht möglich: Der Fragebogen ist einer aktiven Studie zugeordnet.';

  @override
  String get adminQuestionnairesDeleteForbidden =>
      'Ein Bibliotheksfragebogen kann nicht gelöscht werden.';

  @override
  String get adminQuestionnairesDeleteFailed =>
      'Fragebogen konnte nicht gelöscht werden.';

  @override
  String get adminQuestionnairesTitle => 'Fragebögen';

  @override
  String get adminQuestionnairesLibraryLabel => 'Bibliothek';

  @override
  String get adminQuestionnairesCustomTab => 'Eigene';

  @override
  String get adminQuestionnairesNewTooltip => 'Neuer Fragebogen';

  @override
  String get adminQuestionnairesLoadFailed =>
      'Fragebögen konnten nicht geladen werden.';

  @override
  String get adminQuestionnairesLibraryEmpty =>
      'Keine Bibliotheksfragebögen gefunden.';

  @override
  String get adminQuestionnairesCustomEmpty =>
      'Noch keine eigenen Fragebögen.\nTippe auf +, um einen zu erstellen.';

  @override
  String adminQuestionnairesItemCount(int count) {
    return '$count Fragen';
  }

  @override
  String get adminQuestionnairesInactiveChip => 'Inaktiv';

  @override
  String get adminQuestionnairesEditDialogTitle => 'Fragebogen bearbeiten';

  @override
  String get adminQuestionnairesNewDialogTitle => 'Neuer Fragebogen';

  @override
  String get adminQuestionnairesTitleFieldLabel => 'Titel *';

  @override
  String get adminQuestionnairesFieldRequiredError => 'Erforderlich';

  @override
  String get adminQuestionnairesDescriptionFieldLabel => 'Beschreibung';

  @override
  String adminQuestionnairesQuestionsCount(int count) {
    return 'Fragen ($count)';
  }

  @override
  String get adminQuestionnairesAddButton => 'Hinzufügen';

  @override
  String get adminQuestionnairesNoQuestionsYet =>
      'Noch keine Fragen. Tippe auf „Hinzufügen“, um eine zu erstellen.';

  @override
  String get adminQuestionnairesAllQuestionsNeedText =>
      'Alle Fragen müssen einen Text enthalten.';

  @override
  String get adminQuestionnairesSaveFailed =>
      'Fragebogen konnte nicht gespeichert werden.';

  @override
  String get adminQuestionnairesCreateButton => 'Erstellen';

  @override
  String adminQuestionnairesQuestionNumber(int number) {
    return 'F$number';
  }

  @override
  String get adminQuestionnairesQuestionTextFieldLabel => 'Fragetext';

  @override
  String get adminQuestionnairesTypeFieldLabel => 'Typ';

  @override
  String get adminQuestionnairesTypeOpenText => 'Freitext';

  @override
  String get adminQuestionnairesTypeSingleChoice => 'Einfachauswahl';

  @override
  String get adminQuestionnairesTypeMultiChoice => 'Mehrfachauswahl';

  @override
  String get adminQuestionnairesTypeScale => 'Skala';

  @override
  String get adminQuestionnairesRequiredLabel => 'Pflichtfrage';

  @override
  String adminQuestionnairesOptionsCount(int count) {
    return 'Optionen ($count)';
  }

  @override
  String get adminQuestionnairesAddOption => 'Option hinzufügen';

  @override
  String adminQuestionnairesOptionLabelField(int number) {
    return 'Bezeichnung für Option $number';
  }

  @override
  String get adminShellNavParticipants => 'Teilnehmende';

  @override
  String get adminShellNavSurveys => 'Umfragen';

  @override
  String get adminShellNavQuestionnaires => 'Fragebögen';

  @override
  String get adminShellNavHabits => 'Gewohnheiten';

  @override
  String get adminShellNavDevices => 'Geräte';

  @override
  String get adminShellNavSettings => 'Einstellungen';

  @override
  String get recommendationResultsTitle => 'Empfehlungen';

  @override
  String get recommendationTryAgain => 'Erneut versuchen';

  @override
  String get recommendationEmptyMessage =>
      'Es wurden keine Empfehlungen generiert. Beschreibe dein Ziel etwas genauer: je mehr Kontext du angibst, desto besser.';

  @override
  String get recommendationTryDifferentGoal => 'Anderes Ziel ausprobieren';

  @override
  String get recommendationHabitFlowError =>
      'Der Gewohnheiten-Assistent konnte nicht geöffnet werden. Bitte versuche es erneut.';

  @override
  String get recommendationWhyThisHelps => 'Warum das hilft:';

  @override
  String recommendationSourcesCount(int count) {
    return 'Quellen ($count)';
  }

  @override
  String get recommendationAddToHabits => 'Zu meinen Gewohnheiten hinzufügen';

  @override
  String get recommendationFeedbackSubmitted =>
      'Feedback gesendet, vielen Dank!';

  @override
  String get recommendationLeaveComment => 'Kommentar hinterlassen:';

  @override
  String get recommendationFeedbackHint => 'Dein Feedback…';

  @override
  String get recommendationFeedbackFailed =>
      'Feedback konnte nicht gesendet werden';

  @override
  String get recommendationSourceLinkError =>
      'Der Quellenlink konnte nicht geöffnet werden.';

  @override
  String get recommendationLoadingPhaseExperts => 'Experten werden befragt…';

  @override
  String get recommendationLoadingPhaseHabitsDb =>
      'Deine Gewohnheitendatenbank wird durchsucht…';

  @override
  String get recommendationLoadingPhasePapers =>
      'Wissenschaftliche Studien werden gelesen…';

  @override
  String get recommendationLoadingPhaseGenerating =>
      'Deine persönlichen Empfehlungen werden erstellt…';

  @override
  String get recommendationLoadingTimeoutError =>
      'Die Erstellung der Empfehlungen hat zu lange gedauert. Bitte versuche es erneut.';

  @override
  String get recommendationLoadingGenericError =>
      'Beim Erstellen der Empfehlungen ist ein Fehler aufgetreten. Bitte versuche es erneut.';

  @override
  String get bubbleGraphNoHabitsInDimension =>
      'Noch keine Gewohnheiten in dieser Kategorie.';

  @override
  String get bubbleGraphAllCategories => 'Alle Kategorien';

  @override
  String bubbleGraphHabitCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Gewohnheiten',
      one: '1 Gewohnheit',
    );
    return '$_temp0';
  }

  @override
  String recommendationCardWhyTitle(String habitName) {
    return 'Warum „$habitName“?';
  }

  @override
  String get recommendationCardEvidence => 'Belege';

  @override
  String get recommendationCardConfidence => 'Konfidenz';

  @override
  String get recommendationCardWhy => 'Warum?';

  @override
  String get recommendationCardDismiss => 'Verwerfen';

  @override
  String get recommendationCardAccept => 'Annehmen';

  @override
  String get questionnaireFormRequiredQuestion =>
      'Diese Frage ist erforderlich.';

  @override
  String get questionnaireFormAnswerAllRequired =>
      'Bitte beantworte alle Pflichtfragen, bevor du fortfährst.';

  @override
  String questionnaireFormProgressLabel(int current, int total) {
    return 'Frage $current von $total';
  }

  @override
  String get questionnaireFormBackButton => 'Zurück';

  @override
  String get questionnaireFormSubmitButton => 'Absenden';

  @override
  String get questionnaireFormSaveAndContinueButton => 'Speichern & weiter';

  @override
  String get questionnaireFormAnswerHint => 'Deine Antwort …';

  @override
  String get questionnaireFallbackTitle => 'Fragebogen';

  @override
  String get donateShareEyebrow => 'GEWOHNHEIT TEILEN';

  @override
  String get donateHeroTitle => 'Teile eine Gewohnheit mit der Wissenschaft';

  @override
  String get donateHeroSubtitle =>
      'Anonym · ca. 2 Min. · Hilft Forschenden weltweit';

  @override
  String get donateStartSharingButton => 'Jetzt teilen';

  @override
  String get donateQuestionnaireEyebrow => 'FRAGEBOGEN';

  @override
  String get donateQuestionnaireDueSubtitle =>
      'Kurzer Fragebogen · jetzt fällig';

  @override
  String get donateCompleteButton => 'Ausfüllen';

  @override
  String get donateSharedTodayTitle => 'Heute geteilt';

  @override
  String get donateSharedTodayBody =>
      'Danke für deinen Beitrag! Jede geteilte Gewohnheit hilft unserer Forschung. Teile gerne noch eine weitere.';

  @override
  String get donateShareAnotherButton => 'Weitere Gewohnheit teilen';

  @override
  String get donateWhyShareTitle => 'Warum teilen?';

  @override
  String get donateWhyShareBody =>
      'Geteilte Gewohnheiten bleiben anonym und helfen der Forschung, bessere Empfehlungen für alle zu entwickeln, auch für dich.';

  @override
  String get readMoreAboutProject => 'Mehr über das Projekt erfahren';

  @override
  String get donatePleaseAnswerAllQuestions => 'Bitte beantworte alle Fragen';

  @override
  String get donateNotAHabitMessage =>
      'Das klingt nicht wie eine Gewohnheit. Versuche, ein regelmäßiges Verhalten zu beschreiben, z. B. „Ich gehe jeden Morgen 30 Minuten spazieren“.';

  @override
  String get donateSavedOffline =>
      'Offline gespeichert, wird gesendet, sobald wieder eine Verbindung besteht';

  @override
  String get donateUnauthorized =>
      'Nicht autorisiert. Bitte melde dich erneut an.';

  @override
  String get donateAnalysisUnavailable =>
      'Die Gewohnheitsanalyse ist vorübergehend nicht verfügbar. Bitte versuche es gleich noch einmal.';

  @override
  String get donateTodaysTasksEyebrow => 'HEUTIGE AUFGABEN';

  @override
  String get donateCommunityLabel => 'Community';

  @override
  String get donateDayStreakLabel => 'Tage-Serie';

  @override
  String get donateFormDescribeHabitLabel => 'Beschreibe deine Gewohnheit';

  @override
  String get donateFormHabitHint =>
      'z. B. Ich gehe jeden Morgen 30 Minuten spazieren';

  @override
  String get donateFormHabitValidationError =>
      'Bitte beschreibe deine Gewohnheit (mindestens 10 Zeichen)';

  @override
  String get donateFormFrequencyQuestion =>
      'Wie oft übst du diese Gewohnheit aus?';

  @override
  String get donateFormFrequencyRarely => 'Selten';

  @override
  String get donateFormFrequencyWeekly => 'Wöchentlich';

  @override
  String get donateFormFrequencySeveralPerWeek => 'Mehrmals/Woche';

  @override
  String get donateFormFrequencyDaily => 'Täglich';

  @override
  String get donateFormDurationQuestion =>
      'Wie lange hast du diese Gewohnheit schon?';

  @override
  String get donateFormDurationUnder1Month => '< 1 Monat';

  @override
  String get donateFormDuration1To3Months => '1–3 Monate';

  @override
  String get donateFormDuration3To12Months => '3–12 Monate';

  @override
  String get donateFormDurationOver1Year => '> 1 Jahr';

  @override
  String get donateFormHealthBenefitQuestion =>
      'Wie sehr nützt es deiner Gesundheit?';

  @override
  String get donateFormRatingCaption => '1 = Gar nicht · 5 = Sehr stark';

  @override
  String get donateFormWellbeingQuestion =>
      'Wie sehr verbessert es dein Wohlbefinden?';

  @override
  String get setCueNextButton => 'Weiter';

  @override
  String get setCueNoneAvailableTitle => 'Noch keine Auslöser verfügbar';

  @override
  String get setCueNoneAvailableSubtitle =>
      'Deine Studienkoordination wird dir bald Auslöser zuweisen';

  @override
  String setCueAssignedNumbered(int index, int total) {
    return 'Auslöser $index von $total (von der Studie zugewiesen)';
  }

  @override
  String get setCueAssignedByStudy => 'Von der Studie zugewiesen';

  @override
  String addAnotherCueCount(int current, int max) {
    return 'Weiteren Auslöser hinzufügen ($current/$max)';
  }

  @override
  String setCueMaxReachedNote(int max) {
    return 'Du kannst bis zu $max Auslöser hinzufügen.';
  }

  @override
  String couldNotLogToday(String error) {
    return 'Heutiger Eintrag konnte nicht gespeichert werden: $error';
  }

  @override
  String get continueButton => 'Weiter';

  @override
  String get behaviorWalking => 'Spazieren gehen';

  @override
  String get behaviorLightJogging => 'Leichtes Joggen';

  @override
  String get behaviorCycling => 'Radfahren';

  @override
  String get behaviorStructuredCalisthenics => 'Kalisteniktraining';

  @override
  String get behaviorYoga => 'Yoga';

  @override
  String get describeYourHabitMinLength =>
      'Bitte beschreibe deine Gewohnheit (mind. 3 Zeichen)';

  @override
  String get yourHabitLabel => 'Deine Gewohnheit';

  @override
  String get yourHabitHint => 'z. B. Ein 20-minütiger Spaziergang';

  @override
  String get nextButton => 'Weiter';
}
