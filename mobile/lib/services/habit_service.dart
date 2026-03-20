import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/habit_node.dart';
import '../models/habit_stats.dart';
import '../providers/auth_provider.dart';
import 'auth_service.dart';
import '../config/app_config.dart';

/// Service for fetching public habit data and submitting anonymous annotations.
class HabitService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  final Dio _dio;
  final AuthService _authService;

  HabitService({Dio? dio, required AuthService authService})
      : _dio = dio ?? Dio(),
        _authService = authService;

  Future<Map<String, String>> _authHeaders() async {
    final token = await _authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  /// Returns all anonymized habit nodes from the public graph.
  Future<List<HabitNode>> fetchPublicHabits() async {
    final headers = await _authHeaders();
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/habits/public',
      options: Options(headers: headers),
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(HabitNode.fromJson)
        .toList();
  }

  /// Returns aggregated habit statistics (total, byCategory, byDay).
  Future<HabitStats> fetchStats() async {
    final headers = await _authHeaders();
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/habits/stats',
      options: Options(headers: headers),
    );
    return HabitStats.fromJson(response.data ?? {});
  }

  /// Returns donated habits from the authenticated graph, with display text
  /// resolved in [lang] (e.g. 'en' or 'de').
  Future<List<HabitNode>> fetchDonatedHabits(String lang) async {
    final headers = await _authHeaders();
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/habits',
      queryParameters: {'lang': lang},
      options: Options(headers: headers),
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map((json) => HabitNode.fromDonatedJson(json, lang))
        .toList();
  }

  /// Submits an anonymous annotation of [type] ('helpful' or 'iDoThis') for
  /// habit [id]. Returns the updated annotation counts.
  Future<Map<String, int>> annotateHabit(String id, String type) async {
    final headers = await _authHeaders();
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/habits/$id/annotate',
      data: {'type': type},
      options: Options(headers: headers),
    );
    return ((response.data?['annotationCounts'] as Map<String, dynamic>?) ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
  }
}

/// Provides the singleton [HabitService] instance.
final habitServiceProvider = Provider<HabitService>((ref) {
  final authService = ref.watch(authServiceProvider);
  return HabitService(authService: authService);
});
