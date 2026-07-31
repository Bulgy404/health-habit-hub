// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Dutch Flemish (`nl`).
class AppLocalizationsNl extends AppLocalizations {
  AppLocalizationsNl([String locale = 'nl']) : super(locale);

  @override
  String get appTitle => 'Health Habit Hub';

  @override
  String get shareHabit => 'Deel een gewoonte';

  @override
  String get exploreHabits => 'Ontdek gewoontes';

  @override
  String get settings => 'Instellingen';

  @override
  String get profile => 'Profiel';

  @override
  String get habitSharedSuccess => 'Gewoonte succesvol gedeeld!';

  @override
  String get submissionFailed => 'Verzenden mislukt. Probeer het opnieuw.';

  @override
  String get questionnaireAlreadyCompleted =>
      'Deze vragenlijst is al voltooid en kan nog niet opnieuw worden ingevuld.';

  @override
  String get noConnection => 'Geen verbinding';

  @override
  String get couldNotLoadSurvey =>
      'Kan vragenlijst niet laden.\nControleer je verbinding.';

  @override
  String get retry => 'Opnieuw proberen';

  @override
  String get refresh => 'Vernieuwen';

  @override
  String get graphTab => 'Grafiek';

  @override
  String get statsTab => 'Statistieken';

  @override
  String get failedToLoadHabits => 'Gewoontes konden niet worden geladen';

  @override
  String get noHabitDataYet => 'Nog geen gewoontegegevens beschikbaar.';

  @override
  String get couldNotSubmitAnnotation => 'Kon annotatie niet verzenden';

  @override
  String get communityAnnotations => 'Community-annotaties';

  @override
  String get unknown => 'Onbekend';

  @override
  String iDoThisCount(String count) {
    return 'Dit doe ik ook: $count';
  }

  @override
  String helpfulCount(String count) {
    return 'Opgeslagen: $count';
  }

  @override
  String get iDoThisToo => 'Dit doe ik ook';

  @override
  String get helpful => 'Opslaan';

  @override
  String get savedSection => 'Opgeslagen';

  @override
  String get failedToLoadSettings => 'Instellingen konden niet worden geladen';

  @override
  String get tokenCardFormat => 'Tokenkaartformaat';

  @override
  String get tokenCardFormatDescription =>
      'Selecteer het formaat dat wordt gebruikt bij het genereren van tokenkaarten voor nieuwe deelnemers.';

  @override
  String get settingsSaved => 'Instellingen opgeslagen';

  @override
  String get failedToSaveSettings =>
      'Instellingen konden niet worden opgeslagen';

  @override
  String get privacyStatement => 'Privacyverklaring';

  @override
  String get accessibilityStatement => 'Toegankelijkheidsverklaring';

  @override
  String get imprint => 'Colofon';

  @override
  String get couldNotLoadLegalDocument =>
      'Dit document kon niet worden geladen.\nControleer je verbinding.';

  @override
  String get save => 'Opslaan';

  @override
  String get qrOnly => 'Alleen QR';

  @override
  String get qrOnlyDescription => 'Genereer alleen QR-codetokens';

  @override
  String get printOnly => 'Alleen afdrukken';

  @override
  String get printOnlyDescription => 'Genereer alleen afdrukbare tokenkaarten';

  @override
  String get both => 'Beide';

  @override
  String get bothDescription => 'Genereer QR-code- en afdrukbare tokenkaarten';

  @override
  String get myProfile => 'Mijn profiel';

  @override
  String get profileSavedSuccess => 'Profiel succesvol opgeslagen!';

  @override
  String get profileEnterNumber => 'Voer een getal in';

  @override
  String get profileEnterText => 'Voer tekst in';

  @override
  String profileIncompleteBanner(String fields) {
    return 'Je profiel mist nog: $fields';
  }

  @override
  String get profileCompleteNow => 'Nu aanvullen';

  @override
  String get couldNotLoadProfile =>
      'Kan profiel niet laden.\nControleer je verbinding.';

  @override
  String get healthQuestionnaires => 'Gezondheidsvragenlijsten';

  @override
  String get sliqLifestyleIndex => 'SLIQ: leefstijlindex';

  @override
  String get rand36HealthSurvey => 'RAND-36: gezondheidsvragenlijst';

  @override
  String get restoreAccountOnDevice => 'Account herstellen op dit apparaat';

  @override
  String get studyMembershipTitle => 'Studie';

  @override
  String get studyMembershipCurrentLabel => 'Huidige studie';

  @override
  String get studyMembershipDefaultLabel => 'Algemene studie (geen studiecode)';

  @override
  String studyMembershipGroupLabel(String groupLabel) {
    return 'Groep: $groupLabel';
  }

  @override
  String get studyMembershipLoadFailed =>
      'Kon je studie-informatie niet laden.';

  @override
  String get studyMembershipJoinButton => 'Deelnemen aan een andere studie';

  @override
  String get studyMembershipLeaveButton => 'Studie verlaten';

  @override
  String get studyMembershipJoinDialogTitle => 'Deelnemen aan een studie';

  @override
  String get studyMembershipJoinDialogBody =>
      'Voer de studiecode in die je van een onderzoeker hebt gekregen. Gewoontes, logs en antwoorden die je al hebt gedeeld blijven bij je huidige studie; alleen wat je vanaf nu doet telt mee voor de nieuwe studie.';

  @override
  String get studyMembershipCodeLabel => 'Studiecode';

  @override
  String get studyMembershipJoinConfirm => 'Deelnemen';

  @override
  String studyMembershipJoinSuccess(String studyName) {
    return 'Je hebt je aangesloten bij $studyName.';
  }

  @override
  String get studyMembershipAlreadyInStudy => 'Je zit al in die studie.';

  @override
  String get studyMembershipInvalidCode =>
      'Ongeldige code. Controleer en probeer het opnieuw.';

  @override
  String get studyMembershipCodeExpired => 'Deze code is verlopen.';

  @override
  String get studyMembershipCodeUsedUp => 'Deze code is al volledig gebruikt.';

