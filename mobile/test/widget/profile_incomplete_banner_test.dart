// Widget tests for ProfileScreen's handling of unfilled (optional) profile
// fields: the account summary — study membership, health questionnaires,
// etc. — must stay visible with a "complete your profile" nudge, rather than
// forcing the edit form in front of everything else until every field is
// filled in.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/profile_screen.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

Widget _buildSubject(Dio dio) {
  return ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: const ProfileScreen(),
    ),
  );
}

void main() {
  late Dio dio;
  late DioAdapter adapter;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
    adapter.onGet(
      '$_base/profile-field-definitions',
      (server) => server.reply(200, [
        {
          'fieldId': 'gender',
          'label': 'Gender',
          'type': 'select',
          'options': ['Male', 'Female', 'Other'],
          'required': false,
          'order': 1,
        },
        {
          'fieldId': 'age',
          'label': 'Age',
          'type': 'number',
          'options': <String>[],
          'required': false,
          'order': 2,
        },
      ]),
    );
    // No profile saved yet — both optional fields are unfilled.
    adapter.onGet(
      '$_base/user-profile',
      (server) => server.reply(404, {'error': 'not found'}),
    );
    adapter.onGet(
      '$_base/participant/questionnaires',
      (server) => server.reply(200, <dynamic>[]),
    );
    adapter.onGet(
      '$_base/onboarding/enrollment',
      (server) => server.reply(200, {
        'studyId': 's1',
        'groupId': 'g1',
        'studyName': 'Default Study',
        'groupLabel': 'Group 1',
        'isDefaultStudy': true,
        'studyCodeUsed': null,
      }),
    );
  });

  testWidgets(
    'shows the account summary (not the edit form) even when optional profile fields are unfilled',
    (tester) async {
      await tester.pumpWidget(_buildSubject(dio));
      await tester.pumpAndSettle();

      // The rest of the account page is visible without filling anything in.
      expect(find.text('Current study'), findsOneWidget);
      expect(find.text('Join a different study'), findsOneWidget);
      // The edit form's per-field inputs are not shown up front.
      expect(find.text('Select option'), findsNothing);
    },
  );

  testWidgets(
    'shows an incomplete-profile banner naming the unfilled fields',
    (tester) async {
      await tester.pumpWidget(_buildSubject(dio));
      await tester.pumpAndSettle();

      expect(find.textContaining('Gender, Age'), findsOneWidget);
      expect(find.text('Complete now'), findsOneWidget);
    },
  );

  testWidgets(
    'tapping "Complete now" opens the edit form, and Cancel returns to the summary',
    (tester) async {
      await tester.pumpWidget(_buildSubject(dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Complete now'));
      await tester.pumpAndSettle();

      expect(find.text('Select option'), findsOneWidget); // Gender field input
      expect(find.text('Cancel'), findsOneWidget);

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(find.text('Current study'), findsOneWidget);
    },
  );
}
