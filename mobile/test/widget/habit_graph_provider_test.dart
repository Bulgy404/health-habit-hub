import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/services/habit_service.dart';

const _base = 'http://localhost:3000/api/v1';

void main() {
  group('HabitService.fetchBubbleGraph', () {
    late Dio dio;
    late DioAdapter adapter;
    late HabitService service;

    setUp(() {
      dio = Dio();
      adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
      service = HabitService(dio: dio);
    });

    test('sends GET /habits/bubble-graph and parses BubbleGraph', () async {
      adapter.onGet(
        '$_base/habits/bubble-graph',
        (server) => server.reply(200, {
          'dimensions': [
            {
              'id': 'TIME',
              'label': 'Time',
              'habitCount': 1,
              'habits': [
                {
                  'id': 'uuid-1',
                  'label': 'Drink water',
                  'originalText': 'Drink water',
                  'language': 'en',
                  'annotationCounts': {'helpful': 0, 'iDoThis': 0},
                },
              ],
            },
          ],
        }),
      );

      final graph = await service.fetchBubbleGraph();

      expect(graph.dimensions.length, 1);
      expect(graph.dimensions.first.id, 'TIME');
      expect(graph.dimensions.first.habits.length, 1);
      expect(graph.dimensions.first.habits.first.label, 'Drink water');
    });
  });
}
