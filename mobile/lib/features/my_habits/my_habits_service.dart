/// Service layer for the My Habits feature.
library;

// mobile/lib/features/my_habits/my_habits_service.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../core/exceptions.dart';
import 'my_habits_models.dart';

/// REST client for the habit intentions and SRHI API endpoints.
class MyHabitsService {
  /// Creates a [MyHabitsService] using the given Dio [dio] instance.
  MyHabitsService({required Dio dio}) : _dio = dio;

  final Dio _dio;
  static const _base = AppConfig.apiBaseUrl;

  /// Fetches the participant's resolved habit configuration from the backend.
  Future<HabitConfig> fetchHabitConfig() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('$_base/me/habit-config');
      return HabitConfig.fromJson(res.data ?? {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Returns all habit intentions for the current user.
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

  /// Creates a new habit intention and returns the persisted [Intention].
  ///
  /// Throws [ValidationException] when the participant has reached their
  /// maximum allowed intentions.
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

  /// Updates the lifecycle [status] of a habit intention.
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

  /// Logs whether the habit was [enacted] on [date] (`'YYYY-MM-DD'`).
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

  /// Returns daily logs for [intentionId], optionally filtered to [from]–[to].
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

  /// Returns all SRHI measurement windows that are currently due.
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

  /// Submits SRHI [items] for [intentionId] at [weekNumber].
  ///
  /// Returns the resulting [SrhiTrajectoryPoint] with the computed score.
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

  /// Returns the full SRHI score trajectory for [intentionId].
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

/// Provides the singleton [MyHabitsService] instance.
final myHabitsServiceProvider = Provider<MyHabitsService>((ref) {
  return MyHabitsService(dio: ref.watch(dioProvider));
});
