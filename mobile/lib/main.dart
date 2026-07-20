/// App entry point — Firebase init + optional Sentry + Riverpod scope.
library;

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'firebase_options.dart';
import 'services/fresh_install_guard.dart';

/// Sentry DSN injected at build time:
///   flutter build ios --dart-define=SENTRY_DSN=https://...
/// Empty (the default) disables crash reporting entirely — no SDK traffic.
/// Use a SELF-HOSTED Sentry instance so crash metadata stays on TU
/// infrastructure (see DEPLOYMENT.md → Error Reporting).
const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

Future<void> main() async {
  // Binding first: a throw before this renders as a bare white screen with no
  // Flutter error UI, which is impossible to diagnose on a device.
  WidgetsFlutterBinding.ensureInitialized();

  // A release build compiled without the --dart-define values would point at
  // localhost. Surface that on screen instead of throwing, so the cause is
  // visible on the device rather than showing a blank app.
  final configError = AppConfig.productionConfigError();
  if (configError != null) {
    runApp(_ConfigErrorApp(message: configError));
    return;
  }

  // Must run before anything reads onboarding/auth state from secure
  // storage — see fresh_install_guard.dart for why that state can survive
  // a reinstall on its own.
  await ensureFreshInstallState();
  // Loads intl's date symbol data for every bundled locale, so the
  // locale-aware month/weekday names in the contribution graph don't throw.
  await initializeDateFormatting();
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

/// Shown instead of the app when a release build is missing its
/// `--dart-define` configuration. Deliberately dependency-free (no Riverpod,
/// no localisation) so it can render even when nothing else is initialised.
class _ConfigErrorApp extends StatelessWidget {
  const _ConfigErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF1A1C19),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: Color(0xFFFFB300), size: 48),
                  const SizedBox(height: 16),
                  const Text(
                    'Configuration error',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SelectableText(
                    message,
                    style: const TextStyle(
                      color: Color(0xFFE3E4DE),
                      fontSize: 14,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
