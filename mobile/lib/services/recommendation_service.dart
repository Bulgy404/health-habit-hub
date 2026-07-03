import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/recommendation.dart';
import '../core/dio_provider.dart';
import '../config/app_config.dart';

/// Service for fetching and acting on habit recommendations.
class RecommendationService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  /// Creates a [RecommendationService] using [dio].
  RecommendationService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Fetches all recommendations for [userId].
  ///
  /// Recommendation generation runs an LLM + retrieval pipeline server-side and
  /// can take well over a minute, so this call overrides the shared Dio
  /// receiveTimeout with a much longer one to avoid aborting a valid response.
  Future<List<Recommendation>> fetchRecommendations(String userId) async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/recommend/$userId',
      options: Options(receiveTimeout: const Duration(minutes: 4)),
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(Recommendation.fromJson)
        .toList();
  }

  /// Marks recommendation [id] as accepted.
  Future<void> acceptRecommendation(String id) async {
    await _dio.post<void>(
      '$_baseUrl/recommend/accept/$id',
    );
  }

  /// Marks recommendation [id] as dismissed.
  Future<void> dismissRecommendation(String id) async {
    await _dio.post<void>(
      '$_baseUrl/recommend/dismiss/$id',
    );
  }
}

/// Provides the singleton [RecommendationService] instance.
final recommendationServiceProvider = Provider<RecommendationService>((ref) {
  return RecommendationService(dio: ref.watch(dioProvider));
});
