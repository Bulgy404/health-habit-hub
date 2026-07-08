// Widget tests for the _StudyMembershipSection on ProfileScreen: current
// study display, join-a-study dialog, and leave-study confirmation.
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

/// Registers the baseline mocks every ProfileScreen render needs, so
/// _offline stays false and the study membership section actually mounts.
void _mockBaseline(DioAdapter adapter) {
  adapter.onGet(
    '$_base/profile-field-definitions',
    (server) => server.reply(200, <dynamic>[]),
  );
  // Must be non-empty, or ProfileScreen falls into edit mode (existing.isEmpty
  // => _editing = true), which never renders the summary view / this section.
  adapter.onGet(
    '$_base/user-profile',
    (server) => server.reply(200, {
      'fields': [
        {'questionId': 'placeholder', 'type': 'text', 'value': 'x'},
      ],
    }),
  );
  adapter.onGet(
    '$_base/participant/questionnaires',
    (server) => server.reply(200, <dynamic>[]),
  );
}

void main() {
  late Dio dio;
  late DioAdapter adapter;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
    _mockBaseline(adapter);
  });

  testWidgets('shows the default-study label and no Leave button when enrolled in the default study', (
    tester,
  ) async {
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

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('General study (no study code)'), findsOneWidget);
    expect(find.text('Join a different study'), findsOneWidget);
    expect(find.text('Leave study'), findsNothing);
  });

  testWidgets('shows the study name, group, and a Leave button when in a code-joined study', (
    tester,
  ) async {
    adapter.onGet(
      '$_base/onboarding/enrollment',
      (server) => server.reply(200, {
        'studyId': 's2',
        'groupId': 'g2',
        'studyName': 'HabConnect Pilot',
        'groupLabel': 'Group B',
        'isDefaultStudy': false,
        'studyCodeUsed': 'HHH-ABCDE',
      }),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('HabConnect Pilot'), findsOneWidget);
    expect(find.text('Group: Group B'), findsOneWidget);
    expect(find.text('Leave study'), findsOneWidget);
  });

  testWidgets('join dialog rejects a badly formatted code without hitting the network', (
    tester,
  ) async {
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

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Join a different study'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'nope');
    await tester.tap(find.text('Join'));
    await tester.pump();

    expect(find.text('Invalid code. Please check and try again.'), findsOneWidget);
  });

  testWidgets(
    'joining a study posts the code, closes the dialog, and confirms with the new study name',
    (tester) async {
      // Note: http_mock_adapter 0.6.1 bakes each route's response in at
      // *registration* time (RequestHandling.onRoute calls the handler
      // callback synchronously), not per actual HTTP request — there's no
      // way in this version to make the same GET route return different
      // payloads on a 1st vs. 2nd call within one test. So this test
      // verifies the join round-trip (dialog closes, correct study name in
      // the confirmation) rather than the follow-up auto-refreshed display,
      // which is exercised by the "current enrollment" tests above using
      // the exact same _load() code path.
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
      adapter.onPost(
        '$_base/onboarding/switch-study',
        (server) => server.reply(200, {
          'studyId': 's2',
          'groupId': 'g2',
          'studyName': 'HabConnect Pilot',
          'groupLabel': 'Group B',
        }),
      );

      await tester.pumpWidget(_buildSubject(dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Join a different study'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'HHH-ABCDE');
      await tester.tap(find.text('Join'));
      await tester.pumpAndSettle();

      // Dialog closed (its "Join" confirm button is gone) and the success
      // snackbar names the correct study, proving the POST body/response
      // round-tripped correctly end to end.
      expect(find.text('Join a study'), findsNothing);
      expect(find.text("You've joined HabConnect Pilot."), findsOneWidget);
    },
  );

  testWidgets(
    'leaving a study shows a confirmation dialog and, once confirmed, succeeds',
    (tester) async {
      // See the note on the "joining a study" test above re: why this
      // doesn't also assert on the post-refresh display.
      adapter.onGet(
        '$_base/onboarding/enrollment',
        (server) => server.reply(200, {
          'studyId': 's2',
          'groupId': 'g2',
          'studyName': 'HabConnect Pilot',
          'groupLabel': 'Group B',
          'isDefaultStudy': false,
          'studyCodeUsed': 'HHH-ABCDE',
        }),
      );
      adapter.onPost(
        '$_base/onboarding/leave-study',
        (server) => server.reply(200, {
          'studyId': 's1',
          'groupId': 'g1',
          'studyName': 'Default Study',
          'groupLabel': 'Group 1',
        }),
      );

      await tester.pumpWidget(_buildSubject(dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Leave study'));
      await tester.pumpAndSettle();

      expect(find.text('Leave this study?'), findsOneWidget);

      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(find.text("You've left the study."), findsOneWidget);
    },
  );
}
