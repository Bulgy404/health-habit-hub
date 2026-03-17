import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/recommendation.dart';
import '../providers/auth_provider.dart';
import 'auth_service.dart';
import '../config/app_config.dart';

/// Service for fetching and acting on habit recommendations.
class RecommendationService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  final Dio _dio;
  final AuthService _authService;

  RecommendationService({
    Dio? dio,
    required AuthService authService,
  })  : _dio = dio ?? Dio(),
        _authService = authService;

  Future<Map<String, String>> _authHeaders() async {
    final token = await _authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  /// Fetches all recommendations for [userId].
  Future<List<Recommendation>> fetchRecommendations(String userId) async {
    final headers = await _authHeaders();
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/recommend/$userId',
      options: Options(headers: headers),
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(Recommendation.fromJson)
        .toList();
  }

  /// Marks recommendation [id] as accepted.
  Future<void> acceptRecommendation(String id) async {
    final headers = await _authHeaders();
    await _dio.post<void>(
      '$_baseUrl/recommend/accept/$id',
      options: Options(headers: headers),
    );
  }

  /// Marks recommendation [id] as dismissed.
  Future<void> dismissRecommendation(String id) async {
    final headers = await _authHeaders();
    await _dio.post<void>(
      '$_baseUrl/recommend/dismiss/$id',
      options: Options(headers: headers),
    );
  }
}

/// Provides the singleton [RecommendationService] instance.
final recommendationServiceProvider = Provider<RecommendationService>((ref) {
  final authService = ref.watch(authServiceProvider);
  return RecommendationService(authService: authService);
});
