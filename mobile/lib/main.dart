/// App entry point — Firebase init + optional Sentry + Riverpod scope.
library;

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'firebase_options.dart';

/// Sentry DSN injected at build time:
///   flutter build ios --dart-define=SENTRY_DSN=https://...
/// Empty (the default) disables crash reporting entirely — no SDK traffic.
/// Use a SELF-HOSTED Sentry instance so crash metadata stays on TU
/// infrastructure (see DEPLOYMENT.md → Error Reporting).
const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // Firebase not configured — push notifications unavailable.
  }

  if (_sentryDsn.isEmpty) {
    runApp(const ProviderScope(child: HhhApp()));
    return;
  }

  await SentryFlutter.init(
    (options) {
      options.dsn = _sentryDsn;
      // Privacy: never attach PII, screenshots, or view hierarchies —
      // participants are anonymous and must stay that way in crash reports.
      options.sendDefaultPii = false;
      options.attachScreenshot = false;
      // ignore: experimental_member_use
      options.attachViewHierarchy = false;
      options.tracesSampleRate = 0;
      options.environment =
          const String.fromEnvironment('APP_ENV', defaultValue: 'production');
    },
    appRunner: () => runApp(const ProviderScope(child: HhhApp())),
  );
}
