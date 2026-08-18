// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'Health Habit Hub';

  @override
  String get shareHabit => 'Partager une habitude';

  @override
  String get exploreHabits => 'Explorer les habitudes';

  @override
  String get settings => 'Paramètres';

  @override
  String get profile => 'Profil';

  @override
  String get habitSharedSuccess => 'Habitude partagée avec succès !';

  @override
  String get submissionFailed => 'Échec de l\'envoi. Veuillez réessayer.';

  @override
  String get questionnaireAlreadyCompleted =>
      'Ce questionnaire a déjà été complété et ne peut pas encore être rempli à nouveau.';

  @override
  String get noConnection => 'Aucune connexion';

  @override
  String get couldNotLoadSurvey =>
      'Impossible de charger le questionnaire.\nVeuillez vérifier votre connexion.';

  @override
  String get retry => 'Réessayer';

  @override
  String get refresh => 'Actualiser';

  @override
  String get graphTab => 'Graphique';

  @override
  String get statsTab => 'Statistiques';

  @override
  String get failedToLoadHabits => 'Échec du chargement des habitudes';

  @override
  String get noHabitDataYet =>
      'Aucune donnée d\'habitude disponible pour le moment.';

  @override
  String get couldNotSubmitAnnotation => 'Impossible d\'envoyer l\'annotation';

  @override
  String get communityAnnotations => 'Annotations de la communauté';

  @override
  String get unknown => 'Inconnu';

  @override
  String iDoThisCount(String count) {
    return 'Moi aussi je le fais : $count';
  }

  @override
  String helpfulCount(String count) {
    return 'Enregistré : $count';
  }

  @override
  String get iDoThisToo => 'Moi aussi je le fais';

  @override
  String get helpful => 'Enregistrer';

  @override
  String get savedSection => 'Enregistré';

  @override
  String get failedToLoadSettings => 'Échec du chargement des paramètres';

  @override
  String get tokenCardFormat => 'Format de la carte-jeton';

  @override
  String get tokenCardFormatDescription =>
      'Sélectionnez le format utilisé pour générer les cartes-jetons des nouveaux participants.';

  @override
  String get settingsSaved => 'Paramètres enregistrés';

  @override
  String get failedToSaveSettings =>
      'Échec de l\'enregistrement des paramètres';

  @override
  String get privacyStatement => 'Déclaration de confidentialité';

  @override
  String get accessibilityStatement => 'Déclaration d\'accessibilité';

  @override
  String get imprint => 'Mentions légales';

  @override
  String get couldNotLoadLegalDocument =>
      'Impossible de charger ce document.\nVeuillez vérifier votre connexion.';

  @override
  String get save => 'Enregistrer';

  @override
  String get qrOnly => 'QR uniquement';

  @override
  String get qrOnlyDescription => 'Générer uniquement des jetons QR code';

  @override
  String get printOnly => 'Impression uniquement';

  @override
  String get printOnlyDescription =>
      'Générer uniquement des cartes-jetons imprimables';

  @override
  String get both => 'Les deux';

  @override
  String get bothDescription =>
      'Générer des jetons QR code et des cartes-jetons imprimables';

  @override
  String get myProfile => 'Mon profil';

  @override
  String get profileSavedSuccess => 'Profil enregistré avec succès !';

  @override
  String get profileEnterNumber => 'Saisissez un nombre';

  @override
  String get profileEnterText => 'Saisissez du texte';

  @override
  String profileIncompleteBanner(String fields) {
    return 'Il manque à votre profil : $fields';
  }

  @override
  String get profileCompleteNow => 'Compléter maintenant';

  @override
  String get couldNotLoadProfile =>
      'Impossible de charger le profil.\nVeuillez vérifier votre connexion.';

  @override
  String get healthQuestionnaires => 'Questionnaires de santé';

  @override
  String get sliqLifestyleIndex => 'SLIQ : indice de mode de vie';

  @override
  String get rand36HealthSurvey => 'RAND-36 : enquête de santé';

  @override
  String get restoreAccountOnDevice => 'Restaurer le compte sur cet appareil';

  @override
  String get studyMembershipTitle => 'Étude';

  @override
  String get studyMembershipCurrentLabel => 'Étude actuelle';

  @override
  String get studyMembershipDefaultLabel =>
      'Étude générale (sans code d\'étude)';

  @override
  String studyMembershipGroupLabel(String groupLabel) {
    return 'Groupe : $groupLabel';
  }

  @override
  String get studyMembershipLoadFailed =>
      'Impossible de charger vos informations d\'étude.';

  @override
  String get studyMembershipJoinButton => 'Rejoindre une autre étude';

  @override
  String get studyMembershipLeaveButton => 'Quitter l\'étude';

  @override
  String get studyMembershipJoinDialogTitle => 'Rejoindre une étude';

  @override
  String get studyMembershipJoinDialogBody =>
      'Saisissez le code d\'étude fourni par un chercheur. Les habitudes, journaux et réponses déjà partagés restent associés à votre étude actuelle ; seul ce que vous faites à partir de maintenant compte pour la nouvelle étude.';

  @override
  String get studyMembershipCodeLabel => 'Code d\'étude';

  @override
  String get studyMembershipJoinConfirm => 'Rejoindre';

  @override
  String studyMembershipJoinSuccess(String studyName) {
    return 'Vous avez rejoint $studyName.';
  }

  @override
  String get studyMembershipAlreadyInStudy =>
      'Vous êtes déjà dans cette étude.';

  @override
  String get studyMembershipInvalidCode =>
      'Code invalide. Veuillez vérifier et réessayer.';

  @override
  String get studyMembershipCodeExpired => 'Ce code a expiré.';

  @override
  String get studyMembershipCodeUsedUp =>
      'Ce code a déjà été entièrement utilisé.';

  @override
  String get studyMembershipJoinFailed =>
      'Impossible de rejoindre cette étude. Veuillez vérifier votre connexion.';

  @override
  String get studyMembershipLeaveConfirmTitle => 'Quitter cette étude ?';

  @override
  String get studyMembershipLeaveConfirmBody =>
      'Vous passerez à l\'étude générale. Rien n\'est supprimé : vos habitudes, journaux et réponses aux questionnaires existants restent inchangés et toujours associés à cette étude.';

  @override
  String get studyMembershipLeaveSuccess => 'Vous avez quitté l\'étude.';

  @override
  String get studyMembershipLeaveFailed =>
      'Impossible de quitter l\'étude. Veuillez vérifier votre connexion.';

  @override
  String get profileCompleted => 'Profil complété';

  @override
  String completedOn(String date) {
    return 'Complété le $date';
  }

  @override
  String get edit => 'Modifier';

  @override
  String get appearance => 'Apparence';

  @override
  String get light => 'Clair';

  @override
  String get system => 'Système';

  @override
  String get dark => 'Sombre';

  @override
  String get cancel => 'Annuler';

  @override
  String get delete => 'Supprimer';

  @override
  String get create => 'Créer';

  @override
  String get apply => 'Appliquer';

  @override
  String get adminDeviceSessions => 'Sessions des appareils';

  @override
  String get adminRevokeSessionTitle => 'Révoquer la session ?';

  @override
  String adminRevokeSessionContent(String participantId) {
    return 'Révoquer la session du participant $participantId ?\nIl sera déconnecté immédiatement.';
  }

  @override
  String get adminRevoke => 'Révoquer';

  @override
  String get adminSessionRevoked => 'Session révoquée';

  @override
  String get adminFailedToRevokeSession =>
      'Échec de la révocation de la session';

  @override
  String get adminNoActiveSessions => 'Aucune session active';

  @override
  String get adminFailedToLoadSessions => 'Échec du chargement des sessions';

  @override
  String get adminColParticipantId => 'ID du participant';

  @override
  String get adminColDeviceType => 'Type d\'appareil';

  @override
  String get adminColAppVersion => 'Version de l\'application';

  @override
  String get adminColLastSeen => 'Dernière connexion';

  @override
  String get adminColSessionId => 'ID de session';

  @override
  String get adminColActions => 'Actions';

  @override
  String get adminDonatedHabits => 'Habitudes partagées';

  @override
  String get adminAutoRefreshOn => 'Actualisation automatique activée';

  @override
  String get adminAutoRefreshOff => 'Actualisation automatique désactivée';

  @override
  String get adminCouldNotOpenExportUrl =>
      'Impossible d\'ouvrir l\'URL d\'export';

  @override
  String get adminCsvExportFailed => 'Échec de l\'export CSV';

  @override
  String get adminAllDates => 'Toutes les dates';

  @override
  String get adminGroup => 'Groupe';

  @override
  String get adminCategory => 'Catégorie';

  @override
  String get adminAll => 'Tous';

  @override
  String get adminClearDateRange => 'Effacer la plage de dates';

  @override
  String get adminCsv => 'CSV';

  @override
  String get adminNoHabitDonationsFound => 'Aucune habitude partagée trouvée';

  @override
  String get adminFailedToLoadHabitDonations =>
      'Échec du chargement des habitudes partagées';

  @override
  String adminParticipantTitle(String participantId) {
    return 'Participant $participantId';
  }

  @override
  String get adminExportJson => 'Exporter en JSON';

  @override
  String get adminFailedToExportProgress =>
      'Échec de l\'export des données de progression.';

  @override
  String get adminProfileCard => 'Profil';

  @override
  String get adminProfileNotYetCompleted => 'Pas encore complété';

  @override
  String adminSurveysCompleted(int count) {
    return 'Enquêtes complétées ($count)';
  }

  @override
  String get adminNoSurveysCompletedYet =>
      'Aucune enquête complétée pour le moment.';

  @override
  String adminHabitsDonated(int count) {
    return 'Habitudes partagées ($count)';
  }

  @override
  String get adminNoHabitsDonatedYet =>
      'Aucune habitude partagée pour le moment.';

  @override
  String adminHabitsDonatedDetail(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count habitudes partagées. Les détails de chaque habitude sont disponibles dans le moniteur des habitudes.',
      one:
          '1 habitude partagée. Les détails de chaque habitude sont disponibles dans le moniteur des habitudes.',
    );
    return '$_temp0';
  }

  @override
  String get adminRecommendations => 'Recommandations';

  @override
  String get adminAccepted => 'Acceptées';

  @override
  String get adminDismissed => 'Rejetées';

  @override
  String get adminTimeline => 'Chronologie';

  @override
  String get adminNoTimelineEventsYet =>
      'Aucun événement dans la chronologie pour le moment.';

  @override
  String get adminTimelineEnrolled => 'Inscrit';

  @override
  String get adminTimelineSurveyCompleted => 'Enquête complétée';

  @override
  String get adminTimelineRecommendationAccepted => 'Recommandation acceptée';

  @override
  String get adminTimelineRecommendationDismissed => 'Recommandation rejetée';

  @override
  String get adminFailedToLoadParticipantProgress =>
      'Échec du chargement de la progression du participant.';

  @override
  String get adminParticipants => 'Participants';

  @override
  String get adminNoParticipantsFound => 'Aucun participant trouvé.';

  @override
  String get adminSearchByUsername => 'Rechercher par nom d\'utilisateur…';

  @override
  String get adminAllGroups => 'Tous les groupes';

  @override
  String get adminColUsername => 'Nom d\'utilisateur';

  @override
  String get adminColEnrolled => 'Inscrit';

  @override
  String get adminColLastActive => 'Dernière activité';

  @override
  String get adminColSurveysPercent => 'Enquêtes %';

  @override
  String get adminDeleteParticipant => 'Supprimer le participant';

  @override
  String get adminFailedToUpdateGroup => 'Échec de la mise à jour du groupe.';

  @override
  String get adminDeleteParticipantTitle => 'Supprimer le participant';

  @override
  String get adminDeleteParticipantContent =>
      'Cela anonymisera les données du participant. Cette action est irréversible.';

  @override
  String get adminFailedToDeleteParticipant =>
      'Échec de la suppression du participant.';

  @override
  String adminParticipantCreated(String username) {
    return 'Participant $username créé';
  }

  @override
  String get adminCreateParticipantTooltip => 'Créer un participant';

  @override
  String get adminFailedToLoadParticipants =>
      'Échec du chargement des participants.';

  @override
  String get adminPrevious => 'Précédent';

  @override
  String get adminNext => 'Suivant';

  @override
  String get adminCreateParticipantTitle => 'Créer un participant';

  @override
  String get adminStudyGroup => 'Groupe d\'étude';

  @override
  String get adminTokenCardFormat => 'Format de la carte-jeton';

  @override
  String get adminQrAndPrint => 'QR + Impression';

  @override
  String get adminFailedToCreateParticipant =>
      'Échec de la création du participant. Veuillez réessayer.';

  @override
  String get adminSurveys => 'Enquêtes';

  @override
  String get adminFailedToUpdateStatus => 'Échec de la mise à jour du statut';

  @override
  String get adminNewSurveyTooltip => 'Nouvelle enquête';

  @override
  String get adminNoSurveysFound => 'Aucune enquête trouvée';

  @override
  String get adminFailedToLoadSurveys => 'Échec du chargement des enquêtes';

  @override
  String get adminPublish => 'Publier';

  @override
  String get adminArchive => 'Archiver';

  @override
  String get adminNewSurveyTitle => 'Nouvelle enquête';

  @override
  String get adminSurveyTitleLabel => 'Titre';

  @override
  String get adminSurveyTypeLabel => 'Type';

  @override
  String get adminTitleIsRequired => 'Le titre est requis';

  @override
  String get adminFailedToCreateSurvey => 'Échec de la création de l\'enquête';

  @override
  String get adminSurveyEditor => 'Éditeur d\'enquête';

  @override
  String get adminInvalidJson =>
      'JSON invalide, veuillez corriger avant d\'enregistrer';

  @override
  String get adminSurveySaved => 'Enquête enregistrée';

  @override
  String get adminFailedToSaveSurvey =>
      'Échec de l\'enregistrement de l\'enquête';

  @override
  String get adminFailedToLoadSurvey => 'Échec du chargement de l\'enquête';

  @override
  String get adminJsonSchema => 'Schéma JSON';

  @override
  String get adminAssignToGroups => 'Attribuer à des groupes';

  @override
  String get failedToLoadStats => 'Échec du chargement des statistiques';

  @override
  String get failedToLoadQuestionnaire =>
      'Échec du chargement du questionnaire.';

  @override
  String get getRecommendations => 'Obtenir des recommandations';

  @override
  String get healthGoalPrompt =>
      'Sur quel objectif de santé aimeriez-vous travailler ?';

  @override
  String get goalInputSubtitle =>
      'Plus vous partagez de contexte (votre mode de vie, ce que vous avez déjà essayé, ce qui vous freine), meilleure sera votre recommandation.';

  @override
  String get goalInputHint =>
      'p. ex. J\'ai 34 ans et je travaille de longues heures assis à un bureau. J\'ai du mal à m\'endormir avant minuit et je me réveille épuisé. J\'ai essayé de courir le soir, mais j\'abandonne après une semaine. Je veux une routine réaliste qui m\'aide à décompresser et à me sentir plus reposé.';

  @override
  String get goalInputValidationError => 'Veuillez décrire votre objectif';

  @override
  String get recommendWhyCardTitle =>
      'Comment fonctionnent les recommandations ?';

  @override
  String get recommendWhyCardBody =>
      'Nous comparons ton objectif à des habitudes similaires partagées par d\'autres, puis un modèle de langage transforme les meilleures correspondances en une suggestion personnalisée.';

  @override
  String get recommendWhyCardLink => 'Voir comment ça marche';

  @override
  String get questionnaireResponseSubmitted => 'Réponse envoyée !';

  @override
  String get questionnaireThankYou =>
      'Merci d\'avoir complété le questionnaire. Vos réponses permettent de personnaliser vos recommandations d\'habitudes.';

  @override
  String get backToProfile => 'Retour au profil';

  @override
  String get thankYou => 'Merci';

  @override
  String get noQuestionnairesDue =>
      'Aucun questionnaire à remplir pour le moment.';

  @override
  String questionnaireCompletedOn(String date) {
    return 'Terminé le $date';
  }

  @override
  String get questionnaireNotYetAvailable => 'Pas encore disponible';

  @override
  String get myHabitsTab => 'Mes habitudes';

  @override
  String get exploreSavedTab => 'Enregistrées';

  @override
  String get navTabShare => 'Partager';

  @override
  String get navTabExplore => 'Explorer';

  @override
  String get navTabRecommend => 'Recommandé';

  @override
  String get navTabAccount => 'Compte';

  @override
  String get newHabit => 'Nouvelle habitude';

  @override
  String get noHabitsYet =>
      'Aucune habitude pour le moment.\nAppuyez sur « Nouvelle habitude » pour commencer à en former une.';

  @override
  String get logToday => 'Enregistrer aujourd\'hui';

  @override
  String get loggedToday => 'Enregistré ✓';

  @override
  String get logForAnotherDay => 'Enregistrer pour un autre jour';

  @override
  String get backfillSheetTitle => 'Enregistrer un autre jour';

  @override
  String get backfillSheetSubtitle =>
      'Appuyez sur un jour pour le marquer comme fait, ou appuyez à nouveau pour annuler.';

  @override
  String get today => 'Aujourd\'hui';

  @override
  String get yesterday => 'Hier';

  @override
  String get pickBehaviorTitle => 'Quelle habitude souhaitez-vous former ?';

  @override
  String get setCueTitle => 'Définissez votre signal';

  @override
  String get setCuePreRatedInstruction =>
      'Votre condition d\'étude vous attribue le ou les signaux suivants. Lisez-les attentivement : c\'est le moment où vous agirez.';

  @override
  String get setCueSelfSelectedInstruction =>
      'Décrivez un moment précis qui se produit régulièrement dans votre vie.';

  @override
  String get setCuePlaceholder => 'p. ex. Après le dîner chaque soir';

  @override
  String get setCueTooShort =>
      'Veuillez décrire votre signal en au moins 10 caractères.';

  @override
  String get confirmPlanTitle => 'Votre plan';

  @override
  String get confirmPlanSubtitle =>
      'Lisez votre intention de mise en œuvre et confirmez-la.';

  @override
  String get confirmPlanEditHint => 'Modifiez votre intention…';

  @override
  String confirmPlanReminderAtTime(String time) {
    return 'Rappel à $time (défini par l\'étude)';
  }

  @override
  String get confirmPlanNoRemindersByStudy =>
      'Aucun rappel (défini par l\'étude)';

  @override
  String get confirmPlanShareWithCommunity =>
      'Partager cette habitude anonymement avec la communauté';

  @override
  String get durationLabel => 'Durée (minutes)';

  @override
  String get createHabit => 'Créer l\'habitude';

  @override
  String get habitLimitReached =>
      'Vous avez atteint la limite d\'habitudes pour votre condition d\'étude.';

  @override
  String get srhiCheckInTitle => 'Bilan hebdomadaire des habitudes';

  @override
  String get srhiCheckInSubtitle => 'Prend environ 2 minutes.';

  @override
  String get srhiStartButton => 'Commencer le bilan';

  @override
  String get srhiFormTitle => 'Bilan de l\'habitude';

  @override
  String srhiStem(String behavior) {
    return '$behavior est quelque chose…';
  }

  @override
  String get srhiScaleMin => '1 = Pas du tout d\'accord';

  @override
  String get srhiScaleMax => '7 = Tout à fait d\'accord';

  @override
  String get srhiSubmit => 'Envoyer';

  @override
  String get srhiSubmitIncomplete =>
      'Veuillez évaluer les 12 éléments avant d\'envoyer.';

  @override
  String weekLabel(int n) {
    return 'Semaine $n';
  }

  @override
  String get habitDetailTitle => 'Détail de l\'habitude';

  @override
  String get abandonHabit => 'Abandonner l\'habitude';

  @override
  String get abandonConfirm =>
      'Êtes-vous sûr de vouloir abandonner cette habitude ? Cette action est irréversible.';

  @override
  String get confirm => 'Confirmer';

  @override
  String get heatmapTitle => 'Journal d\'activité';

  @override
  String get trajectoryTitle => 'Force de l\'habitude';

  @override
  String get enactedLabel => 'Réalisé';

  @override
  String get missedLabel => 'Manqué';

  @override
  String get noLogsYet => 'Aucune activité enregistrée pour le moment.';

  @override
  String get noTrajectoryYet =>
      'Les données SRHI apparaîtront après votre premier bilan hebdomadaire.';

  @override
  String get srhiChartWeekAxis => 'Semaine d\'étude';

  @override
  String get srhiChartScoreAxis => 'Score SRHI (1–7)';

  @override
  String srhiChartTooltip(int week, String score) {
    return 'Semaine $week : $score / 7';
  }

  @override
  String get automaticityTitle => 'Automaticity';

  @override
  String get automaticityExplanationBody =>
      'Automaticity combines your habit strength, recent adherence, and current streak into a single 0-100% score of how self-sustaining this habit has become. It\'s the same signal that determines how often you\'re reminded.';

  @override
  String get noAutomaticityYet =>
      'Automaticity data will appear after your first weekly check-in.';

  @override
  String get automaticityChartScoreAxis => 'Automaticity';

  @override
  String automaticityChartTooltip(int week, String percent) {
    return 'Week $week: $percent%';
  }

  @override
  String get srhiExplanationTitle => 'Qu\'est-ce que le SRHI ?';

  @override
  String get srhiExplanationBody =>
      'Le Self-Report Habit Index (SRHI) mesure à quel point ce comportement vous semble automatique, sur une échelle de 1 à 7. Un score plus élevé signifie moins d\'effort conscient : un signe que l\'habitude s\'intègre à votre routine.';

  @override
  String get srhiScoreLabel => 'Score SRHI actuel';

  @override
  String get srhiScoreUnavailable => 'Pas encore disponible';

  @override
  String get srhiNextCheckInLabel => 'Prochain bilan';

  @override
  String get srhiNextCheckInDue => 'À faire maintenant';

  @override
  String get srhiNextCheckInNone => 'Aucun programmé';

  @override
  String get consentTitle => 'Informations sur l\'étude et consentement';

  @override
  String get consentUpdatedTitle => 'Consentement d\'étude mis à jour';

  @override
  String get consentConfirmText =>
      'En appuyant sur « Je consens », vous confirmez avoir lu et compris les informations sur l\'étude et acceptez d\'y participer volontairement.';

  @override
  String get consentAccept => 'Je consens';

  @override
  String get consentDecline => 'Je ne consens pas';

  @override
  String get consentCouldNotLoad =>
      'Le document de consentement n\'a pas pu être chargé. Veuillez vérifier votre connexion.';

  @override
  String get deleteAccount => 'Supprimer le compte';

  @override
  String get deleteAccountTitle => 'Supprimer le compte ?';

  @override
  String get deleteAccountContent =>
      'Cette action supprime définitivement votre compte et votre accès — vous ne pourrez plus vous reconnecter, et cette action est irréversible.\n\nVos données contribuées (plans d\'habitudes, journaux quotidiens, réponses aux questionnaires et dons) restent sur nos serveurs, mais uniquement sous forme d\'entrées anonymes : une fois votre compte et votre identité supprimés, rien ne permet de les relier à vous.\n\nDes questions ou des préoccupations à ce sujet ? Consultez :';

  @override
  String get deleteAccountConfirm => 'Supprimer définitivement';

  @override
  String get deleteAccountFailed =>
      'Échec de la suppression du compte. Veuillez vérifier votre connexion et réessayer.';

  @override
  String get exportMyData => 'Exporter mes données';

  @override
  String get exportFailed =>
      'Échec de l\'export. Veuillez vérifier votre connexion et réessayer.';

  @override
  String get myDataSection => 'Mes données';

  @override
  String get studyConsent => 'Consentement d\'étude';

  @override
  String get legalSection => 'Informations légales';

  @override
  String get language => 'Langue';

  @override
  String get signOut => 'Se déconnecter';

  @override
  String get signOutConfirm => 'Êtes-vous sûr de vouloir vous déconnecter ?';

  @override
  String get signingOut => 'Déconnexion…';

  @override
  String get sessionExpiredMessage =>
      'Votre session a expiré. Veuillez vous reconnecter pour continuer.';

  @override
  String get signInAction => 'Se connecter';

  @override
  String get aiDisclaimer =>
      'Suggestions générées par IA à partir des données de votre étude. Ceci ne constitue pas un avis médical ; consultez un médecin pour toute question de santé.';

  @override
  String get dailyReminderLabel => 'Rappel quotidien';

  @override
  String get habitCadenceQuestion => 'À quelle fréquence ?';

  @override
  String get habitCadenceDaily => 'Tous les jours';

  @override
  String get habitCadenceWeeklyOption => 'N fois par semaine';

  @override
  String habitCadenceTargetLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count fois par semaine',
      one: '1 fois par semaine',
    );
    return '$_temp0';
  }

  @override
  String weeklyProgressLabel(int done, int target) {
    return '$done / $target cette semaine';
  }

  @override
  String weeklyStreakLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'série de $count semaines',
      one: 'série d\'1 semaine',
    );
    return '$_temp0';
  }

  @override
  String get noReminders => 'Aucun rappel';

  @override
  String get reminderFadingHint =>
      'Les rappels deviennent moins fréquents à mesure que votre habitude se renforce.';

  @override
  String get doneButton => 'Terminé';

  @override
  String get habitStrengthLabel => 'Force de l\'habitude';

  @override
  String get commentsTitle => 'Commentaires';

  @override
  String get commentHint => 'Partagez une réflexion (anonyme)…';

  @override
  String get noCommentsYet =>
      'Aucun commentaire pour le moment. Soyez le premier.';

  @override
  String get couldNotPostComment => 'Impossible de publier le commentaire';

  @override
  String get commentPendingReview =>
      'Votre commentaire a été soumis pour examen et apparaîtra une fois approuvé.';

  @override
  String get reportComment => 'Signaler';

  @override
  String get reportCommentTitle => 'Signaler ce commentaire ?';

  @override
  String get reportCommentBody =>
      'Ce commentaire sera immédiatement masqué et transmis à l\'équipe de l\'étude pour examen.';

  @override
  String get commentReported => 'Commentaire signalé';

  @override
  String get couldNotReportComment => 'Impossible de signaler le commentaire';

  @override
  String get commentsDisabledMessage =>
      'Les commentaires sont désactivés. Activez-les dans les paramètres pour les afficher et en publier.';

  @override
  String get communitySection => 'Communauté';

  @override
  String get communityComments => 'Commentaires de la communauté';

  @override
  String get communityCommentsSubtitle =>
      'Désactivez pour masquer la publication et la consultation des commentaires sur les habitudes partagées.';

  @override
  String get likeTooltip => '';

  @override
  String get adminComments => 'Commentaires';

  @override
  String get adminDeleteCommentTitle => 'Supprimer le commentaire ?';

  @override
  String get adminDeleteCommentContent =>
      'Cela supprime le commentaire pour tous les participants. Cette action est irréversible.';

  @override
  String get adminFailedToDeleteComment =>
      'Échec de la suppression du commentaire';

  @override
  String get adminFailedToLoadComments =>
      'Échec du chargement des commentaires';

  @override
  String get adminNoCommentsYet => 'Aucun commentaire pour le moment.';

  @override
  String get onboardingShareHabitTitle => 'Partager une habitude';

  @override
  String get onboardingShareHabitDescription =>
      'Partagez vos habitudes personnelles avec les chercheurs pour aider à mieux comprendre les comportements du quotidien. Vos contributions sont anonymisées et utilisées uniquement à des fins de recherche scientifique. Chaque habitude que vous partagez rend le jeu de données plus précieux pour tout le monde.';

  @override
  String get onboardingExploreAnnotateTitle => 'Explorer et annoter';

  @override
  String get onboardingExploreAnnotateDescription =>
      'Parcourez le graphique interactif des habitudes pour découvrir comment elles sont liées entre elles au sein de la communauté. Vous pouvez annoter les connexions et ajouter du contexte pour enrichir la base de connaissances partagée. Plus vous explorez, plus le graphique s\'enrichit.';

  @override
  String get onboardingRecommendationsTitle => 'Obtenir des recommandations';

  @override
  String get onboardingRecommendationsDescription =>
      'Recevez des recommandations d\'habitudes personnalisées basées sur votre profil et le jeu de données collectif. Notre moteur de recommandation apprend des contributions de la communauté pour suggérer des habitudes adaptées à votre mode de vie. Découvrez de nouvelles habitudes que d\'autres personnes ayant un profil similaire ont trouvées utiles.';

  @override
  String get onboardingSubtitle =>
      'Une plateforme de science participative où vos habitudes contribuent à une meilleure compréhension des comportements du quotidien.';

  @override
  String get onboardingGetStarted => 'Commencer';

  @override
  String get onboardingRestoreAccount => 'Restaurer un compte existant';

  @override
  String get onboardingSkip => 'Passer';

  @override
  String get onboardingContinue => 'Continuer';

  @override
  String get onboardingNext => 'Suivant';

  @override
  String get studyCodeAppBarTitle => 'Code d\'étude';

  @override
  String get studyCodeQuestion => 'Avez-vous un code d\'étude ?';

  @override
  String get studyCodeSubtitle =>
      'Si un chercheur vous a donné un code d\'étude, saisissez-le ici pour rejoindre son étude. Vous pouvez aussi passer cette étape.';

  @override
  String get studyCodeLabel => 'Code d\'étude';

  @override
  String get studyCodeInvalidFormat =>
      'Saisissez un code valide au format HHH-XXXXX.';

  @override
  String get studyCodeInvalid =>
      'Code invalide. Veuillez vérifier et réessayer.';

  @override
  String get studyCodeExpired => 'Ce code a expiré.';

  @override
  String get studyCodeAlreadyUsed => 'Ce code a déjà été utilisé.';

  @override
  String get studyCodeGenericError =>
      'Impossible d\'utiliser ce code. Veuillez vérifier votre connexion.';

  @override
  String get studyCodeSkipError =>
      'Impossible de continuer sans code. Veuillez vérifier votre connexion et réessayer.';

  @override
  String get studyCodeContinueButton => 'Continuer avec le code';

  @override
  String get studyCodeSkipButton => 'Rejoindre sans code d\'étude';

  @override
  String get adminQuestionnairesDeleteConfirmTitle =>
      'Supprimer le questionnaire ?';

  @override
  String adminQuestionnairesDeleteConfirmMessage(String title) {
    return 'Supprimer « $title » ? Cette action est irréversible.';
  }

  @override
  String get adminQuestionnairesDeleteConflict =>
      'Suppression impossible : le questionnaire est attribué à une étude active.';

  @override
  String get adminQuestionnairesDeleteForbidden =>
      'Impossible de supprimer un questionnaire de la bibliothèque.';

  @override
  String get adminQuestionnairesDeleteFailed =>
      'Échec de la suppression du questionnaire.';

  @override
  String get adminQuestionnairesTitle => 'Questionnaires';

  @override
  String get adminQuestionnairesLibraryLabel => 'Bibliothèque';

  @override
  String get adminQuestionnairesCustomTab => 'Personnalisés';

  @override
  String get adminQuestionnairesNewTooltip => 'Nouveau questionnaire';

  @override
  String get adminQuestionnairesLoadFailed =>
      'Échec du chargement des questionnaires.';

  @override
  String get adminQuestionnairesLibraryEmpty =>
      'Aucun questionnaire de bibliothèque trouvé.';

  @override
  String get adminQuestionnairesCustomEmpty =>
      'Aucun questionnaire personnalisé pour le moment.\nAppuyez sur + pour en créer un.';

  @override
  String adminQuestionnairesItemCount(int count) {
    return '$count questions';
  }

  @override
  String get adminQuestionnairesInactiveChip => 'Inactif';

  @override
  String get adminQuestionnairesEditDialogTitle => 'Modifier le questionnaire';

  @override
  String get adminQuestionnairesNewDialogTitle => 'Nouveau questionnaire';

  @override
  String get adminQuestionnairesTitleFieldLabel => 'Titre *';

  @override
  String get adminQuestionnairesFieldRequiredError => 'Obligatoire';

  @override
  String get adminQuestionnairesDescriptionFieldLabel => 'Description';

  @override
  String adminQuestionnairesQuestionsCount(int count) {
    return 'Questions ($count)';
  }

  @override
  String get adminQuestionnairesAddButton => 'Ajouter';

  @override
  String get adminQuestionnairesNoQuestionsYet =>
      'Aucune question pour le moment. Appuyez sur « Ajouter » pour en ajouter une.';

  @override
  String get adminQuestionnairesAllQuestionsNeedText =>
      'Toutes les questions doivent contenir du texte.';

  @override
  String get adminQuestionnairesSaveFailed =>
      'Échec de l\'enregistrement du questionnaire.';

  @override
  String get adminQuestionnairesCreateButton => 'Créer';

  @override
  String adminQuestionnairesQuestionNumber(int number) {
    return 'Q$number';
  }

  @override
  String get adminQuestionnairesQuestionTextFieldLabel =>
      'Texte de la question';

  @override
  String get adminQuestionnairesTypeFieldLabel => 'Type';

  @override
  String get adminQuestionnairesTypeOpenText => 'Texte libre';

  @override
  String get adminQuestionnairesTypeSingleChoice => 'Choix unique';

  @override
  String get adminQuestionnairesTypeMultiChoice => 'Choix multiple';

  @override
  String get adminQuestionnairesTypeScale => 'Échelle';

  @override
  String get adminQuestionnairesRequiredLabel => 'Obligatoire';

  @override
  String adminQuestionnairesOptionsCount(int count) {
    return 'Options ($count)';
  }

  @override
  String get adminQuestionnairesAddOption => 'Ajouter une option';

  @override
  String adminQuestionnairesOptionLabelField(int number) {
    return 'Libellé de l\'option $number';
  }

  @override
  String get adminShellNavParticipants => 'Participants';

  @override
  String get adminShellNavSurveys => 'Enquêtes';

  @override
  String get adminShellNavQuestionnaires => 'Questionnaires';

  @override
  String get adminShellNavHabits => 'Habitudes';

  @override
  String get adminShellNavDevices => 'Appareils';

  @override
  String get adminShellNavSettings => 'Paramètres';

  @override
  String get recommendationResultsTitle => 'Recommandations';

  @override
  String get recommendationTryAgain => 'Réessayer';

  @override
  String get recommendationEmptyMessage =>
      'Aucune recommandation n\'a été générée. Essayez de décrire votre objectif plus en détail : plus vous partagez de contexte, mieux c\'est.';

  @override
  String get recommendationTryDifferentGoal => 'Essayer un autre objectif';

  @override
  String get recommendationHabitFlowError =>
      'Impossible d\'ouvrir le parcours de création d\'habitude. Veuillez réessayer.';

  @override
  String get recommendationWhyThisHelps => 'Pourquoi cela aide :';

  @override
  String recommendationSourcesCount(int count) {
    return 'Sources ($count)';
  }

  @override
  String get recommendationAddToHabits => 'Ajouter à mes habitudes';

  @override
  String get recommendationFeedbackSubmitted => 'Commentaire envoyé, merci !';

  @override
  String get recommendationLeaveComment => 'Laissez un commentaire :';

  @override
  String get recommendationFeedbackHint => 'Votre commentaire…';

  @override
  String get recommendationFeedbackFailed => 'Échec de l\'envoi du commentaire';

  @override
  String get recommendationSourceLinkError =>
      'Impossible d\'ouvrir le lien de la source.';

  @override
  String get recommendationLoadingPhaseCommunity =>
      'Comparaison avec des habitudes essayées par des personnes comme toi…';

  @override
  String get recommendationLoadingPhaseHistory =>
      'Vérification de ce qui fonctionne déjà pour toi…';

  @override
  String get recommendationLoadingPhaseResearch =>
      'Consultation de la recherche sur le changement de comportement…';

  @override
  String get recommendationLoadingPhaseGenerating =>
      'Rédaction de ta suggestion personnalisée…';

  @override
  String get recommendationLoadingTimeoutError =>
      'La génération des recommandations a pris trop de temps. Veuillez réessayer.';

  @override
  String get recommendationLoadingGenericError =>
      'Une erreur s\'est produite lors de la génération des recommandations. Veuillez réessayer.';

  @override
  String get bubbleGraphNoHabitsInDimension =>
      'Aucune habitude dans cette dimension pour le moment.';

  @override
  String get bubbleGraphAllCategories => 'Toutes les catégories';

  @override
  String bubbleGraphHabitCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count habitudes',
      one: '1 habitude',
    );
    return '$_temp0';
  }

  @override
  String get bubbleGraphDimensionTime => 'Temps';

  @override
  String get bubbleGraphDimensionBehavior => 'Comportement';

  @override
  String get bubbleGraphDimensionLocation => 'Lieu';

  @override
  String get bubbleGraphDimensionPriorBehavior => 'Comportement antérieur';

  @override
  String get bubbleGraphDimensionSocial => 'Social';

  @override
  String get bubbleGraphDimensionMentalState => 'État mental';

  @override
  String get bubbleGraphDimensionReasoning => 'Raisonnement';

  @override
  String recommendationCardWhyTitle(String habitName) {
    return 'Pourquoi « $habitName » ?';
  }

  @override
  String get recommendationCardEvidence => 'Preuves';

  @override
  String get recommendationCardConfidence => 'Confiance';

  @override
  String get recommendationCardWhy => 'Pourquoi ?';

  @override
  String get recommendationCardDismiss => 'Rejeter';

  @override
  String get recommendationCardAccept => 'Accepter';

  @override
  String get questionnaireFormRequiredQuestion =>
      'Cette question est obligatoire.';

  @override
  String get questionnaireFormAnswerAllRequired =>
      'Veuillez répondre à toutes les questions obligatoires avant d\'envoyer.';

  @override
  String questionnaireFormProgressLabel(int current, int total) {
    return 'Question $current sur $total';
  }

  @override
  String get questionnaireFormBackButton => 'Retour';

  @override
  String get questionnaireFormSubmitButton => 'Envoyer';

  @override
  String get questionnaireFormSaveAndContinueButton =>
      'Enregistrer et continuer';

  @override
  String get questionnaireFormAnswerHint => 'Votre réponse…';

  @override
  String get questionnaireFallbackTitle => 'Questionnaire';

  @override
  String get donateShareEyebrow => 'PARTAGER UNE HABITUDE';

  @override
  String get donateHeroTitle => 'Partagez une habitude avec la science';

  @override
  String get donateHeroSubtitle =>
      'Anonyme · ~2 min · Aide les chercheurs du monde entier';

  @override
  String get donateStartSharingButton => 'Commencer à partager';

  @override
  String get donateQuestionnaireEyebrow => 'QUESTIONNAIRE';

  @override
  String get donateQuestionnaireDueSubtitle =>
      'Questionnaire court · à faire maintenant';

  @override
  String get donateCompleteButton => 'Compléter';

  @override
  String get donateSharedTodayTitle => 'Partagé aujourd\'hui';

  @override
  String get donateSharedTodayBody =>
      'Merci pour votre contribution ! Chaque habitude partagée aide notre recherche : n\'hésitez pas à en partager une autre.';

  @override
  String get donateShareAnotherButton => 'Partager une autre habitude';

  @override
  String get donateWhyShareTitle => 'Pourquoi partager ?';

  @override
  String get donateWhyShareBody =>
      'Les habitudes partagées restent anonymes et aident la recherche à créer de meilleures recommandations pour tous, y compris pour vous.';

  @override
  String get readMoreAboutProject => 'En savoir plus sur le projet';

  @override
  String get donatePleaseAnswerAllQuestions =>
      'Veuillez répondre à toutes les questions';

  @override
  String get donateNotAHabitMessage =>
      'Cela ne ressemble pas à une habitude. Essayez de décrire un comportement régulier, par exemple « Je fais une marche de 30 minutes chaque matin ».';

  @override
  String get donateSavedOffline =>
      'Enregistré hors ligne, sera envoyé une fois la connexion rétablie';

  @override
  String get donateUnauthorized => 'Non autorisé. Veuillez vous reconnecter.';

  @override
  String get donateAnalysisUnavailable =>
      'L\'analyse des habitudes est temporairement indisponible. Veuillez réessayer dans un instant.';

  @override
  String get donateTodaysTasksEyebrow => 'TÂCHES DU JOUR';

  @override
  String get donateCommunityLabel => 'Communauté';

  @override
  String get donateDayStreakLabel => 'Série de jours';

  @override
  String get donateHabitHintTitle => 'Qu\'est-ce qu\'une habitude ?';

  @override
  String get donateHabitHintBody =>
      'Une habitude est une action précise et répétable, pas seulement un objectif général. Une bonne description nomme l\'action elle-même, ainsi que son contexte : quand ou où vous la faites, et parfois pourquoi.';

  @override
  String get donateHabitHintExampleIntro => 'Par exemple :';

  @override
  String get donateHabitHintExampleSentence =>
      '[T]Après le petit-déjeuner[/T], je vais [B]faire une marche de 20 minutes[/B] [L]dans le parc[/L] parce que [R]je veux avoir plus d\'énergie[/R].';

  @override
  String get donateFormDescribeHabitLabel => 'Décrivez votre habitude';

  @override
  String get donateFormHabitHint =>
      'p. ex. Je fais une marche de 30 minutes chaque matin';

  @override
  String get donateFormHabitValidationError =>
      'Veuillez décrire votre habitude (au moins 10 caractères)';

  @override
  String get donateFormFrequencyQuestion =>
      'À quelle fréquence pratiquez-vous cette habitude ?';

  @override
  String get donateFormFrequencyRarely => 'Rarement';

  @override
  String get donateFormFrequencyWeekly => 'Hebdomadaire';

  @override
  String get donateFormFrequencySeveralPerWeek => 'Plusieurs fois/semaine';

  @override
  String get donateFormFrequencyDaily => 'Quotidien';

  @override
  String get donateFormHealthBenefitQuestion =>
      'Selon vous, dans quelle mesure cette habitude profite-t-elle à votre santé ?';

  @override
  String get donateFormRatingCaption => '1 = Pas du tout · 5 = Énormément';

  @override
  String get donateFormWellbeingQuestion =>
      'Selon vous, dans quelle mesure cette habitude améliore-t-elle votre bien-être ?';

  @override
  String get donateVoiceStartRecording => 'Parler à la place';

  @override
  String get donateVoiceStopRecording => 'Arrêter l\'enregistrement';

  @override
  String get donateVoiceTranscribing => 'Transcription en cours…';

  @override
  String get donateVoiceTranscriptionFailed =>
      'Impossible de transcrire — veuillez réessayer ou taper le texte.';

  @override
  String get donateVoiceMicPermissionDenied =>
      'L\'accès au microphone est nécessaire pour parler votre habitude — vous pouvez aussi la taper.';

  @override
  String get donateVoiceHoldToSpeak => 'Maintenez pour parler';

  @override
  String get donateVoiceRecording => 'Enregistrement… relâchez pour arrêter';

  @override
  String get donateVoiceEditTranscript => 'Modifier le texte';

  @override
  String get donateVoiceTranscriptPlaceholder =>
      'Maintenez le bouton ci-dessous et décrivez votre habitude';

  @override
  String get setCueNextButton => 'Suivant';

  @override
  String get setCueNoneAvailableTitle =>
      'Aucun signal disponible pour le moment';

  @override
  String get setCueNoneAvailableSubtitle =>
      'Votre coordinateur d\'étude vous attribuera bientôt des signaux';

  @override
  String setCueAssignedNumbered(int index, int total) {
    return 'Signal $index sur $total (attribué par l\'étude)';
  }

  @override
  String get setCueAssignedByStudy => 'Attribué par l\'étude';

  @override
  String addAnotherCueCount(int current, int max) {
    return 'Ajouter un autre signal ($current/$max)';
  }

  @override
  String setCueMaxReachedNote(int max) {
    return 'Vous pouvez ajouter jusqu\'à $max signaux.';
  }

  @override
  String get setCueLabelSingle => 'Votre signal';

  @override
  String setCueLabelNumbered(int number) {
    return 'Signal $number';
  }

  @override
  String get setCueRemoveTooltip => 'Supprimer le signal';

  @override
  String get setCueExtraPlaceholder => 'ex. à la maison en semaine';

  @override
  String couldNotLogToday(String error) {
    return 'Impossible d\'enregistrer aujourd\'hui : $error';
  }

  @override
  String couldNotLogDay(String error) {
    return 'Impossible de mettre à jour l\'enregistrement : $error';
  }

  @override
  String get continueButton => 'Continuer';

  @override
  String get describeYourHabitMinLength =>
      'Veuillez décrire votre habitude (min. 3 caractères)';

  @override
  String get yourHabitLabel => 'Votre habitude';

  @override
  String get yourHabitHint => 'p. ex. Une marche de 20 minutes';

  @override
  String get nextButton => 'Suivant';

  @override
  String get helpAndSupport => 'Aide et assistance';

  @override
  String get contactResearchTeam => 'Contacter l\'équipe de recherche';

  @override
  String get contactResearchTeamDescription =>
      'Une question ou un problème ? Envoyez-nous un e-mail, nous vous répondrons.';

  @override
  String get sendEmail => 'Envoyer un e-mail';

  @override
  String couldNotOpenEmailApp(String email) {
    return 'Impossible d\'ouvrir une application e-mail. Veuillez écrire directement à $email.';
  }

  @override
  String get frequentlyAskedQuestions => 'Questions fréquentes';

  @override
  String get faqPassphraseQuestion =>
      'J\'ai perdu ma phrase de récupération — que faire ?';

  @override
  String get faqPassphraseAnswer =>
      'Votre phrase de 24 mots est le seul moyen de récupérer votre compte. Si vous l\'avez encore, utilisez « Restaurer le compte » sur l\'écran d\'accueil. Si vous l\'avez perdue, votre compte et vos données ne peuvent malheureusement pas être récupérés — contactez-nous si vous souhaitez recommencer.';

  @override
  String get faqDataQuestion => 'Puis-je exporter ou supprimer mes données ?';

  @override
  String get faqDataAnswer =>
      'Oui. Allez dans Paramètres → Exporter mes données pour télécharger tout ce qui est lié à votre compte, ou Paramètres → Supprimer le compte pour l\'effacer définitivement. La suppression est irréversible.';

  @override
  String get faqOfflineQuestion =>
      'Que se passe-t-il si je perds la connexion pendant l\'utilisation de l\'application ?';

  @override
  String get faqOfflineAnswer =>
      'Les enregistrements d\'habitudes soumis hors ligne sont conservés sur votre appareil et envoyés automatiquement dès que vous êtes de nouveau en ligne.';

  @override
  String get faqNotificationsQuestion => 'Puis-je désactiver les rappels ?';

  @override
  String get faqNotificationsAnswer =>
      'Les rappels font partie de l\'étude et ne peuvent pas être désactivés dans l\'application. Si nécessaire, vous pouvez gérer les notifications de cette application dans les paramètres système de votre téléphone.';

  @override
  String get faqConsentQuestion => 'Puis-je retirer mon consentement ?';

  @override
  String get faqConsentAnswer =>
      'Oui, à tout moment. Allez dans Paramètres → Consentement à l\'étude pour revoir ce que vous avez accepté, ou Paramètres → Supprimer le compte pour retirer votre consentement et effacer vos données.';

  @override
  String get changeRecoveryPassphrase => 'Changer la phrase de récupération';

  @override
  String get rotatePassphraseTitle => 'Changer votre phrase de récupération ?';

  @override
  String get rotatePassphraseWarning =>
      'Votre phrase actuelle de 24 mots cessera immédiatement de fonctionner. Veillez à sauvegarder la nouvelle phrase en lieu sûr.';

  @override
  String get rotatePassphraseConfirm => 'Générer une nouvelle phrase';

  @override
  String get rotatePassphraseNewTitle =>
      'Votre nouvelle phrase de récupération';

  @override
  String get rotatePassphraseNewSubtitle =>
      'Notez ces 24 mots ou conservez-les en lieu sûr. Vous en aurez besoin pour récupérer votre compte.';

  @override
  String get rotatePassphraseSavedCheckbox => 'Je l\'ai notée';

  @override
  String get rotatePassphraseDone => 'Terminé';

  @override
  String get rotatePassphraseFailed =>
      'Impossible de générer une nouvelle phrase. Vérifiez votre connexion et réessayez.';

  @override
  String get copyToClipboard => 'Copier dans le presse-papiers';

  @override
  String get passphraseCopied => 'Phrase copiée dans le presse-papiers';

  @override
  String get close => 'Fermer';

  @override
  String appVersion(String version, String buildNumber) {
    return 'Version $version ($buildNumber)';
  }

  @override
  String get habitTypeBuild => 'Build a new habit';

  @override
  String get habitTypeQuit => 'Break a habit';

  @override
  String get habitTypeFilterAll => 'All';

  @override
  String get habitImpactFilterAll => 'All';

  @override
  String get habitImpactFilterHigh => 'High impact';

  @override
  String get habitImpactFilterLow => 'Low impact';

  @override
  String get exploreFiltersTooltip => 'Filters';

  @override
  String get exploreFiltersTitle => 'Filters';

  @override
  String get exploreFilterHabitTypeLabel => 'Habit Type';

  @override
  String get exploreFilterHealthBenefitLabel => 'Health Benefit';

  @override
  String get exploreFilterWellbeingLabel => 'Wellbeing';

  @override
  String get habitHealthBenefitFilterAll => 'All';

  @override
  String get habitHealthBenefitFilterHigh => 'High benefit';

  @override
  String get habitHealthBenefitFilterLow => 'Low benefit';

  @override
  String get habitWellbeingFilterAll => 'All';

  @override
  String get habitWellbeingFilterHigh => 'High wellbeing';

  @override
  String get habitWellbeingFilterLow => 'Low wellbeing';

  @override
  String get exploreFiltersClearAll => 'Clear all';

  @override
  String get exploreFiltersDone => 'Done';

  @override
  String get informationOverloadTitle => 'One habit at a time';

  @override
  String get informationOverloadInfo =>
      'To help habits stick, we ask you to focus on your current ones before adding new ones of the same type. New slots open up automatically as your habits become more automatic. Habit stacking isn\'t affected by this limit. You can turn this off in Settings, but we don\'t recommend it.';

  @override
  String get informationOverloadBlocked =>
      'Let\'s focus on your current habit first — a new slot opens once it becomes more automatic.';

  @override
  String get informationOverloadBlockedOptOutHint =>
      'You can turn this off in Settings.';

  @override
  String get informationOverloadBlockedOptOutAction => 'Go to Settings';

  @override
  String get stackOntoExistingHabitTitle => 'Stack onto an existing habit';

  @override
  String get stackOntoExistingHabitSubtitle =>
      'Anchor this new habit to one you already do';

  @override
  String get stackAnchorPickLabel => 'Anchor habit';

  @override
  String get stackAnchorNone => 'None';

  @override
  String get stackAnchorFreeTextLabel => 'Or type an anchor habit';

  @override
  String get stackAnchorFreeTextHint => 'e.g. After my morning coffee';

  @override
  String stackAlsoTrackAnchor(String anchor) {
    return 'Suivre aussi « $anchor » comme habitude';
  }

  @override
  String stackedOntoLabel(String anchor) {
    return 'Rattaché à : $anchor';
  }

  @override
  String get habitsSection => 'Habits';

  @override
  String get informationOverloadOptOutTitle => 'Allow multiple new habits';

  @override
  String get informationOverloadOptOutSubtitle =>
      'Turn off the one-habit-at-a-time focus guard';

  @override
  String get progressSection => 'Progress';

  @override
  String get achievementsTitle => 'Achievements';

  @override
  String get achievementsSubtitle =>
      'Badges you\'ve earned, and badges still to unlock.';

  @override
  String get achievementsLockedTag => 'Locked';
}
