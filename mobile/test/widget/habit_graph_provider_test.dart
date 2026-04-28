import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/models/habit_graph.dart';
import 'package:hhh/providers/habit_graph_provider.dart';
import 'package:hhh/services/habit_service.dart';

const _base = 'http://localhost:3000/api/v1';

void main() {
  group('HabitService.fetchHabitGraph', () {
    late Dio dio;
    late DioAdapter adapter;
    late HabitService service;

    setUp(() {
      dio = Dio();
      adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
      service = HabitService(dio: dio);
    });

    test('sends GET /habits/graph and parses HabitGraph', () async {
      adapter.onGet(
        '$_base/habits/graph',
        (server) => server.reply(200, {
          'nodes': [
            {
              'id': 'h:uuid-1',
              'type': 'habit',
              'label': 'Drink water',
              'habitId': 'uuid-1',
              'originalText': 'Drink water',
              'language': 'en',
              'annotationCounts': {'helpful': 0, 'iDoThis': 0},
            },
            {
              'id': 'c:bcio_001',
              'type': 'concept',
              'label': 'Self-monitoring',
              'habitId': null,
              'originalText': '',
              'language': '',
              'annotationCounts': {'helpful': 0, 'iDoThis': 0},
            },
          ],
          'edges': [
            {'source': 'h:uuid-1', 'target': 'c:bcio_001'},
          ],
        }),
      );

      final graph = await service.fetchHabitGraph();

      expect(graph.nodes.length, 2);
      expect(graph.edges.length, 1);
      expect(graph.habitNodes.first.label, 'Drink water');
      expect(graph.conceptNodes.first.label, 'Self-monitoring');
    });
  });
}
