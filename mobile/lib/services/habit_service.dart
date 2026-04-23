import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/exceptions.dart';
import '../models/habit_node.dart';
import '../models/habit_stats.dart';
import '../core/dio_provider.dart';
import '../config/app_config.dart';

/// Service for fetching public habit data and submitting anonymous annotations.
class HabitService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  HabitService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Returns all anonymized habit nodes from the public graph.
  Future<List<HabitNode>> fetchPublicHabits() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/habits/public',
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(HabitNode.fromJson)
        .toList();
  }

  /// Returns aggregated habit statistics (total, byCategory, byDay).
  Future<HabitStats> fetchStats() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/habits/stats',
    );
    return HabitStats.fromJson(response.data ?? {});
  }

  /// Returns donated habits from the authenticated graph, with display text
  /// resolved in [lang] (e.g. 'en' or 'de').
  Future<List<HabitNode>> fetchDonatedHabits(String lang) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '$_baseUrl/habits',
        queryParameters: {'lang': lang},
      );
      return (response.data ?? [])
          .cast<Map<String, dynamic>>()
          .map((json) => HabitNode.fromDonatedJson(json, lang))
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
  }

  /// Submits an anonymous annotation of [type] ('helpful' or 'iDoThis') for
  /// habit [id]. Returns the updated annotation counts.
  Future<Map<String, int>> annotateHabit(String id, String type) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/habits/$id/annotate',
      data: {'type': type},
    );
    return ((response.data?['annotationCounts'] as Map<String, dynamic>?) ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
  }
}

/// Provides the singleton [HabitService] instance.
final habitServiceProvider = Provider<HabitService>((ref) {
  return HabitService(dio: ref.watch(dioProvider));
});

final habitStatsProvider = FutureProvider<HabitStats>((ref) {
  return ref.read(habitServiceProvider).fetchStats();
});
