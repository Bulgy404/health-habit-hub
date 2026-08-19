// Widget tests for QuestionnaireScreen / QuestionnaireFormWidget.
//
// Covers: loading/error(+retry)/data states for the definition fetch, all
// four question types, progress header, Back button visibility, required-
// question validation on Save & Continue and Submit, submit-in-flight
// spinner, submission failure banner, and the confirmation screen.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/dio_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/features/questionnaire/questionnaire_screen.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';
const _slug = 'sliq';

const _definitionJson = {
  'slug': _slug,
  'title': 'SLIQ',
  'description': 'Self-report questionnaire',
  'version': '1.0',
  'questions': [
    {
      'id': 'q1',
      'text': 'Pick one',
      'type': 'single_choice',
      'required': true,
      'options': [
        {'value': 'a', 'label': 'Option A'},
        {'value': 'b', 'label': 'Option B'},
      ],
    },
    {
      'id': 'q2',
      'text': 'Pick many',
      'type': 'multi_choice',
      'required': false,
      'options': [
        {'value': 'x', 'label': 'Option X'},
        {'value': 'y', 'label': 'Option Y'},
      ],
    },
    {
      'id': 'q3',
      'text': 'Rate it',
      'type': 'scale',
      'required': false,
      'options': <Map<String, String>>[],
      'min': 0,
      'max': 5,
    },
    {
      'id': 'q4',
      'text': 'Tell us more',
      'type': 'text',
      'required': true,
      'options': <Map<String, String>>[],
    },
  ],
};

Widget _buildSubject(Dio dio, {String? habitUuid}) {
  final router = GoRouter(
    initialLocation: habitUuid == null
        ? '/questionnaire/$_slug'
        : '/questionnaire/$_slug?habitUuid=$habitUuid',
    routes: [
      GoRoute(
        path: '/questionnaire/:slug',
        builder: (context, state) => QuestionnaireScreen(
          slug: state.pathParameters['slug'] ?? '',
          habitUuid: state.uri.queryParameters['habitUuid'],
        ),
        routes: [
          GoRoute(
            path: 'confirmation',
            builder: (context, state) => QuestionnaireConfirmationScreen(
              slug: state.pathParameters['slug'] ?? '',
              habitUuid: state.uri.queryParameters['habitUuid'],
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/settings/profile',
        builder: (context, state) => const Scaffold(body: Text('Profile')),
      ),
      GoRoute(
        path: '/share',
        builder: (context, state) => const Scaffold(body: Text('Share')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
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

void main() {
  late Dio dio;
  late DioAdapter adapter;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const UrlRequestMatcher());
  });

  testWidgets('shows a loading indicator while the definition is fetched',
      (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson, delay: const Duration(seconds: 1)),
      queryParameters: {'lang': 'en'},
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    // Drain the delayed response so no Timer is left pending at teardown.
    await tester.pumpAndSettle();
  });

  testWidgets('shows an error state with Retry on fetch failure', (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(500, {}),
      queryParameters: {'lang': 'en'},
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.text('Failed to load questionnaire.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Retry'), findsOneWidget);
  });

  testWidgets('renders all four question types across the flow', (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    // Q1: single choice.
    expect(find.text('Question 1 of 4'), findsOneWidget);
    expect(find.text('Pick one'), findsOneWidget);
    expect(find.text('Option A'), findsOneWidget);
    expect(find.text('Option B'), findsOneWidget);
    await tester.tap(find.text('Option A'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    // Q2: multi choice.
    expect(find.text('Question 2 of 4'), findsOneWidget);
    expect(find.text('Pick many'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNWidgets(2));
    expect(find.widgetWithText(OutlinedButton, 'Back'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    // Q3: scale.
    expect(find.text('Question 3 of 4'), findsOneWidget);
    expect(find.text('Rate it'), findsOneWidget);
    expect(find.byType(Slider), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    // Q4: free text, last question.
    expect(find.text('Question 4 of 4'), findsOneWidget);
    expect(find.text('Tell us more'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Submit'), findsOneWidget);
  });

  testWidgets('Back button is hidden on the first question and shown after',
      (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(OutlinedButton, 'Back'), findsNothing);

    await tester.tap(find.text('Option A'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(OutlinedButton, 'Back'), findsOneWidget);
  });

  testWidgets(
      'Save & Continue is blocked with an error when a required question is unanswered',
      (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    // Q1 is required; don't answer it.
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pump();

    expect(find.text('This question is required.'), findsOneWidget);
    expect(find.text('Question 1 of 4'), findsOneWidget);
  });

  testWidgets(
      'Submit is blocked with the required-question error when the last question is unanswered',
      (tester) async {
    // Forward navigation always re-validates the question being left (via
    // Save & Continue), so an earlier required question can never be
    // skipped in the first place — the only way to reach Submit with an
    // unmet required question is for it to be the current (last) one,
    // which surfaces the same "this question is required" message as
    // Save & Continue's own validation, not a separate "all required"
    // message (that loop in _onSubmit is a defensive check behind the
    // per-step gating, unreachable through the actual UI flow).
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Option A'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    // Now on Q4 (unanswered, required) — Submit should be blocked.
    await tester.tap(find.widgetWithText(FilledButton, 'Submit'));
    await tester.pump();

    expect(find.text('This question is required.'), findsOneWidget);
    expect(find.text('Question 4 of 4'), findsOneWidget);
  });

  testWidgets(
      'submitting shows a spinner, then navigates to the confirmation screen on success',
      (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );
    adapter.onPost(
      '$_base/questionnaire-responses',
      (server) => server.reply(200, {}, delay: const Duration(milliseconds: 500)),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Option A'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'My answer');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Submit'));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();

    expect(find.text('Response submitted!'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Back to Profile'), findsOneWidget);
  });

  testWidgets(
      'post-donation questionnaire (habitUuid set) offers "Share Another Habit" and returns to /share, not profile',
      (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );
    adapter.onPost(
      '$_base/questionnaire-responses',
      (server) => server.reply(200, {}),
    );

    await tester.pumpWidget(_buildSubject(dio, habitUuid: 'habit-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Option A'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'My answer');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Submit'));
    await tester.pumpAndSettle();

    expect(find.text('Response submitted!'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Back to Profile'), findsNothing);
    expect(
      find.widgetWithText(FilledButton, 'Share Another Habit'),
      findsOneWidget,
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Share Another Habit'));
    await tester.pumpAndSettle();

    expect(find.text('Share'), findsOneWidget);
  });

  testWidgets('submission failure shows a retryable error banner, keeps the form',
      (tester) async {
    adapter.onGet(
      '$_base/questionnaires/$_slug',
      (server) => server.reply(200, _definitionJson),
      queryParameters: {'lang': 'en'},
    );
    adapter.onPost(
      '$_base/questionnaire-responses',
      (server) => server.reply(500, {}),
    );

    await tester.pumpWidget(_buildSubject(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Option A'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save & Continue'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'My answer');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Submit'));
    await tester.pumpAndSettle();

    expect(find.text('Submission failed. Please try again.'), findsOneWidget);
    // Still on the questionnaire form, not the confirmation screen.
    expect(find.text('Question 4 of 4'), findsOneWidget);
  });
}
