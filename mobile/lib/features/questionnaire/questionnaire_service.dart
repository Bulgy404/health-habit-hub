/// Service and providers for the questionnaire feature.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import 'questionnaire_models.dart';

/// REST client for the questionnaire API endpoints.
class QuestionnaireService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  /// Creates a [QuestionnaireService] using the given Dio [dio] instance.
  QuestionnaireService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Fetches the full [QuestionnaireDefinition] for [slug].
  Future<QuestionnaireDefinition> fetchQuestionnaire(String slug) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/questionnaires/$slug',
    );
    return QuestionnaireDefinition.fromJson(response.data ?? {});
  }

  /// Submits [answers] for [questionnaireSlug].
  Future<void> submitResponse({
    required String questionnaireSlug,
    required Map<String, dynamic> answers,
  }) async {
    await _dio.post<void>(
      '$_baseUrl/questionnaire-responses',
      data: {
        'questionnaireSlug': questionnaireSlug,
        'answers': answers,
      },
    );
  }

  /// Returns the questionnaires assigned to the participant's enrolled study.
  Future<List<ParticipantQuestionnaire>> fetchParticipantQuestionnaires() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/participant/questionnaires',
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(ParticipantQuestionnaire.fromJson)
        .toList();
  }
}

/// Provides the singleton [QuestionnaireService] instance.
final questionnaireServiceProvider = Provider<QuestionnaireService>((ref) {
  return QuestionnaireService(dio: ref.watch(dioProvider));
});

/// Fetches a [QuestionnaireDefinition] by [slug].
final questionnaireProvider =
    FutureProvider.family<QuestionnaireDefinition, String>((ref, slug) async {
  final service = ref.watch(questionnaireServiceProvider);
  return service.fetchQuestionnaire(slug);
});

/// Fetches all questionnaires assigned to the current participant's study.
final participantQuestionnairesProvider =
    FutureProvider<List<ParticipantQuestionnaire>>((ref) async {
  final service = ref.watch(questionnaireServiceProvider);
  return service.fetchParticipantQuestionnaires();
});
