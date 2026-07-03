// Pure redirect guard logic extracted from routerProvider so it can be
// unit-tested independently of Riverpod and flutter_secure_storage.
//
// [redirectGuard] encodes two guards:
//   1. Auth guard   – unauthenticated users may not access protected routes.
//   2. Onboarding bypass – skip welcome when already onboarded + logged in.

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
  Future<bool> Function()? getRecommenderEnabled,
}) async {
  // ── 1. Auth guard ─────────────────────────────────────────────────────────
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

  // ── 1b. Recommender guard ───────────────────────────────────────────────────
  // When the participant's study disables the recommender, keep them out of the
  // recommender flow (e.g. reached via a deep link or push notification). The
  // bottom-nav tab is also hidden in ShellScreen; this is defence-in-depth.
  if (location.startsWith('/recommend') && getRecommenderEnabled != null) {
    try {
      if (!await getRecommenderEnabled()) return '/habits';
    } catch (_) {
      // Unknown → allow; the tab-level check still applies once config loads.
    }
  }

  // ── 2. Onboarding bypass ──────────────────────────────────────────────────
  // Only suppress /onboarding/welcome for users who have already onboarded.
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
