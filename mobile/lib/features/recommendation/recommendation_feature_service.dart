/// Service and provider for the recommendation feature.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import 'recommendation_models.dart';

/// REST client for the recommendation API endpoints.
class RecommendationFeatureService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  final Dio _dio;

  /// Creates a [RecommendationFeatureService] using [dio].
  RecommendationFeatureService({required Dio dio}) : _dio = dio;

  /// Calls POST /api/v1/recommend/generate which proxies to the Python
  /// recommender's POST /api/v1/llm/recommend endpoint.
  Future<RecommendationResponse> generateRecommendations({
    required String userId,
    required String goal,
    required String sessionId,
  }) async {
    // Recommendation generation runs an LLM + retrieval pipeline server-side
    // and routinely takes longer than the shared Dio receiveTimeout (60s), so
    // this call raises the receive/send timeouts to avoid aborting a valid
    // response mid-flight.
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/recommend/generate',
      data: {'user_id': userId, 'goal': goal, 'session_id': sessionId},
      options: Options(
        receiveTimeout: const Duration(minutes: 5),
        sendTimeout: const Duration(minutes: 1),
      ),
    );
    return RecommendationResponse.fromJson(response.data!);
  }

  /// Calls POST /api/v1/recommendations/:id/feedback to store a user comment.
  Future<void> submitFeedback({
    required String recommendationId,
    required String comment,
  }) async {
    await _dio.post<void>(
      '$_baseUrl/recommendations/$recommendationId/feedback',
      data: {'comment': comment},
    );
  }
}

/// Provides the singleton [RecommendationFeatureService] instance.
final recommendationFeatureServiceProvider =
    Provider<RecommendationFeatureService>((ref) {
  return RecommendationFeatureService(dio: ref.watch(dioProvider));
});
