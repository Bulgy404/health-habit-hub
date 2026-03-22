// Unit tests for HabitService.fetchStats — verifies stats response parsing.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/services/habit_service.dart';

// AppConfig.apiBaseUrl defaults to 'http://localhost:3000/api/v1' in tests.
const _base = 'http://localhost:3000/api/v1';

void main() {
  late Dio dio;
  late DioAdapter adapter;
  late HabitService service;

  setUp(() {
    dio = Dio();
    adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
    service = HabitService(dio: dio);
  });

  group('fetchStats', () {
    test('parses total, byCategory, and byDay from response', () async {
      adapter.onGet(
        '$_base/habits/stats',
        (server) => server.reply(200, {
          'total': 57,
          'byCategory': [
            {'category': 'Exercise', 'count': 30},
            {'category': 'Nutrition', 'count': 27},
          ],
          'byDay': [
            {'date': '2026-03-20', 'count': 10},
            {'date': '2026-03-21', 'count': 5},
          ],
        }),
      );

      final stats = await service.fetchStats();

      expect(stats.total, 57);
      expect(stats.byCategory.length, 2);
      expect(stats.byCategory.first.category, 'Exercise');
      expect(stats.byCategory.first.count, 30);
      expect(stats.byDay.length, 2);
      expect(stats.byDay.first.date, '2026-03-20');
      expect(stats.byDay.first.count, 10);
    });

    test('handles empty response gracefully (defaults to 0 / empty lists)',
        () async {
      adapter.onGet(
        '$_base/habits/stats',
        (server) => server.reply(200, {}),
      );

      final stats = await service.fetchStats();

      expect(stats.total, 0);
      expect(stats.byCategory, isEmpty);
      expect(stats.byDay, isEmpty);
    });
  });
}
