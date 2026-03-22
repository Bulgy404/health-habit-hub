// Unit tests for QuestionnaireService.fetchParticipantQuestionnaires.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/features/questionnaire/questionnaire_service.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

void main() {
  late Dio dio;
  late DioAdapter adapter;
  late QuestionnaireService service;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
    service = QuestionnaireService(dio: dio);
  });

  group('fetchParticipantQuestionnaires', () {
    test('parses non-empty list from study-scoped endpoint', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(200, [
          {'slug': 'sliq', 'title': 'SLIQ — Lifestyle Index'},
          {'slug': 'rand-36', 'title': 'RAND-36 — Health Survey'},
        ]),
      );

      final result = await service.fetchParticipantQuestionnaires();

      expect(result.length, 2);
      expect(result[0].slug, 'sliq');
      expect(result[0].title, 'SLIQ — Lifestyle Index');
      expect(result[1].slug, 'rand-36');
    });

    test('returns empty list when study has no questionnaires', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(200, <dynamic>[]),
      );

      final result = await service.fetchParticipantQuestionnaires();

      expect(result, isEmpty);
    });

    test('propagates DioException on server error', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(500, <String, dynamic>{}),
      );

      expect(
        () => service.fetchParticipantQuestionnaires(),
        throwsA(isA<DioException>()),
      );
    });
  });
}
