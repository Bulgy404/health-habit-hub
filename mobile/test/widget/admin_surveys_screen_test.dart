// Widget tests for AdminSurveysScreen.
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/models/admin_survey.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/admin/admin_surveys_screen.dart';
import 'package:hhh/services/admin_service.dart';
import 'package:hhh/services/auth_service.dart';

final _fakeDio = Dio();

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

class _FakeAdminService extends AdminService {
  final bool shouldThrow;
  final List<AdminSurvey> surveys;
  final Completer<List<AdminSurvey>>? _completer;

  _FakeAdminService.loading()
      : shouldThrow = false,
        surveys = const [],
        _completer = Completer<List<AdminSurvey>>(),
        super(dio: _fakeDio, authService: _FakeAuthService());

  _FakeAdminService.throwing()
      : shouldThrow = true,
        surveys = const [],
        _completer = null,
        super(dio: _fakeDio, authService: _FakeAuthService());

  _FakeAdminService.empty()
      : shouldThrow = false,
        surveys = const [],
        _completer = null,
        super(dio: _fakeDio, authService: _FakeAuthService());

  _FakeAdminService.withData(this.surveys)
      : shouldThrow = false,
        _completer = null,
        super(dio: _fakeDio, authService: _FakeAuthService());

  @override
  Future<List<AdminSurvey>> fetchSurveys() {
    if (_completer != null) return _completer.future;
    if (shouldThrow) return Future.error(Exception('Network error'));
    return Future.value(surveys);
  }
}

// Wrap in GoRouter so context.push works when row is tapped.
Widget _buildSubject(AdminService service) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/admin/surveys',
        builder: (_, _) => const AdminSurveysScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (context, state) {
              final surveyId = state.pathParameters['id']!;
              return AdminSurveyEditorScreen(
                surveyId: surveyId,
                initialSurvey: state.extra as AdminSurvey?,
              );
            },
          ),
        ],
      ),
    ],
    initialLocation: '/admin/surveys',
  );
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      adminServiceProvider.overrideWithValue(service),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows Surveys AppBar title', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.loading()));
    await tester.pump();

    expect(find.text('Surveys'), findsOneWidget);
  });

  testWidgets('shows loading indicator while fetching', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.loading()));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.throwing()));
    await tester.pumpAndSettle();

    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when no surveys', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.empty()));
    await tester.pumpAndSettle();

    expect(find.text('No surveys found'), findsOneWidget);
  });

  testWidgets('shows survey tile when data available', (tester) async {
    const survey = AdminSurvey(
      id: 's1',
      title: 'Baseline Survey',
      type: 'habit-donation',
      status: 'published',
      targetMode: 'all_participants',
      assignedGroups: ['G1'],
      jsonSchema: {},
    );
    await tester
        .pumpWidget(_buildSubject(_FakeAdminService.withData([survey])));
    await tester.pumpAndSettle();

    expect(find.text('Baseline Survey'), findsOneWidget);
  });
}
