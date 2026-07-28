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
        queryParameters: {'lang': 'en'},
      );

      final result = await service.fetchParticipantQuestionnaires('en');

      expect(result.length, 2);
      expect(result[0].slug, 'sliq');
      expect(result[0].title, 'SLIQ — Lifestyle Index');
      expect(result[1].slug, 'rand-36');
    });

    test('sends the requested language in the query parameter', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(200, [
          {'slug': 'sliq', 'title': 'SLIQ — Lebensstil-Index'},
        ]),
        queryParameters: {'lang': 'de'},
      );

      final result = await service.fetchParticipantQuestionnaires('de');

      expect(result.single.title, 'SLIQ — Lebensstil-Index');
    });

    test('returns empty list when study has no questionnaires', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(200, <dynamic>[]),
        queryParameters: {'lang': 'en'},
      );

      final result = await service.fetchParticipantQuestionnaires('en');

      expect(result, isEmpty);
    });

    test('parses available/completedAt, defaulting to available when absent', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(200, [
          {
            'slug': 'sliq',
            'title': 'SLIQ',
            'available': false,
            'completedAt': '2026-07-01T09:00:00.000Z',
          },
          {'slug': 'rand-36', 'title': 'RAND-36'},
        ]),
        queryParameters: {'lang': 'en'},
      );

      final result = await service.fetchParticipantQuestionnaires('en');

      expect(result[0].available, false);
      expect(result[0].completedAt, DateTime.parse('2026-07-01T09:00:00.000Z'));
      expect(result[1].available, true);
      expect(result[1].completedAt, isNull);
    });

    test('propagates DioException on server error', () async {
      adapter.onGet(
        '$_base/participant/questionnaires',
        (server) => server.reply(500, <String, dynamic>{}),
        queryParameters: {'lang': 'en'},
      );

      expect(
        () => service.fetchParticipantQuestionnaires('en'),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('fetchDueQuestionnaires', () {
    test('excludes srhi items — they have no entry in the generic '
        'questionnaires collection that /questionnaire/:slug reads from, '
        'so surfacing them here would route to a 404', () async {
      adapter.onGet(
        '$_base/questionnaires/due',
        (server) => server.reply(200, {
          'questionnaires': [
            {
              'windowId': 'w1',
              'questionnaireSlug': 'sliq',
              'questionnaireTitle': 'SLIQ',
              'occurrence': 1,
              'scheduledFor': '2026-07-01T09:00:00.000Z',
              'isDue': true,
            },
            {
              'windowId': 'w2',
              'questionnaireSlug': 'srhi',
              'questionnaireTitle': 'Weekly check-in: Walking',
              'occurrence': 1,
              'scheduledFor': '2026-07-01T09:00:00.000Z',
              'isDue': true,
              'intentionId': 'intention-1',
            },
          ],
        }),
        queryParameters: {'lang': 'en'},
      );

      final result = await service.fetchDueQuestionnaires('en');

      expect(result.length, 1);
      expect(result.single.slug, 'sliq');
    });
  });
}
