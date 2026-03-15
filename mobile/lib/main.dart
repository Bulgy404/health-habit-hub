import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'models/admin_survey.dart';
import 'screens/admin/admin_devices_screen.dart';
import 'screens/admin/admin_settings_screen.dart';
import 'screens/admin/admin_habits_screen.dart';
import 'screens/admin/admin_participant_detail_screen.dart';
import 'screens/admin/admin_participants_screen.dart';
import 'screens/admin/admin_surveys_screen.dart';
import 'screens/donate_screen.dart';
import 'screens/explore_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/recommend_screen.dart';
import 'screens/shell_screen.dart';

void main() {
  runApp(const ProviderScope(child: HhhApp()));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

final _router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) {
        final user = state.uri.queryParameters['user'];
        final token = state.uri.queryParameters['token'];
        return LoginScreen(initialUsername: user, initialPassword: token);
      },
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
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/admin',
              builder: (context, state) =>
                  const AdminParticipantsScreen(),
              routes: [
                GoRoute(
                  path: 'participants/:id',
                  builder: (context, state) =>
                      AdminParticipantDetailScreen(
                    participantId:
                        state.pathParameters['id'] ?? '',
                  ),
                ),
                GoRoute(
                  path: 'surveys',
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
                  path: 'habits',
                  builder: (context, state) =>
                      const AdminHabitsScreen(),
                ),
                GoRoute(
                  path: 'devices',
                  builder: (context, state) =>
                      const AdminDevicesScreen(),
                ),
                GoRoute(
                  path: 'settings',
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

class HhhApp extends StatelessWidget {
  const HhhApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Health Habit Hub',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      routerConfig: _router,
    );
  }
}
