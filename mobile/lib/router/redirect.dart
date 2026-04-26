// Pure redirect guard logic extracted from routerProvider so it can be
// unit-tested independently of Riverpod and flutter_secure_storage.
//
// [redirectGuard] encodes all three guards:
//   1. Admin guard  – only admin/researcher roles may access /admin/* routes.
//   2. Auth guard   – unauthenticated users may not access protected routes.
//   3. Onboarding bypass – skip welcome/login when already onboarded + logged in.

/// Returns the path to redirect to, or null to stay on [location].
///
/// Dependencies are injected as async callbacks so the function can be tested
/// without platform channels or Riverpod containers.
///
/// - [location]: the [GoRouterState.matchedLocation] of the current navigation.
/// - [getIsLoggedIn]: resolves to true when the user holds a valid session.
/// - [getUserRoles]: resolves to the list of Keycloak realm roles.
/// - [getIsOnboardingComplete]: resolves to true when onboarding has been done.
Future<String?> redirectGuard({
  required String location,
  required Future<bool> Function() getIsLoggedIn,
  required Future<List<String>> Function() getUserRoles,
  required Future<bool> Function() getIsOnboardingComplete,
}) async {
  // ── 1. Admin guard ────────────────────────────────────────────────────────
  if (location.startsWith('/admin')) {
    try {
      final isLoggedIn = await getIsLoggedIn();
      if (!isLoggedIn) return '/onboarding/welcome';
      final roles = await getUserRoles();
      if (!roles.contains('admin') && !roles.contains('researcher')) {
        return '/';
      }
    } catch (_) {
      return '/onboarding/welcome';
    }
    return null;
  }

  // ── 2. Auth guard ─────────────────────────────────────────────────────────
  const protectedPrefixes = [
    '/share',
    '/donate',
    '/explore',
    '/recommend',
    '/settings',
    '/questionnaire',
  ];
  if (protectedPrefixes.any((p) => location.startsWith(p))) {
    try {
      final isLoggedIn = await getIsLoggedIn();
      if (!isLoggedIn) return '/onboarding/welcome';
    } catch (_) {
      return '/onboarding/welcome';
    }
  }

  // ── 3. Onboarding bypass ──────────────────────────────────────────────────
  // Only suppress /onboarding/welcome for users who have already onboarded.
  // /login is intentionally excluded — it hosts the admin PKCE flow and must
  // always be reachable regardless of participant onboarding state.
  if (location.startsWith('/onboarding/welcome')) {
    if (await getIsOnboardingComplete()) {
      try {
        final isLoggedIn = await getIsLoggedIn();
        if (isLoggedIn) return '/share';
      } catch (_) {
        // isLoggedIn check failed – treat as unauthenticated.
      }
      // Onboarding complete but not logged in — stay on welcome so the user
      // can use the restore flow.
      return null;
    }
  }

  return null;
}
