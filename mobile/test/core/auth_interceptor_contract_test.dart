// Contract tests for Dio + AuthInterceptor.
//
// Verifies every interceptor behaviour and SurveyService request pattern so
// that a Dio or http_mock_adapter major-version bump is caught before it
// reaches production.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/auth_interceptor.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/survey_service.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

// ---------------------------------------------------------------------------
// Stub AuthService that returns a controlled token
// ---------------------------------------------------------------------------

class _StubAuthService extends AuthService {
  final String? _token;

  _StubAuthService({String? token}) : _token = token;

  @override
  Future<String?> getAccessToken() async => _token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Builds a [Dio] instance with [AuthInterceptor] attached and returns it
/// together with a [DioAdapter] for request interception.
(Dio, DioAdapter) _buildDio(AuthService authService) {
  final dio = Dio();
  dio.interceptors.add(AuthInterceptor(authService));
  final adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
  return (dio, adapter);
}

void main() {
  // ─── AuthInterceptor ───────────────────────────────────────────────────────

  group('AuthInterceptor', () {
    test(
      'injects Authorization: Bearer <token> header when getAccessToken() returns a token',
      () async {
        final authService = _StubAuthService(token: 'my-access-token');
        final (dio, adapter) = _buildDio(authService);

        String? capturedAuthHeader;
        adapter.onGet(
          '$_base/probe',
          (server) => server.replyCallback(200, (options) {
            capturedAuthHeader =
                options.headers['Authorization'] as String?;
            return {};
          }),
        );

        await dio.get<Map<String, dynamic>>('$_base/probe');

        expect(capturedAuthHeader, 'Bearer my-access-token');
      },
    );

    test(
      'omits Authorization header when getAccessToken() returns null',
      () async {
        final authService = _StubAuthService(token: null);
        final (dio, adapter) = _buildDio(authService);

        bool headerPresent = false;
        adapter.onGet(
          '$_base/probe',
          (server) => server.replyCallback(200, (options) {
            headerPresent = options.headers.containsKey('Authorization');
            return {};
          }),
        );

        await dio.get<Map<String, dynamic>>('$_base/probe');

        expect(headerPresent, isFalse);
      },
    );
  });

  // ─── SurveyService contract ────────────────────────────────────────────────

  group('SurveyService', () {
    late Dio dio;
    late DioAdapter adapter;
    late SurveyService service;

    setUp(() {
      dio = Dio();
      adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
      service = SurveyService(dio: dio);
    });

    test(
      'fetchSurvey() sends GET to correct path and deserialises Survey.fromJson',
      () async {
        const surveyJson = {
          'id': 'survey-42',
          'title': 'Health Check',
          'type': 'questionnaire',
          'jsonSchema': {'type': 'object'},
          'assignedGroups': ['group1'],
          'status': 'active',
        };

        adapter.onGet(
          '$_base/surveys/survey-42',
          (server) => server.reply(200, surveyJson),
        );

        final survey = await service.fetchSurvey('survey-42');

        expect(survey.id, 'survey-42');
        expect(survey.title, 'Health Check');
        expect(survey.type, 'questionnaire');
        expect(survey.status, 'active');
        expect(survey.assignedGroups, ['group1']);
      },
    );

    test(
      'submitResult() sends POST with {answers: ...} body',
      () async {
        const surveyId = 'survey-42';
        final answers = {'q1': 'yes', 'q2': 3};

        Map<String, dynamic>? capturedBody;
        adapter.onPost(
          '$_base/surveys/$surveyId/results',
          (server) => server.replyCallback(201, (options) {
            capturedBody = options.data as Map<String, dynamic>?;
            return {
              'surveyId': surveyId,
              'userId': 'user-1',
              'answers': answers,
              'completedAt': '2026-03-30T10:00:00.000Z',
            };
          }),
          data: {'answers': answers},
        );

        final result = await service.submitResult(surveyId, answers);

        expect(capturedBody, isNotNull);
        expect(capturedBody!['answers'], answers);
        expect(result.surveyId, surveyId);
        expect(result.userId, 'user-1');
      },
    );
  });
}
