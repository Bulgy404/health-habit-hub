import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/dio_provider.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../services/auth_service.dart';
import '../services/habit_service.dart';
import 'bubble_graph_provider.dart';
import 'show_in_graph_provider.dart';

/// ChangeNotifier that fires whenever the auth state changes (login or logout).
/// Passed to GoRouter's [refreshListenable] so the redirect guard re-runs and
/// all role/token providers re-evaluate.
class AuthNotifier extends ChangeNotifier {
  /// Notifies listeners that the user has logged out.
  ///
  /// Deferred to a microtask: this can be invoked from deep inside an async
  /// callback (e.g. a token refresh completing) that happens to resolve
  /// while Flutter is mid-build/mid-navigation. GoRouter watches this
  /// notifier as its `refreshListenable`, and a same-frame notifyListeners()
  /// call in that window trips "setState() or markNeedsBuild() called during
  /// build". Deferring one microtask moves it safely outside the frame.
  void notifyLogout() => Future.microtask(notifyListeners);

  /// Notifies listeners that the user has logged in. See [notifyLogout] for
  /// why this is deferred.
  void notifyLogin() => Future.microtask(notifyListeners);
}

/// Provides the singleton [AuthNotifier].
final authNotifierProvider = Provider<AuthNotifier>((ref) => AuthNotifier());

/// Every provider that holds data scoped to the current user identity.
/// Riverpod invalidates every keyed instance of a `.family` provider when
/// the family itself is invalidated with no argument, so the two family
/// providers here ([intentionLogsProvider], [srhiTrajectoryProvider]) are
/// fully covered too.
// Untyped list literal: the element type (ProviderOrFamily) isn't part of
// riverpod's public export surface, so it can't be spelled out here — Dart
// still infers it correctly from the elements for the ref.invalidate() calls
// below. Not `const`: providers are runtime-constructed final top-levels.
final userScopedProviders = [
  habitConfigProvider,
  intentionsProvider,
  dueSrhiProvider,
  intentionLogsProvider,
  srhiTrajectoryProvider,
  bubbleGraphProvider,
  myStatsProvider,
  habitStatsProvider,
  myAnnotationsProvider,
];

/// Invalidates [userScopedProviders], so a login/logout transition never
/// leaves the previous identity's data visible under the new one.
///
/// Call this at every point local storage switches to a different identity's
/// tokens — not just [authServiceProvider]'s onLogin/onLogout, since the
/// onboarding "create new account" and "restore with passphrase" flows write
/// tokens directly to secure storage without going through [AuthService]
/// (see [invalidateUserScopedProvidersFromWidget] for those call sites).
void invalidateUserScopedProviders(Ref ref) {
  for (final provider in userScopedProviders) {
    ref.invalidate(provider);
  }
}

/// Same as [invalidateUserScopedProviders], for call sites that only have a
/// [WidgetRef] (screens), which is a distinct sealed type from [Ref] and
/// isn't interchangeable with it.
void invalidateUserScopedProvidersFromWidget(WidgetRef ref) {
  for (final provider in userScopedProviders) {
    ref.invalidate(provider);
  }
}

/// Provides the singleton [AuthService] instance.
final authServiceProvider = Provider<AuthService>((ref) {
  final notifier = ref.watch(authNotifierProvider);
  return AuthService(
    dio: ref.watch(authDioProvider),
    onLogout: () {
      invalidateUserScopedProviders(ref);
      notifier.notifyLogout();
    },
    onLogin: () {
      invalidateUserScopedProviders(ref);
      notifier.notifyLogin();
    },
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