  @override
  String get studyMembershipJoinFailed =>
      'Kon niet deelnemen aan die studie. Controleer je verbinding.';

  @override
  String get studyMembershipLeaveConfirmTitle => 'Deze studie verlaten?';

  @override
  String get studyMembershipLeaveConfirmBody =>
      'Je gaat naar de algemene studie. Er wordt niets verwijderd: je bestaande gewoontes, logs en vragenlijstantwoorden blijven precies zoals ze zijn, nog steeds toegeschreven aan deze studie.';

  @override
  String get studyMembershipLeaveSuccess => 'Je hebt de studie verlaten.';

  @override
  String get studyMembershipLeaveFailed =>
      'Kon de studie niet verlaten. Controleer je verbinding.';

  @override
  String get profileCompleted => 'Profiel voltooid';

  @override
  String completedOn(String date) {
    return 'Voltooid op $date';
  }

  @override
  String get edit => 'Bewerken';

  @override
  String get appearance => 'Weergave';

  @override
  String get light => 'Licht';

  @override
  String get system => 'Systeem';

  @override
  String get dark => 'Donker';

  @override
  String get cancel => 'Annuleren';

  @override
  String get delete => 'Verwijderen';

  @override
  String get create => 'Aanmaken';

  @override
  String get apply => 'Toepassen';

  @override
  String get adminDeviceSessions => 'Apparaatsessies';

  @override
  String get adminRevokeSessionTitle => 'Sessie intrekken?';

  @override
  String adminRevokeSessionContent(String participantId) {
    return 'Sessie voor deelnemer $participantId intrekken?\nDeze persoon wordt onmiddellijk uitgelogd.';
  }

  @override
  String get adminRevoke => 'Intrekken';

  @override
  String get adminSessionRevoked => 'Sessie ingetrokken';

  @override
  String get adminFailedToRevokeSession => 'Intrekken van sessie mislukt';

  @override
  String get adminNoActiveSessions => 'Geen actieve sessies';

  @override
  String get adminFailedToLoadSessions => 'Sessies konden niet worden geladen';

  @override
  String get adminColParticipantId => 'Deelnemer-ID';

  @override
  String get adminColDeviceType => 'Apparaattype';

  @override
  String get adminColAppVersion => 'App-versie';

  @override
  String get adminColLastSeen => 'Laatst gezien';

  @override
  String get adminColSessionId => 'Sessie-ID';

  @override
  String get adminColActions => 'Acties';

  @override
  String get adminDonatedHabits => 'Gedeelde gewoontes';

  @override
  String get adminAutoRefreshOn => 'Automatisch vernieuwen aan';

  @override
  String get adminAutoRefreshOff => 'Automatisch vernieuwen uit';

  @override
  String get adminCouldNotOpenExportUrl => 'Kon export-URL niet openen';

  @override
  String get adminCsvExportFailed => 'CSV-export mislukt';

  @override
  String get adminAllDates => 'Alle datums';

  @override
  String get adminGroup => 'Groep';

  @override
  String get adminCategory => 'Categorie';

  @override
  String get adminAll => 'Alle';

  @override
  String get adminClearDateRange => 'Datumbereik wissen';

  @override
  String get adminCsv => 'CSV';

  @override
  String get adminNoHabitDonationsFound => 'Geen gedeelde gewoontes gevonden';

  @override
  String get adminFailedToLoadHabitDonations =>
      'Gedeelde gewoontes konden niet worden geladen';

  @override
  String adminParticipantTitle(String participantId) {
    return 'Deelnemer $participantId';
  }

  @override
  String get adminExportJson => 'JSON exporteren';

  @override
  String get adminFailedToExportProgress =>
      'Voortgangsgegevens konden niet worden geëxporteerd.';

  @override
  String get adminProfileCard => 'Profiel';

  @override
  String get adminProfileNotYetCompleted => 'Nog niet voltooid';

  @override
  String adminSurveysCompleted(int count) {
    return 'Voltooide enquêtes ($count)';
  }

  @override
  String get adminNoSurveysCompletedYet => 'Nog geen enquêtes voltooid.';

  @override
  String adminHabitsDonated(int count) {
    return 'Gedeelde gewoontes ($count)';
  }

  @override
  String get adminNoHabitsDonatedYet => 'Nog geen gewoontes gedeeld.';

