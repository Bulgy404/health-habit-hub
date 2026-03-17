import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'models/admin_survey.dart';
import 'providers/auth_provider.dart';
import 'screens/admin/admin_devices_screen.dart';
import 'screens/admin/admin_habits_screen.dart';
import 'screens/admin/admin_participant_detail_screen.dart';
import 'screens/admin/admin_participants_screen.dart';
import 'screens/admin/admin_settings_screen.dart';
import 'screens/admin/admin_shell_screen.dart';
import 'screens/admin/admin_surveys_screen.dart';
import 'screens/donate_screen.dart';
import 'screens/explore_screen.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding/passphrase_screen.dart';
import 'screens/onboarding/restore_screen.dart';
import 'screens/onboarding/welcome_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/recommend_screen.dart';
import 'screens/shell_screen.dart';

void main() {
  runApp(const ProviderScope(child: HhhApp()));
}

// ---------------------------------------------------------------------------
// Router provider
// ---------------------------------------------------------------------------

/// GoRouter wrapped in a Riverpod Provider so the redirect guard can access
/// auth state via [userRolesProvider] without relying on BuildContext.
final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: '/onboarding/welcome',
    // Redirect guard: admin route protection and onboarding bypass.
    redirect: (context, state) async {
      // Admin guard: only admin/researcher roles may access /admin/* routes.
      if (state.matchedLocation.startsWith('/admin')) {
        try {
          final roles = await ref.read(userRolesProvider.future);
          if (!roles.contains('admin') && !roles.contains('researcher')) {
            return '/';
          }
        } catch (_) {
          return '/';
        }
        return null;
      }

      // Onboarding bypass: if the user has already completed onboarding,
      // skip the welcome and login screens and go straight to the app.
      final location = state.matchedLocation;
      if (location.startsWith('/onboarding/welcome') ||
          location == '/login') {
        if (await isOnboardingComplete()) {
          return '/donate';
        }
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/onboarding/passphrase',
        builder: (context, state) => const PassphraseScreen(),
      ),
      GoRoute(
        path: '/onboarding/restore',
        builder: (context, state) => const RestoreScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ShellScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/donate',
                builder: (context, state) => const DonateScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/explore',
                builder: (context, state) => const ExploreScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/recommend',
                builder: (context, state) => const RecommendScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
          // Admin branch: side-nav rail via AdminShellScreen.
          // initialLocation ensures the Admin tab always opens to the
          // participants list on first visit.
          StatefulShellBranch(
            initialLocation: '/admin/participants',
            routes: [
              ShellRoute(
                builder: (context, state, child) =>
                    AdminShellScreen(child: child),
                routes: [
                  GoRoute(
                    path: '/admin/participants',
                    builder: (context, state) =>
                        const AdminParticipantsScreen(),
                    routes: [
                      GoRoute(
                        path: ':id',
                        builder: (context, state) =>
                            AdminParticipantDetailScreen(
                          participantId:
                              state.pathParameters['id'] ?? '',
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: '/admin/surveys',
                    builder: (context, state) =>
                        const AdminSurveysScreen(),
                    routes: [
                      GoRoute(
                        path: ':id',
                        builder: (context, state) =>
                            AdminSurveyEditorScreen(
                          surveyId:
                              state.pathParameters['id'] ?? '',
                          initialSurvey:
                              state.extra as AdminSurvey?,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: '/admin/habits',
                    builder: (context, state) =>
                        const AdminHabitsScreen(),
                  ),
                  GoRoute(
                    path: '/admin/devices',
                    builder: (context, state) =>
                        const AdminDevicesScreen(),
                  ),
                  GoRoute(
                    path: '/admin/settings',
                    builder: (context, state) =>
                        const AdminSettingsScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

class HhhApp extends ConsumerWidget {
  const HhhApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Health Habit Hub',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
