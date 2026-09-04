// Pure redirect guard logic extracted from routerProvider so it can be
// unit-tested independently of Riverpod and flutter_secure_storage.
//
// [redirectGuard] encodes two guards:
//   1. Auth guard   – unauthenticated users may not access protected routes.
//   2. Onboarding bypass – skip welcome when already onboarded + logged in.
//   3. Study consent gate – verified-identity studies may require a second,
//      study-specific consent document that can only be known AFTER the
//      enrolment code is redeemed (the study is unknown until then).

/// Returns the path to redirect to, or null to stay on [location].
///
/// Dependencies are injected as async callbacks so the function can be tested
/// without platform channels or Riverpod containers.
///
/// - [location]: the [GoRouterState.matchedLocation] of the current navigation.
/// - [getIsLoggedIn]: resolves to true when the user holds a valid session.
/// - [getUserRoles]: resolves to the list of Keycloak realm roles.
/// - [getIsOnboardingComplete]: resolves to true when onboarding has been done.
/// - [getStudyConsentPending]: resolves to true when the participant is
///   enrolled in a study that requires a study-specific consent they have not
///   yet accepted. Injected like the others so this stays a pure function.
Future<String?> redirectGuard({
  required String location,
  required Future<bool> Function() getIsLoggedIn,
  required Future<List<String>> Function() getUserRoles,
  required Future<bool> Function() getIsOnboardingComplete,
  Future<bool> Function()? getRecommenderEnabled,
  Future<bool> Function()? getStudyConsentPending,
}) async {
  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  const protectedPrefixes = [
    '/share',
    '/donate',
    '/explore',
    '/recommend',
    '/settings',
    '/questionnaire',
    '/habits',
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

  // ── 1c. Study consent gate ────────────────────────────────────────────────
  // A verified-identity study can require its own consent document. The study
  // — and therefore the document — is only known once the enrolment code has
  // been redeemed, which is why this is a gate AFTER enrolment rather than an
  // extra step in the onboarding chain: reordering that well-tested flow to
  // ask for the code first would be a far larger, riskier change.
  //
  // Fails OPEN on error, exactly like the recommender guard. A flaky network
  // must never lock a participant out of the app they are enrolled in; the
  // check re-runs on every navigation.
  if (protectedPrefixes.any((p) => location.startsWith(p)) &&
      getStudyConsentPending != null) {
    try {
      if (await getStudyConsentPending()) return '/onboarding/study-consent';
    } catch (_) {
      // Unknown → allow through.
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
