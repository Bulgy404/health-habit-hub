import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';

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
  /// **'Submission failed — please try again.'**
  String get submissionFailed;

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
  /// **'Helpful: {count}'**
  String helpfulCount(String count);

  /// Button label for the iDoThis annotation action
  ///
  /// In en, this message translates to:
  /// **'I do this too'**
  String get iDoThisToo;

  /// Button label for the helpful annotation action
  ///
  /// In en, this message translates to:
  /// **'Helpful'**
  String get helpful;

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
  /// **'SLIQ — Lifestyle Index'**
  String get sliqLifestyleIndex;

  /// Button label for the RAND-36 questionnaire
  ///
  /// In en, this message translates to:
  /// **'RAND-36 — Health Survey'**
  String get rand36HealthSurvey;

  /// Button label to restore account on current device
  ///
  /// In en, this message translates to:
  /// **'Restore account on this device'**
  String get restoreAccountOnDevice;

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
  /// **'Invalid JSON — please fix before saving'**
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

  /// AppBar title for confirmation screens
  ///
  /// In en, this message translates to:
  /// **'Thank You'**
  String get thankYou;

  /// Empty state message shown on the profile screen when the participant's study has no questionnaires
  ///
  /// In en, this message translates to:
  /// **'No questionnaires assigned to your study.'**
  String get noQuestionnairesAssigned;

  /// Bottom nav tab label for My Habits
  ///
  /// In en, this message translates to:
  /// **'My Habits'**
  String get myHabitsTab;

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
  /// **'Your study condition assigns the following cue(s). Read them carefully — this is when you will act.'**
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
  /// **'My {behavior} is something…'**
  String srhiStem(String behavior);

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
      <String>['de', 'en'].contains(locale.languageCode);

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
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
