import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/admin_habit_donation.dart';
import '../models/admin_participant.dart';
import '../models/admin_questionnaire.dart';
import '../models/admin_session.dart';
import '../models/admin_survey.dart';
import '../models/participant_progress.dart';
import '../providers/auth_provider.dart';
import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../services/auth_service.dart';

/// Service for admin API endpoints.
class AdminService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  /// Creates an [AdminService] using [dio] and [authService].
  AdminService({required Dio dio, required AuthService authService})
      : _dio = dio,
        _authService = authService;

  final Dio _dio;
  final AuthService _authService;

  /// Returns all non-deleted participants.
  Future<List<AdminParticipant>> fetchParticipants() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/admin/participants',
    );
    final data = response.data ?? [];
    return data
        .map((e) => AdminParticipant.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Creates a new participant in Keycloak and MongoDB.
  ///
  /// [group] must be one of G1–G4.
  /// [tokenCardFormat] must be 'qr', 'print', or 'both'.
  ///
  /// Returns a map with keys: userId, username, password, tokenCardUrl.
  Future<Map<String, dynamic>> createParticipant({
    required String group,
    required String tokenCardFormat,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/admin/participants',
      data: {'group': group, 'tokenCardFormat': tokenCardFormat},
    );
    return response.data ?? {};
  }

  /// Updates a participant's study group.
  ///
  /// Calls PATCH /api/v1/admin/participants/:id/group with body {group}.
  Future<void> updateParticipantGroup(String id, String group) async {
    await _dio.patch<void>(
      '$_baseUrl/admin/participants/$id/group',
      data: {'group': group},
    );
  }

  /// Soft-deletes (anonymizes) a participant.
  ///
  /// Calls DELETE /api/v1/admin/participants/:id.
  Future<void> deleteParticipant(String id) async {
    await _dio.delete<void>(
      '$_baseUrl/admin/participants/$id',
    );
  }

  /// Returns the full progress data for a participant.
  ///
  /// Calls GET /api/v1/admin/participants/:id/progress.
  Future<ParticipantProgress> fetchParticipantProgress(String id) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/admin/participants/$id/progress',
    );
    return ParticipantProgress.fromJson(response.data ?? {});
  }

  /// Returns the full token card URL for a participant.
  String tokenCardUrl(String participantId, String format) =>
      '$_baseUrl/admin/participants/$participantId/token-card?format=$format';

  // ---------------------------------------------------------------------------
  // Session endpoints
  // ---------------------------------------------------------------------------

  /// Returns all active device sessions.
  Future<List<AdminSession>> fetchSessions() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/admin/sessions',
    );
    final data = response.data ?? [];
    return data
        .map((e) => AdminSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Revokes (deletes) a session by [sessionId].
  Future<void> revokeSession(String sessionId) async {
    await _dio.delete<void>(
      '$_baseUrl/admin/sessions/$sessionId',
    );
  }

  // ---------------------------------------------------------------------------
  // Survey endpoints
  // ---------------------------------------------------------------------------

  /// Returns all surveys.
  Future<List<AdminSurvey>> fetchSurveys() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/admin/surveys',
    );
    final data = response.data ?? [];
    return data
        .map((e) => AdminSurvey.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Creates a new survey with [title] and [type].
  Future<AdminSurvey> createSurvey({
    required String title,
    required String type,
    required String targetMode,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/admin/surveys',
      data: {'title': title, 'type': type, 'targetMode': targetMode},
    );
    return AdminSurvey.fromJson(response.data ?? {});
  }

  /// Updates survey fields (e.g. jsonSchema).
  Future<void> updateSurvey(String id, Map<String, dynamic> data) async {
    await _dio.put<void>(
      '$_baseUrl/admin/surveys/$id',
      data: data,
    );
  }

  /// Updates survey publish/archive status.
  Future<void> updateSurveyStatus(String id, String status) async {
    await _dio.patch<void>(
      '$_baseUrl/admin/surveys/$id/status',
      data: {'status': status},
    );
  }

  /// Updates the groups a survey is assigned to.
  Future<void> updateSurveyGroups(String id, List<String> groups) async {
    await _dio.patch<void>(
      '$_baseUrl/admin/surveys/$id/groups',
      data: {'groups': groups},
    );
  }

  // ---------------------------------------------------------------------------
  // Questionnaire endpoints (native questionnaire system)
  // ---------------------------------------------------------------------------

  /// Fetches the full questionnaire definition (including questions) by id.
  Future<Map<String, dynamic>> fetchQuestionnaireFull(String id) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/admin/questionnaires/$id',
    );
    return response.data ?? {};
  }

  /// Lists all questionnaires (library + custom) for admin management.
  Future<List<AdminQuestionnaire>> fetchAdminQuestionnaires() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/admin/questionnaires',
    );
    final data = response.data ?? [];
    return data
        .map((e) => AdminQuestionnaire.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Creates a new custom questionnaire.
  Future<String> createQuestionnaire({
    required String title,
    required String description,
    required List<Map<String, dynamic>> questions,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/admin/questionnaires',
      data: {'title': title, 'description': description, 'questions': questions},
    );
    return (response.data?['id'] ?? '').toString();
  }

  /// Updates a custom questionnaire.
  Future<void> updateQuestionnaire(
    String id, {
    required String title,
    required String description,
    required List<Map<String, dynamic>> questions,
  }) async {
    await _dio.put<void>(
      '$_baseUrl/admin/questionnaires/$id',
      data: {'title': title, 'description': description, 'questions': questions},
    );
  }

  /// Deletes a custom questionnaire. Throws if assigned to an active study.
  Future<void> deleteQuestionnaire(String id) async {
    await _dio.delete<void>('$_baseUrl/admin/questionnaires/$id');
  }

  // ---------------------------------------------------------------------------
  // Habit donation feed endpoints
  // ---------------------------------------------------------------------------

  /// Returns a paginated list of habit donations with optional filters.
  Future<HabitsFeedResult> fetchHabitsFeed({
    String? group,
    String? category,
    String? dateFrom,
    String? dateTo,
    int page = 1,
    int limit = 50,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (group != null && group.isNotEmpty) 'group': group,
      if (category != null && category.isNotEmpty) 'category': category,
      // ignore: use_null_aware_elements
      if (dateFrom != null) 'dateFrom': dateFrom,
      // ignore: use_null_aware_elements
      if (dateTo != null) 'dateTo': dateTo,
    };
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/admin/habits/feed',
      queryParameters: queryParams,
    );
    return HabitsFeedResult.fromJson(response.data ?? {});
  }

  // ---------------------------------------------------------------------------
  // Settings endpoints
  // ---------------------------------------------------------------------------

  /// Returns all admin settings as a flat {key: value} map.
  Future<Map<String, dynamic>> fetchSettings() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/admin/settings',
    );
    return response.data ?? {};
  }

  /// Updates a single admin setting.
  Future<void> updateSetting(String key, String value) async {
    await _dio.put<void>(
      '$_baseUrl/admin/settings/$key',
      data: {'value': value},
    );
  }

  /// Returns the CSV export URL for the habits feed (with bearer token embedded).
  ///
  /// Intended for use with [url_launcher] so the browser triggers a download.
  Future<String> exportHabitsCsvUrl({
    String? group,
    String? category,
    String? dateFrom,
    String? dateTo,
  }) async {
    final token = await _authService.getAccessToken();
    final params = <String>['format=csv'];
    if (group != null && group.isNotEmpty) params.add('group=$group');
    if (category != null && category.isNotEmpty) {
      params.add('category=${Uri.encodeComponent(category)}');
    }
    if (dateFrom != null) params.add('dateFrom=$dateFrom');
    if (dateTo != null) params.add('dateTo=$dateTo');
    if (token != null) params.add('token=${Uri.encodeComponent(token)}');
    return '$_baseUrl/admin/habits/feed/export?${params.join('&')}';
  }
}

/// Riverpod provider for [AdminService].
final adminServiceProvider = Provider<AdminService>((ref) {
  return AdminService(
    dio: ref.watch(dioProvider),
    authService: ref.watch(authServiceProvider),
  );
});
