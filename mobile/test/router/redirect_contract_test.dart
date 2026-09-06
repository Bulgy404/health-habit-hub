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
  _studyConsentGateTests();
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

    test(
      'visiting /habits when NOT logged in redirects to /onboarding/welcome',
      () async {
        final result = await _guard(
          location: '/habits',
          isLoggedIn: false,
        );
        expect(result, '/onboarding/welcome');
      },
    );

    test(
      'visiting /habits when logged in returns null (no redirect)',
      () async {
        final result = await _guard(
          location: '/habits',
          isLoggedIn: true,
        );
        expect(result, isNull);
      },
    );
  });

}

/// Study consent gate (verified-identity studies).
///
/// The study-specific document can only be known AFTER the enrolment code is
/// redeemed, so this is a gate on protected routes rather than an extra step
/// in the onboarding chain — reordering that well-tested flow to ask for the
/// code first would be a much larger, riskier change.
void _studyConsentGateTests() {
  group('study consent gate', () {
    Future<String?> guard({
      required String location,
      bool loggedIn = true,
      bool onboarded = true,
      bool? consentPending,
    }) =>
        redirectGuard(
          location: location,
          getIsLoggedIn: () async => loggedIn,
          getUserRoles: () async => const <String>[],
          getIsOnboardingComplete: () async => onboarded,
          getStudyConsentPending:
              consentPending == null ? null : () async => consentPending,
        );

    test('redirects to the study consent screen when one is pending', () async {
      expect(await guard(location: '/share', consentPending: true),
          '/onboarding/study-consent');
      expect(await guard(location: '/habits', consentPending: true),
          '/onboarding/study-consent');
    });

    test('stays put when no study consent is pending', () async {
      expect(await guard(location: '/share', consentPending: false), isNull);
    });

    test('is inert for anonymous studies, where the callback is absent', () async {
      // Every existing study. The gate must add nothing at all for them.
      expect(await guard(location: '/share'), isNull);
      expect(await guard(location: '/habits'), isNull);
    });

    test('FAILS OPEN when the check throws', () async {
      // A flaky network must never lock a participant out of the app they are
      // enrolled in. The check re-runs on every navigation.
      final result = await redirectGuard(
        location: '/share',
        getIsLoggedIn: () async => true,
        getUserRoles: () async => const <String>[],
        getIsOnboardingComplete: () async => true,
        getStudyConsentPending: () async => throw Exception('offline'),
      );
      expect(result, isNull);
    });

    test('the auth guard still wins over the consent gate', () async {
      // An unauthenticated user goes to welcome, not to a consent screen they
      // could not submit anyway.
      expect(
        await guard(location: '/share', loggedIn: false, consentPending: true),
        '/onboarding/welcome',
      );
    });

    test('does not gate unprotected routes', () async {
      expect(
        await guard(location: '/onboarding/passphrase', consentPending: true),
        isNull,
      );
    });
  });
}