  @override
  String adminHabitsDonatedDetail(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count gewoontes gedeeld. Individuele gewoontedetails zijn beschikbaar in de gewoontemonitor.',
      one:
          '1 gewoonte gedeeld. Individuele gewoontedetails zijn beschikbaar in de gewoontemonitor.',
    );
    return '$_temp0';
  }

  @override
  String get adminRecommendations => 'Aanbevelingen';

  @override
  String get adminAccepted => 'Geaccepteerd';

  @override
  String get adminDismissed => 'Afgewezen';

  @override
  String get adminTimeline => 'Tijdlijn';

  @override
  String get adminNoTimelineEventsYet => 'Nog geen tijdlijngebeurtenissen.';

  @override
  String get adminTimelineEnrolled => 'Ingeschreven';

  @override
  String get adminTimelineSurveyCompleted => 'Enquête voltooid';

  @override
  String get adminTimelineRecommendationAccepted => 'Aanbeveling geaccepteerd';

  @override
  String get adminTimelineRecommendationDismissed => 'Aanbeveling afgewezen';

  @override
  String get adminFailedToLoadParticipantProgress =>
      'Voortgang van deelnemer kon niet worden geladen.';

  @override
  String get adminParticipants => 'Deelnemers';

  @override
  String get adminNoParticipantsFound => 'Geen deelnemers gevonden.';

  @override
  String get adminSearchByUsername => 'Zoeken op gebruikersnaam…';

  @override
  String get adminAllGroups => 'Alle groepen';

  @override
  String get adminColUsername => 'Gebruikersnaam';

  @override
  String get adminColEnrolled => 'Ingeschreven';

  @override
  String get adminColLastActive => 'Laatst actief';

  @override
  String get adminColSurveysPercent => 'Enquêtes %';

  @override
  String get adminDeleteParticipant => 'Deelnemer verwijderen';

  @override
  String get adminFailedToUpdateGroup => 'Groep kon niet worden bijgewerkt.';

  @override
  String get adminDeleteParticipantTitle => 'Deelnemer verwijderen';

  @override
  String get adminDeleteParticipantContent =>
      'Hierdoor worden de gegevens van de deelnemer geanonimiseerd. Dit kan niet ongedaan worden gemaakt.';

  @override
  String get adminFailedToDeleteParticipant =>
      'Deelnemer kon niet worden verwijderd.';

  @override
  String adminParticipantCreated(String username) {
    return 'Deelnemer $username aangemaakt';
  }

  @override
  String get adminCreateParticipantTooltip => 'Deelnemer aanmaken';

  @override
  String get adminFailedToLoadParticipants =>
      'Deelnemers konden niet worden geladen.';

  @override
  String get adminPrevious => 'Vorige';

  @override
  String get adminNext => 'Volgende';

  @override
  String get adminCreateParticipantTitle => 'Deelnemer aanmaken';

  @override
  String get adminStudyGroup => 'Studiegroep';

  @override
  String get adminTokenCardFormat => 'Tokenkaartformaat';

  @override
  String get adminQrAndPrint => 'QR + afdruk';

  @override
  String get adminFailedToCreateParticipant =>
      'Deelnemer kon niet worden aangemaakt. Probeer het opnieuw.';

  @override
  String get adminSurveys => 'Enquêtes';

  @override
  String get adminFailedToUpdateStatus => 'Status kon niet worden bijgewerkt';

  @override
  String get adminNewSurveyTooltip => 'Nieuwe enquête';

  @override
  String get adminNoSurveysFound => 'Geen enquêtes gevonden';

  @override
  String get adminFailedToLoadSurveys => 'Enquêtes konden niet worden geladen';

  @override
  String get adminPublish => 'Publiceren';

  @override
  String get adminArchive => 'Archiveren';

  @override
  String get adminNewSurveyTitle => 'Nieuwe enquête';

  @override
  String get adminSurveyTitleLabel => 'Titel';

  @override
  String get adminSurveyTypeLabel => 'Type';

  @override
  String get adminTitleIsRequired => 'Titel is verplicht';

  @override
  String get adminFailedToCreateSurvey => 'Enquête kon niet worden aangemaakt';

  @override
  String get adminSurveyEditor => 'Enquête-editor';

  @override
  String get adminInvalidJson =>
      'Ongeldige JSON, corrigeer dit voordat u opslaat';

  @override
  String get adminSurveySaved => 'Enquête opgeslagen';

  @override
  String get adminFailedToSaveSurvey => 'Enquête kon niet worden opgeslagen';

  @override
  String get adminFailedToLoadSurvey => 'Enquête kon niet worden geladen';

  @override
  String get adminJsonSchema => 'JSON-schema';

  @override
  String get adminAssignToGroups => 'Toewijzen aan groepen';

  @override
  String get failedToLoadStats => 'Statistieken konden niet worden geladen';

  @override
  String get failedToLoadQuestionnaire => 'Kan vragenlijst niet laden.';

  @override
  String get getRecommendations => 'Aanbevelingen ontvangen';

  @override
  String get healthGoalPrompt => 'Aan welk gezondheidsdoel wil je werken?';

  @override
  String get goalInputSubtitle =>
      'Hoe meer context je deelt (je leefstijl, wat je al geprobeerd hebt, wat in de weg staat), hoe beter je aanbeveling wordt.';

  @override
  String get goalInputHint =>
      'bijv. Ik ben 34 en werk lange dagen achter een bureau. Ik heb moeite om voor middernacht in slaap te vallen en word uitgeput wakker. Ik heb \'s avonds hardlopen geprobeerd, maar geef het na een week op. Ik wil een realistische routine die me helpt te ontspannen en uitgeruster te voelen.';

  @override
  String get goalInputValidationError => 'Beschrijf je doel';

  @override
  String get questionnaireResponseSubmitted => 'Antwoord verzonden!';

  @override
  String get questionnaireThankYou =>
      'Bedankt voor het invullen van de vragenlijst. Je antwoorden helpen om je gewoonteaanbevelingen te personaliseren.';

  @override
  String get backToProfile => 'Terug naar profiel';

  @override
  String get thankYou => 'Bedankt';

  @override
  String get noQuestionnairesAssigned =>
      'Er zijn geen vragenlijsten aan je studie toegewezen.';

  @override
  String questionnaireCompletedOn(String date) {
    return 'Voltooid op $date';
  }

  @override
  String get questionnaireNotYetAvailable => 'Nog niet beschikbaar';

  @override
  String get questionnaireReminderMessage =>
      'Er staat een gezondheidsvragenlijst voor je klaar.';

  @override
  String get questionnaireReminderAction => 'Invullen';

  @override
  String get myHabitsTab => 'Mijn gewoontes';

  @override
  String get exploreSavedTab => 'Opgeslagen';

  @override
  String get navTabShare => 'Delen';

  @override
  String get navTabExplore => 'Ontdekken';

  @override
  String get navTabRecommend => 'Advies';

  @override
  String get navTabAccount => 'Account';

  @override
  String get newHabit => 'Nieuwe gewoonte';

  @override
  String get noHabitsYet =>
      'Nog geen gewoontes.\nTik op \"Nieuwe gewoonte\" om er een te starten.';

  @override
  String get logToday => 'Vandaag registreren';

  @override
  String get loggedToday => 'Geregistreerd ✓';

  @override
  String get habitUnlogged => 'Registratie verwijderd';

  @override
  String get pickBehaviorTitle => 'Welke gewoonte wil je vormen?';

  @override
  String get setCueTitle => 'Stel je aanleiding in';

  @override
  String get setCuePreRatedInstruction =>
      'Jouw studieconditie wijst de volgende aanleiding(en) toe. Lees ze aandachtig door: dit is het moment waarop je in actie komt.';

  @override
  String get setCueSelfSelectedInstruction =>
      'Beschrijf een specifiek moment dat regelmatig in je leven voorkomt.';

  @override
  String get setCuePlaceholder => 'bijv. Elke avond na het eten';

  @override
  String get setCueTooShort => 'Beschrijf je aanleiding in minstens 10 tekens.';

  @override
  String get confirmPlanTitle => 'Jouw plan';

  @override
  String get confirmPlanSubtitle =>
      'Lees je implementatie-intentie door en bevestig deze.';

  @override
  String get confirmPlanEditHint => 'Pas je intentie aan…';

  @override
  String confirmPlanReminderAtTime(String time) {
    return 'Herinnering om $time (ingesteld door de studie)';
  }

  @override
  String get confirmPlanNoRemindersByStudy =>
      'Geen herinneringen (ingesteld door de studie)';

  @override
  String get confirmPlanShareWithCommunity =>
      'Deel deze gewoonte anoniem met de community';

  @override
  String get durationLabel => 'Duur (minuten)';

  @override
  String get createHabit => 'Gewoonte aanmaken';

  @override
  String get habitLimitReached =>
      'Je hebt het maximale aantal gewoontes voor jouw studieconditie bereikt.';

  @override
  String get srhiCheckInTitle => 'Wekelijkse gewoonte-check-in';

  @override
  String get srhiCheckInSubtitle => 'Duurt ongeveer 2 minuten.';

  @override
  String get srhiStartButton => 'Check-in starten';

  @override
  String get srhiFormTitle => 'Gewoonte-check-in';

  @override
  String srhiStem(String behavior) {
    return '$behavior is iets…';
  }

  @override
  String get srhiScaleMin => '1 = Helemaal mee oneens';

  @override
  String get srhiScaleMax => '7 = Helemaal mee eens';

  @override
  String get srhiSubmit => 'Verzenden';

  @override
  String get srhiSubmitIncomplete =>
      'Beoordeel alle 12 items voordat je verzendt.';

  @override
  String weekLabel(int n) {
    return 'Week $n';
  }

  @override
  String get habitDetailTitle => 'Gewoontedetails';

  @override
  String get abandonHabit => 'Gewoonte opgeven';

  @override
  String get abandonConfirm =>
      'Weet je zeker dat je deze gewoonte wilt opgeven? Dit kan niet ongedaan worden gemaakt.';

  @override
  String get confirm => 'Bevestigen';

  @override
  String get heatmapTitle => 'Activiteitenlog';

  @override
  String get trajectoryTitle => 'Gewoontesterkte';

  @override
  String get enactedLabel => 'Uitgevoerd';

  @override
  String get missedLabel => 'Gemist';

  @override
  String get noLogsYet => 'Nog geen activiteit geregistreerd.';

  @override
  String get noTrajectoryYet =>
      'SRHI-gegevens verschijnen na je eerste wekelijkse check-in.';

  @override
  String get srhiExplanationTitle => 'Wat is SRHI?';

  @override
  String get srhiExplanationBody =>
      'De Self-Report Habit Index (SRHI) meet hoe automatisch dit gedrag voor je aanvoelt, op een schaal van 1 tot 7. Een hogere score betekent minder bewuste inspanning: een teken dat de gewoonte deel wordt van je routine.';

  @override
  String get srhiScoreLabel => 'Huidige SRHI-score';

  @override
  String get srhiScoreUnavailable => 'Nog niet beschikbaar';

  @override
  String get srhiNextCheckInLabel => 'Volgende check-in';

  @override
  String get srhiNextCheckInDue => 'Nu verschuldigd';

  @override
  String get srhiNextCheckInNone => 'Niet gepland';

  @override
  String get consentTitle => 'Studie-informatie & toestemming';

  @override
  String get consentUpdatedTitle => 'Bijgewerkte studietoestemming';

  @override
  String get consentConfirmText =>
      'Door op \"Ik geef toestemming\" te tikken bevestig je dat je de studie-informatie hebt gelezen en begrepen en vrijwillig instemt met deelname.';

  @override
  String get consentAccept => 'Ik geef toestemming';

  @override
  String get consentDecline => 'Ik geef geen toestemming';

  @override
  String get consentCouldNotLoad =>
      'Het toestemmingsdocument kon niet worden geladen. Controleer je verbinding.';

  @override
  String get deleteAccount => 'Account verwijderen';

  @override
  String get deleteAccountTitle => 'Account verwijderen?';

  @override
  String get deleteAccountContent =>
      'Dit verwijdert je account en inlogtoegang permanent — je kunt niet meer inloggen, en dit kan niet ongedaan worden gemaakt.\n\nJe bijgedragen gegevens (gewoonteplannen, dagelijkse registraties, vragenlijstantwoorden en donaties) blijven op onze servers staan, maar alleen als anonieme gegevens: zodra je account en identiteit zijn verwijderd, kan niets daarvan nog naar jou worden herleid.\n\nVragen of zorgen hierover? Zie:';

  @override
  String get deleteAccountConfirm => 'Definitief verwijderen';

  @override
  String get deleteAccountFailed =>
      'Verwijderen van account mislukt. Controleer je verbinding en probeer het opnieuw.';

  @override
  String get exportMyData => 'Mijn gegevens exporteren';

  @override
  String get exportFailed =>
      'Exporteren mislukt. Controleer je verbinding en probeer het opnieuw.';

  @override
  String get myDataSection => 'Mijn gegevens';

  @override
  String get studyConsent => 'Studietoestemming';

  @override
  String get legalSection => 'Juridisch';

  @override
  String get language => 'Taal';

  @override
  String get signOut => 'Afmelden';

  @override
  String get signOutConfirm => 'Weet je zeker dat je je wilt afmelden?';

  @override
  String get signingOut => 'Bezig met afmelden…';

  @override
  String get sessionExpiredMessage =>
      'Je sessie is verlopen. Meld je opnieuw aan om door te gaan.';

  @override
  String get signInAction => 'Aanmelden';

  @override
  String get aiDisclaimer =>
      'Door AI gegenereerde suggesties op basis van je studiegegevens. Dit is geen medisch advies; raadpleeg bij gezondheidsklachten een arts.';

  @override
  String get dailyReminderLabel => 'Dagelijkse herinnering';

  @override
  String get noReminders => 'Geen herinneringen';

  @override
  String get reminderFadingHint =>
      'Herinneringen worden minder frequent naarmate je gewoonte sterker wordt.';

  @override
  String get doneButton => 'Klaar';

  @override
  String get habitStrengthLabel => 'Gewoontesterkte';

  @override
  String get commentsTitle => 'Reacties';

  @override
  String get commentHint => 'Deel een gedachte (anoniem)…';

  @override
  String get noCommentsYet => 'Nog geen reacties. Wees de eerste.';

  @override
  String get couldNotPostComment => 'Kon reactie niet plaatsen';

  @override
  String get commentPendingReview =>
      'Je reactie is ingediend ter beoordeling en verschijnt zodra deze is goedgekeurd.';

  @override
  String get reportComment => 'Rapporteren';

  @override
  String get reportCommentTitle => 'Reactie rapporteren?';

  @override
  String get reportCommentBody =>
      'Deze reactie wordt direct verborgen en voorgelegd aan het onderzoeksteam ter beoordeling.';

  @override
  String get commentReported => 'Reactie gerapporteerd';

  @override
  String get couldNotReportComment => 'Kon reactie niet rapporteren';

  @override
  String get commentsDisabledMessage =>
      'Reacties zijn uitgeschakeld. Zet ze aan in Instellingen om te bekijken en te plaatsen.';

  @override
  String get communitySection => 'Community';

  @override
  String get communityComments => 'Community-reacties';

  @override
  String get communityCommentsSubtitle =>
      'Zet uit om het plaatsen en bekijken van reacties op gedeelde gewoontes te verbergen.';

  @override
  String get likeTooltip => '';

  @override
  String get adminComments => 'Reacties';

  @override
  String get adminDeleteCommentTitle => 'Reactie verwijderen?';

  @override
  String get adminDeleteCommentContent =>
      'Hiermee wordt de reactie voor alle deelnemers verwijderd. Dit kan niet ongedaan worden gemaakt.';

  @override
  String get adminFailedToDeleteComment => 'Reactie kon niet worden verwijderd';

  @override
  String get adminFailedToLoadComments => 'Reacties konden niet worden geladen';

  @override
  String get adminNoCommentsYet => 'Nog geen reacties.';

  @override
  String get onboardingShareHabitTitle => 'Deel een gewoonte';

  @override
  String get onboardingShareHabitDescription =>
      'Deel je persoonlijke gewoontes met onderzoekers om een rijker beeld van alledaags gedrag op te bouwen. Je bijdragen worden geanonimiseerd en uitsluitend gebruikt voor wetenschappelijk onderzoek. Elke gewoonte die je deelt maakt de dataset waardevoller voor iedereen.';

  @override
  String get onboardingExploreAnnotateTitle => 'Ontdekken & annoteren';

  @override
  String get onboardingExploreAnnotateDescription =>
      'Blader door de interactieve gewoontegrafiek om te ontdekken hoe gewoontes binnen de community met elkaar samenhangen. Je kunt verbindingen annoteren en context toevoegen om de gedeelde kennisbank te verbeteren. Hoe meer je ontdekt, hoe rijker de grafiek wordt.';

  @override
  String get onboardingRecommendationsTitle => 'Aanbevelingen ontvangen';

  @override
  String get onboardingRecommendationsDescription =>
      'Ontvang gepersonaliseerde gewoonteaanbevelingen op basis van je profiel en de volledige dataset. Onze aanbevelingsengine leert van bijdragen uit de community om gewoontes voor te stellen die bij jouw levensstijl passen. Ontdek nieuwe gewoontes die anderen met een vergelijkbaar profiel al nuttig hebben gevonden.';

  @override
  String get onboardingSubtitle =>
      'Een citizen-science-platform waar jouw gewoontes helpen een rijker beeld van alledaags gedrag op te bouwen.';

  @override
  String get onboardingGetStarted => 'Aan de slag';

  @override
  String get onboardingRestoreAccount => 'Bestaand account herstellen';

  @override
  String get onboardingSkip => 'Overslaan';

  @override
  String get onboardingContinue => 'Doorgaan';

  @override
  String get onboardingNext => 'Volgende';

  @override
  String get studyCodeAppBarTitle => 'Studiecode';

  @override
  String get studyCodeQuestion => 'Heb je een studiecode?';

  @override
  String get studyCodeSubtitle =>
      'Als een onderzoeker je een studiecode heeft gegeven, vul deze hier in om aan hun studie deel te nemen. Je kunt deze stap ook overslaan.';

  @override
  String get studyCodeLabel => 'Studiecode';

  @override
  String get studyCodeInvalidFormat =>
      'Vul een geldige code in het formaat HHH-XXXXX in.';

  @override
  String get studyCodeInvalid =>
      'Ongeldige code. Controleer de code en probeer het opnieuw.';

  @override
  String get studyCodeExpired => 'Deze code is verlopen.';

  @override
  String get studyCodeAlreadyUsed => 'Deze code is al gebruikt.';

  @override
  String get studyCodeGenericError =>
      'Code kon niet worden verzilverd. Controleer je verbinding.';

  @override
  String get studyCodeSkipError =>
      'Deelnemen zonder code is mislukt. Controleer je verbinding en probeer het opnieuw.';

  @override
  String get studyCodeContinueButton => 'Doorgaan met code';

  @override
  String get studyCodeSkipButton => 'Deelnemen zonder studiecode';

  @override
  String get adminQuestionnairesDeleteConfirmTitle =>
      'Vragenlijst verwijderen?';

  @override
  String adminQuestionnairesDeleteConfirmMessage(String title) {
    return '\"$title\" verwijderen? Dit kan niet ongedaan worden gemaakt.';
  }

  @override
  String get adminQuestionnairesDeleteConflict =>
      'Verwijderen niet mogelijk: de vragenlijst is toegewezen aan een actieve studie.';

  @override
  String get adminQuestionnairesDeleteForbidden =>
      'Een bibliotheekvragenlijst kan niet worden verwijderd.';

  @override
  String get adminQuestionnairesDeleteFailed =>
      'Vragenlijst kon niet worden verwijderd.';

  @override
  String get adminQuestionnairesTitle => 'Vragenlijsten';

  @override
  String get adminQuestionnairesLibraryLabel => 'Bibliotheek';

  @override
  String get adminQuestionnairesCustomTab => 'Aangepast';

  @override
  String get adminQuestionnairesNewTooltip => 'Nieuwe vragenlijst';

  @override
  String get adminQuestionnairesLoadFailed =>
      'Vragenlijsten konden niet worden geladen.';

  @override
  String get adminQuestionnairesLibraryEmpty =>
      'Geen bibliotheekvragenlijsten gevonden.';

  @override
  String get adminQuestionnairesCustomEmpty =>
      'Nog geen aangepaste vragenlijsten.\nTik op + om er een aan te maken.';

  @override
  String adminQuestionnairesItemCount(int count) {
    return '$count vragen';
  }

  @override
  String get adminQuestionnairesInactiveChip => 'Inactief';

  @override
  String get adminQuestionnairesEditDialogTitle => 'Vragenlijst bewerken';

  @override
  String get adminQuestionnairesNewDialogTitle => 'Nieuwe vragenlijst';

  @override
  String get adminQuestionnairesTitleFieldLabel => 'Titel *';

  @override
  String get adminQuestionnairesFieldRequiredError => 'Verplicht';

  @override
  String get adminQuestionnairesDescriptionFieldLabel => 'Beschrijving';

  @override
  String adminQuestionnairesQuestionsCount(int count) {
    return 'Vragen ($count)';
  }

  @override
  String get adminQuestionnairesAddButton => 'Toevoegen';

  @override
  String get adminQuestionnairesNoQuestionsYet =>
      'Nog geen vragen. Tik op \"Toevoegen\" om er een toe te voegen.';

  @override
  String get adminQuestionnairesAllQuestionsNeedText =>
      'Alle vragen moeten tekst bevatten.';

  @override
  String get adminQuestionnairesSaveFailed =>
      'Vragenlijst kon niet worden opgeslagen.';

  @override
  String get adminQuestionnairesCreateButton => 'Aanmaken';

  @override
  String adminQuestionnairesQuestionNumber(int number) {
    return 'V$number';
  }

  @override
  String get adminQuestionnairesQuestionTextFieldLabel => 'Vraagtekst';

  @override
  String get adminQuestionnairesTypeFieldLabel => 'Type';

  @override
  String get adminQuestionnairesTypeOpenText => 'Open tekst';

  @override
  String get adminQuestionnairesTypeSingleChoice => 'Enkele keuze';

  @override
  String get adminQuestionnairesTypeMultiChoice => 'Meerdere keuzes';

  @override
  String get adminQuestionnairesTypeScale => 'Schaal';

  @override
  String get adminQuestionnairesRequiredLabel => 'Verplicht';

  @override
  String adminQuestionnairesOptionsCount(int count) {
    return 'Opties ($count)';
  }

  @override
  String get adminQuestionnairesAddOption => 'Optie toevoegen';

  @override
  String adminQuestionnairesOptionLabelField(int number) {
    return 'Label voor optie $number';
  }

  @override
  String get adminShellNavParticipants => 'Deelnemers';

  @override
  String get adminShellNavSurveys => 'Enquêtes';

  @override
  String get adminShellNavQuestionnaires => 'Vragenlijsten';

  @override
  String get adminShellNavHabits => 'Gewoontes';

  @override
  String get adminShellNavDevices => 'Apparaten';

  @override
  String get adminShellNavSettings => 'Instellingen';

  @override
  String get recommendationResultsTitle => 'Aanbevelingen';

  @override
  String get recommendationTryAgain => 'Opnieuw proberen';

  @override
  String get recommendationEmptyMessage =>
      'Er zijn geen aanbevelingen gegenereerd. Probeer je doel wat gedetailleerder te beschrijven: hoe meer context je deelt, hoe beter.';

  @override
  String get recommendationTryDifferentGoal => 'Probeer een ander doel';

  @override
  String get recommendationHabitFlowError =>
      'Kon de gewoonteflow niet openen. Probeer het opnieuw.';

  @override
  String get recommendationWhyThisHelps => 'Waarom dit helpt:';

  @override
  String recommendationSourcesCount(int count) {
    return 'Bronnen ($count)';
  }

  @override
  String get recommendationAddToHabits => 'Toevoegen aan mijn gewoontes';

  @override
  String get recommendationFeedbackSubmitted => 'Feedback verzonden, bedankt!';

  @override
  String get recommendationLeaveComment => 'Laat een reactie achter:';

  @override
  String get recommendationFeedbackHint => 'Jouw feedback…';

  @override
  String get recommendationFeedbackFailed =>
      'Feedback kon niet worden verzonden';

  @override
  String get recommendationSourceLinkError => 'Kon de bronlink niet openen.';

  @override
  String get recommendationLoadingPhaseExperts =>
      'Experts worden geraadpleegd…';

  @override
  String get recommendationLoadingPhaseHabitsDb =>
      'Je gewoontedatabase wordt doorzocht…';

  @override
  String get recommendationLoadingPhasePapers =>
      'Wetenschappelijke publicaties worden gelezen…';

  @override
  String get recommendationLoadingPhaseGenerating =>
      'Je persoonlijke aanbevelingen worden gegenereerd…';

  @override
  String get recommendationLoadingTimeoutError =>
      'Het genereren van aanbevelingen duurde te lang. Probeer het opnieuw.';

  @override
  String get recommendationLoadingGenericError =>
      'Er is iets misgegaan bij het genereren van aanbevelingen. Probeer het opnieuw.';

  @override
  String get bubbleGraphNoHabitsInDimension =>
      'Nog geen gewoontes in deze dimensie.';

  @override
  String get bubbleGraphAllCategories => 'Alle categorieën';

  @override
  String bubbleGraphHabitCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count gewoontes',
      one: '1 gewoonte',
    );
    return '$_temp0';
  }

  @override
  String recommendationCardWhyTitle(String habitName) {
    return 'Waarom \"$habitName\"?';
  }

  @override
  String get recommendationCardEvidence => 'Onderbouwing';

  @override
  String get recommendationCardConfidence => 'Betrouwbaarheid';

  @override
  String get recommendationCardWhy => 'Waarom?';

  @override
  String get recommendationCardDismiss => 'Afwijzen';

  @override
  String get recommendationCardAccept => 'Accepteren';

  @override
  String get questionnaireFormRequiredQuestion => 'Deze vraag is verplicht.';

  @override
  String get questionnaireFormAnswerAllRequired =>
      'Beantwoord alle verplichte vragen voordat je verdergaat.';

  @override
  String questionnaireFormProgressLabel(int current, int total) {
    return 'Vraag $current van $total';
  }

  @override
  String get questionnaireFormBackButton => 'Terug';

  @override
  String get questionnaireFormSubmitButton => 'Verzenden';

  @override
  String get questionnaireFormSaveAndContinueButton => 'Opslaan & doorgaan';

  @override
  String get questionnaireFormAnswerHint => 'Jouw antwoord…';

  @override
  String get questionnaireFallbackTitle => 'Vragenlijst';

  @override
  String get donateShareEyebrow => 'DEEL EEN GEWOONTE';

  @override
  String get donateHeroTitle => 'Deel een gewoonte met de wetenschap';

  @override
  String get donateHeroSubtitle =>
      'Anoniem · ~2 min · Helpt onderzoekers wereldwijd';

  @override
  String get donateStartSharingButton => 'Begin met delen';

  @override
  String get donateQuestionnaireEyebrow => 'VRAGENLIJST';

  @override
  String get donateQuestionnaireDueSubtitle =>
      'Korte vragenlijst · nu in te vullen';

  @override
  String get donateCompleteButton => 'Invullen';

  @override
  String get donateSharedTodayTitle => 'Vandaag gedeeld';

  @override
  String get donateSharedTodayBody =>
      'Bedankt voor je bijdrage! Elke gedeelde gewoonte helpt ons onderzoek, deel gerust nog een gewoonte.';

  @override
  String get donateShareAnotherButton => 'Nog een gewoonte delen';

  @override
  String get donateWhyShareTitle => 'Waarom delen?';

  @override
  String get donateWhyShareBody =>
      'Gedeelde gewoontes blijven anoniem en helpen onderzoekers betere aanbevelingen te maken voor iedereen, ook voor jou.';

  @override
  String get readMoreAboutProject => 'Meer lezen over het project';

  @override
  String get donatePleaseAnswerAllQuestions => 'Beantwoord alle vragen';

  @override
  String get donateNotAHabitMessage =>
      'Dit lijkt niet op een gewoonte. Probeer een terugkerend gedrag te beschrijven, bijv. \"Ik maak elke ochtend een wandeling van 30 minuten\".';

  @override
  String get donateSavedOffline =>
      'Offline opgeslagen, wordt verzonden zodra er verbinding is';

  @override
  String get donateUnauthorized => 'Niet geautoriseerd. Log opnieuw in.';

  @override
  String get donateAnalysisUnavailable =>
      'Gewoonteanalyse is tijdelijk niet beschikbaar. Probeer het over een moment opnieuw.';

  @override
  String get donateTodaysTasksEyebrow => 'TAKEN VAN VANDAAG';

  @override
  String get donateCommunityLabel => 'Community';

  @override
  String get donateDayStreakLabel => 'Dagreeks';

  @override
  String get donateFormDescribeHabitLabel => 'Beschrijf je gewoonte';

  @override
  String get donateFormHabitHint =>
      'bijv. Ik maak elke ochtend een wandeling van 30 minuten';

  @override
  String get donateFormHabitValidationError =>
      'Beschrijf je gewoonte (minstens 10 tekens)';

  @override
  String get donateFormFrequencyQuestion => 'Hoe vaak doe je deze gewoonte?';

  @override
  String get donateFormFrequencyRarely => 'Zelden';

  @override
  String get donateFormFrequencyWeekly => 'Wekelijks';

  @override
  String get donateFormFrequencySeveralPerWeek => 'Meerdere keren/week';

  @override
  String get donateFormFrequencyDaily => 'Dagelijks';

  @override
  String get donateFormDurationQuestion => 'Hoe lang heb je deze gewoonte al?';

  @override
  String get donateFormDurationUnder1Month => '< 1 maand';

  @override
  String get donateFormDuration1To3Months => '1–3 maanden';

  @override
  String get donateFormDuration3To12Months => '3–12 maanden';

  @override
  String get donateFormDurationOver1Year => '> 1 jaar';

  @override
  String get donateFormHealthBenefitQuestion =>
      'Hoeveel voordeel heeft het voor je gezondheid?';

  @override
  String get donateFormRatingCaption => '1 = Helemaal niet · 5 = Heel erg';

  @override
  String get donateFormWellbeingQuestion => 'Hoeveel verbetert het je welzijn?';

  @override
  String get setCueNextButton => 'Volgende';

  @override
  String get setCueNoneAvailableTitle => 'Nog geen aanleidingen beschikbaar';

  @override
  String get setCueNoneAvailableSubtitle =>
      'Je studiecoördinator zal binnenkort aanleidingen toewijzen';

  @override
  String setCueAssignedNumbered(int index, int total) {
    return 'Aanleiding $index van $total (toegewezen door de studie)';
  }

  @override
  String get setCueAssignedByStudy => 'Toegewezen door de studie';

  @override
  String addAnotherCueCount(int current, int max) {
    return 'Nog een aanleiding toevoegen ($current/$max)';
  }

  @override
  String setCueMaxReachedNote(int max) {
    return 'Je kunt maximaal $max aanleidingen toevoegen.';
  }

  @override
  String get setCueLabelSingle => 'Jouw aanleiding';

  @override
  String setCueLabelNumbered(int number) {
    return 'Aanleiding $number';
  }

  @override
  String get setCueRemoveTooltip => 'Aanleiding verwijderen';

  @override
  String get setCueExtraPlaceholder => 'bijv. thuis op doordeweekse dagen';

  @override
  String couldNotLogToday(String error) {
    return 'Kon vandaag niet registreren: $error';
  }

  @override
  String get continueButton => 'Doorgaan';

  @override
  String get describeYourHabitMinLength =>
      'Beschrijf je gewoonte (min. 3 tekens)';

  @override
  String get yourHabitLabel => 'Jouw gewoonte';

  @override
  String get yourHabitHint => 'bijv. Een wandeling van 20 minuten';

  @override
  String get nextButton => 'Volgende';

  @override
  String get helpAndSupport => 'Hulp en ondersteuning';

  @override
  String get contactResearchTeam => 'Onderzoeksteam contacteren';

  @override
  String get contactResearchTeamDescription =>
      'Heb je een vraag of probleem? Stuur ons een e-mail, we nemen contact met je op.';

  @override
  String get sendEmail => 'E-mail versturen';

  @override
  String couldNotOpenEmailApp(String email) {
    return 'Kon geen e-mailapp openen. Stuur direct een e-mail naar $email.';
  }

  @override
  String get frequentlyAskedQuestions => 'Veelgestelde vragen';

  @override
  String get faqPassphraseQuestion => 'Ik ben mijn herstelzin kwijt — wat nu?';

  @override
  String get faqPassphraseAnswer =>
      'Je zin van 24 woorden is de enige manier om je account te herstellen. Heb je hem nog, gebruik dan \"Account herstellen\" op het welkomstscherm. Ben je hem kwijt, dan kunnen je account en gegevens helaas niet worden hersteld — neem contact met ons op als je opnieuw wilt beginnen.';

  @override
  String get faqDataQuestion =>
      'Kan ik mijn gegevens exporteren of verwijderen?';

  @override
  String get faqDataAnswer =>
      'Ja. Ga naar Instellingen → Mijn gegevens exporteren om alles te downloaden dat aan je account is gekoppeld, of Instellingen → Account verwijderen om het permanent te wissen. Verwijderen kan niet ongedaan worden gemaakt.';

  @override
  String get faqOfflineQuestion =>
      'Wat gebeurt er als ik offline ben tijdens het gebruik van de app?';

  @override
  String get faqOfflineAnswer =>
      'Gewoonte-registraties die je offline verstuurt, worden op je apparaat bewaard en automatisch verzonden zodra je weer online bent.';

  @override
  String get faqNotificationsQuestion => 'Kan ik herinneringen uitzetten?';

  @override
  String get faqNotificationsAnswer =>
      'Herinneringen horen bij de studie en kunnen niet in de app worden uitgezet. Indien nodig kunt u meldingen voor deze app beheren in de systeeminstellingen van uw telefoon.';

  @override
  String get faqConsentQuestion => 'Kan ik mijn toestemming intrekken?';

  @override
  String get faqConsentAnswer =>
      'Ja, op elk moment. Ga naar Instellingen → Studietoestemming om te bekijken waarmee je hebt ingestemd, of Instellingen → Account verwijderen om in te trekken en je gegevens te wissen.';

  @override
  String get changeRecoveryPassphrase => 'Herstelzin wijzigen';

  @override
  String get rotatePassphraseTitle => 'Herstelzin wijzigen?';

  @override
  String get rotatePassphraseWarning =>
      'Je huidige zin van 24 woorden werkt hierna direct niet meer. Bewaar de nieuwe zin zeker op een veilige plek.';

  @override
  String get rotatePassphraseConfirm => 'Nieuwe zin genereren';

  @override
  String get rotatePassphraseNewTitle => 'Je nieuwe herstelzin';

  @override
  String get rotatePassphraseNewSubtitle =>
      'Schrijf deze 24 woorden op of bewaar ze op een veilige plek. Je hebt ze nodig om je account te herstellen.';

  @override
  String get rotatePassphraseSavedCheckbox => 'Ik heb het opgeschreven';

  @override
  String get rotatePassphraseDone => 'Klaar';

  @override
  String get rotatePassphraseFailed =>
      'Kon geen nieuwe zin genereren. Controleer je verbinding en probeer het opnieuw.';

  @override
  String get copyToClipboard => 'Kopiëren naar klembord';

  @override
  String get passphraseCopied => 'Zin gekopieerd naar klembord';

  @override
  String get close => 'Sluiten';

  @override
  String appVersion(String version, String buildNumber) {
    return 'Versie $version ($buildNumber)';
  }

  @override
  String get habitTypeBuild => 'Build a new habit';

  @override
  String get habitTypeQuit => 'Break a habit';

  @override
  String get habitTypeFilterAll => 'All';

  @override
  String get informationOverloadInfo => 'To help habits stick, focus on your current ones before starting new ones of the same type. New slots open up as your habits become automatic.';

  @override
  String get informationOverloadBlocked => 'Let\'s focus on your current habit first — a new slot opens once it becomes more automatic.';

  @override
  String get stackOntoExistingHabitTitle => 'Stack onto an existing habit';

  @override
  String get stackOntoExistingHabitSubtitle => 'Anchor this new habit to one you already do';

  @override
  String get stackAnchorPickLabel => 'Anchor habit';

  @override
  String get stackAnchorNone => 'None';

  @override
  String get stackAnchorFreeTextLabel => 'Or type an anchor habit';

  @override
  String get stackAnchorFreeTextHint => 'e.g. After my morning coffee';

  @override
  String get habitsSection => 'Habits';

  @override
  String get informationOverloadOptOutTitle => 'Allow multiple new habits';

  @override
  String get informationOverloadOptOutSubtitle => 'Turn off the one-habit-at-a-time focus guard';

  @override
  String get progressSection => 'Progress';
}
