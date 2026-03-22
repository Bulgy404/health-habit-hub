// Unit tests for RecommendationService — happy path and 500 error path.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/services/recommendation_service.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

void main() {
  late Dio dio;
  late DioAdapter adapter;
  late RecommendationService service;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
    service = RecommendationService(dio: dio);
  });

  group('fetchRecommendations', () {
    test('happy path: parses recommendation list', () async {
      adapter.onGet(
        '$_base/recommend/user-abc',
        (server) => server.reply(200, [
          {
            'id': 'rec-1',
            'habitName': 'Morning run',
            'category': 'Exercise',
            'confidenceScore': 0.87,
            'rationale': 'Improves cardiovascular health',
            'ragCitation': {
              'sourceTitle': 'Health Journal',
              'excerpt': 'Running improves health outcomes.',
            },
          },
        ]),
      );

      final recs = await service.fetchRecommendations('user-abc');

      expect(recs.length, 1);
      expect(recs.first.id, 'rec-1');
      expect(recs.first.habitName, 'Morning run');
      expect(recs.first.category, 'Exercise');
      expect(recs.first.confidenceScore, closeTo(0.87, 0.001));
      expect(recs.first.ragCitation, isNotNull);
      expect(recs.first.ragCitation!.sourceTitle, 'Health Journal');
    });

    test('happy path: handles empty list', () async {
      adapter.onGet(
        '$_base/recommend/user-empty',
        (server) => server.reply(200, []),
      );

      final recs = await service.fetchRecommendations('user-empty');

      expect(recs, isEmpty);
    });

    test('500 error path: propagates DioException', () async {
      adapter.onGet(
        '$_base/recommend/user-err',
        (server) => server.throws(
          500,
          DioException(
            requestOptions: RequestOptions(path: '$_base/recommend/user-err'),
            response: Response(
              statusCode: 500,
              requestOptions:
                  RequestOptions(path: '$_base/recommend/user-err'),
            ),
            type: DioExceptionType.badResponse,
          ),
        ),
      );

      await expectLater(
        service.fetchRecommendations('user-err'),
        throwsA(isA<DioException>()),
      );
    });
  });
}
