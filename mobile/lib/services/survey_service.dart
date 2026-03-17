import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/survey.dart';
import '../models/survey_result.dart';
import '../providers/auth_provider.dart';
import 'auth_service.dart';
import '../config/app_config.dart';

/// Service for fetching surveys and submitting results via the backend API.
class SurveyService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  final Dio _dio;
  final AuthService _authService;

  SurveyService({
    Dio? dio,
    required AuthService authService,
  })  : _dio = dio ?? Dio(),
        _authService = authService;

  /// Returns Authorization header with the current Bearer token, or empty map.
  Future<Map<String, String>> _authHeaders() async {
    final token = await _authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  /// Fetches a survey by its [id].
  Future<Survey> fetchSurvey(String id) async {
    final headers = await _authHeaders();
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/surveys/$id',
      options: Options(headers: headers),
    );
    return Survey.fromJson(response.data!);
  }

  /// Fetches the profile survey (type: habit-donation) assigned to the current user.
  Future<Survey> fetchProfileSurvey() async {
    return fetchSurvey('profile');
  }

  /// Submits survey answers for [surveyId] and returns the persisted result.
  Future<SurveyResult> submitResult(
    String surveyId,
    Map<String, dynamic> answers,
  ) async {
    final headers = await _authHeaders();
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/surveys/$surveyId/results',
      data: {'answers': answers},
      options: Options(headers: headers),
    );
    return SurveyResult.fromJson(response.data!);
  }
}

/// Provides the singleton [SurveyService] instance.
final surveyServiceProvider = Provider<SurveyService>((ref) {
  final authService = ref.watch(authServiceProvider);
  return SurveyService(authService: authService);
});
