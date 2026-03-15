import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/habit_node.dart';
import '../providers/auth_provider.dart';
import 'auth_service.dart';

/// Service for fetching public habit data and submitting anonymous annotations.
class HabitService {
  static const _baseUrl = 'https://api.hhh.tu-dresden.de/api/v1';

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
