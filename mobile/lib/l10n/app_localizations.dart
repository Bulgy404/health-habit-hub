import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_nl.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('de'),
    Locale('en'),
    Locale('fr'),
    Locale('ja'),
    Locale('nl'),
  ];

  /// The application title
  ///
  /// In en, this message translates to:
  /// **'Health Habit Hub'**
  String get appTitle;

  /// Label for the share habit screen/action
  ///
  /// In en, this message translates to:
  /// **'Share a Habit'**
  String get shareHabit;

  /// Label for the explore habits screen
  ///
  /// In en, this message translates to:
  /// **'Explore Habits'**
  String get exploreHabits;

  /// Label for the settings screen
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// Label for the profile screen
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profile;

  /// Snackbar message when habit sharing succeeds
  ///
  /// In en, this message translates to:
  /// **'Habit shared successfully!'**
  String get habitSharedSuccess;

  /// Snackbar message when a form submission fails
  ///
  /// In en, this message translates to:
  /// **'Submission failed. Please try again.'**
  String get submissionFailed;

  /// Error shown when submitting a questionnaire the backend rejects because it's not currently due (already completed, next occurrence not open yet)
  ///
  /// In en, this message translates to:
  /// **'This questionnaire has already been completed and can\'t be filled out again yet.'**
  String get questionnaireAlreadyCompleted;

  /// Offline banner heading
  ///
  /// In en, this message translates to:
  /// **'No connection'**
  String get noConnection;

  /// Offline banner body for donate screen
  ///
  /// In en, this message translates to:
  /// **'Could not load survey.\nPlease check your connection.'**
  String get couldNotLoadSurvey;

  /// Label for the retry button
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// Tooltip for the refresh icon button
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// Tab label for the habit graph view
  ///
  /// In en, this message translates to:
  /// **'Graph'**
  String get graphTab;

  /// Tab label for the stats view
  ///
  /// In en, this message translates to:
  /// **'Stats'**
  String get statsTab;

  /// Error message when habit list fails to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load habits'**
  String get failedToLoadHabits;

  /// Empty state message on explore screen
  ///
  /// In en, this message translates to:
  /// **'No habit data available yet.'**
  String get noHabitDataYet;

  /// Snackbar message when annotation submission fails
  ///
  /// In en, this message translates to:
  /// **'Could not submit annotation'**
  String get couldNotSubmitAnnotation;

  /// Section heading for annotation counts in habit detail sheet
  ///
  /// In en, this message translates to:
  /// **'Community annotations'**
  String get communityAnnotations;

  /// Fallback label when a category is empty
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get unknown;

  /// Annotation count label for iDoThis
  ///
  /// In en, this message translates to:
  /// **'I do this too: {count}'**
  String iDoThisCount(String count);

  /// Annotation count label for helpful
  ///
  /// In en, this message translates to:
  /// **'Saved: {count}'**
  String helpfulCount(String count);

  /// Button label for the iDoThis annotation action
  ///
  /// In en, this message translates to:
  /// **'I do this too'**
  String get iDoThisToo;

  /// Button label for the helpful annotation action
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get helpful;

  /// Section heading for saved habits in My Habits overview
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get savedSection;

  /// Error message when settings fail to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load settings'**
  String get failedToLoadSettings;

  /// Section title for token card format setting
  ///
  /// In en, this message translates to:
  /// **'Token Card Format'**
  String get tokenCardFormat;

  /// Description text for the token card format setting
  ///
  /// In en, this message translates to:
  /// **'Select the format used when generating token cards for new participants.'**
  String get tokenCardFormatDescription;

  /// Snackbar message when settings are saved successfully
  ///
  /// In en, this message translates to:
  /// **'Settings saved'**
  String get settingsSaved;

  /// Snackbar message when saving settings fails
  ///
  /// In en, this message translates to:
  /// **'Failed to save settings'**
  String get failedToSaveSettings;

  /// Label for the privacy statement legal page
  ///
  /// In en, this message translates to:
  /// **'Privacy Statement'**
  String get privacyStatement;

  /// Label for the accessibility statement legal page
  ///
  /// In en, this message translates to:
  /// **'Accessibility Statement'**
  String get accessibilityStatement;

  /// Label for the imprint legal page
  ///
  /// In en, this message translates to:
  /// **'Imprint'**
  String get imprint;

  /// Offline banner body for legal document screens
  ///
  /// In en, this message translates to:
  /// **'Could not load this document.\nPlease check your connection.'**
  String get couldNotLoadLegalDocument;

  /// Label for the save button
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// Radio option label for QR-only token card format
  ///
  /// In en, this message translates to:
  /// **'QR only'**
  String get qrOnly;

  /// Subtitle for the QR-only token card format option
  ///
  /// In en, this message translates to:
  /// **'Generate QR code tokens only'**
  String get qrOnlyDescription;

  /// Radio option label for print-only token card format
  ///
  /// In en, this message translates to:
  /// **'Print only'**
  String get printOnly;

  /// Subtitle for the print-only token card format option
  ///
  /// In en, this message translates to:
  /// **'Generate printable token cards only'**
  String get printOnlyDescription;

  /// Radio option label for both QR and print token card format
  ///
  /// In en, this message translates to:
  /// **'Both'**
  String get both;

  /// Subtitle for the both token card format option
  ///
  /// In en, this message translates to:
  /// **'Generate QR code and printable token cards'**
  String get bothDescription;

  /// AppBar title for the profile screen
  ///
  /// In en, this message translates to:
  /// **'My Profile'**
  String get myProfile;

  /// Snackbar message when profile is saved successfully
  ///
  /// In en, this message translates to:
  /// **'Profile saved successfully!'**
  String get profileSavedSuccess;

  /// Hint text for a numeric custom profile field
  ///
  /// In en, this message translates to:
  /// **'Enter a number'**
  String get profileEnterNumber;

  /// Hint text for a free-text custom profile field
  ///
  /// In en, this message translates to:
  /// **'Enter text'**
  String get profileEnterText;

  /// Banner shown in the account summary when one or more profile fields (e.g. gender, age) haven't been filled in yet, listing their labels
  ///
  /// In en, this message translates to:
  /// **'Your profile is missing: {fields}'**
  String profileIncompleteBanner(String fields);

  /// Button in the profile-incomplete banner that opens the profile edit form
  ///
  /// In en, this message translates to:
  /// **'Complete now'**
  String get profileCompleteNow;

  /// Offline banner body for profile screen
  ///
  /// In en, this message translates to:
  /// **'Could not load profile.\nPlease check your connection.'**
  String get couldNotLoadProfile;

  /// Section heading for health questionnaire buttons
  ///
  /// In en, this message translates to:
  /// **'Health Questionnaires'**
  String get healthQuestionnaires;

  /// Button label for the SLIQ questionnaire
  ///
  /// In en, this message translates to:
  /// **'SLIQ: Lifestyle Index'**
  String get sliqLifestyleIndex;

  /// Button label for the RAND-36 questionnaire
  ///
  /// In en, this message translates to:
  /// **'RAND-36: Health Survey'**
  String get rand36HealthSurvey;

  /// Button label to restore account on current device
  ///
  /// In en, this message translates to:
  /// **'Restore account on this device'**
  String get restoreAccountOnDevice;

  /// Section heading for study membership on the account screen
  ///
  /// In en, this message translates to:
  /// **'Study'**
  String get studyMembershipTitle;

  /// Label above the current study name
  ///
  /// In en, this message translates to:
  /// **'Current study'**
  String get studyMembershipCurrentLabel;

  /// Shown as the study name when the participant is in the default study rather than a code-joined one
  ///
  /// In en, this message translates to:
  /// **'General study (no study code)'**
  String get studyMembershipDefaultLabel;

  /// Shows the participant's group within their current study
  ///
  /// In en, this message translates to:
  /// **'Group: {groupLabel}'**
  String studyMembershipGroupLabel(String groupLabel);

  /// Error shown when the current enrollment fails to load
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load your study information.'**
  String get studyMembershipLoadFailed;

  /// Button opening the join-a-study dialog
  ///
  /// In en, this message translates to:
  /// **'Join a different study'**
  String get studyMembershipJoinButton;

  /// Button that leaves the current code-joined study, returning to the general study
  ///
  /// In en, this message translates to:
  /// **'Leave study'**
  String get studyMembershipLeaveButton;

  /// Title of the join-a-study dialog
  ///
  /// In en, this message translates to:
  /// **'Join a study'**
  String get studyMembershipJoinDialogTitle;

  /// Explanatory body text in the join-a-study dialog
  ///
  /// In en, this message translates to:
  /// **'Enter the study code a researcher gave you. Habits, logs, and answers you\'ve already shared stay with your current study; only what you do from now on counts toward the new one.'**
  String get studyMembershipJoinDialogBody;

  /// Label for the study code text field
  ///
  /// In en, this message translates to:
  /// **'Study code'**
  String get studyMembershipCodeLabel;

  /// Confirm button in the join-a-study dialog
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get studyMembershipJoinConfirm;

  /// Snackbar shown after successfully switching to a new study
  ///
  /// In en, this message translates to:
  /// **'You\'ve joined {studyName}.'**
  String studyMembershipJoinSuccess(String studyName);

  /// Error when the entered code targets the study the participant is already in
  ///
  /// In en, this message translates to:
  /// **'You\'re already in that study.'**
  String get studyMembershipAlreadyInStudy;

  /// Error for an unrecognized study code
  ///
  /// In en, this message translates to:
  /// **'Invalid code. Please check and try again.'**
  String get studyMembershipInvalidCode;

  /// Error for an expired study code
  ///
  /// In en, this message translates to:
  /// **'This code has expired.'**
  String get studyMembershipCodeExpired;

  /// Error for a study code that has hit its redemption limit
  ///
  /// In en, this message translates to:
  /// **'This code has already been fully used.'**
  String get studyMembershipCodeUsedUp;

  /// Generic fallback error when joining a study fails
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t join that study. Please check your connection.'**
  String get studyMembershipJoinFailed;

  /// Title of the leave-study confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'Leave this study?'**
  String get studyMembershipLeaveConfirmTitle;

  /// Explanatory body text in the leave-study confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'You\'ll move to the general study. Nothing is deleted: your existing habits, logs, and questionnaire answers stay exactly as they are, still attributed to this study.'**
  String get studyMembershipLeaveConfirmBody;

  /// Snackbar shown after successfully leaving a study
  ///
  /// In en, this message translates to:
  /// **'You\'ve left the study.'**
  String get studyMembershipLeaveSuccess;

  /// Generic fallback error when leaving a study fails
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t leave the study. Please check your connection.'**
  String get studyMembershipLeaveFailed;

  /// Card title when profile has been completed
  ///
  /// In en, this message translates to:
  /// **'Profile Completed'**
  String get profileCompleted;

  /// Card subtitle showing when profile was completed
  ///
  /// In en, this message translates to:
  /// **'Completed on {date}'**
  String completedOn(String date);

  /// Label for the edit button
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get edit;

  /// Section heading for theme mode selector
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get appearance;

  /// Theme mode option: light
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get light;

  /// Theme mode option: system default
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get system;

  /// Theme mode option: dark
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get dark;

  /// Label for the cancel button
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// Label for the delete button
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// Label for the create button
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get create;

  /// Label for the apply filters button
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get apply;

  /// AppBar title for the admin device sessions screen
  ///
  /// In en, this message translates to:
  /// **'Device Sessions'**
  String get adminDeviceSessions;

  /// Dialog title when confirming session revocation
  ///
  /// In en, this message translates to:
  /// **'Revoke session?'**
  String get adminRevokeSessionTitle;

  /// Dialog body when confirming session revocation
  ///
  /// In en, this message translates to:
  /// **'Revoke session for participant {participantId}?\nThey will be logged out immediately.'**
  String adminRevokeSessionContent(String participantId);

  /// Button label to revoke a device session
  ///
  /// In en, this message translates to:
  /// **'Revoke'**
  String get adminRevoke;

  /// Snackbar message when session is successfully revoked
  ///
  /// In en, this message translates to:
  /// **'Session revoked'**
  String get adminSessionRevoked;

  /// Snackbar message when session revocation fails
  ///
  /// In en, this message translates to:
  /// **'Failed to revoke session'**
  String get adminFailedToRevokeSession;

  /// Empty state message on device sessions screen
  ///
  /// In en, this message translates to:
  /// **'No active sessions'**
  String get adminNoActiveSessions;

  /// Error message when device sessions fail to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load sessions'**
  String get adminFailedToLoadSessions;

  /// Column header for participant ID in device sessions table
  ///
  /// In en, this message translates to:
  /// **'Participant ID'**
  String get adminColParticipantId;

  /// Column header for device type in device sessions table
  ///
  /// In en, this message translates to:
  /// **'Device Type'**
  String get adminColDeviceType;

  /// Column header for app version in device sessions table
  ///
  /// In en, this message translates to:
  /// **'App Version'**
  String get adminColAppVersion;

  /// Column header for last seen timestamp in device sessions table
  ///
  /// In en, this message translates to:
  /// **'Last Seen'**
  String get adminColLastSeen;

  /// Column header for session ID in device sessions table
  ///
  /// In en, this message translates to:
  /// **'Session ID'**
  String get adminColSessionId;

  /// Column header for actions in admin tables
  ///
  /// In en, this message translates to:
  /// **'Actions'**
  String get adminColActions;

  /// AppBar title for the admin donated habits screen
  ///
  /// In en, this message translates to:
  /// **'Shared Habits'**
  String get adminDonatedHabits;

  /// Tooltip when auto-refresh is enabled
  ///
  /// In en, this message translates to:
  /// **'Auto-refresh on'**
  String get adminAutoRefreshOn;

  /// Tooltip when auto-refresh is disabled
  ///
  /// In en, this message translates to:
  /// **'Auto-refresh off'**
  String get adminAutoRefreshOff;

  /// Snackbar message when CSV export URL cannot be opened
  ///
  /// In en, this message translates to:
  /// **'Could not open export URL'**
  String get adminCouldNotOpenExportUrl;

  /// Snackbar message when CSV export fails
  ///
  /// In en, this message translates to:
  /// **'CSV export failed'**
  String get adminCsvExportFailed;

  /// Label shown on date range button when no date range is selected
  ///
  /// In en, this message translates to:
  /// **'All dates'**
  String get adminAllDates;

  /// Label for the group dropdown filter
  ///
  /// In en, this message translates to:
  /// **'Group'**
  String get adminGroup;

  /// Label for the category dropdown filter
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get adminCategory;

  /// Option label meaning all groups or all categories
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get adminAll;

  /// Tooltip for the clear date range button
  ///
  /// In en, this message translates to:
  /// **'Clear date range'**
  String get adminClearDateRange;

  /// Label for the CSV export button
  ///
  /// In en, this message translates to:
  /// **'CSV'**
  String get adminCsv;

  /// Empty state message on donated habits screen
  ///
  /// In en, this message translates to:
  /// **'No shared habits found'**
  String get adminNoHabitDonationsFound;

  /// Error message when habit donations fail to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load shared habits'**
  String get adminFailedToLoadHabitDonations;

  /// AppBar title for the participant detail screen
  ///
  /// In en, this message translates to:
  /// **'Participant {participantId}'**
  String adminParticipantTitle(String participantId);

  /// Tooltip for the export JSON button on participant detail screen
  ///
  /// In en, this message translates to:
  /// **'Export JSON'**
  String get adminExportJson;

  /// Snackbar message when exporting participant progress data fails
  ///
  /// In en, this message translates to:
  /// **'Failed to export progress data.'**
  String get adminFailedToExportProgress;

  /// Card title for the profile section on participant detail screen
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get adminProfileCard;

  /// Status text when participant profile is not yet completed
  ///
  /// In en, this message translates to:
  /// **'Not yet completed'**
  String get adminProfileNotYetCompleted;

  /// Section header showing how many surveys were completed
  ///
  /// In en, this message translates to:
  /// **'Surveys Completed ({count})'**
  String adminSurveysCompleted(int count);

  /// Empty state for surveys section on participant detail screen
  ///
  /// In en, this message translates to:
  /// **'No surveys completed yet.'**
  String get adminNoSurveysCompletedYet;

  /// Section header showing how many habits were donated
  ///
  /// In en, this message translates to:
  /// **'Habits Shared ({count})'**
  String adminHabitsDonated(int count);

  /// Empty state for habits section when no habits donated
  ///
  /// In en, this message translates to:
  /// **'No habits shared yet.'**
  String get adminNoHabitsDonatedYet;

  /// Detail text for habits section when habits have been donated
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 habit shared. Individual habit details are available in the Habits Monitor.} other{{count} habits shared. Individual habit details are available in the Habits Monitor.}}'**
  String adminHabitsDonatedDetail(int count);

  /// Section heading for recommendations on participant detail screen
  ///
  /// In en, this message translates to:
  /// **'Recommendations'**
  String get adminRecommendations;

  /// Label for accepted recommendations count chip
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get adminAccepted;

  /// Label for dismissed recommendations count chip
  ///
  /// In en, this message translates to:
  /// **'Dismissed'**
  String get adminDismissed;

  /// Section heading for the timeline on participant detail screen
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get adminTimeline;

  /// Empty state for timeline section on participant detail screen
  ///
  /// In en, this message translates to:
  /// **'No timeline events yet.'**
  String get adminNoTimelineEventsYet;

  /// Timeline event label for enrollment
  ///
  /// In en, this message translates to:
  /// **'Enrolled'**
  String get adminTimelineEnrolled;

  /// Timeline event label for survey completion
  ///
  /// In en, this message translates to:
  /// **'Survey completed'**
  String get adminTimelineSurveyCompleted;

  /// Timeline event label for recommendation accepted
  ///
  /// In en, this message translates to:
  /// **'Recommendation accepted'**
  String get adminTimelineRecommendationAccepted;

  /// Timeline event label for recommendation dismissed
  ///
  /// In en, this message translates to:
  /// **'Recommendation dismissed'**
  String get adminTimelineRecommendationDismissed;

  /// Error message when participant progress fails to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load participant progress.'**
  String get adminFailedToLoadParticipantProgress;

  /// AppBar title for the admin participants screen
  ///
  /// In en, this message translates to:
  /// **'Participants'**
  String get adminParticipants;

  /// Empty state message on participants screen
  ///
  /// In en, this message translates to:
  /// **'No participants found.'**
  String get adminNoParticipantsFound;

  /// Hint text for the participant search field
  ///
  /// In en, this message translates to:
  /// **'Search by username…'**
  String get adminSearchByUsername;

  /// Dropdown option to show all groups
  ///
  /// In en, this message translates to:
  /// **'All groups'**
  String get adminAllGroups;

  /// Column header for username in participants table
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get adminColUsername;

  /// Column header for enrolled date in participants table
  ///
  /// In en, this message translates to:
  /// **'Enrolled'**
  String get adminColEnrolled;

  /// Column header for last active date in participants table
  ///
  /// In en, this message translates to:
  /// **'Last Active'**
  String get adminColLastActive;

  /// Column header for survey completion percentage in participants table
  ///
  /// In en, this message translates to:
  /// **'Surveys %'**
  String get adminColSurveysPercent;

  /// Tooltip for delete participant button
  ///
  /// In en, this message translates to:
  /// **'Delete participant'**
  String get adminDeleteParticipant;

  /// Snackbar message when updating participant group fails
  ///
  /// In en, this message translates to:
  /// **'Failed to update group.'**
  String get adminFailedToUpdateGroup;

  /// Dialog title when confirming participant deletion
  ///
  /// In en, this message translates to:
  /// **'Delete Participant'**
  String get adminDeleteParticipantTitle;

  /// Dialog body when confirming participant deletion
  ///
  /// In en, this message translates to:
  /// **'This will anonymize participant data. Cannot be undone.'**
  String get adminDeleteParticipantContent;

  /// Snackbar message when participant deletion fails
  ///
  /// In en, this message translates to:
  /// **'Failed to delete participant.'**
  String get adminFailedToDeleteParticipant;

  /// Snackbar message when a new participant is created
  ///
  /// In en, this message translates to:
  /// **'Participant {username} created'**
  String adminParticipantCreated(String username);

  /// Tooltip for the create participant floating action button
  ///
  /// In en, this message translates to:
  /// **'Create participant'**
  String get adminCreateParticipantTooltip;

  /// Error message when participants list fails to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load participants.'**
  String get adminFailedToLoadParticipants;

  /// Label for the previous page button in pagination
  ///
  /// In en, this message translates to:
  /// **'Previous'**
  String get adminPrevious;

  /// Label for the next page button in pagination
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get adminNext;

  /// Dialog title for creating a new participant
  ///
  /// In en, this message translates to:
  /// **'Create Participant'**
  String get adminCreateParticipantTitle;

  /// Label for the study group dropdown in create participant dialog
  ///
  /// In en, this message translates to:
  /// **'Study group'**
  String get adminStudyGroup;

  /// Label for the token card format dropdown in create participant dialog
  ///
  /// In en, this message translates to:
  /// **'Token card format'**
  String get adminTokenCardFormat;

  /// Option label for QR + Print token card format in create participant dialog
  ///
  /// In en, this message translates to:
  /// **'QR + Print'**
  String get adminQrAndPrint;

  /// Error message when participant creation fails
  ///
  /// In en, this message translates to:
  /// **'Failed to create participant. Please try again.'**
  String get adminFailedToCreateParticipant;

  /// AppBar title for the admin surveys screen
  ///
  /// In en, this message translates to:
  /// **'Surveys'**
  String get adminSurveys;

  /// Snackbar message when updating survey status fails
  ///
  /// In en, this message translates to:
  /// **'Failed to update status'**
  String get adminFailedToUpdateStatus;

  /// Tooltip for the new survey floating action button
  ///
  /// In en, this message translates to:
  /// **'New survey'**
  String get adminNewSurveyTooltip;

  /// Empty state message on surveys screen
  ///
  /// In en, this message translates to:
  /// **'No surveys found'**
  String get adminNoSurveysFound;

  /// Error message when surveys fail to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load surveys'**
  String get adminFailedToLoadSurveys;

  /// Button label to publish a survey
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get adminPublish;

  /// Button label to archive a survey
  ///
  /// In en, this message translates to:
  /// **'Archive'**
  String get adminArchive;

  /// Dialog title for creating a new survey
  ///
  /// In en, this message translates to:
  /// **'New Survey'**
  String get adminNewSurveyTitle;

  /// Label for the title field in the new survey dialog
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get adminSurveyTitleLabel;

  /// Label for the type dropdown in the new survey dialog
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get adminSurveyTypeLabel;

  /// Validation message when survey title is empty
  ///
  /// In en, this message translates to:
  /// **'Title is required'**
  String get adminTitleIsRequired;

  /// Error message when survey creation fails
  ///
  /// In en, this message translates to:
  /// **'Failed to create survey'**
  String get adminFailedToCreateSurvey;

  /// Fallback AppBar title for the survey editor screen
  ///
  /// In en, this message translates to:
  /// **'Survey Editor'**
  String get adminSurveyEditor;

  /// Snackbar message when survey JSON is invalid
  ///
  /// In en, this message translates to:
  /// **'Invalid JSON, please fix before saving'**
  String get adminInvalidJson;

  /// Snackbar message when survey is saved successfully
  ///
  /// In en, this message translates to:
  /// **'Survey saved'**
  String get adminSurveySaved;

  /// Snackbar message when saving survey fails
  ///
  /// In en, this message translates to:
  /// **'Failed to save survey'**
  String get adminFailedToSaveSurvey;

  /// Error message when a single survey fails to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load survey'**
  String get adminFailedToLoadSurvey;

  /// Label for the JSON schema text field in the survey editor
  ///
  /// In en, this message translates to:
  /// **'JSON Schema'**
  String get adminJsonSchema;

  /// Section heading for group assignment chips in the survey editor
  ///
  /// In en, this message translates to:
  /// **'Assign to Groups'**
  String get adminAssignToGroups;

  /// Error message when stats fail to load on explore screen
  ///
  /// In en, this message translates to:
  /// **'Failed to load stats'**
  String get failedToLoadStats;

  /// Error message when questionnaire fails to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load questionnaire.'**
  String get failedToLoadQuestionnaire;

  /// AppBar title and button label for the recommendation input screen
  ///
  /// In en, this message translates to:
  /// **'Get Recommendations'**
  String get getRecommendations;

  /// Prompt asking the user to describe their health goal
  ///
  /// In en, this message translates to:
  /// **'What health goal would you like to work on?'**
  String get healthGoalPrompt;

  /// Instructional subtitle on the goal-input screen, encouraging detailed answers
  ///
  /// In en, this message translates to:
  /// **'The more context you share (your lifestyle, what you\'ve tried, and what gets in the way), the better your recommendation will be.'**
  String get goalInputSubtitle;

  /// Example placeholder text shown inside the empty goal-description text field
  ///
  /// In en, this message translates to:
  /// **'e.g. I\'m 34 and work long hours at a desk job. I struggle to fall asleep before midnight and wake up exhausted. I\'ve tried evening runs but give up after a week. I want a realistic routine that helps me wind down and feel more rested.'**
  String get goalInputHint;

  /// Validation error when the goal-description field is submitted empty
  ///
  /// In en, this message translates to:
  /// **'Please describe your goal'**
  String get goalInputValidationError;

  /// Heading for the explanatory card on the goal-input screen linking to the how-recommendations-work page
  ///
  /// In en, this message translates to:
  /// **'How do recommendations work?'**
  String get recommendWhyCardTitle;

  /// Body copy for the explanatory card on the goal-input screen
  ///
  /// In en, this message translates to:
  /// **'We match your goal against similar habits shared by others, then a language model turns the best matches into a personalized suggestion.'**
  String get recommendWhyCardBody;

  /// Tap target on the recommend-why card opening the About the Health Habit Hub info page, scrolled to the how-recommendations-work section
  ///
  /// In en, this message translates to:
  /// **'See how it works'**
  String get recommendWhyCardLink;

  /// Heading on the questionnaire confirmation screen
  ///
  /// In en, this message translates to:
  /// **'Response submitted!'**
  String get questionnaireResponseSubmitted;

  /// Body text on the questionnaire confirmation screen
  ///
  /// In en, this message translates to:
  /// **'Thank you for completing the questionnaire. Your answers help personalise your habit recommendations.'**
  String get questionnaireThankYou;

  /// Button label to navigate back to the profile screen
  ///
  /// In en, this message translates to:
  /// **'Back to Profile'**
  String get backToProfile;

  /// Button label on the post-donation questionnaire confirmation screen, returning to the share/donate screen
  ///
  /// In en, this message translates to:
  /// **'Share Another Habit'**
  String get backToShare;

  /// AppBar title for confirmation screens
  ///
  /// In en, this message translates to:
  /// **'Thank You'**
  String get thankYou;

  /// Shown on the profile screen when the participant's study has assigned questionnaires but none are currently due
  ///
  /// In en, this message translates to:
  /// **'No questionnaires due right now.'**
  String get noQuestionnairesDue;

  /// Label under a greyed-out, no-longer-editable questionnaire in the profile's Health Questionnaires list, showing when it was submitted
  ///
  /// In en, this message translates to:
  /// **'Completed on {date}'**
  String questionnaireCompletedOn(String date);

  /// Label under a greyed-out questionnaire in the profile's Health Questionnaires list that has never been completed and has no open window yet
  ///
  /// In en, this message translates to:
  /// **'Not yet available'**
  String get questionnaireNotYetAvailable;

  /// Bottom nav tab label for My Habits
  ///
  /// In en, this message translates to:
  /// **'My Habits'**
  String get myHabitsTab;

  /// Label for the Explore tab showing the user's saved/liked donated habits (distinct from the top-level 'My Habits' page, which tracks the user's own habits)
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get exploreSavedTab;

  /// Bottom nav tab label for the share-a-habit screen
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get navTabShare;

  /// Bottom nav tab label for the explore-habits screen
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get navTabExplore;

  /// Bottom nav tab label for the recommendations screen. Previously abbreviated to "Recs", which was ambiguous.
  ///
  /// In en, this message translates to:
  /// **'Recommend'**
  String get navTabRecommend;

  /// Bottom nav tab label for the account/settings screen
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get navTabAccount;

  /// Button to start new habit flow
  ///
  /// In en, this message translates to:
  /// **'New Habit'**
  String get newHabit;

  /// Empty state for My Habits tab
  ///
  /// In en, this message translates to:
  /// **'No habits yet.\nTap \"New Habit\" to start forming one.'**
  String get noHabitsYet;

  /// Button on habit card to log today's enactment
  ///
  /// In en, this message translates to:
  /// **'Log today'**
  String get logToday;

  /// Shown on habit card when today is already logged
  ///
  /// In en, this message translates to:
  /// **'Logged ✓'**
  String get loggedToday;

  /// Tooltip on habit card's log checkbox; long-press opens the backfill sheet
  ///
  /// In en, this message translates to:
  /// **'Log for another day'**
  String get logForAnotherDay;

  /// Title of the bottom sheet for logging a habit on a past day
  ///
  /// In en, this message translates to:
  /// **'Log a different day'**
  String get backfillSheetTitle;

  /// Subtitle explaining the backfill sheet
  ///
  /// In en, this message translates to:
  /// **'Tap a day to mark it done, or tap again to undo it.'**
  String get backfillSheetSubtitle;

  /// Label for today's date row in the backfill sheet
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// Label for yesterday's date row in the backfill sheet
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get yesterday;

  /// Screen 1 of new habit flow
  ///
  /// In en, this message translates to:
  /// **'What habit do you want to form?'**
  String get pickBehaviorTitle;

  /// Screen 2 of new habit flow
  ///
  /// In en, this message translates to:
  /// **'Set your cue'**
  String get setCueTitle;

  /// Instruction shown for pre-rated cues
  ///
  /// In en, this message translates to:
  /// **'Your study condition assigns the following cue(s). Read them carefully: this is when you will act.'**
  String get setCuePreRatedInstruction;

  /// Instruction shown for self-selected cues
  ///
  /// In en, this message translates to:
  /// **'Describe a specific moment that happens regularly in your life.'**
  String get setCueSelfSelectedInstruction;

  /// Hint text for self-selected cue input
  ///
  /// In en, this message translates to:
  /// **'e.g. After dinner each evening'**
  String get setCuePlaceholder;

  /// Validation error for too-short cue text
  ///
  /// In en, this message translates to:
  /// **'Please describe your cue in at least 10 characters.'**
  String get setCueTooShort;

  /// Screen 3 of new habit flow
  ///
  /// In en, this message translates to:
  /// **'Your plan'**
  String get confirmPlanTitle;

  /// Subtitle on confirm plan screen
  ///
  /// In en, this message translates to:
  /// **'Read your implementation intention and confirm.'**
  String get confirmPlanSubtitle;

  /// Hint text for the editable implementation-intention text field
  ///
  /// In en, this message translates to:
  /// **'Edit your intention…'**
  String get confirmPlanEditHint;

  /// Read-only reminder status when the study fixes the reminder time
  ///
  /// In en, this message translates to:
  /// **'Reminder at {time} (set by study)'**
  String confirmPlanReminderAtTime(String time);

  /// Read-only reminder status when the study disables reminders
  ///
  /// In en, this message translates to:
  /// **'No reminders (set by study)'**
  String get confirmPlanNoRemindersByStudy;

  /// Label for the community-sharing opt-in switch on the confirm plan screen
  ///
  /// In en, this message translates to:
  /// **'Share this habit anonymously with the community'**
  String get confirmPlanShareWithCommunity;

  /// Label for duration input in new habit flow
  ///
  /// In en, this message translates to:
  /// **'Duration (minutes)'**
  String get durationLabel;

  /// Submit button on confirm plan screen
  ///
  /// In en, this message translates to:
  /// **'Create habit'**
  String get createHabit;

  /// Error when maxHabits is exceeded
  ///
  /// In en, this message translates to:
  /// **'You have reached the habit limit for your study condition.'**
  String get habitLimitReached;

  /// Title on SRHI prompt card
  ///
  /// In en, this message translates to:
  /// **'Weekly habit check-in'**
  String get srhiCheckInTitle;

  /// Subtitle on SRHI prompt card
  ///
  /// In en, this message translates to:
  /// **'Takes about 2 minutes.'**
  String get srhiCheckInSubtitle;

  /// Button on SRHI prompt card
  ///
  /// In en, this message translates to:
  /// **'Start check-in'**
  String get srhiStartButton;

  /// AppBar title on SRHI form screen
  ///
  /// In en, this message translates to:
  /// **'Habit check-in'**
  String get srhiFormTitle;

  /// Stem sentence for SRHI items
  ///
  /// In en, this message translates to:
  /// **'{behavior} is something…'**
  String srhiStem(String behavior);

  /// Label for the lowest point of the SRHI 1-7 agreement scale
  ///
  /// In en, this message translates to:
  /// **'1 = Strongly disagree'**
  String get srhiScaleMin;

  /// Label for the highest point of the SRHI 1-7 agreement scale
  ///
  /// In en, this message translates to:
  /// **'7 = Strongly agree'**
  String get srhiScaleMax;

  /// Submit button on SRHI form screen
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get srhiSubmit;

  /// Error shown when SRHI form is incomplete
  ///
  /// In en, this message translates to:
  /// **'Please rate all 12 items before submitting.'**
  String get srhiSubmitIncomplete;

  /// Week label in SRHI trajectory
  ///
  /// In en, this message translates to:
  /// **'Week {n}'**
  String weekLabel(int n);

  /// AppBar title on habit detail screen
  ///
  /// In en, this message translates to:
  /// **'Habit detail'**
  String get habitDetailTitle;

  /// Menu action to abandon a habit
  ///
  /// In en, this message translates to:
  /// **'Abandon habit'**
  String get abandonHabit;

  /// Confirmation dialog body for abandon
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to abandon this habit? This cannot be undone.'**
  String get abandonConfirm;

  /// Confirm button in dialogs
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// Section title above the heatmap
  ///
  /// In en, this message translates to:
  /// **'Activity log'**
  String get heatmapTitle;

  /// Section title above SRHI trajectory chart
  ///
  /// In en, this message translates to:
  /// **'Habit strength'**
  String get trajectoryTitle;

  /// Legend label for heatmap enacted cells
  ///
  /// In en, this message translates to:
  /// **'Enacted'**
  String get enactedLabel;

  /// Legend label for heatmap missed cells
  ///
  /// In en, this message translates to:
  /// **'Missed'**
  String get missedLabel;

  /// Empty state for heatmap
  ///
  /// In en, this message translates to:
  /// **'No activity logged yet.'**
  String get noLogsYet;

  /// Empty state for trajectory chart
  ///
  /// In en, this message translates to:
  /// **'SRHI data will appear after your first weekly check-in.'**
  String get noTrajectoryYet;

  /// X-axis title for the SRHI trajectory chart (time)
  ///
  /// In en, this message translates to:
  /// **'Study week'**
  String get srhiChartWeekAxis;

  /// Y-axis title for the SRHI trajectory chart (habit strength)
  ///
  /// In en, this message translates to:
  /// **'SRHI score (1–7)'**
  String get srhiChartScoreAxis;

  /// Tooltip shown when tapping a point on the SRHI chart
  ///
  /// In en, this message translates to:
  /// **'Week {week}: {score} / 7'**
  String srhiChartTooltip(int week, String score);

  /// Section title above the automaticity trajectory chart, shown below habit strength
  ///
  /// In en, this message translates to:
  /// **'Automaticity'**
  String get automaticityTitle;

  /// Body text explaining what the automaticity chart shows
  ///
  /// In en, this message translates to:
  /// **'Automaticity combines your habit strength, recent adherence, and current streak into a single 0-100% score of how self-sustaining this habit has become. It\'s the same signal that determines how often you\'re reminded.'**
  String get automaticityExplanationBody;

  /// Empty state for the automaticity trajectory chart
  ///
  /// In en, this message translates to:
  /// **'Automaticity data will appear after your first weekly check-in.'**
  String get noAutomaticityYet;

  /// Y-axis title for the automaticity trajectory chart
  ///
  /// In en, this message translates to:
  /// **'Automaticity'**
  String get automaticityChartScoreAxis;

  /// Tooltip shown when tapping a point on the automaticity chart
  ///
  /// In en, this message translates to:
  /// **'Week {week}: {percent}%'**
  String automaticityChartTooltip(int week, String percent);

  /// Title of the dismissible SRHI explainer card on the habit detail screen
  ///
  /// In en, this message translates to:
  /// **'What\'s SRHI?'**
  String get srhiExplanationTitle;

  /// Body text of the dismissible SRHI explainer card
  ///
  /// In en, this message translates to:
  /// **'The Self-Report Habit Index (SRHI) measures how automatic this behavior feels to you, on a scale from 1 to 7. A higher score means it takes less conscious effort: a sign the habit is becoming part of your routine.'**
  String get srhiExplanationBody;

  /// Label above the latest SRHI score figure
  ///
  /// In en, this message translates to:
  /// **'Current SRHI score'**
  String get srhiScoreLabel;

  /// Shown instead of a score figure before the first check-in is submitted
  ///
  /// In en, this message translates to:
  /// **'Not yet available'**
  String get srhiScoreUnavailable;

  /// Label for the next scheduled SRHI check-in date
  ///
  /// In en, this message translates to:
  /// **'Next check-in'**
  String get srhiNextCheckInLabel;

  /// Shown instead of a date when the next SRHI check-in is already due
  ///
  /// In en, this message translates to:
  /// **'Due now'**
  String get srhiNextCheckInDue;

  /// Shown when there is no upcoming SRHI check-in for this habit
  ///
  /// In en, this message translates to:
  /// **'None scheduled'**
  String get srhiNextCheckInNone;

  /// App bar title of the informed-consent screen
  ///
  /// In en, this message translates to:
  /// **'Study Information & Consent'**
  String get consentTitle;

  /// App bar title when re-consenting after a version bump
  ///
  /// In en, this message translates to:
  /// **'Updated Study Consent'**
  String get consentUpdatedTitle;

  /// Text above the consent buttons
  ///
  /// In en, this message translates to:
  /// **'By tapping \"I consent\" you confirm that you have read and understood the study information and voluntarily agree to participate.'**
  String get consentConfirmText;

  /// Accept button on the consent screen
  ///
  /// In en, this message translates to:
  /// **'I consent'**
  String get consentAccept;

  /// Decline button on the consent screen
  ///
  /// In en, this message translates to:
  /// **'I do not consent'**
  String get consentDecline;

  /// Offline error on the consent screen
  ///
  /// In en, this message translates to:
  /// **'The consent document could not be loaded. Please check your connection.'**
  String get consentCouldNotLoad;

  /// Settings entry to delete the account
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get deleteAccount;

  /// Title of the account-deletion confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'Delete account?'**
  String get deleteAccountTitle;

  /// Body of the account-deletion confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'This permanently removes your account and login — you won\'t be able to sign back in, and this cannot be undone.\n\nYour contributed data (habit plans, daily logs, questionnaire answers, and donations) stays on our servers, but only as anonymous entries: once your account and identity are removed, nothing links that data back to you.\n\nQuestions or concerns about this? See:'**
  String get deleteAccountContent;

  /// Destructive confirm button of the deletion dialog
  ///
  /// In en, this message translates to:
  /// **'Delete permanently'**
  String get deleteAccountConfirm;

  /// Snackbar when account deletion fails
  ///
  /// In en, this message translates to:
  /// **'Account deletion failed. Please check your connection and try again.'**
  String get deleteAccountFailed;

  /// Settings entry for the GDPR data export
  ///
  /// In en, this message translates to:
  /// **'Export my data'**
  String get exportMyData;

  /// Snackbar when the data export fails
  ///
  /// In en, this message translates to:
  /// **'Export failed. Please check your connection and try again.'**
  String get exportFailed;

  /// Settings section label for data rights
  ///
  /// In en, this message translates to:
  /// **'My data'**
  String get myDataSection;

  /// Settings entry / title of the read-only consent document
  ///
  /// In en, this message translates to:
  /// **'Study consent'**
  String get studyConsent;

  /// Settings section label for legal documents
  ///
  /// In en, this message translates to:
  /// **'Legal'**
  String get legalSection;

  /// Settings entry for the app language
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// Settings entry to sign out
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// Body of the sign-out confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to sign out?'**
  String get signOutConfirm;

  /// Shown on the full-screen progress indicator while sign-out is in progress
  ///
  /// In en, this message translates to:
  /// **'Signing out…'**
  String get signingOut;

  /// Shown when the backend rejects a request because the session could not be renewed
  ///
  /// In en, this message translates to:
  /// **'Your session expired. Please sign in again to continue.'**
  String get sessionExpiredMessage;

  /// Button label to re-authenticate after a session expired
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInAction;

  /// AI provenance and medical disclaimer on the recommendations screen
  ///
  /// In en, this message translates to:
  /// **'AI-generated suggestions based on your study data. This is not medical advice; consult a doctor for health concerns.'**
  String get aiDisclaimer;

  /// Label of the reminder section in habit creation
  ///
  /// In en, this message translates to:
  /// **'Daily reminder'**
  String get dailyReminderLabel;

  /// Label of the cadence (daily vs weekly target) section in habit creation
  ///
  /// In en, this message translates to:
  /// **'How often?'**
  String get habitCadenceQuestion;

  /// Segmented-button option: the habit is tracked every day
  ///
  /// In en, this message translates to:
  /// **'Daily'**
  String get habitCadenceDaily;

  /// Segmented-button option: the habit has a weekly target count instead of a daily one
  ///
  /// In en, this message translates to:
  /// **'N times a week'**
  String get habitCadenceWeeklyOption;

  /// Shows the currently selected weekly target count next to the stepper
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 time a week} other{{count} times a week}}'**
  String habitCadenceTargetLabel(int count);

  /// Progress chip on a weekly-cadence habit card/detail screen, e.g. "2 / 3 this week"
  ///
  /// In en, this message translates to:
  /// **'{done} / {target} this week'**
  String weeklyProgressLabel(int done, int target);

  /// Streak stat for a weekly-cadence habit, in weeks rather than days
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1-week streak} other{{count}-week streak}}'**
  String weeklyStreakLabel(int count);

  /// Shown when reminders are disabled
  ///
  /// In en, this message translates to:
  /// **'No reminders'**
  String get noReminders;

  /// Hint explaining adaptive reminder fading
  ///
  /// In en, this message translates to:
  /// **'Reminders become less frequent as your habit gets stronger.'**
  String get reminderFadingHint;

  /// Done button on the time picker sheet
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get doneButton;

  /// Label of the SRHI score chip on habit cards
  ///
  /// In en, this message translates to:
  /// **'Habit strength'**
  String get habitStrengthLabel;

  /// Header of the comment section on a habit
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get commentsTitle;

  /// Placeholder of the comment input
  ///
  /// In en, this message translates to:
  /// **'Share a thought (anonymous)…'**
  String get commentHint;

  /// Empty state of the comment list
  ///
  /// In en, this message translates to:
  /// **'No comments yet. Be the first.'**
  String get noCommentsYet;

  /// Snackbar when posting a comment fails
  ///
  /// In en, this message translates to:
  /// **'Could not post comment'**
  String get couldNotPostComment;

  /// Snackbar shown instead of the comment when auto-moderation flagged it
  ///
  /// In en, this message translates to:
  /// **'Your comment was submitted for review and will appear once approved.'**
  String get commentPendingReview;

  /// Tooltip/button label to report a comment
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get reportComment;

  /// Title of the report-comment confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'Report comment?'**
  String get reportCommentTitle;

  /// Body text of the report-comment confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'This comment will be hidden immediately and sent to the study team for review.'**
  String get reportCommentBody;

  /// Snackbar after successfully reporting a comment
  ///
  /// In en, this message translates to:
  /// **'Comment reported'**
  String get commentReported;

  /// Snackbar when reporting a comment fails
  ///
  /// In en, this message translates to:
  /// **'Could not report comment'**
  String get couldNotReportComment;

  /// Shown instead of the comment section when the user has disabled comments
  ///
  /// In en, this message translates to:
  /// **'Comments are turned off. Enable them in Settings to view and post.'**
  String get commentsDisabledMessage;

  /// Section label above the community-comments toggle in Settings
  ///
  /// In en, this message translates to:
  /// **'Community'**
  String get communitySection;

  /// Settings row title for the comments on/off toggle
  ///
  /// In en, this message translates to:
  /// **'Community comments'**
  String get communityComments;

  /// Settings row subtitle explaining the comments toggle
  ///
  /// In en, this message translates to:
  /// **'Turn off to hide comment posting and viewing on shared habits.'**
  String get communityCommentsSubtitle;

  /// Unused — like annotation removed
  ///
  /// In en, this message translates to:
  /// **''**
  String get likeTooltip;

  /// Title of the admin comment-moderation screen
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get adminComments;

  /// Title of the moderation delete dialog
  ///
  /// In en, this message translates to:
  /// **'Delete comment?'**
  String get adminDeleteCommentTitle;

  /// Body of the moderation delete dialog
  ///
  /// In en, this message translates to:
  /// **'This removes the comment for all participants. Cannot be undone.'**
  String get adminDeleteCommentContent;

  /// Snackbar when moderation deletion fails
  ///
  /// In en, this message translates to:
  /// **'Failed to delete comment'**
  String get adminFailedToDeleteComment;

  /// Error state of the moderation list
  ///
  /// In en, this message translates to:
  /// **'Failed to load comments'**
  String get adminFailedToLoadComments;

  /// Empty state of the moderation list
  ///
  /// In en, this message translates to:
  /// **'No comments yet.'**
  String get adminNoCommentsYet;

  /// Title of the first onboarding walkthrough step
  ///
  /// In en, this message translates to:
  /// **'Share a Habit'**
  String get onboardingShareHabitTitle;

  /// Body copy of the first onboarding walkthrough step
  ///
  /// In en, this message translates to:
  /// **'Share your personal habits with researchers to help build a richer understanding of everyday behaviour. Your contributions are anonymised and used only for scientific research. Every habit you share makes the dataset more valuable for everyone.'**
  String get onboardingShareHabitDescription;

  /// Title of the second onboarding walkthrough step
  ///
  /// In en, this message translates to:
  /// **'Explore & Annotate'**
  String get onboardingExploreAnnotateTitle;

  /// Body copy of the second onboarding walkthrough step
  ///
  /// In en, this message translates to:
  /// **'Browse the interactive habit graph to discover how habits relate to each other across the community. You can annotate connections and add context to improve the shared knowledge base. The more you explore, the richer the graph becomes.'**
  String get onboardingExploreAnnotateDescription;

  /// Title of the third onboarding walkthrough step
  ///
  /// In en, this message translates to:
  /// **'Get Recommendations'**
  String get onboardingRecommendationsTitle;

  /// Body copy of the third onboarding walkthrough step
  ///
  /// In en, this message translates to:
  /// **'Receive personalised habit recommendations based on your profile and the collective dataset. Our recommendation engine learns from community contributions to suggest habits that fit your lifestyle. Discover new habits that others with similar profiles have found helpful.'**
  String get onboardingRecommendationsDescription;

  /// Subtitle shown under the app name on the onboarding splash page
  ///
  /// In en, this message translates to:
  /// **'A citizen-science platform where your habits help build a richer understanding of everyday behaviour.'**
  String get onboardingSubtitle;

  /// Button label to begin the onboarding walkthrough from the splash page
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get onboardingGetStarted;

  /// Button label on the onboarding splash page to restore an existing account instead of onboarding as new
  ///
  /// In en, this message translates to:
  /// **'Restore existing account'**
  String get onboardingRestoreAccount;

  /// Button label to skip ahead to the last onboarding walkthrough page
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get onboardingSkip;

  /// Button label on the final onboarding walkthrough page to proceed to consent
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get onboardingContinue;

  /// Button label to advance to the next onboarding walkthrough page
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get onboardingNext;

  /// AppBar title on the study-code onboarding screen
  ///
  /// In en, this message translates to:
  /// **'Study Code'**
  String get studyCodeAppBarTitle;

  /// Heading on the study-code onboarding screen
  ///
  /// In en, this message translates to:
  /// **'Do you have a study code?'**
  String get studyCodeQuestion;

  /// Explanatory subtitle on the study-code onboarding screen
  ///
  /// In en, this message translates to:
  /// **'If a researcher gave you a study code, enter it here to join their study. You can also skip this step.'**
  String get studyCodeSubtitle;

  /// Text field label for the study code input
  ///
  /// In en, this message translates to:
  /// **'Study code'**
  String get studyCodeLabel;

  /// Validation error when the entered study code doesn't match the expected format
  ///
  /// In en, this message translates to:
  /// **'Enter a valid code in HHH-XXXXX format.'**
  String get studyCodeInvalidFormat;

  /// Error shown when the server rejects the study code as unknown (404)
  ///
  /// In en, this message translates to:
  /// **'Invalid code. Please check and try again.'**
  String get studyCodeInvalid;

  /// Error shown when the study code has expired (410)
  ///
  /// In en, this message translates to:
  /// **'This code has expired.'**
  String get studyCodeExpired;

  /// Error shown when the study code was already redeemed (409)
  ///
  /// In en, this message translates to:
  /// **'This code has already been used.'**
  String get studyCodeAlreadyUsed;

  /// Fallback error when redeeming the study code fails for an unrecognised reason
  ///
  /// In en, this message translates to:
  /// **'Could not redeem code. Please check your connection.'**
  String get studyCodeGenericError;

  /// Shown when skipping study-code entry (enrolling in the default study) fails
  ///
  /// In en, this message translates to:
  /// **'Could not join without a code. Please check your connection and try again.'**
  String get studyCodeSkipError;

  /// Primary button to submit the entered study code
  ///
  /// In en, this message translates to:
  /// **'Continue with code'**
  String get studyCodeContinueButton;

  /// Secondary button to skip entering a study code and join the default study
  ///
  /// In en, this message translates to:
  /// **'Join without study code'**
  String get studyCodeSkipButton;

  /// Title of the confirmation dialog shown before deleting a questionnaire
  ///
  /// In en, this message translates to:
  /// **'Delete questionnaire?'**
  String get adminQuestionnairesDeleteConfirmTitle;

  /// Body of the confirmation dialog shown before deleting a questionnaire, includes the questionnaire title
  ///
  /// In en, this message translates to:
  /// **'Delete \"{title}\"? This cannot be undone.'**
  String adminQuestionnairesDeleteConfirmMessage(String title);

  /// Error shown when deleting a questionnaire fails because it is assigned to an active study (HTTP 409)
  ///
  /// In en, this message translates to:
  /// **'Cannot delete: questionnaire is assigned to an active study.'**
  String get adminQuestionnairesDeleteConflict;

  /// Error shown when deleting a questionnaire fails because it is a read-only library questionnaire (HTTP 403)
  ///
  /// In en, this message translates to:
  /// **'Cannot delete a library questionnaire.'**
  String get adminQuestionnairesDeleteForbidden;

  /// Generic error shown when deleting a questionnaire fails
  ///
  /// In en, this message translates to:
  /// **'Failed to delete questionnaire.'**
  String get adminQuestionnairesDeleteFailed;

  /// AppBar title for the admin questionnaires screen
  ///
  /// In en, this message translates to:
  /// **'Questionnaires'**
  String get adminQuestionnairesTitle;

  /// Label for the library questionnaires tab, and chip shown on library questionnaire cards
  ///
  /// In en, this message translates to:
  /// **'Library'**
  String get adminQuestionnairesLibraryLabel;

  /// Tab label for researcher-created custom questionnaires
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get adminQuestionnairesCustomTab;

  /// Tooltip for the floating action button that creates a new custom questionnaire
  ///
  /// In en, this message translates to:
  /// **'New questionnaire'**
  String get adminQuestionnairesNewTooltip;

  /// Error message shown when the questionnaire list fails to load
  ///
  /// In en, this message translates to:
  /// **'Failed to load questionnaires.'**
  String get adminQuestionnairesLoadFailed;

  /// Empty state message for the library questionnaires tab
  ///
  /// In en, this message translates to:
  /// **'No library questionnaires found.'**
  String get adminQuestionnairesLibraryEmpty;

  /// Empty state message for the custom questionnaires tab
  ///
  /// In en, this message translates to:
  /// **'No custom questionnaires yet.\nTap + to create one.'**
  String get adminQuestionnairesCustomEmpty;

  /// Chip label showing the number of questions in a questionnaire
  ///
  /// In en, this message translates to:
  /// **'{count} questions'**
  String adminQuestionnairesItemCount(int count);

  /// Chip label shown on a questionnaire card when the questionnaire is inactive
  ///
  /// In en, this message translates to:
  /// **'Inactive'**
  String get adminQuestionnairesInactiveChip;

  /// Title of the questionnaire editor dialog when editing an existing questionnaire
  ///
  /// In en, this message translates to:
  /// **'Edit Questionnaire'**
  String get adminQuestionnairesEditDialogTitle;

  /// Title of the questionnaire editor dialog when creating a new questionnaire
  ///
  /// In en, this message translates to:
  /// **'New Questionnaire'**
  String get adminQuestionnairesNewDialogTitle;

  /// Label for the required title text field in the questionnaire editor dialog
  ///
  /// In en, this message translates to:
  /// **'Title *'**
  String get adminQuestionnairesTitleFieldLabel;

  /// Validation error shown under the title field when it is left empty
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get adminQuestionnairesFieldRequiredError;

  /// Label for the description text field in the questionnaire editor dialog
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get adminQuestionnairesDescriptionFieldLabel;

  /// Section heading showing the number of questions in the questionnaire editor dialog
  ///
  /// In en, this message translates to:
  /// **'Questions ({count})'**
  String adminQuestionnairesQuestionsCount(int count);

  /// Button label to add a new question in the questionnaire editor dialog
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get adminQuestionnairesAddButton;

  /// Empty state message shown when a questionnaire has no questions yet
  ///
  /// In en, this message translates to:
  /// **'No questions yet. Tap \"Add\" to add one.'**
  String get adminQuestionnairesNoQuestionsYet;

  /// Validation snackbar shown when saving a questionnaire with one or more blank questions
  ///
  /// In en, this message translates to:
  /// **'All questions must have text.'**
  String get adminQuestionnairesAllQuestionsNeedText;

  /// Snackbar message shown when saving a questionnaire fails
  ///
  /// In en, this message translates to:
  /// **'Failed to save questionnaire.'**
  String get adminQuestionnairesSaveFailed;

  /// Button label to submit the dialog when creating a new questionnaire
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get adminQuestionnairesCreateButton;

  /// Short numbered label identifying a question's position in the questionnaire editor
  ///
  /// In en, this message translates to:
  /// **'Q{number}'**
  String adminQuestionnairesQuestionNumber(int number);

  /// Label for the question text field in the question editor
  ///
  /// In en, this message translates to:
  /// **'Question text'**
  String get adminQuestionnairesQuestionTextFieldLabel;

  /// Label for the question type dropdown in the question editor
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get adminQuestionnairesTypeFieldLabel;

  /// Question type option: free-form open text answer
  ///
  /// In en, this message translates to:
  /// **'Open text'**
  String get adminQuestionnairesTypeOpenText;

  /// Question type option: single choice answer
  ///
  /// In en, this message translates to:
  /// **'Single choice'**
  String get adminQuestionnairesTypeSingleChoice;

  /// Question type option: multiple choice answer
  ///
  /// In en, this message translates to:
  /// **'Multi choice'**
  String get adminQuestionnairesTypeMultiChoice;

  /// Question type option: numeric scale answer
  ///
  /// In en, this message translates to:
  /// **'Scale'**
  String get adminQuestionnairesTypeScale;

  /// Checkbox label indicating whether a question must be answered
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get adminQuestionnairesRequiredLabel;

  /// Section heading showing the number of answer options for a choice question
  ///
  /// In en, this message translates to:
  /// **'Options ({count})'**
  String adminQuestionnairesOptionsCount(int count);

  /// Button label to add a new answer option to a choice question
  ///
  /// In en, this message translates to:
  /// **'Add option'**
  String get adminQuestionnairesAddOption;

  /// Label for a text field editing the label of a single answer option, numbered by its position
  ///
  /// In en, this message translates to:
  /// **'Option {number} label'**
  String adminQuestionnairesOptionLabelField(int number);

  /// Admin shell navigation rail label for the Participants section
  ///
  /// In en, this message translates to:
  /// **'Participants'**
  String get adminShellNavParticipants;

  /// Admin shell navigation rail label for the Surveys section
  ///
  /// In en, this message translates to:
  /// **'Surveys'**
  String get adminShellNavSurveys;

  /// Admin shell navigation rail label for the Questionnaires section
  ///
  /// In en, this message translates to:
  /// **'Questionnaires'**
  String get adminShellNavQuestionnaires;

  /// Admin shell navigation rail label for the Habits section
  ///
  /// In en, this message translates to:
  /// **'Habits'**
  String get adminShellNavHabits;

  /// Admin shell navigation rail label for the Devices section
  ///
  /// In en, this message translates to:
  /// **'Devices'**
  String get adminShellNavDevices;

  /// Admin shell navigation rail label for the Settings section
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get adminShellNavSettings;

  /// App bar title on the recommendation results screen
  ///
  /// In en, this message translates to:
  /// **'Recommendations'**
  String get recommendationResultsTitle;

  /// Button label to retry after an error or empty recommendation result
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get recommendationTryAgain;

  /// Message shown when the recommendation API returns no results
  ///
  /// In en, this message translates to:
  /// **'No recommendations were generated. Try describing your goal in more detail: the more context you share, the better.'**
  String get recommendationEmptyMessage;

  /// Bottom bar button label to go back and enter a different goal
  ///
  /// In en, this message translates to:
  /// **'Try a different goal'**
  String get recommendationTryDifferentGoal;

  /// Error shown when navigating to the habit-creation flow from a recommendation fails
  ///
  /// In en, this message translates to:
  /// **'Could not open the habit flow. Please try again.'**
  String get recommendationHabitFlowError;

  /// Label preceding the rationale text on a recommendation card
  ///
  /// In en, this message translates to:
  /// **'Why this helps:'**
  String get recommendationWhyThisHelps;

  /// Expansion tile title showing the number of cited sources for a recommendation
  ///
  /// In en, this message translates to:
  /// **'Sources ({count})'**
  String recommendationSourcesCount(int count);

  /// Button label to adopt a recommendation as a new habit
  ///
  /// In en, this message translates to:
  /// **'Add to my habits'**
  String get recommendationAddToHabits;

  /// Confirmation shown after successfully submitting feedback on a recommendation
  ///
  /// In en, this message translates to:
  /// **'Feedback submitted, thank you!'**
  String get recommendationFeedbackSubmitted;

  /// Label above the feedback comment field on a recommendation card
  ///
  /// In en, this message translates to:
  /// **'Leave a comment:'**
  String get recommendationLeaveComment;

  /// Placeholder hint text in the recommendation feedback comment field
  ///
  /// In en, this message translates to:
  /// **'Your feedback…'**
  String get recommendationFeedbackHint;

  /// Error shown when submitting recommendation feedback fails
  ///
  /// In en, this message translates to:
  /// **'Failed to submit feedback'**
  String get recommendationFeedbackFailed;

  /// Error shown when a citation source link fails to open
  ///
  /// In en, this message translates to:
  /// **'Could not open the source link.'**
  String get recommendationSourceLinkError;

  /// First phase label on the recommendation loading screen — matches the 'Community habits' data source on the About page's diagram
  ///
  /// In en, this message translates to:
  /// **'Comparing with habits people like you have tried…'**
  String get recommendationLoadingPhaseCommunity;

  /// Second phase label on the recommendation loading screen — matches the 'Your habits & answers' data source
  ///
  /// In en, this message translates to:
  /// **'Checking what\'s already working for you…'**
  String get recommendationLoadingPhaseHistory;

  /// Third phase label on the recommendation loading screen — matches the 'Research' data source
  ///
  /// In en, this message translates to:
  /// **'Consulting behaviour-change research…'**
  String get recommendationLoadingPhaseResearch;

  /// Fourth (final) phase label on the recommendation loading screen — the AI-writing step
  ///
  /// In en, this message translates to:
  /// **'Writing your personalized suggestion…'**
  String get recommendationLoadingPhaseGenerating;

  /// Error shown when the recommendation request times out
  ///
  /// In en, this message translates to:
  /// **'Generating recommendations took too long. Please try again.'**
  String get recommendationLoadingTimeoutError;

  /// Generic fallback error shown when generating recommendations fails
  ///
  /// In en, this message translates to:
  /// **'Something went wrong while generating recommendations. Please try again.'**
  String get recommendationLoadingGenericError;

  /// Empty state shown when a drilled-into dimension has no habit bubbles
  ///
  /// In en, this message translates to:
  /// **'No habits in this dimension yet.'**
  String get bubbleGraphNoHabitsInDimension;

  /// Tooltip for the back button that returns from a dimension to the full bubble graph overview
  ///
  /// In en, this message translates to:
  /// **'All categories'**
  String get bubbleGraphAllCategories;

  /// Habit count label shown under a dimension bubble and in the dimension drill-in header
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 habit} other{{count} habits}}'**
  String bubbleGraphHabitCount(int count);

  /// Bubble graph dimension label: TIME
  ///
  /// In en, this message translates to:
  /// **'Time'**
  String get bubbleGraphDimensionTime;

  /// Bubble graph dimension label: BEHAVIOR
  ///
  /// In en, this message translates to:
  /// **'Behavior'**
  String get bubbleGraphDimensionBehavior;

  /// Bubble graph dimension label: PHYSICAL_SETTING
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get bubbleGraphDimensionLocation;

  /// Bubble graph dimension label: PRIOR_BEHAVIOR
  ///
  /// In en, this message translates to:
  /// **'Prior Behavior'**
  String get bubbleGraphDimensionPriorBehavior;

  /// Bubble graph dimension label: OTHER_PEOPLE
  ///
  /// In en, this message translates to:
  /// **'Social'**
  String get bubbleGraphDimensionSocial;

  /// Bubble graph dimension label: INTERNAL_STATE
  ///
  /// In en, this message translates to:
  /// **'Mental State'**
  String get bubbleGraphDimensionMentalState;

  /// Bubble graph dimension label: REASONING
  ///
  /// In en, this message translates to:
  /// **'Reasoning'**
  String get bubbleGraphDimensionReasoning;

  /// Bottom sheet title asking why a specific habit was recommended
  ///
  /// In en, this message translates to:
  /// **'Why \"{habitName}\"?'**
  String recommendationCardWhyTitle(String habitName);

  /// Label for the citation/evidence section in the recommendation rationale sheet
  ///
  /// In en, this message translates to:
  /// **'Evidence'**
  String get recommendationCardEvidence;

  /// Label preceding the confidence score bar on a recommendation card
  ///
  /// In en, this message translates to:
  /// **'Confidence'**
  String get recommendationCardConfidence;

  /// Button label that opens the full rationale for a recommendation
  ///
  /// In en, this message translates to:
  /// **'Why?'**
  String get recommendationCardWhy;

  /// Tooltip for the button that dismisses a recommendation card
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get recommendationCardDismiss;

  /// Tooltip for the button that accepts a recommendation card
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get recommendationCardAccept;

  /// Validation error shown when a required questionnaire question is left unanswered
  ///
  /// In en, this message translates to:
  /// **'This question is required.'**
  String get questionnaireFormRequiredQuestion;

  /// Validation error shown on final submit when required questions are unanswered
  ///
  /// In en, this message translates to:
  /// **'Please answer all required questions before submitting.'**
  String get questionnaireFormAnswerAllRequired;

  /// Progress indicator label showing current question number out of total
  ///
  /// In en, this message translates to:
  /// **'Question {current} of {total}'**
  String questionnaireFormProgressLabel(int current, int total);

  /// Button to go back to the previous questionnaire question
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get questionnaireFormBackButton;

  /// Button to submit the completed questionnaire
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get questionnaireFormSubmitButton;

  /// Button to save the current answer and move to the next question
  ///
  /// In en, this message translates to:
  /// **'Save & Continue'**
  String get questionnaireFormSaveAndContinueButton;

  /// Placeholder hint text for the free-text questionnaire answer field
  ///
  /// In en, this message translates to:
  /// **'Your answer…'**
  String get questionnaireFormAnswerHint;

  /// Fallback app bar title shown while the questionnaire definition is loading or unavailable
  ///
  /// In en, this message translates to:
  /// **'Questionnaire'**
  String get questionnaireFallbackTitle;

  /// Small uppercase eyebrow label above the share-a-habit hero card
  ///
  /// In en, this message translates to:
  /// **'SHARE A HABIT'**
  String get donateShareEyebrow;

  /// Headline on the share-a-habit hero card
  ///
  /// In en, this message translates to:
  /// **'Share a habit with science'**
  String get donateHeroTitle;

  /// Subtitle on the share-a-habit hero card describing the task
  ///
  /// In en, this message translates to:
  /// **'Anonymous · ~2 min · Helps researchers worldwide'**
  String get donateHeroSubtitle;

  /// Button that opens the habit-donation form
  ///
  /// In en, this message translates to:
  /// **'Start sharing'**
  String get donateStartSharingButton;

  /// Small uppercase eyebrow label above a due-questionnaire task card
  ///
  /// In en, this message translates to:
  /// **'QUESTIONNAIRE'**
  String get donateQuestionnaireEyebrow;

  /// Subtitle on a due-questionnaire task card
  ///
  /// In en, this message translates to:
  /// **'Short questionnaire · due now'**
  String get donateQuestionnaireDueSubtitle;

  /// Button on a due-questionnaire task card that opens the questionnaire
  ///
  /// In en, this message translates to:
  /// **'Complete'**
  String get donateCompleteButton;

  /// Heading shown once the user has already shared a habit today
  ///
  /// In en, this message translates to:
  /// **'Shared today'**
  String get donateSharedTodayTitle;

  /// Body text shown once the user has already shared a habit today
  ///
  /// In en, this message translates to:
  /// **'Thanks for contributing! Every habit you share helps our research. Feel free to add another.'**
  String get donateSharedTodayBody;

  /// Prominent button on the shared-today card that lets the user share an additional habit the same day
  ///
  /// In en, this message translates to:
  /// **'Share another habit'**
  String get donateShareAnotherButton;

  /// Heading for the explanatory card on why habit sharing is useful
  ///
  /// In en, this message translates to:
  /// **'Why share?'**
  String get donateWhyShareTitle;

  /// Body copy for the explanatory card on why habit sharing is useful
  ///
  /// In en, this message translates to:
  /// **'Shared habits stay anonymous and help researchers build better recommendations for everyone, including you.'**
  String get donateWhyShareBody;

  /// Tap target on the why-share card opening the About the project info page
  ///
  /// In en, this message translates to:
  /// **'Read more about the project'**
  String get readMoreAboutProject;

  /// Snackbar shown when the donation form is submitted with missing answers
  ///
  /// In en, this message translates to:
  /// **'Please answer all questions'**
  String get donatePleaseAnswerAllQuestions;

  /// Message shown when the backend classifier rejects the submitted text as not being a habit
  ///
  /// In en, this message translates to:
  /// **'This doesn\'t look like a habit. Try describing a regular behaviour, e.g. \"I go for a 30-minute walk every morning\".'**
  String get donateNotAHabitMessage;

  /// Snackbar shown when a habit donation is queued for later submission due to no connection
  ///
  /// In en, this message translates to:
  /// **'Saved offline, will submit when connected'**
  String get donateSavedOffline;

  /// Snackbar shown when habit donation submission fails with a 401 response
  ///
  /// In en, this message translates to:
  /// **'Unauthorized. Please sign in again.'**
  String get donateUnauthorized;

  /// Snackbar shown when habit donation submission fails with a 502/503 response
  ///
  /// In en, this message translates to:
  /// **'Habit analysis is temporarily unavailable. Please try again in a moment.'**
  String get donateAnalysisUnavailable;

  /// Section heading above the list of today's tasks on the donate landing screen
  ///
  /// In en, this message translates to:
  /// **'TODAY\'S TASKS'**
  String get donateTodaysTasksEyebrow;

  /// Label under the total-donations stat card
  ///
  /// In en, this message translates to:
  /// **'Community'**
  String get donateCommunityLabel;

  /// Label under the sharing-streak stat card
  ///
  /// In en, this message translates to:
  /// **'Day streak'**
  String get donateDayStreakLabel;

  /// Title of the dismissible educational hint card on the donation form
  ///
  /// In en, this message translates to:
  /// **'What\'s a habit?'**
  String get donateHabitHintTitle;

  /// Body text of the dismissible educational hint card on the donation form, explaining what a habit and its context are
  ///
  /// In en, this message translates to:
  /// **'A habit is a specific, repeatable action, not just a general goal. A good description names the action itself, plus the context around it: when or where you do it, and sometimes why.'**
  String get donateHabitHintBody;

  /// Label introducing the worked example sentence below the hint body
  ///
  /// In en, this message translates to:
  /// **'For example:'**
  String get donateHabitHintExampleIntro;

  /// Worked example habit sentence for the donation-form hint card. [T]/[B]/[L]/[R] tags mark the Time/Behavior/Location/Reasoning phrases that get colour-coded to match the Explore graph's dimension colours — keep each tag pair wrapped tightly around the corresponding translated phrase, but the phrases and tags may be reordered freely to fit natural word order in this language.
  ///
  /// In en, this message translates to:
  /// **'[T]After breakfast[/T], I will [B]go for a 20-minute walk[/B] [L]in the park[/L] because [R]I want more energy[/R].'**
  String get donateHabitHintExampleSentence;

  /// Label above the habit description text field on the donation form
  ///
  /// In en, this message translates to:
  /// **'Describe your habit'**
  String get donateFormDescribeHabitLabel;

  /// Placeholder hint text for the habit description text field
  ///
  /// In en, this message translates to:
  /// **'e.g. I go for a 30-minute walk every morning'**
  String get donateFormHabitHint;

  /// Validation error when the habit description is too short
  ///
  /// In en, this message translates to:
  /// **'Please describe your habit (at least 10 characters)'**
  String get donateFormHabitValidationError;

  /// Rating question label on the donation form
  ///
  /// In en, this message translates to:
  /// **'How often do you do this habit?'**
  String get donateFormFrequencyQuestion;

  /// Frequency rating option on the donation form
  ///
  /// In en, this message translates to:
  /// **'Rarely'**
  String get donateFormFrequencyRarely;

  /// Frequency rating option on the donation form
  ///
  /// In en, this message translates to:
  /// **'Weekly'**
  String get donateFormFrequencyWeekly;

  /// Frequency rating option on the donation form
  ///
  /// In en, this message translates to:
  /// **'Several/week'**
  String get donateFormFrequencySeveralPerWeek;

  /// Frequency rating option on the donation form
  ///
  /// In en, this message translates to:
  /// **'Daily'**
  String get donateFormFrequencyDaily;

  /// Rating question label on the donation form
  ///
  /// In en, this message translates to:
  /// **'How much do you think this habit benefits your health?'**
  String get donateFormHealthBenefitQuestion;

  /// Caption explaining the 1-5 rating scale endpoints on the donation form
  ///
  /// In en, this message translates to:
  /// **'1 = Not at all · 5 = Very much'**
  String get donateFormRatingCaption;

  /// Rating question label on the donation form
  ///
  /// In en, this message translates to:
  /// **'How much do you think this habit improves your wellbeing?'**
  String get donateFormWellbeingQuestion;

  /// Button label to start recording a spoken habit description on the donation form
  ///
  /// In en, this message translates to:
  /// **'Speak instead'**
  String get donateVoiceStartRecording;

  /// Button label to stop recording a spoken habit description on the donation form
  ///
  /// In en, this message translates to:
  /// **'Stop recording'**
  String get donateVoiceStopRecording;

  /// Label shown while a recorded habit description is being transcribed
  ///
  /// In en, this message translates to:
  /// **'Transcribing…'**
  String get donateVoiceTranscribing;

  /// Error shown when speech-to-text transcription fails on the donation form
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t transcribe that — please try again or type it instead.'**
  String get donateVoiceTranscriptionFailed;

  /// Error shown when microphone permission is denied on the donation form
  ///
  /// In en, this message translates to:
  /// **'Microphone access is needed to speak your habit — you can type it instead.'**
  String get donateVoiceMicPermissionDenied;

  /// Label under the round hold-to-speak button on the voice donation form
  ///
  /// In en, this message translates to:
  /// **'Hold to speak'**
  String get donateVoiceHoldToSpeak;

  /// Label under the round hold-to-speak button while recording is in progress
  ///
  /// In en, this message translates to:
  /// **'Recording… release to stop'**
  String get donateVoiceRecording;

  /// Tooltip/label for the small edit icon that unlocks the greyed transcript field for manual correction
  ///
  /// In en, this message translates to:
  /// **'Edit text'**
  String get donateVoiceEditTranscript;

  /// Placeholder shown in the greyed transcript field before any speech has been transcribed
  ///
  /// In en, this message translates to:
  /// **'Hold the button below and describe your habit'**
  String get donateVoiceTranscriptPlaceholder;

  /// Section header above the activity picker on the donation form, shown when the study restricts donation to a fixed catalog of activities
  ///
  /// In en, this message translates to:
  /// **'What did you do?'**
  String get donateStructuredPickerLabel;

  /// Hint text below the activity picker header on the donation form
  ///
  /// In en, this message translates to:
  /// **'Choose the activity that best matches what you did'**
  String get donateStructuredPickerHint;

  /// Empty-state message shown when the structured activity catalog has no entries configured
  ///
  /// In en, this message translates to:
  /// **'No activities are available yet — please check back later.'**
  String get donateStructuredEmptyState;

  /// Button to proceed from the cue-setting step to the next step
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get setCueNextButton;

  /// Empty-state title shown when no study-assigned cues are available yet
  ///
  /// In en, this message translates to:
  /// **'No cues available yet'**
  String get setCueNoneAvailableTitle;

  /// Empty-state subtitle shown when no study-assigned cues are available yet
  ///
  /// In en, this message translates to:
  /// **'Your study coordinator will assign cues soon'**
  String get setCueNoneAvailableSubtitle;

  /// Subtitle for an assigned cue when more than one cue was assigned
  ///
  /// In en, this message translates to:
  /// **'Cue {index} of {total} (assigned by study)'**
  String setCueAssignedNumbered(int index, int total);

  /// Subtitle for an assigned cue when only one cue was assigned
  ///
  /// In en, this message translates to:
  /// **'Assigned by study'**
  String get setCueAssignedByStudy;

  /// Button label to add another self-selected cue, showing current and maximum count
  ///
  /// In en, this message translates to:
  /// **'Add another cue ({current}/{max})'**
  String addAnotherCueCount(int current, int max);

  /// Note shown once the maximum number of self-selected cues has been reached
  ///
  /// In en, this message translates to:
  /// **'You can add up to {max} cues.'**
  String setCueMaxReachedNote(int max);

  /// Text field label for a self-selected cue when there is only one cue field
  ///
  /// In en, this message translates to:
  /// **'Your cue'**
  String get setCueLabelSingle;

  /// Text field label for a self-selected cue when there is more than one cue field
  ///
  /// In en, this message translates to:
  /// **'Cue {number}'**
  String setCueLabelNumbered(int number);

  /// Tooltip on the button that removes a self-selected cue field
  ///
  /// In en, this message translates to:
  /// **'Remove cue'**
  String get setCueRemoveTooltip;

  /// Hint text for self-selected cue fields after the first one
  ///
  /// In en, this message translates to:
  /// **'e.g. at home on weekdays'**
  String get setCueExtraPlaceholder;

  /// Snackbar shown when logging today's habit completion fails
  ///
  /// In en, this message translates to:
  /// **'Could not log today: {error}'**
  String couldNotLogToday(String error);

  /// Snackbar shown when logging/unlogging a past day in the backfill sheet fails
  ///
  /// In en, this message translates to:
  /// **'Could not update log: {error}'**
  String couldNotLogDay(String error);

  /// Generic button to proceed to the next screen
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueButton;

  /// Validation error when the free-text habit description is too short
  ///
  /// In en, this message translates to:
  /// **'Please describe your habit (min. 3 characters)'**
  String get describeYourHabitMinLength;

  /// Text field label for entering a free-text habit description
  ///
  /// In en, this message translates to:
  /// **'Your habit'**
  String get yourHabitLabel;

  /// Hint text for the free-text habit description field
  ///
  /// In en, this message translates to:
  /// **'e.g. A 20-minute walk'**
  String get yourHabitHint;

  /// Generic Next button label
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get nextButton;

  /// Settings entry and title of the help/contact/FAQ screen
  ///
  /// In en, this message translates to:
  /// **'Help & Support'**
  String get helpAndSupport;

  /// Section label for the contact card on the Help & Support screen
  ///
  /// In en, this message translates to:
  /// **'Contact the research team'**
  String get contactResearchTeam;

  /// Body text above the send-email button
  ///
  /// In en, this message translates to:
  /// **'Have a question or ran into a problem? Send us an email and we\'ll get back to you.'**
  String get contactResearchTeamDescription;

  /// Button that opens the mail app addressed to the study team
  ///
  /// In en, this message translates to:
  /// **'Send email'**
  String get sendEmail;

  /// Shown when no email app could be launched from the Help & Support screen's Send email button
  ///
  /// In en, this message translates to:
  /// **'Could not open an email app. Please email {email} directly.'**
  String couldNotOpenEmailApp(String email);

  /// Section label for the FAQ list on the Help & Support screen
  ///
  /// In en, this message translates to:
  /// **'Frequently asked questions'**
  String get frequentlyAskedQuestions;

  /// FAQ question about a lost recovery passphrase
  ///
  /// In en, this message translates to:
  /// **'I lost my recovery passphrase — what do I do?'**
  String get faqPassphraseQuestion;

  /// FAQ answer about a lost recovery passphrase
  ///
  /// In en, this message translates to:
  /// **'Your 24-word passphrase is the only way to recover your account. If you still have it, use \"Restore account\" on the welcome screen. If you\'ve lost it, your account and data unfortunately cannot be recovered — contact us if you\'d like to start over.'**
  String get faqPassphraseAnswer;

  /// FAQ question about exporting or deleting data
  ///
  /// In en, this message translates to:
  /// **'Can I export or delete my data?'**
  String get faqDataQuestion;

  /// FAQ answer about exporting or deleting data
  ///
  /// In en, this message translates to:
  /// **'Yes. Go to Settings → Export my data to download everything linked to your account, or Settings → Delete account to permanently erase it. Deletion cannot be undone.'**
  String get faqDataAnswer;

  /// FAQ question about offline behavior
  ///
  /// In en, this message translates to:
  /// **'What happens if I lose connection while using the app?'**
  String get faqOfflineQuestion;

  /// FAQ answer about offline behavior
  ///
  /// In en, this message translates to:
  /// **'Habit check-ins you submit while offline are saved on your device and sent automatically once you\'re back online.'**
  String get faqOfflineAnswer;

  /// FAQ question about notifications
  ///
  /// In en, this message translates to:
  /// **'Can I turn off reminders?'**
  String get faqNotificationsQuestion;

  /// FAQ answer explaining notifications are study-managed
  ///
  /// In en, this message translates to:
  /// **'Reminders are part of the study, so they can\'t be turned off inside the app. If you need to, you can manage notifications for this app in your phone\'s system settings.'**
  String get faqNotificationsAnswer;

  /// FAQ question about withdrawing consent
  ///
  /// In en, this message translates to:
  /// **'Can I withdraw my consent?'**
  String get faqConsentQuestion;

  /// FAQ answer about withdrawing consent
  ///
  /// In en, this message translates to:
  /// **'Yes, at any time. Go to Settings → Study consent to review what you agreed to, or Settings → Delete account to withdraw and erase your data.'**
  String get faqConsentAnswer;

  /// Settings entry to rotate the recovery passphrase
  ///
  /// In en, this message translates to:
  /// **'Change recovery passphrase'**
  String get changeRecoveryPassphrase;

  /// Title of the passphrase-rotation confirmation dialog
  ///
  /// In en, this message translates to:
  /// **'Change your recovery passphrase?'**
  String get rotatePassphraseTitle;

  /// Warning shown before and during passphrase rotation
  ///
  /// In en, this message translates to:
  /// **'Your current 24-word phrase will stop working immediately. Make sure to save the new one somewhere safe.'**
  String get rotatePassphraseWarning;

  /// Button that confirms and triggers passphrase rotation
  ///
  /// In en, this message translates to:
  /// **'Generate new phrase'**
  String get rotatePassphraseConfirm;

  /// Heading shown above the newly generated passphrase
  ///
  /// In en, this message translates to:
  /// **'Your new recovery passphrase'**
  String get rotatePassphraseNewTitle;

  /// Subtitle shown above the newly generated passphrase
  ///
  /// In en, this message translates to:
  /// **'Write these 24 words down or store them somewhere safe. You\'ll need them to recover your account.'**
  String get rotatePassphraseNewSubtitle;

  /// Checkbox label confirming the new passphrase was saved
  ///
  /// In en, this message translates to:
  /// **'I have written it down'**
  String get rotatePassphraseSavedCheckbox;

  /// Button that finishes the passphrase-rotation flow
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get rotatePassphraseDone;

  /// Error shown when passphrase rotation fails
  ///
  /// In en, this message translates to:
  /// **'Could not generate a new passphrase. Please check your connection and try again.'**
  String get rotatePassphraseFailed;

  /// Generic button label to copy text to the clipboard
  ///
  /// In en, this message translates to:
  /// **'Copy to clipboard'**
  String get copyToClipboard;

  /// Snackbar shown after copying the passphrase
  ///
  /// In en, this message translates to:
  /// **'Passphrase copied to clipboard'**
  String get passphraseCopied;

  /// Generic tooltip/label for a close icon button
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// Footer on the Account screen showing the installed app version and build number
  ///
  /// In en, this message translates to:
  /// **'Version {version} ({buildNumber})'**
  String appVersion(String version, String buildNumber);

  /// No description provided for @habitTypeBuild.
  ///
  /// In en, this message translates to:
  /// **'Build a new habit'**
  String get habitTypeBuild;

  /// No description provided for @habitTypeQuit.
  ///
  /// In en, this message translates to:
  /// **'Break a habit'**
  String get habitTypeQuit;

  /// No description provided for @habitTypeFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get habitTypeFilterAll;

  /// No description provided for @habitImpactFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get habitImpactFilterAll;

  /// No description provided for @habitImpactFilterHigh.
  ///
  /// In en, this message translates to:
  /// **'High impact'**
  String get habitImpactFilterHigh;

  /// No description provided for @habitImpactFilterLow.
  ///
  /// In en, this message translates to:
  /// **'Low impact'**
  String get habitImpactFilterLow;

  /// No description provided for @exploreFiltersTooltip.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get exploreFiltersTooltip;

  /// No description provided for @exploreFiltersTitle.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get exploreFiltersTitle;

  /// No description provided for @exploreFilterHabitTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Habit Type'**
  String get exploreFilterHabitTypeLabel;

  /// No description provided for @exploreFilterHealthBenefitLabel.
  ///
  /// In en, this message translates to:
  /// **'Health Benefit'**
  String get exploreFilterHealthBenefitLabel;

  /// No description provided for @exploreFilterWellbeingLabel.
  ///
  /// In en, this message translates to:
  /// **'Wellbeing'**
  String get exploreFilterWellbeingLabel;

  /// No description provided for @habitHealthBenefitFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get habitHealthBenefitFilterAll;

  /// No description provided for @habitHealthBenefitFilterHigh.
  ///
  /// In en, this message translates to:
  /// **'High benefit'**
  String get habitHealthBenefitFilterHigh;

  /// No description provided for @habitHealthBenefitFilterLow.
  ///
  /// In en, this message translates to:
  /// **'Low benefit'**
  String get habitHealthBenefitFilterLow;

  /// No description provided for @habitWellbeingFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get habitWellbeingFilterAll;

  /// No description provided for @habitWellbeingFilterHigh.
  ///
  /// In en, this message translates to:
  /// **'High wellbeing'**
  String get habitWellbeingFilterHigh;

  /// No description provided for @habitWellbeingFilterLow.
  ///
  /// In en, this message translates to:
  /// **'Low wellbeing'**
  String get habitWellbeingFilterLow;

  /// No description provided for @exploreFiltersClearAll.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get exploreFiltersClearAll;

  /// No description provided for @exploreFiltersDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get exploreFiltersDone;

  /// Title of the dismissible explainer card shown when the §7.3 information-overload guard is active for this study
  ///
  /// In en, this message translates to:
  /// **'One habit at a time'**
  String get informationOverloadTitle;

  /// Body of the dismissible explainer card shown when the §7.3 information-overload guard is active for this study
  ///
  /// In en, this message translates to:
  /// **'To help habits stick, we ask you to focus on your current ones before adding new ones of the same type. New slots open up automatically as your habits become more automatic. Habit stacking isn\'t affected by this limit. You can turn this off in Settings, but we don\'t recommend it.'**
  String get informationOverloadInfo;

  /// No description provided for @informationOverloadBlocked.
  ///
  /// In en, this message translates to:
  /// **'Let\'s focus on your current habit first — a new slot opens once it becomes more automatic.'**
  String get informationOverloadBlocked;

  /// Shown alongside informationOverloadBlocked, only when the participant's study condition permits opting out of the §7.3 guard; links to the Settings toggle.
  ///
  /// In en, this message translates to:
  /// **'You can turn this off in Settings.'**
  String get informationOverloadBlockedOptOutHint;

  /// Button label navigating to the Settings screen's information-overload opt-out toggle, shown next to informationOverloadBlockedOptOutHint.
  ///
  /// In en, this message translates to:
  /// **'Go to Settings'**
  String get informationOverloadBlockedOptOutAction;

  /// No description provided for @stackOntoExistingHabitTitle.
  ///
  /// In en, this message translates to:
  /// **'Stack onto an existing habit'**
  String get stackOntoExistingHabitTitle;

  /// No description provided for @stackOntoExistingHabitSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Anchor this new habit to one you already do'**
  String get stackOntoExistingHabitSubtitle;

  /// No description provided for @stackAnchorPickLabel.
  ///
  /// In en, this message translates to:
  /// **'Anchor habit'**
  String get stackAnchorPickLabel;

  /// No description provided for @stackAnchorNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get stackAnchorNone;

  /// No description provided for @stackAnchorFreeTextLabel.
  ///
  /// In en, this message translates to:
  /// **'Or type an anchor habit'**
  String get stackAnchorFreeTextLabel;

  /// No description provided for @stackAnchorFreeTextHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. After my morning coffee'**
  String get stackAnchorFreeTextHint;

  /// Opt-in checkbox offering to also create a tracked habit for a free-typed stacking anchor
  ///
  /// In en, this message translates to:
  /// **'Also track \"{anchor}\" as a habit I\'m building'**
  String stackAlsoTrackAnchor(String anchor);

  /// Shown on the confirm/detail screens for a habit stacked onto an anchor
  ///
  /// In en, this message translates to:
  /// **'Stacked onto: {anchor}'**
  String stackedOntoLabel(String anchor);

  /// No description provided for @habitsSection.
  ///
  /// In en, this message translates to:
  /// **'Habits'**
  String get habitsSection;

  /// No description provided for @informationOverloadOptOutTitle.
  ///
  /// In en, this message translates to:
  /// **'Allow multiple new habits'**
  String get informationOverloadOptOutTitle;

  /// No description provided for @informationOverloadOptOutSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Turn off the one-habit-at-a-time focus guard'**
  String get informationOverloadOptOutSubtitle;

  /// No description provided for @progressSection.
  ///
  /// In en, this message translates to:
  /// **'Progress'**
  String get progressSection;

  /// Title of the badges/achievements screen, opened by tapping the Progress card in settings
  ///
  /// In en, this message translates to:
  /// **'Achievements'**
  String get achievementsTitle;

  /// Subtitle explaining the achievements screen shows both earned and locked badges
  ///
  /// In en, this message translates to:
  /// **'Badges you\'ve earned, and badges still to unlock.'**
  String get achievementsSubtitle;

  /// Small tag shown on a not-yet-earned badge tile
  ///
  /// In en, this message translates to:
  /// **'Locked'**
  String get achievementsLockedTag;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['de', 'en', 'fr', 'ja', 'nl'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
    case 'ja':
      return AppLocalizationsJa();
    case 'nl':
      return AppLocalizationsNl();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
