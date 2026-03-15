import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

/// Provides the singleton [AuthService] instance.
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

/// Provides the current login state as an async bool.
final isLoggedInProvider = FutureProvider<bool>((ref) async {
  final authService = ref.watch(authServiceProvider);
  return authService.isLoggedIn();
});

/// Provides the user ID (JWT `sub` claim) from the stored access token.
///
/// Returns null when no token is stored or decoding fails.
final userIdProvider = FutureProvider<String?>((ref) async {
  final authService = ref.watch(authServiceProvider);
  final token = await authService.getAccessToken();
  if (token == null) return null;
  try {
    final parts = token.split('.');
    if (parts.length != 3) return null;
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final claims = jsonDecode(payload) as Map<String, dynamic>;
    return claims['sub'] as String?;
  } catch (_) {
    return null;
  }
});

/// Provides the list of Keycloak realm roles from the stored JWT access token.
///
/// Returns an empty list when no token is stored or decoding fails.
final userRolesProvider = FutureProvider<List<String>>((ref) async {
  final authService = ref.watch(authServiceProvider);
  final token = await authService.getAccessToken();
  if (token == null) return [];
  try {
    final parts = token.split('.');
    if (parts.length != 3) return [];
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final claims = jsonDecode(payload) as Map<String, dynamic>;
    final roles = (claims['realm_access']?['roles'] as List?)?.cast<String>();
    return roles ?? [];
  } catch (_) {
    return [];
  }
});
