import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/admin_participant.dart';
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

  /// Returns the full token card URL for a participant.
  String tokenCardUrl(String participantId, String format) =>
      '$_baseUrl/admin/participants/$participantId/token-card?format=$format';
}

/// Riverpod provider for [AdminService].
final adminServiceProvider = Provider<AdminService>((ref) {
  return AdminService(ref.read(authServiceProvider));
});
