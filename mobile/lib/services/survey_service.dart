import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/survey.dart';
import '../models/survey_result.dart';
import '../core/dio_provider.dart';
import '../config/app_config.dart';

/// Service for fetching surveys and submitting results via the backend API.
class SurveyService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  SurveyService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Fetches a survey by its [id].
  Future<Survey> fetchSurvey(String id) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/surveys/$id',
    );
    return Survey.fromJson(response.data!);
  }

  /// Fetches the profile survey assigned to the current user.
  Future<Survey> fetchProfileSurvey() async {
    return fetchSurvey('profile');
  }

  /// Submits survey answers for [surveyId] and returns the persisted result.
  Future<SurveyResult> submitResult(
    String surveyId,
    Map<String, dynamic> answers,
  ) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/surveys/$surveyId/results',
      data: {'answers': answers},
    );
    return SurveyResult.fromJson(response.data!);
  }
}

/// Provides the singleton [SurveyService] instance.
final surveyServiceProvider = Provider<SurveyService>((ref) {
  return SurveyService(dio: ref.watch(dioProvider));
});
