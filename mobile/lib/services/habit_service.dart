import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/exceptions.dart';
import '../models/bubble_graph.dart';
import '../models/habit_node.dart';
import '../models/habit_stats.dart'; // HabitStats, MyStats, etc.
import '../core/dio_provider.dart';
import '../config/app_config.dart';

/// Service for fetching public habit data and submitting anonymous annotations.
class HabitService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  /// Creates a [HabitService] using [dio].
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

  /// Returns the authenticated user's donated habits + dimension breakdown.
  Future<MyStats> fetchMyStats() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/habits/my-stats',
      );
      return MyStats.fromJson(response.data ?? {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
  }

  /// Returns aggregated habit statistics (total, byCategory, byDay).
  Future<HabitStats> fetchStats() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/habits/stats',
    );
    return HabitStats.fromJson(response.data ?? {});
  }

  /// Returns the bubble-graph: dimensions → habits, for the drill-down view.
  Future<BubbleGraph> fetchBubbleGraph() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/habits/bubble-graph',
      );
      return BubbleGraph.fromJson(response.data ?? {'dimensions': []});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
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

  /// Submits or removes an anonymous annotation of [type] ('helpful' or
  /// 'iDoThis') for habit [id]. Pass [remove] to undo a previous annotation.
  /// Returns the updated annotation counts.
  Future<Map<String, int>> annotateHabit(
    String id,
    String type, {
    bool remove = false,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/habits/$id/annotate',
      data: {'type': type, if (remove) 'remove': true},
    );
    return ((response.data?['annotationCounts'] as Map<String, dynamic>?) ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
  }
}

/// Provides the singleton [HabitService] instance.
final habitServiceProvider = Provider<HabitService>((ref) {
  return HabitService(dio: ref.watch(dioProvider));
});

/// Fetches aggregated habit statistics (community totals).
/// Cached per Riverpod lifecycle; re-evaluated when habitServiceProvider rebuilds.
final habitStatsProvider = FutureProvider<HabitStats>((ref) {
  return ref.watch(habitServiceProvider).fetchStats();
});
