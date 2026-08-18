/// Service and providers for the questionnaire feature.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../providers/locale_provider.dart';
import 'questionnaire_models.dart';

/// REST client for the questionnaire API endpoints.
class QuestionnaireService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  /// Creates a [QuestionnaireService] using the given Dio [dio] instance.
  QuestionnaireService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Fetches the full [QuestionnaireDefinition] for [slug], with title,
  /// question text, and option labels resolved in [lang].
  Future<QuestionnaireDefinition> fetchQuestionnaire(
    String slug,
    String lang,
  ) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/questionnaires/$slug',
      queryParameters: {'lang': lang},
    );
    return QuestionnaireDefinition.fromJson(response.data ?? {});
  }

  /// Submits [answers] for [questionnaireSlug].
  ///
  /// [habitUuid] identifies this as a post-donation questionnaire fill tied
  /// to one specific habit donation (see habitDonationService.js /
  /// ShareHabitScreen) — it bypasses the normal scheduled-window gating and
  /// links the response back to that donation for research retrieval.
  /// Omitted for every other (scheduled) questionnaire submission.
  Future<void> submitResponse({
    required String questionnaireSlug,
    required Map<String, dynamic> answers,
    String? habitUuid,
  }) async {
    await _dio.post<void>(
      '$_baseUrl/questionnaire-responses',
      data: {
        'questionnaireSlug': questionnaireSlug,
        'answers': answers,
        'habitUuid': ?habitUuid,
      },
    );
  }

  /// Returns the participant's due + upcoming scheduled questionnaires
  /// (from the questionnaire scheduling system), with titles resolved in
  /// [lang].
  ///
  /// Excludes `srhi` items: the endpoint also carries per-habit SRHI
  /// check-ins so [ReminderSchedulerService] can schedule their local
  /// notifications, but SRHI has its own dedicated in-app surface (the habit
  /// list's check-in card) and submission flow — routing it through the
  /// generic `/questionnaire/:slug` screen here would 404 (SRHI isn't in the
  /// `questionnaires` collection that route reads from).
  Future<List<DueQuestionnaire>> fetchDueQuestionnaires(String lang) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/questionnaires/due',
      queryParameters: {'lang': lang},
    );
    final list =
        (response.data?['questionnaires'] as List<dynamic>?) ?? const [];
    return list
        .cast<Map<String, dynamic>>()
        .map(DueQuestionnaire.fromJson)
        .where((q) => q.slug != 'srhi')
        .toList();
  }

  /// Returns the questionnaires assigned to the participant's enrolled
  /// study, with titles resolved in [lang].
  ///
  /// A 404 means there's nothing to show — either the participant isn't
  /// enrolled in a study, or the study has no questionnaires assigned —
  /// which is treated the same as an assigned-but-empty list (`[]`) rather
  /// than an error, so the profile screen can hide the section instead of
  /// showing a scary "failed to load" message for an entirely normal state.
  Future<List<ParticipantQuestionnaire>> fetchParticipantQuestionnaires(
    String lang,
  ) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '$_baseUrl/participant/questionnaires',
        queryParameters: {'lang': lang},
      );
      return (response.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(ParticipantQuestionnaire.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return const [];
      rethrow;
    }
  }
}

/// A scheduled questionnaire occurrence that is due (or coming up) for the
/// current participant.
class DueQuestionnaire {
  /// Creates a [DueQuestionnaire].
  const DueQuestionnaire({
    required this.windowId,
    required this.slug,
    required this.title,
    required this.occurrence,
    required this.scheduledFor,
    required this.isDue,
  });

  /// The scheduled window id.
  final String windowId;

  /// Questionnaire slug (used to open + submit it).
  final String slug;

  /// Human-readable questionnaire title.
  final String title;

  /// 1-based occurrence within the assignment schedule.
  final int occurrence;

  /// When this occurrence is due.
  final DateTime? scheduledFor;

  /// Whether it is due now (`scheduledFor <= now`).
  final bool isDue;

  /// Deserialises from the `/questionnaires/due` API response.
  factory DueQuestionnaire.fromJson(Map<String, dynamic> json) =>
      DueQuestionnaire(
        windowId: json['windowId']?.toString() ?? '',
        slug: json['questionnaireSlug']?.toString() ?? '',
        title: json['questionnaireTitle']?.toString() ?? '',
        occurrence: (json['occurrence'] as num?)?.toInt() ?? 1,
        scheduledFor: json['scheduledFor'] != null
            ? DateTime.tryParse(json['scheduledFor'].toString())
            : null,
        isDue: json['isDue'] == true,
      );
}

/// Provides the singleton [QuestionnaireService] instance.
final questionnaireServiceProvider = Provider<QuestionnaireService>((ref) {
  return QuestionnaireService(dio: ref.watch(dioProvider));
});

/// The participant's due + upcoming scheduled questionnaires.
final dueQuestionnairesProvider =
    FutureProvider<List<DueQuestionnaire>>((ref) async {
  final lang = ref.watch(localeProvider).languageCode;
  return ref.watch(questionnaireServiceProvider).fetchDueQuestionnaires(lang);
});

/// Fetches a [QuestionnaireDefinition] by [slug].
final questionnaireProvider =
    FutureProvider.family<QuestionnaireDefinition, String>((ref, slug) async {
  final service = ref.watch(questionnaireServiceProvider);
  final lang = ref.watch(localeProvider).languageCode;
  return service.fetchQuestionnaire(slug, lang);
});

/// Fetches all questionnaires assigned to the current participant's study.
final participantQuestionnairesProvider =
    FutureProvider<List<ParticipantQuestionnaire>>((ref) async {
  final service = ref.watch(questionnaireServiceProvider);
  final lang = ref.watch(localeProvider).languageCode;
  return service.fetchParticipantQuestionnaires(lang);
});
