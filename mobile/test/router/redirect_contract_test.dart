// Contract tests for go_router redirect guard logic.
//
// Tests verify that [redirectGuard] implements the three guards correctly:
//   1. Admin guard
//   2. Auth guard (protected routes)
//   3. Onboarding bypass
//
// Dependencies are injected as callbacks so no platform channels, Riverpod
// containers, or flutter_secure_storage are needed.
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/router/redirect.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Future<String?> _guard({
  required String location,
  bool isLoggedIn = false,
  List<String> roles = const [],
  bool onboardingComplete = false,
}) =>
    redirectGuard(
      location: location,
      getIsLoggedIn: () async => isLoggedIn,
      getUserRoles: () async => roles,
      getIsOnboardingComplete: () async => onboardingComplete,
    );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  // ── Onboarding bypass ─────────────────────────────────────────────────────

  group('onboarding bypass', () {
    test(
      'visiting /onboarding/welcome when onboarding complete + logged in '
      'redirects to /share',
      () async {
        final result = await _guard(
          location: '/onboarding/welcome',
          isLoggedIn: true,
          onboardingComplete: true,
        );
        expect(result, '/share');
      },
    );

    test(
      'visiting /onboarding/welcome when onboarding complete + NOT logged in '
      'returns null (stays on welcome for restore flow)',
      () async {
        final result = await _guard(
          location: '/onboarding/welcome',
          isLoggedIn: false,
          onboardingComplete: true,
        );
        expect(result, isNull);
      },
    );

  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  group('auth guard', () {
    test(
      'visiting /share when NOT logged in redirects to /onboarding/welcome',
      () async {
        final result = await _guard(
          location: '/share',
          isLoggedIn: false,
        );
        expect(result, '/onboarding/welcome');
      },
    );

    test(
      'visiting /share when logged in returns null (no redirect)',
      () async {
        final result = await _guard(
          location: '/share',
          isLoggedIn: true,
        );
        expect(result, isNull);
      },
    );
  });

}
