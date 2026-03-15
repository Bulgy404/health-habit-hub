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
}

/// Riverpod provider for [AdminService].
final adminServiceProvider = Provider<AdminService>((ref) {
  return AdminService(ref.read(authServiceProvider));
});
