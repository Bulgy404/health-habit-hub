// Widget tests for ProfileSetupScreen.
//
// The screen has no secure-storage dependency, so no MethodChannel mock is
// needed (contrast with the sibling onboarding screens). It fetches dynamic
// field definitions from GET /profile-field-definitions and posts answers to
// POST /user-profile.
import 'package:dio/dio.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/onboarding/profile_setup_screen.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Wraps [ProfileSetupScreen] in the minimal widget tree needed for tests.
///
/// Provides [dio] (with an attached adapter) as the [dioProvider] override.
Widget _buildSubject(Dio dio) {
  final router = GoRouter(
    initialLocation: '/onboarding/profile-setup',
    routes: [
      GoRoute(
        path: '/onboarding/profile-setup',
        builder: (context, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: '/onboarding/study-code',
        builder: (context, state) => const Scaffold(body: Text('StudyCode')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      dioProvider.overrideWithValue(dio),
    ],
    child: MaterialApp.router(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      routerConfig: router,
    ),
  );
}

/// One field of each supported type: required text, optional number,
/// optional date, and optional select.
const _fieldDefinitions = [
  {
    'fieldId': 'nickname',
    'label': 'Nickname',
    'type': 'text',
    'options': <String>[],
    'required': true,
    'order': 0,
  },
  {
    'fieldId': 'age',
    'label': 'Age',
    'type': 'number',
    'options': <String>[],
    'required': false,
    'order': 1,
  },
  {
    'fieldId': 'birthday',
    'label': 'Birthday',
    'type': 'date',
    'options': <String>[],
    'required': false,
    'order': 2,
  },
  {
    'fieldId': 'gender',
    'label': 'Gender',
    'type': 'select',
    'options': [
      {'value': 'female', 'label': 'Female'},
      {'value': 'male', 'label': 'Male'},
      {'value': 'other', 'label': 'Other'},
    ],
    'required': false,
    'order': 3,
  },
];

/// Same shape as [_fieldDefinitions] but with no required field, for tests
/// that exercise the Skip button (which is hidden whenever a required field
/// exists — see the mandatory age-group eligibility question).
final _fieldDefinitionsNoRequired = [
  for (final def in _fieldDefinitions) {...def, 'required': false},
];

void _mockDefinitions(
  DioAdapter adapter, {
  int statusCode = 200,
  List<Map<String, Object>> definitions = _fieldDefinitions,
}) {
  adapter.onGet(
    '$_base/profile-field-definitions',
    (server) => server.reply(
      statusCode,
      statusCode == 200 ? definitions : <dynamic>[],
    ),
    queryParameters: {'lang': 'en'},
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late Dio dio;
  late DioAdapter adapter;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
  });

  testWidgets('shows a loading indicator while fetching field definitions',
      (tester) async {
    _mockDefinitions(adapter);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets('renders one input per field type: text, number, date, select',
      (tester) async {
    _mockDefinitions(adapter);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('Nickname'), findsOneWidget);
    expect(find.text('Age'), findsOneWidget);
    expect(find.text('Birthday'), findsOneWidget);
    expect(find.text('Gender'), findsOneWidget);

    // Text + number fields render as TextField.
    expect(find.byType(TextField), findsNWidgets(2));
    // Date + select fields render as tappable placeholders.
    expect(find.text('Select date'), findsOneWidget);
    expect(find.text('Select option'), findsOneWidget);
  });

  testWidgets(
      'Continue is disabled until the required text field is filled',
      (tester) async {
    _mockDefinitions(adapter);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    final continueButtonFinder = find.byType(FilledButton);
    expect(
      tester.widget<FilledButton>(continueButtonFinder).onPressed,
      isNull,
    );

    // Nickname is the first field (order 0) and the only required one.
    await tester.enterText(find.byType(TextField).first, 'Alex');
    await tester.pump();

    expect(
      tester.widget<FilledButton>(continueButtonFinder).onPressed,
      isNotNull,
    );

    // Clearing it back out disables Continue again.
    await tester.enterText(find.byType(TextField).first, '');
    await tester.pump();

    expect(
      tester.widget<FilledButton>(continueButtonFinder).onPressed,
      isNull,
    );
  });

  testWidgets(
      'tapping the date field opens a bottom-sheet picker; Done sets the '
      'displayed value', (tester) async {
    _mockDefinitions(adapter);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Select date'));
    await tester.pumpAndSettle();

    expect(find.byType(CupertinoDatePicker), findsOneWidget);

    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    // No wheel interaction happened, so the picker's initial default
    // (January 1, 1990) is what gets committed.
    expect(find.text('January 1, 1990'), findsOneWidget);
    expect(find.text('Select date'), findsNothing);
  });

  testWidgets(
      'tapping the select field opens a bottom-sheet picker; Done sets the '
      'displayed value', (tester) async {
    _mockDefinitions(adapter);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Select option'));
    await tester.tap(find.text('Select option'));
    await tester.pumpAndSettle();

    expect(find.byType(CupertinoPicker), findsOneWidget);

    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    // No wheel interaction happened, so the first option is committed.
    expect(find.text('Female'), findsOneWidget);
    expect(find.text('Select option'), findsNothing);
  });

  testWidgets(
      'Skip is hidden when a required field exists, so it cannot be used to '
      'bypass it', (tester) async {
    _mockDefinitions(adapter);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('Skip'), findsNothing);
  });

  testWidgets('Skip navigates to study-code when no field is required',
      (tester) async {
    _mockDefinitions(adapter, definitions: _fieldDefinitionsNoRequired);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(find.text('StudyCode'), findsOneWidget);
  });

  testWidgets('Continue posts the filled fields and navigates to study-code',
      (tester) async {
    _mockDefinitions(adapter);
    adapter.onPost(
      '$_base/user-profile',
      (server) => server.reply(200, <String, dynamic>{}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Alex');
    await tester.pump();

    await tester.ensureVisible(find.byType(FilledButton));
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(find.text('StudyCode'), findsOneWidget);
  });

  testWidgets(
      'when field definitions fail to load, the form has no fields and '
      'Continue is immediately enabled', (tester) async {
    _mockDefinitions(adapter, statusCode: 500);

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('Nickname'), findsNothing);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });
}
