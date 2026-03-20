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

  /// Label for the donate habit screen/action
  ///
  /// In en, this message translates to:
  /// **'Donate a Habit'**
  String get donateHabit;

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

  /// Snackbar message when habit donation succeeds
  ///
  /// In en, this message translates to:
  /// **'Habit donated successfully!'**
  String get habitDonatedSuccess;

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
