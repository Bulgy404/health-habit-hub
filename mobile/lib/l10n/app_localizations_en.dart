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
  String get shareHabit => 'Share a Habit';

  @override
  String get exploreHabits => 'Explore Habits';

  @override
  String get settings => 'Settings';

  @override
  String get profile => 'Profile';

  @override
  String get habitSharedSuccess => 'Habit shared successfully!';

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
    return 'Saved: $count';
  }

  @override
  String get iDoThisToo => 'I do this too';

  @override
  String get helpful => 'Save';

  @override
  String get savedSection => 'Saved';

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
  String get privacyStatement => 'Privacy Statement';

  @override
  String get accessibilityStatement => 'Accessibility Statement';

  @override
  String get imprint => 'Imprint';

  @override
  String get couldNotLoadLegalDocument =>
      'Could not load this document.\nPlease check your connection.';

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

  @override
  String get cancel => 'Cancel';

  @override
  String get delete => 'Delete';

  @override
  String get create => 'Create';

  @override
  String get apply => 'Apply';

  @override
  String get adminDeviceSessions => 'Device Sessions';

  @override
  String get adminRevokeSessionTitle => 'Revoke session?';

  @override
  String adminRevokeSessionContent(String participantId) {
    return 'Revoke session for participant $participantId?\nThey will be logged out immediately.';
  }

  @override
  String get adminRevoke => 'Revoke';

  @override
  String get adminSessionRevoked => 'Session revoked';

  @override
  String get adminFailedToRevokeSession => 'Failed to revoke session';

  @override
  String get adminNoActiveSessions => 'No active sessions';

  @override
  String get adminFailedToLoadSessions => 'Failed to load sessions';

  @override
  String get adminColParticipantId => 'Participant ID';

  @override
  String get adminColDeviceType => 'Device Type';

  @override
  String get adminColAppVersion => 'App Version';

  @override
  String get adminColLastSeen => 'Last Seen';

  @override
  String get adminColSessionId => 'Session ID';

  @override
  String get adminColActions => 'Actions';

  @override
  String get adminDonatedHabits => 'Shared Habits';

  @override
  String get adminAutoRefreshOn => 'Auto-refresh on';

  @override
  String get adminAutoRefreshOff => 'Auto-refresh off';

  @override
  String get adminCouldNotOpenExportUrl => 'Could not open export URL';

  @override
  String get adminCsvExportFailed => 'CSV export failed';

  @override
  String get adminAllDates => 'All dates';

  @override
  String get adminGroup => 'Group';

  @override
  String get adminCategory => 'Category';

  @override
  String get adminAll => 'All';

  @override
  String get adminClearDateRange => 'Clear date range';

  @override
  String get adminCsv => 'CSV';

  @override
  String get adminNoHabitDonationsFound => 'No shared habits found';

  @override
  String get adminFailedToLoadHabitDonations => 'Failed to load shared habits';

  @override
  String adminParticipantTitle(String participantId) {
    return 'Participant $participantId';
  }

  @override
  String get adminExportJson => 'Export JSON';

  @override
  String get adminFailedToExportProgress => 'Failed to export progress data.';

  @override
  String get adminProfileCard => 'Profile';

  @override
  String get adminProfileNotYetCompleted => 'Not yet completed';

  @override
  String adminSurveysCompleted(int count) {
    return 'Surveys Completed ($count)';
  }

  @override
  String get adminNoSurveysCompletedYet => 'No surveys completed yet.';

  @override
  String adminHabitsDonated(int count) {
    return 'Habits Shared ($count)';
  }

  @override
  String get adminNoHabitsDonatedYet => 'No habits shared yet.';

  @override
  String adminHabitsDonatedDetail(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count habits shared. Individual habit details are available in the Habits Monitor.',
      one:
          '1 habit shared. Individual habit details are available in the Habits Monitor.',
    );
    return '$_temp0';
  }

  @override
  String get adminRecommendations => 'Recommendations';

  @override
  String get adminAccepted => 'Accepted';

  @override
  String get adminDismissed => 'Dismissed';

  @override
  String get adminTimeline => 'Timeline';

  @override
  String get adminNoTimelineEventsYet => 'No timeline events yet.';

  @override
  String get adminTimelineEnrolled => 'Enrolled';

  @override
  String get adminTimelineSurveyCompleted => 'Survey completed';

  @override
  String get adminTimelineRecommendationAccepted => 'Recommendation accepted';

  @override
  String get adminTimelineRecommendationDismissed => 'Recommendation dismissed';

  @override
  String get adminFailedToLoadParticipantProgress =>
      'Failed to load participant progress.';

  @override
  String get adminParticipants => 'Participants';

  @override
  String get adminNoParticipantsFound => 'No participants found.';

  @override
  String get adminSearchByUsername => 'Search by username…';

  @override
  String get adminAllGroups => 'All groups';

  @override
  String get adminColUsername => 'Username';

  @override
  String get adminColEnrolled => 'Enrolled';

  @override
  String get adminColLastActive => 'Last Active';

  @override
  String get adminColSurveysPercent => 'Surveys %';

  @override
  String get adminDeleteParticipant => 'Delete participant';

  @override
  String get adminFailedToUpdateGroup => 'Failed to update group.';

  @override
  String get adminDeleteParticipantTitle => 'Delete Participant';

  @override
  String get adminDeleteParticipantContent =>
      'This will anonymize participant data. Cannot be undone.';

  @override
  String get adminFailedToDeleteParticipant => 'Failed to delete participant.';

  @override
  String adminParticipantCreated(String username) {
    return 'Participant $username created';
  }

  @override
  String get adminCreateParticipantTooltip => 'Create participant';

  @override
  String get adminFailedToLoadParticipants => 'Failed to load participants.';

  @override
  String get adminPrevious => 'Previous';

  @override
  String get adminNext => 'Next';

  @override
  String get adminCreateParticipantTitle => 'Create Participant';

  @override
  String get adminStudyGroup => 'Study group';

  @override
  String get adminTokenCardFormat => 'Token card format';

  @override
  String get adminQrAndPrint => 'QR + Print';

  @override
  String get adminFailedToCreateParticipant =>
      'Failed to create participant. Please try again.';

  @override
  String get adminSurveys => 'Surveys';

  @override
  String get adminFailedToUpdateStatus => 'Failed to update status';

  @override
  String get adminNewSurveyTooltip => 'New survey';

  @override
  String get adminNoSurveysFound => 'No surveys found';

  @override
  String get adminFailedToLoadSurveys => 'Failed to load surveys';

  @override
  String get adminPublish => 'Publish';

  @override
  String get adminArchive => 'Archive';

  @override
  String get adminNewSurveyTitle => 'New Survey';

  @override
  String get adminSurveyTitleLabel => 'Title';

  @override
  String get adminSurveyTypeLabel => 'Type';

  @override
  String get adminTitleIsRequired => 'Title is required';

  @override
  String get adminFailedToCreateSurvey => 'Failed to create survey';

  @override
  String get adminSurveyEditor => 'Survey Editor';

  @override
  String get adminInvalidJson => 'Invalid JSON — please fix before saving';

  @override
  String get adminSurveySaved => 'Survey saved';

  @override
  String get adminFailedToSaveSurvey => 'Failed to save survey';

  @override
  String get adminFailedToLoadSurvey => 'Failed to load survey';

  @override
  String get adminJsonSchema => 'JSON Schema';

  @override
  String get adminAssignToGroups => 'Assign to Groups';

  @override
  String get failedToLoadStats => 'Failed to load stats';

  @override
  String get failedToLoadQuestionnaire => 'Failed to load questionnaire.';

  @override
  String get getRecommendations => 'Get Recommendations';

  @override
  String get healthGoalPrompt => 'What health goal would you like to work on?';

  @override
  String get questionnaireResponseSubmitted => 'Response submitted!';

  @override
  String get questionnaireThankYou =>
      'Thank you for completing the questionnaire. Your answers help personalise your habit recommendations.';

  @override
  String get backToProfile => 'Back to Profile';

  @override
  String get thankYou => 'Thank You';

  @override
  String get noQuestionnairesAssigned =>
      'No questionnaires assigned to your study.';

  @override
  String get myHabitsTab => 'My Habits';

  @override
  String get newHabit => 'New Habit';

  @override
  String get noHabitsYet =>
      'No habits yet.\nTap \"New Habit\" to start forming one.';

  @override
  String get logToday => 'Log today';

  @override
  String get loggedToday => 'Logged ✓';

  @override
  String get pickBehaviorTitle => 'What habit do you want to form?';

  @override
  String get setCueTitle => 'Set your cue';

  @override
  String get setCuePreRatedInstruction =>
      'Your study condition assigns the following cue(s). Read them carefully — this is when you will act.';

  @override
  String get setCueSelfSelectedInstruction =>
      'Describe a specific moment that happens regularly in your life.';

  @override
  String get setCuePlaceholder => 'e.g. After dinner each evening';

  @override
  String get setCueTooShort =>
      'Please describe your cue in at least 10 characters.';

  @override
  String get confirmPlanTitle => 'Your plan';

  @override
  String get confirmPlanSubtitle =>
      'Read your implementation intention and confirm.';

  @override
  String get durationLabel => 'Duration (minutes)';

  @override
  String get createHabit => 'Create habit';

  @override
  String get habitLimitReached =>
      'You have reached the habit limit for your study condition.';

  @override
  String get srhiCheckInTitle => 'Weekly habit check-in';

  @override
  String get srhiCheckInSubtitle => 'Takes about 2 minutes.';

  @override
  String get srhiStartButton => 'Start check-in';

  @override
  String get srhiFormTitle => 'Habit check-in';

  @override
  String srhiStem(String behavior) {
    return 'My $behavior is something…';
  }

  @override
  String get srhiSubmit => 'Submit';

  @override
  String get srhiSubmitIncomplete =>
      'Please rate all 12 items before submitting.';

  @override
  String weekLabel(int n) {
    return 'Week $n';
  }

  @override
  String get habitDetailTitle => 'Habit detail';

  @override
  String get abandonHabit => 'Abandon habit';

  @override
  String get abandonConfirm =>
      'Are you sure you want to abandon this habit? This cannot be undone.';

  @override
  String get confirm => 'Confirm';

  @override
  String get heatmapTitle => 'Activity log';

  @override
  String get trajectoryTitle => 'Habit strength';

  @override
  String get enactedLabel => 'Enacted';

  @override
  String get missedLabel => 'Missed';

  @override
  String get noLogsYet => 'No activity logged yet.';

  @override
  String get noTrajectoryYet =>
      'SRHI data will appear after your first weekly check-in.';

  @override
  String get consentTitle => 'Study Information & Consent';

  @override
  String get consentUpdatedTitle => 'Updated Study Consent';

  @override
  String get consentConfirmText =>
      'By tapping \"I consent\" you confirm that you have read and understood the study information and voluntarily agree to participate.';

  @override
  String get consentAccept => 'I consent';

  @override
  String get consentDecline => 'I do not consent';

  @override
  String get consentCouldNotLoad =>
      'The consent document could not be loaded. Please check your connection.';

  @override
  String get deleteAccount => 'Delete account';

  @override
  String get deleteAccountTitle => 'Delete account?';

  @override
  String get deleteAccountContent =>
      'This permanently deletes your account and all data linked to it: your profile, study enrollment, habit plans, daily logs, questionnaire answers, and recommendations.\n\nHabit donations are stored anonymously and cannot be traced back to you.\n\nThis cannot be undone.';

  @override
  String get deleteAccountConfirm => 'Delete permanently';

  @override
  String get deleteAccountFailed =>
      'Account deletion failed. Please check your connection and try again.';

  @override
  String get exportMyData => 'Export my data';

  @override
  String get exportFailed =>
      'Export failed. Please check your connection and try again.';

  @override
  String get myDataSection => 'My data';

  @override
  String get studyConsent => 'Study consent';

  @override
  String get legalSection => 'Legal';

  @override
  String get language => 'Language';

  @override
  String get signOut => 'Sign out';

  @override
  String get signOutConfirm => 'Are you sure you want to sign out?';

  @override
  String get aiDisclaimer =>
      'AI-generated suggestions based on your study data. This is not medical advice — consult a doctor for health concerns.';

  @override
  String get dailyReminderLabel => 'Daily reminder';

  @override
  String get noReminders => 'No reminders';

  @override
  String get reminderFadingHint =>
      'Reminders become less frequent as your habit gets stronger.';

  @override
  String get doneButton => 'Done';

  @override
  String get habitStrengthLabel => 'Habit strength';

  @override
  String get commentsTitle => 'Comments';

  @override
  String get commentHint => 'Share a thought (anonymous)…';

  @override
  String get noCommentsYet => 'No comments yet — be the first.';

  @override
  String get couldNotPostComment => 'Could not post comment';

  @override
  String get likeTooltip => '';

  @override
  String get adminComments => 'Comments';

  @override
  String get adminDeleteCommentTitle => 'Delete comment?';

  @override
  String get adminDeleteCommentContent =>
      'This removes the comment for all participants. Cannot be undone.';

  @override
  String get adminFailedToDeleteComment => 'Failed to delete comment';

  @override
  String get adminFailedToLoadComments => 'Failed to load comments';

  @override
  String get adminNoCommentsYet => 'No comments yet.';

  @override
  String get onboardingShareHabitTitle => 'Share a Habit';

  @override
  String get onboardingShareHabitDescription =>
      'Share your personal habits with researchers to help build a richer understanding of everyday behaviour. Your contributions are anonymised and used only for scientific research. Every habit you share makes the dataset more valuable for everyone.';

  @override
  String get onboardingExploreAnnotateTitle => 'Explore & Annotate';

  @override
  String get onboardingExploreAnnotateDescription =>
      'Browse the interactive habit graph to discover how habits relate to each other across the community. You can annotate connections and add context to improve the shared knowledge base. The more you explore, the richer the graph becomes.';

  @override
  String get onboardingRecommendationsTitle => 'Get Recommendations';

  @override
  String get onboardingRecommendationsDescription =>
      'Receive personalised habit recommendations based on your profile and the collective dataset. Our recommendation engine learns from community contributions to suggest habits that fit your lifestyle. Discover new habits that others with similar profiles have found helpful.';

  @override
  String get onboardingSubtitle =>
      'A citizen-science platform where your habits help build a richer understanding of everyday behaviour.';

  @override
  String get onboardingGetStarted => 'Get Started';

  @override
  String get onboardingRestoreAccount => 'Restore existing account';

  @override
  String get onboardingSkip => 'Skip';

  @override
  String get onboardingContinue => 'Continue';

  @override
  String get onboardingNext => 'Next';

  @override
  String get adminQuestionnairesDeleteConfirmTitle => 'Delete questionnaire?';

  @override
  String adminQuestionnairesDeleteConfirmMessage(String title) {
    return 'Delete \"$title\"? This cannot be undone.';
  }

  @override
  String get adminQuestionnairesDeleteConflict =>
      'Cannot delete: questionnaire is assigned to an active study.';

  @override
  String get adminQuestionnairesDeleteForbidden =>
      'Cannot delete a library questionnaire.';

  @override
  String get adminQuestionnairesDeleteFailed =>
      'Failed to delete questionnaire.';

  @override
  String get adminQuestionnairesTitle => 'Questionnaires';

  @override
  String get adminQuestionnairesLibraryLabel => 'Library';

  @override
  String get adminQuestionnairesCustomTab => 'Custom';

  @override
  String get adminQuestionnairesNewTooltip => 'New questionnaire';

  @override
  String get adminQuestionnairesLoadFailed => 'Failed to load questionnaires.';

  @override
  String get adminQuestionnairesLibraryEmpty =>
      'No library questionnaires found.';

  @override
  String get adminQuestionnairesCustomEmpty =>
      'No custom questionnaires yet.\nTap + to create one.';

  @override
  String adminQuestionnairesItemCount(int count) {
    return '$count questions';
  }

  @override
  String get adminQuestionnairesInactiveChip => 'Inactive';

  @override
  String get adminQuestionnairesEditDialogTitle => 'Edit Questionnaire';

  @override
  String get adminQuestionnairesNewDialogTitle => 'New Questionnaire';

  @override
  String get adminQuestionnairesTitleFieldLabel => 'Title *';

  @override
  String get adminQuestionnairesFieldRequiredError => 'Required';

  @override
  String get adminQuestionnairesDescriptionFieldLabel => 'Description';

  @override
  String adminQuestionnairesQuestionsCount(int count) {
    return 'Questions ($count)';
  }

  @override
  String get adminQuestionnairesAddButton => 'Add';

  @override
  String get adminQuestionnairesNoQuestionsYet =>
      'No questions yet. Tap \"Add\" to add one.';

  @override
  String get adminQuestionnairesAllQuestionsNeedText =>
      'All questions must have text.';

  @override
  String get adminQuestionnairesSaveFailed => 'Failed to save questionnaire.';

  @override
  String get adminQuestionnairesCreateButton => 'Create';

  @override
  String adminQuestionnairesQuestionNumber(int number) {
    return 'Q$number';
  }

  @override
  String get adminQuestionnairesQuestionTextFieldLabel => 'Question text';

  @override
  String get adminQuestionnairesTypeFieldLabel => 'Type';

  @override
  String get adminQuestionnairesTypeOpenText => 'Open text';

  @override
  String get adminQuestionnairesTypeSingleChoice => 'Single choice';

  @override
  String get adminQuestionnairesTypeMultiChoice => 'Multi choice';

  @override
  String get adminQuestionnairesTypeScale => 'Scale';

  @override
  String get adminQuestionnairesRequiredLabel => 'Required';

  @override
  String adminQuestionnairesOptionsCount(int count) {
    return 'Options ($count)';
  }

  @override
  String get adminQuestionnairesAddOption => 'Add option';

  @override
  String adminQuestionnairesOptionLabelField(int number) {
    return 'Option $number label';
  }

  @override
  String get adminShellNavParticipants => 'Participants';

  @override
  String get adminShellNavSurveys => 'Surveys';

  @override
  String get adminShellNavQuestionnaires => 'Questionnaires';

  @override
  String get adminShellNavHabits => 'Habits';

  @override
  String get adminShellNavDevices => 'Devices';

  @override
  String get adminShellNavSettings => 'Settings';

  @override
  String get recommendationResultsTitle => 'Recommendations';

  @override
  String get recommendationTryAgain => 'Try again';

  @override
  String get recommendationEmptyMessage =>
      'No recommendations were generated. Try describing your goal in more detail — the more context you share, the better.';

  @override
  String get recommendationTryDifferentGoal => 'Try a different goal';

  @override
  String get recommendationHabitFlowError =>
      'Could not open the habit flow. Please try again.';

  @override
  String get recommendationWhyThisHelps => 'Why this helps:';

  @override
  String recommendationSourcesCount(int count) {
    return 'Sources ($count)';
  }

  @override
  String get recommendationAddToHabits => 'Add to my habits';

  @override
  String get recommendationFeedbackSubmitted =>
      'Feedback submitted — thank you!';

  @override
  String get recommendationLeaveComment => 'Leave a comment:';

  @override
  String get recommendationFeedbackHint => 'Your feedback…';

  @override
  String get recommendationFeedbackFailed => 'Failed to submit feedback';

  @override
  String get recommendationSourceLinkError => 'Could not open the source link.';

  @override
  String get recommendationLoadingPhaseExperts => 'Asking experts…';

  @override
  String get recommendationLoadingPhaseHabitsDb =>
      'Looking through your habits database…';

  @override
  String get recommendationLoadingPhasePapers => 'Reading academic papers…';

  @override
  String get recommendationLoadingPhaseGenerating =>
      'Generating your personalised recommendations…';

  @override
  String get recommendationLoadingTimeoutError =>
      'Generating recommendations took too long. Please try again.';

  @override
  String get recommendationLoadingGenericError =>
      'Something went wrong while generating recommendations. Please try again.';

  @override
  String get bubbleGraphNoHabitsInDimension =>
      'No habits in this dimension yet.';

  @override
  String get bubbleGraphAllCategories => 'All categories';

  @override
  String bubbleGraphHabitCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count habits',
      one: '1 habit',
    );
    return '$_temp0';
  }

  @override
  String recommendationCardWhyTitle(String habitName) {
    return 'Why \"$habitName\"?';
  }

  @override
  String get recommendationCardEvidence => 'Evidence';

  @override
  String get recommendationCardConfidence => 'Confidence';

  @override
  String get recommendationCardWhy => 'Why?';

  @override
  String get recommendationCardDismiss => 'Dismiss';

  @override
  String get recommendationCardAccept => 'Accept';

  @override
  String get questionnaireFormRequiredQuestion => 'This question is required.';

  @override
  String get questionnaireFormAnswerAllRequired =>
      'Please answer all required questions before submitting.';

  @override
  String questionnaireFormProgressLabel(int current, int total) {
    return 'Question $current of $total';
  }

  @override
  String get questionnaireFormBackButton => 'Back';

  @override
  String get questionnaireFormSubmitButton => 'Submit';

  @override
  String get questionnaireFormSaveAndContinueButton => 'Save & Continue';

  @override
  String get questionnaireFormAnswerHint => 'Your answer…';

  @override
  String get questionnaireFallbackTitle => 'Questionnaire';

  @override
  String get donateShareEyebrow => 'SHARE A HABIT';

  @override
  String get donateHeroTitle => 'Share a habit with science';

  @override
  String get donateHeroSubtitle =>
      'Anonymous · ~2 min · Helps researchers worldwide';

  @override
  String get donateStartSharingButton => 'Start sharing';

  @override
  String get donateQuestionnaireEyebrow => 'QUESTIONNAIRE';

  @override
  String get donateQuestionnaireDueSubtitle => 'Short questionnaire · due now';

  @override
  String get donateCompleteButton => 'Complete';

  @override
  String get donateSharedTodayTitle => 'Shared today';

  @override
  String get donateSharedTodayBody =>
      'Thanks for contributing! Come back tomorrow for the next one.';

  @override
  String get donateWhyShareTitle => 'Why share?';

  @override
  String get donateWhyShareBody =>
      'Every habit you share is added anonymously to a growing, open picture of how people build healthy routines in everyday life. The more real examples researchers see, the better everyone\'s recommendations become — including yours.';

  @override
  String get donatePleaseAnswerAllQuestions => 'Please answer all questions';

  @override
  String get donateNotAHabitMessage =>
      'This doesn\'t look like a habit. Try describing a regular behaviour, e.g. \"I go for a 30-minute walk every morning\".';

  @override
  String get donateSavedOffline => 'Saved offline — will submit when connected';

  @override
  String get donateUnauthorized => 'Unauthorized. Please sign in again.';

  @override
  String get donateAnalysisUnavailable =>
      'Habit analysis is temporarily unavailable. Please try again in a moment.';

  @override
  String get donateTodaysTasksEyebrow => 'TODAY\'S TASKS';

  @override
  String get donateCommunityLabel => 'Community';

  @override
  String get donateDayStreakLabel => 'Day streak';

  @override
  String get donateFormDescribeHabitLabel => 'Describe your habit';

  @override
  String get donateFormHabitHint =>
      'e.g. I go for a 30-minute walk every morning';

  @override
  String get donateFormHabitValidationError =>
      'Please describe your habit (at least 10 characters)';

  @override
  String get donateFormFrequencyQuestion => 'How often do you do this habit?';

  @override
  String get donateFormFrequencyRarely => 'Rarely';

  @override
  String get donateFormFrequencyWeekly => 'Weekly';

  @override
  String get donateFormFrequencySeveralPerWeek => 'Several/week';

  @override
  String get donateFormFrequencyDaily => 'Daily';

  @override
  String get donateFormDurationQuestion => 'How long have you had this habit?';

  @override
  String get donateFormDurationUnder1Month => '< 1 month';

  @override
  String get donateFormDuration1To3Months => '1–3 months';

  @override
  String get donateFormDuration3To12Months => '3–12 months';

  @override
  String get donateFormDurationOver1Year => '> 1 year';

  @override
  String get donateFormHealthBenefitQuestion =>
      'How much does it benefit your health?';

  @override
  String get donateFormRatingCaption => '1 = Not at all · 5 = Very much';

  @override
  String get donateFormWellbeingQuestion =>
      'How much does it improve your wellbeing?';

  @override
  String get setCueNextButton => 'Next';

  @override
  String get setCueNoneAvailableTitle => 'No cues available yet';

  @override
  String get setCueNoneAvailableSubtitle =>
      'Your study coordinator will assign cues soon';

  @override
  String setCueAssignedNumbered(int index, int total) {
    return 'Cue $index of $total (assigned by study)';
  }

  @override
  String get setCueAssignedByStudy => 'Assigned by study';

  @override
  String addAnotherCueCount(int current, int max) {
    return 'Add another cue ($current/$max)';
  }

  @override
  String setCueMaxReachedNote(int max) {
    return 'You can add up to $max cues.';
  }

  @override
  String couldNotLogToday(String error) {
    return 'Could not log today: $error';
  }

  @override
  String get continueButton => 'Continue';

  @override
  String get behaviorWalking => 'Walking';

  @override
  String get behaviorLightJogging => 'Light jogging';

  @override
  String get behaviorCycling => 'Cycling';

  @override
  String get behaviorStructuredCalisthenics => 'Structured calisthenics';

  @override
  String get behaviorYoga => 'Yoga';

  @override
  String get describeYourHabitMinLength =>
      'Please describe your habit (min. 3 characters)';

  @override
  String get yourHabitLabel => 'Your habit';

  @override
  String get yourHabitHint => 'e.g. A 20-minute walk';

  @override
  String get nextButton => 'Next';
}
