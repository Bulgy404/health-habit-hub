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
  String get submissionFailed => 'Submission failed. Please try again.';

  @override
  String get questionnaireAlreadyCompleted =>
      'This questionnaire has already been completed and can\'t be filled out again yet.';

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
  String get profileEnterNumber => 'Enter a number';

  @override
  String get profileEnterText => 'Enter text';

  @override
  String profileIncompleteBanner(String fields) {
    return 'Your profile is missing: $fields';
  }

  @override
  String get profileCompleteNow => 'Complete now';

  @override
  String get couldNotLoadProfile =>
      'Could not load profile.\nPlease check your connection.';

  @override
  String get healthQuestionnaires => 'Health Questionnaires';

  @override
  String get sliqLifestyleIndex => 'SLIQ: Lifestyle Index';

  @override
  String get rand36HealthSurvey => 'RAND-36: Health Survey';

  @override
  String get restoreAccountOnDevice => 'Restore account on this device';

  @override
  String get studyMembershipTitle => 'Study';

  @override
  String get studyMembershipCurrentLabel => 'Current study';

  @override
  String get studyMembershipDefaultLabel => 'General study (no study code)';

  @override
  String studyMembershipGroupLabel(String groupLabel) {
    return 'Group: $groupLabel';
  }

  @override
  String get studyMembershipLoadFailed =>
      'Couldn\'t load your study information.';

  @override
  String get studyMembershipJoinButton => 'Join a different study';

  @override
  String get studyMembershipLeaveButton => 'Leave study';

  @override
  String get studyMembershipJoinDialogTitle => 'Join a study';

  @override
  String get studyMembershipJoinDialogBody =>
      'Enter the study code a researcher gave you. Habits, logs, and answers you\'ve already shared stay with your current study; only what you do from now on counts toward the new one.';

  @override
  String get studyMembershipCodeLabel => 'Study code';

  @override
  String get studyMembershipJoinConfirm => 'Join';

  @override
  String studyMembershipJoinSuccess(String studyName) {
    return 'You\'ve joined $studyName.';
  }

  @override
  String get studyMembershipAlreadyInStudy => 'You\'re already in that study.';

  @override
  String get studyMembershipInvalidCode =>
      'Invalid code. Please check and try again.';

  @override
  String get studyMembershipCodeExpired => 'This code has expired.';

  @override
  String get studyMembershipCodeUsedUp =>
      'This code has already been fully used.';

  @override
  String get studyMembershipJoinFailed =>
      'Couldn\'t join that study. Please check your connection.';

  @override
  String get studyMembershipLeaveConfirmTitle => 'Leave this study?';

  @override
  String get studyMembershipLeaveConfirmBody =>
      'You\'ll move to the general study. Nothing is deleted: your existing habits, logs, and questionnaire answers stay exactly as they are, still attributed to this study.';

  @override
  String get studyMembershipLeaveSuccess => 'You\'ve left the study.';

  @override
  String get studyMembershipLeaveFailed =>
      'Couldn\'t leave the study. Please check your connection.';

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
  String get adminInvalidJson => 'Invalid JSON, please fix before saving';

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
  String get goalInputSubtitle =>
      'The more context you share (your lifestyle, what you\'ve tried, and what gets in the way), the better your recommendation will be.';

  @override
  String get goalInputHint =>
      'e.g. I\'m 34 and work long hours at a desk job. I struggle to fall asleep before midnight and wake up exhausted. I\'ve tried evening runs but give up after a week. I want a realistic routine that helps me wind down and feel more rested.';

  @override
  String get goalInputValidationError => 'Please describe your goal';

  @override
  String get recommendWhyCardTitle => 'How do recommendations work?';

  @override
  String get recommendWhyCardBody =>
      'We match your goal against similar habits shared by others, then a language model turns the best matches into a personalized suggestion.';

  @override
  String get recommendWhyCardLink => 'See how it works';

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
  String get noQuestionnairesDue => 'No questionnaires due right now.';

  @override
  String questionnaireCompletedOn(String date) {
    return 'Completed on $date';
  }

  @override
  String get questionnaireNotYetAvailable => 'Not yet available';

  @override
  String get myHabitsTab => 'My Habits';

  @override
  String get exploreSavedTab => 'Saved';

  @override
  String get navTabShare => 'Share';

  @override
  String get navTabExplore => 'Explore';

  @override
  String get navTabRecommend => 'Recommend';

  @override
  String get navTabAccount => 'Account';

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
  String get logForAnotherDay => 'Log for another day';

  @override
  String get backfillSheetTitle => 'Log a different day';

  @override
  String get backfillSheetSubtitle =>
      'Tap a day to mark it done, or tap again to undo it.';

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get pickBehaviorTitle => 'What habit do you want to form?';

  @override
  String get setCueTitle => 'Set your cue';

  @override
  String get setCuePreRatedInstruction =>
      'Your study condition assigns the following cue(s). Read them carefully: this is when you will act.';

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
  String get confirmPlanEditHint => 'Edit your intention…';

  @override
  String confirmPlanReminderAtTime(String time) {
    return 'Reminder at $time (set by study)';
  }

  @override
  String get confirmPlanNoRemindersByStudy => 'No reminders (set by study)';

  @override
  String get confirmPlanShareWithCommunity =>
      'Share this habit anonymously with the community';

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
    return '$behavior is something…';
  }

  @override
  String get srhiScaleMin => '1 = Strongly disagree';

  @override
  String get srhiScaleMax => '7 = Strongly agree';

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
  String get srhiChartWeekAxis => 'Study week';

  @override
  String get srhiChartScoreAxis => 'SRHI score (1–7)';

  @override
  String srhiChartTooltip(int week, String score) {
    return 'Week $week: $score / 7';
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
  String get srhiExplanationTitle => 'What\'s SRHI?';

  @override
  String get srhiExplanationBody =>
      'The Self-Report Habit Index (SRHI) measures how automatic this behavior feels to you, on a scale from 1 to 7. A higher score means it takes less conscious effort: a sign the habit is becoming part of your routine.';

  @override
  String get srhiScoreLabel => 'Current SRHI score';

  @override
  String get srhiScoreUnavailable => 'Not yet available';

  @override
  String get srhiNextCheckInLabel => 'Next check-in';

  @override
  String get srhiNextCheckInDue => 'Due now';

  @override
  String get srhiNextCheckInNone => 'None scheduled';

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
      'This permanently removes your account and login — you won\'t be able to sign back in, and this cannot be undone.\n\nYour contributed data (habit plans, daily logs, questionnaire answers, and donations) stays on our servers, but only as anonymous entries: once your account and identity are removed, nothing links that data back to you.\n\nQuestions or concerns about this? See:';

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
  String get signingOut => 'Signing out…';

  @override
  String get sessionExpiredMessage =>
      'Your session expired. Please sign in again to continue.';

  @override
  String get signInAction => 'Sign in';

  @override
  String get aiDisclaimer =>
      'AI-generated suggestions based on your study data. This is not medical advice; consult a doctor for health concerns.';

  @override
  String get dailyReminderLabel => 'Daily reminder';

  @override
  String get habitCadenceQuestion => 'How often?';

  @override
  String get habitCadenceDaily => 'Daily';

  @override
  String get habitCadenceWeeklyOption => 'N times a week';

  @override
  String habitCadenceTargetLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count times a week',
      one: '1 time a week',
    );
    return '$_temp0';
  }

  @override
  String weeklyProgressLabel(int done, int target) {
    return '$done / $target this week';
  }

  @override
  String weeklyStreakLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count-week streak',
      one: '1-week streak',
    );
    return '$_temp0';
  }

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
  String get noCommentsYet => 'No comments yet. Be the first.';

  @override
  String get couldNotPostComment => 'Could not post comment';

  @override
  String get commentPendingReview =>
      'Your comment was submitted for review and will appear once approved.';

  @override
  String get reportComment => 'Report';

  @override
  String get reportCommentTitle => 'Report comment?';

  @override
  String get reportCommentBody =>
      'This comment will be hidden immediately and sent to the study team for review.';

  @override
  String get commentReported => 'Comment reported';

  @override
  String get couldNotReportComment => 'Could not report comment';

  @override
  String get commentsDisabledMessage =>
      'Comments are turned off. Enable them in Settings to view and post.';

  @override
  String get communitySection => 'Community';

  @override
  String get communityComments => 'Community comments';

  @override
  String get communityCommentsSubtitle =>
      'Turn off to hide comment posting and viewing on shared habits.';

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
  String get studyCodeAppBarTitle => 'Study Code';

  @override
  String get studyCodeQuestion => 'Do you have a study code?';

  @override
  String get studyCodeSubtitle =>
      'If a researcher gave you a study code, enter it here to join their study. You can also skip this step.';

  @override
  String get studyCodeLabel => 'Study code';

  @override
  String get studyCodeInvalidFormat =>
      'Enter a valid code in HHH-XXXXX format.';

  @override
  String get studyCodeInvalid => 'Invalid code. Please check and try again.';

  @override
  String get studyCodeExpired => 'This code has expired.';

  @override
  String get studyCodeAlreadyUsed => 'This code has already been used.';

  @override
  String get studyCodeGenericError =>
      'Could not redeem code. Please check your connection.';

  @override
  String get studyCodeSkipError =>
      'Could not join without a code. Please check your connection and try again.';

  @override
  String get studyCodeContinueButton => 'Continue with code';

  @override
  String get studyCodeSkipButton => 'Join without study code';

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
      'No recommendations were generated. Try describing your goal in more detail: the more context you share, the better.';

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
      'Feedback submitted, thank you!';

  @override
  String get recommendationLeaveComment => 'Leave a comment:';

  @override
  String get recommendationFeedbackHint => 'Your feedback…';

  @override
  String get recommendationFeedbackFailed => 'Failed to submit feedback';

  @override
  String get recommendationSourceLinkError => 'Could not open the source link.';

  @override
  String get recommendationLoadingPhaseCommunity =>
      'Comparing with habits people like you have tried…';

  @override
  String get recommendationLoadingPhaseHistory =>
      'Checking what\'s already working for you…';

  @override
  String get recommendationLoadingPhaseResearch =>
      'Consulting behaviour-change research…';

  @override
  String get recommendationLoadingPhaseGenerating =>
      'Writing your personalized suggestion…';

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
  String get bubbleGraphDimensionTime => 'Time';

  @override
  String get bubbleGraphDimensionBehavior => 'Behavior';

  @override
  String get bubbleGraphDimensionLocation => 'Location';

  @override
  String get bubbleGraphDimensionPriorBehavior => 'Prior Behavior';

  @override
  String get bubbleGraphDimensionSocial => 'Social';

  @override
  String get bubbleGraphDimensionMentalState => 'Mental State';

  @override
  String get bubbleGraphDimensionReasoning => 'Reasoning';

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
      'Thanks for contributing! Every habit you share helps our research. Feel free to add another.';

  @override
  String get donateShareAnotherButton => 'Share another habit';

  @override
  String get donateWhyShareTitle => 'Why share?';

  @override
  String get donateWhyShareBody =>
      'Shared habits stay anonymous and help researchers build better recommendations for everyone, including you.';

  @override
  String get readMoreAboutProject => 'Read more about the project';

  @override
  String get donatePleaseAnswerAllQuestions => 'Please answer all questions';

  @override
  String get donateNotAHabitMessage =>
      'This doesn\'t look like a habit. Try describing a regular behaviour, e.g. \"I go for a 30-minute walk every morning\".';

  @override
  String get donateSavedOffline => 'Saved offline, will submit when connected';

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
  String get donateHabitHintTitle => 'What\'s a habit?';

  @override
  String get donateHabitHintBody =>
      'A habit is a specific, repeatable action, not just a general goal. A good description names the action itself, plus the context around it: when or where you do it, and sometimes why.';

  @override
  String get donateHabitHintExampleIntro => 'For example:';

  @override
  String get donateHabitHintExampleSentence =>
      '[T]After breakfast[/T], I will [B]go for a 20-minute walk[/B] [L]in the park[/L] because [R]I want more energy[/R].';

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
  String get donateFormHealthBenefitQuestion =>
      'How much do you think this habit benefits your health?';

  @override
  String get donateFormRatingCaption => '1 = Not at all · 5 = Very much';

  @override
  String get donateFormWellbeingQuestion =>
      'How much do you think this habit improves your wellbeing?';

  @override
  String get donateVoiceStartRecording => 'Speak instead';

  @override
  String get donateVoiceStopRecording => 'Stop recording';

  @override
  String get donateVoiceTranscribing => 'Transcribing…';

  @override
  String get donateVoiceTranscriptionFailed =>
      'Couldn\'t transcribe that — please try again or type it instead.';

  @override
  String get donateVoiceMicPermissionDenied =>
      'Microphone access is needed to speak your habit — you can type it instead.';

  @override
  String get donateVoiceHoldToSpeak => 'Hold to speak';

  @override
  String get donateVoiceRecording => 'Recording… release to stop';

  @override
  String get donateVoiceEditTranscript => 'Edit text';

  @override
  String get donateVoiceTranscriptPlaceholder =>
      'Hold the button below and describe your habit';

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
  String get setCueLabelSingle => 'Your cue';

  @override
  String setCueLabelNumbered(int number) {
    return 'Cue $number';
  }

  @override
  String get setCueRemoveTooltip => 'Remove cue';

  @override
  String get setCueExtraPlaceholder => 'e.g. at home on weekdays';

  @override
  String couldNotLogToday(String error) {
    return 'Could not log today: $error';
  }

  @override
  String couldNotLogDay(String error) {
    return 'Could not update log: $error';
  }

  @override
  String get continueButton => 'Continue';

  @override
  String get describeYourHabitMinLength =>
      'Please describe your habit (min. 3 characters)';

  @override
  String get yourHabitLabel => 'Your habit';

  @override
  String get yourHabitHint => 'e.g. A 20-minute walk';

  @override
  String get nextButton => 'Next';

  @override
  String get helpAndSupport => 'Help & Support';

  @override
  String get contactResearchTeam => 'Contact the research team';

  @override
  String get contactResearchTeamDescription =>
      'Have a question or ran into a problem? Send us an email and we\'ll get back to you.';

  @override
  String get sendEmail => 'Send email';

  @override
  String couldNotOpenEmailApp(String email) {
    return 'Could not open an email app. Please email $email directly.';
  }

  @override
  String get frequentlyAskedQuestions => 'Frequently asked questions';

  @override
  String get faqPassphraseQuestion =>
      'I lost my recovery passphrase — what do I do?';

  @override
  String get faqPassphraseAnswer =>
      'Your 24-word passphrase is the only way to recover your account. If you still have it, use \"Restore account\" on the welcome screen. If you\'ve lost it, your account and data unfortunately cannot be recovered — contact us if you\'d like to start over.';

  @override
  String get faqDataQuestion => 'Can I export or delete my data?';

  @override
  String get faqDataAnswer =>
      'Yes. Go to Settings → Export my data to download everything linked to your account, or Settings → Delete account to permanently erase it. Deletion cannot be undone.';

  @override
  String get faqOfflineQuestion =>
      'What happens if I lose connection while using the app?';

  @override
  String get faqOfflineAnswer =>
      'Habit check-ins you submit while offline are saved on your device and sent automatically once you\'re back online.';

  @override
  String get faqNotificationsQuestion => 'Can I turn off reminders?';

  @override
  String get faqNotificationsAnswer =>
      'Reminders are part of the study, so they can\'t be turned off inside the app. If you need to, you can manage notifications for this app in your phone\'s system settings.';

  @override
  String get faqConsentQuestion => 'Can I withdraw my consent?';

  @override
  String get faqConsentAnswer =>
      'Yes, at any time. Go to Settings → Study consent to review what you agreed to, or Settings → Delete account to withdraw and erase your data.';

  @override
  String get changeRecoveryPassphrase => 'Change recovery passphrase';

  @override
  String get rotatePassphraseTitle => 'Change your recovery passphrase?';

  @override
  String get rotatePassphraseWarning =>
      'Your current 24-word phrase will stop working immediately. Make sure to save the new one somewhere safe.';

  @override
  String get rotatePassphraseConfirm => 'Generate new phrase';

  @override
  String get rotatePassphraseNewTitle => 'Your new recovery passphrase';

  @override
  String get rotatePassphraseNewSubtitle =>
      'Write these 24 words down or store them somewhere safe. You\'ll need them to recover your account.';

  @override
  String get rotatePassphraseSavedCheckbox => 'I have written it down';

  @override
  String get rotatePassphraseDone => 'Done';

  @override
  String get rotatePassphraseFailed =>
      'Could not generate a new passphrase. Please check your connection and try again.';

  @override
  String get copyToClipboard => 'Copy to clipboard';

  @override
  String get passphraseCopied => 'Passphrase copied to clipboard';

  @override
  String get close => 'Close';

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
    return 'Also track \"$anchor\" as a habit I\'m building';
  }

  @override
  String stackedOntoLabel(String anchor) {
    return 'Stacked onto: $anchor';
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
