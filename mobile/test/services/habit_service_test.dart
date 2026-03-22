// Unit tests for HabitService — verifies query-param forwarding and 401 handling.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/core/exceptions.dart';
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

  group('fetchDonatedHabits', () {
    test('sends ?lang= query parameter and returns parsed list', () async {
      adapter.onGet(
        '$_base/habits',
        (server) => server.reply(200, [
          {
            'uuid': 'abc-123',
            'original': 'Walk 30 minutes',
            'language': 'en',
            'displayText': 'Walk 30 minutes',
          }
        ]),
        queryParameters: {'lang': 'en'},
      );

      final habits = await service.fetchDonatedHabits('en');

      expect(habits.length, 1);
      expect(habits.first.id, 'abc-123');
      expect(habits.first.name, 'Walk 30 minutes');
      expect(habits.first.language, 'en');
    });

    test('forwards lang=de in query parameter', () async {
      adapter.onGet(
        '$_base/habits',
        (server) => server.reply(200, [
          {
            'uuid': 'def-456',
            'original': 'Spazieren gehen',
            'language': 'de',
          }
        ]),
        queryParameters: {'lang': 'de'},
      );

      final habits = await service.fetchDonatedHabits('de');

      expect(habits.length, 1);
      expect(habits.first.id, 'def-456');
    });

    test('throws UnauthorisedException on 401 response', () async {
      adapter.onGet(
        '$_base/habits',
        (server) => server.throws(
          401,
          DioException(
            requestOptions: RequestOptions(path: '$_base/habits'),
            response: Response(
              statusCode: 401,
              requestOptions: RequestOptions(path: '$_base/habits'),
            ),
            type: DioExceptionType.badResponse,
          ),
        ),
        queryParameters: {'lang': 'en'},
      );

      await expectLater(
        service.fetchDonatedHabits('en'),
        throwsA(isA<UnauthorisedException>()),
      );
    });
  });
}
