import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/auth_service.dart';
import 'questionnaire_models.dart';

class QuestionnaireService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  final Dio _dio;
  final AuthService _authService;

  QuestionnaireService({Dio? dio, required AuthService authService})
      : _dio = dio ?? Dio(),
        _authService = authService;

  Future<Map<String, String>> _authHeaders() async {
    final token = await _authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  Future<QuestionnaireDefinition> fetchQuestionnaire(String slug) async {
    final headers = await _authHeaders();
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/questionnaires/$slug',
      options: Options(headers: headers),
    );
    return QuestionnaireDefinition.fromJson(response.data ?? {});
  }

  Future<void> submitResponse({
    required String questionnaireSlug,
    required Map<String, dynamic> answers,
  }) async {
    final headers = await _authHeaders();
    await _dio.post<void>(
      '$_baseUrl/questionnaire-responses',
      data: {
        'questionnaireSlug': questionnaireSlug,
        'answers': answers,
      },
      options: Options(headers: headers),
    );
  }
}

final questionnaireServiceProvider = Provider<QuestionnaireService>((ref) {
  final authService = ref.watch(authServiceProvider);
  return QuestionnaireService(authService: authService);
});

final questionnaireProvider =
    FutureProvider.family<QuestionnaireDefinition, String>((ref, slug) async {
  final service = ref.watch(questionnaireServiceProvider);
  return service.fetchQuestionnaire(slug);
});
