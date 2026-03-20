import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/auth_service.dart';
import 'recommendation_models.dart';

class RecommendationFeatureService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  final Dio _dio;
  final AuthService _authService;

  RecommendationFeatureService({Dio? dio, required AuthService authService})
      : _dio = dio ?? Dio(),
        _authService = authService;

  Future<Map<String, String>> _authHeaders() async {
    final token = await _authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  /// Calls POST /api/v1/recommend/generate which proxies to the Python
  /// recommender's POST /api/v1/llm/recommend endpoint.
  Future<RecommendationResponse> generateRecommendations({
    required String userId,
    required String goal,
    required String sessionId,
  }) async {
    final headers = await _authHeaders();
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/recommend/generate',
      data: {'user_id': userId, 'goal': goal, 'session_id': sessionId},
      options: Options(headers: headers),
    );
    return RecommendationResponse.fromJson(response.data!);
  }

  /// Calls POST /api/v1/recommendations/:id/feedback to store a user comment.
  Future<void> submitFeedback({
    required String recommendationId,
    required String comment,
  }) async {
    final headers = await _authHeaders();
    await _dio.post<void>(
      '$_baseUrl/recommendations/$recommendationId/feedback',
      data: {'comment': comment},
      options: Options(headers: headers),
    );
  }
}

final recommendationFeatureServiceProvider =
    Provider<RecommendationFeatureService>((ref) {
  final authService = ref.watch(authServiceProvider);
  return RecommendationFeatureService(authService: authService);
});
