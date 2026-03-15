import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/admin_habit_donation.dart';
import '../models/admin_participant.dart';
import '../models/admin_session.dart';
import '../models/admin_survey.dart';
import '../models/participant_progress.dart';
import '../providers/auth_provider.dart';
import '../services/auth_service.dart';

/// Service for admin API endpoints.
class AdminService {
  static const _baseUrl = 'https://api.hhh.tu-dresden.de/api/v1';

  AdminService(this._authService);

  final AuthService _authService;
  final Dio _dio = Dio();

  Future<Options> _authOptions() async {
    final token = await _authService.getAccessToken();
    return Options(
      headers: token != null ? {'Authorization': 'Bearer $token'} : {},
    );
  }

  /// Returns all non-deleted participants.
  Future<List<AdminParticipant>> fetchParticipants() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/admin/participants',
      options: await _authOptions(),
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
      options: await _authOptions(),
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
      options: await _authOptions(),
    );
  }

  /// Soft-deletes (anonymizes) a participant.
  ///
  /// Calls DELETE /api/v1/admin/participants/:id.
  Future<void> deleteParticipant(String id) async {
    await _dio.delete<void>(
      '$_baseUrl/admin/participants/$id',
      options: await _authOptions(),
    );
  }

  /// Returns the full progress data for a participant.
  ///
  /// Calls GET /api/v1/admin/participants/:id/progress.
  Future<ParticipantProgress> fetchParticipantProgress(String id) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/admin/participants/$id/progress',
      options: await _authOptions(),
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
      options: await _authOptions(),
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
      options: await _authOptions(),
    );
  }

  // ---------------------------------------------------------------------------
  // Survey endpoints
  // ---------------------------------------------------------------------------

  /// Returns all surveys.
  Future<List<AdminSurvey>> fetchSurveys() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/admin/surveys',
      options: await _authOptions(),
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
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/admin/surveys',
      data: {'title': title, 'type': type},
      options: await _authOptions(),
    );
    return AdminSurvey.fromJson(response.data ?? {});
  }

  /// Updates survey fields (e.g. jsonSchema).
  Future<void> updateSurvey(String id, Map<String, dynamic> data) async {
    await _dio.put<void>(
      '$_baseUrl/admin/surveys/$id',
      data: data,
      options: await _authOptions(),
    );
  }

  /// Updates survey publish/archive status.
  Future<void> updateSurveyStatus(String id, String status) async {
    await _dio.patch<void>(
      '$_baseUrl/admin/surveys/$id/status',
      data: {'status': status},
      options: await _authOptions(),
    );
  }

  /// Updates the groups a survey is assigned to.
  Future<void> updateSurveyGroups(String id, List<String> groups) async {
    await _dio.patch<void>(
      '$_baseUrl/admin/surveys/$id/groups',
      data: {'groups': groups},
      options: await _authOptions(),
    );
  }

  // ---------------------------------------------------------------------------
  // Habit donation feed endpoints
  // ---------------------------------------------------------------------------

  /// Returns a paginated list of habit donations with optional filters.
  ///
  /// [group] – one of G1–G4 (omit to show all groups).
  /// [category] – filter by habit category.
  /// [dateFrom] / [dateTo] – ISO-8601 date strings (YYYY-MM-DD).
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
      options: await _authOptions(),
    );
    return HabitsFeedResult.fromJson(response.data ?? {});
  }

  // ---------------------------------------------------------------------------
  // Settings endpoints
  // ---------------------------------------------------------------------------

  /// Returns all admin settings as a flat {key: value} map.
  ///
  /// Calls GET /api/v1/admin/settings.
  Future<Map<String, dynamic>> fetchSettings() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/admin/settings',
      options: await _authOptions(),
    );
    return response.data ?? {};
  }

  /// Updates a single admin setting.
  ///
  /// Calls PUT /api/v1/admin/settings/:key with body {value}.
  Future<void> updateSetting(String key, String value) async {
    await _dio.put<void>(
      '$_baseUrl/admin/settings/$key',
      data: {'value': value},
      options: await _authOptions(),
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
  return AdminService(ref.read(authServiceProvider));
});
