// mobile/lib/features/my_habits/my_habits_service.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../core/exceptions.dart';
import 'my_habits_models.dart';

class MyHabitsService {
  MyHabitsService({required Dio dio}) : _dio = dio;

  final Dio _dio;
  static const _base = AppConfig.apiBaseUrl;

  Future<HabitConfig> fetchHabitConfig() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('$_base/me/habit-config');
      return HabitConfig.fromJson(res.data ?? {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<Intention>> listIntentions() async {
    try {
      final res = await _dio.get<List<dynamic>>('$_base/habits/intentions');
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(Intention.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<Intention> createIntention({
    required String behaviorKey,
    required String behaviorLabel,
    required int durationMinutes,
    required List<IntentionCue> cues,
    required String intentionStatement,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_base/habits/intentions',
        data: {
          'behaviorKey': behaviorKey,
          'behaviorLabel': behaviorLabel,
          'durationMinutes': durationMinutes,
          'cues': cues.map((c) => c.toJson()).toList(),
          'intentionStatement': intentionStatement,
        },
      );
      if (res.statusCode == 409) {
        throw const ValidationException('Habit limit reached');
      }
      return Intention.fromJson(res.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      if (e.response?.statusCode == 409) {
        throw const ValidationException('Habit limit reached');
      }
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<void> updateStatus(String intentionId, String status) async {
    try {
      await _dio.patch(
        '$_base/habits/intentions/$intentionId/status',
        data: {'status': status},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<void> logDay({
    required String intentionId,
    required String date,
    required bool enacted,
  }) async {
    try {
      await _dio.post(
        '$_base/habits/intentions/$intentionId/logs',
        data: {'date': date, 'enacted': enacted},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<DailyLog>> fetchLogs(
    String intentionId, {
    String? from,
    String? to,
  }) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        '$_base/habits/intentions/$intentionId/logs',
        queryParameters: {
          'from': ?from,
          'to': ?to,
        },
      );
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(DailyLog.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<SrhiWindow>> fetchDueSrhi() async {
    try {
      final res = await _dio.get<List<dynamic>>('$_base/srhi/due');
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(SrhiWindow.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<SrhiTrajectoryPoint> submitSrhi({
    required String intentionId,
    required int weekNumber,
    required Map<String, int> items,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_base/srhi/$intentionId/week/$weekNumber',
        data: {'items': items},
      );
      return SrhiTrajectoryPoint.fromJson(res.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<SrhiTrajectoryPoint>> fetchTrajectory(String intentionId) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        '$_base/srhi/$intentionId/trajectory',
      );
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(SrhiTrajectoryPoint.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }
}

final myHabitsServiceProvider = Provider<MyHabitsService>((ref) {
  return MyHabitsService(dio: ref.watch(dioProvider));
});
