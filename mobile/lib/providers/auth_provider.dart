import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

/// ChangeNotifier that fires whenever the auth state changes (login or logout).
/// Passed to GoRouter's [refreshListenable] so the redirect guard re-runs and
/// all role/token providers re-evaluate.
class AuthNotifier extends ChangeNotifier {
  /// Notifies listeners that the user has logged out.
  void notifyLogout() => notifyListeners();

  /// Notifies listeners that the user has logged in.
  void notifyLogin() => notifyListeners();
}

/// Provides the singleton [AuthNotifier].
final authNotifierProvider = Provider<AuthNotifier>((ref) => AuthNotifier());

/// Provides the singleton [AuthService] instance.
final authServiceProvider = Provider<AuthService>((ref) {
  final notifier = ref.watch(authNotifierProvider);
  return AuthService(
    onLogout: notifier.notifyLogout,
    onLogin: notifier.notifyLogin,
  );
});

/// Provides the current login state as an async bool.
final isLoggedInProvider = FutureProvider<bool>((ref) async {
  final authService = ref.watch(authServiceProvider);
  return authService.isLoggedIn();
});

/// Provides the user ID (JWT `sub` claim) from the stored access token.
///
/// Reads the token directly from storage WITHOUT triggering a refresh or
/// logout.  The Dio interceptor handles token refresh before actual API calls,
/// so there is no need to refresh here — doing so can race with GoRouter and
/// cause spurious logouts.
///
/// Returns null when no token is stored or decoding fails.
final userIdProvider = FutureProvider<String?>((ref) async {
  final authService = ref.watch(authServiceProvider);
  return authService.getUserIdFromToken();
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
