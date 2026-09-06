// Pins AppConfig's mode-dependent endpoint defaults.
//
// Release builds default to production so that an Xcode archive — which cannot
// pass Flutter `--dart-define` flags — still ships a working build. Debug builds
// must keep defaulting to localhost, or `flutter run` would hit the production
// server during local development. Tests run in debug, so that is what we can
// assert here; the release branch is a compile-time `kReleaseMode` constant in
// app_config.dart.
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/config/app_config.dart';

void main() {
  group('AppConfig defaults', () {
    test('debug/test builds point at localhost so local dev is unaffected', () {
      expect(AppConfig.apiBaseUrl, 'http://localhost:3000/api/v1');
      expect(AppConfig.keycloakUrl, 'http://localhost:8080');
      expect(AppConfig.wsBaseUrl, 'ws://localhost:3000/ws');
    });

    test('appBaseUrl strips the /api/v1 suffix', () {
      expect(AppConfig.appBaseUrl, 'http://localhost:3000');
    });

    test(
      'analytics stays disabled until both PostHog values are configured',
      () {
        expect(AppConfig.posthogProjectKey, isEmpty);
        expect(AppConfig.posthogHost, isEmpty);
        expect(AppConfig.analyticsConfigured, isFalse);
      },
    );

    test(
      'the localhost guard only trips in release, so debug starts normally',
      () {
        expect(AppConfig.localhostOverridesInRelease(), isEmpty);
        expect(AppConfig.productionConfigError(), isNull);
      },
    );
  });
}
