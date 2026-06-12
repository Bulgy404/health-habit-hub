/// GoRouter configuration for the Health Habit Hub app.
///
/// All route definitions and the [routerProvider] live here so that
/// [main.dart] remains a thin entry point.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/my_habits/habit_detail_screen.dart';
import '../features/my_habits/my_habits_models.dart';
import '../features/my_habits/my_habits_screen.dart';
import '../features/my_habits/new_habit_screen_1_behavior.dart';
import '../features/my_habits/new_habit_screen_2_cue.dart';
import '../features/my_habits/new_habit_screen_3_confirm.dart';
import '../features/my_habits/srhi_form_screen.dart';
import '../features/questionnaire/questionnaire_screen.dart';
import '../features/recommendation/goal_input_screen.dart';
import '../features/recommendation/loading_screen.dart';
import '../models/admin_survey.dart';
import '../providers/auth_provider.dart';
import '../screens/admin/admin_comments_screen.dart';
import '../screens/admin/admin_devices_screen.dart';
import '../screens/admin/admin_habits_screen.dart';
import '../screens/admin/admin_participant_detail_screen.dart';
import '../screens/admin/admin_participants_screen.dart';
import '../screens/admin/admin_questionnaires_screen.dart';
import '../screens/admin/admin_settings_screen.dart';
import '../screens/admin/admin_shell_screen.dart';
import '../screens/admin/admin_surveys_screen.dart';
import '../screens/donate_screen.dart';
import '../screens/explore_screen.dart';
import '../screens/legal_document_screen.dart';
import '../screens/login_screen.dart';
import '../screens/onboarding/consent_screen.dart';
import '../screens/onboarding/passphrase_screen.dart';
import '../screens/onboarding/profile_setup_screen.dart';
import '../screens/onboarding/restore_screen.dart';
import '../screens/onboarding/study_code_screen.dart';
import '../screens/onboarding/welcome_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/settings/personal_info_screen.dart';
import '../screens/shell_screen.dart';
import '../screens/user_settings_screen.dart';
import 'redirect.dart';

/// GoRouter wrapped in a Riverpod Provider so the redirect guard can access
/// auth state via [userRolesProvider] without relying on BuildContext.
final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authNotifierProvider);
  final router = GoRouter(
    initialLocation: '/onboarding/welcome',
    refreshListenable: authNotifier,
    // Redirect guard: admin route protection and onboarding bypass.
    redirect: (context, state) => redirectGuard(
      location: state.matchedLocation,
      getIsLoggedIn: () => ref.read(authServiceProvider).isLoggedIn(),
      getUserRoles: () => ref.read(userRolesProvider.future),
      getIsOnboardingComplete: isOnboardingComplete,
    ),
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
        path: '/onboarding/consent',
        builder: (context, state) => const ConsentScreen(),
      ),
      GoRoute(
        path: '/consent-update',
        builder: (context, state) => const ConsentScreen(isUpdate: true),
      ),
      GoRoute(
        path: '/onboarding/passphrase',
        builder: (context, state) => const PassphraseScreen(),
      ),
      GoRoute(
        path: '/onboarding/restore',
        builder: (context, state) => const RestoreScreen(),
      ),
      GoRoute(
        path: '/onboarding/profile-setup',
        builder: (context, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: '/onboarding/study-code',
        builder: (context, state) => const StudyCodeScreen(),
      ),
      GoRoute(
        path: '/questionnaire/:slug',
        builder: (context, state) => QuestionnaireScreen(
          slug: state.pathParameters['slug'] ?? '',
        ),
        routes: [
          GoRoute(
            path: 'confirmation',
            builder: (context, state) => QuestionnaireConfirmationScreen(
              slug: state.pathParameters['slug'] ?? '',
            ),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ShellScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/share',
                builder: (context, state) => const ShareHabitScreen(),
              ),
              GoRoute(
                path: '/donate',
                redirect: (context, state) => '/share',
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
                path: '/habits',
                builder: (context, state) => const MyHabitsScreen(),
                routes: [
                  GoRoute(
                    path: 'new/behavior',
                    builder: (context, state) => const PickBehaviorScreen(),
                  ),
                  GoRoute(
                    path: 'new/cue',
                    builder: (context, state) {
                      final extra = state.extra as Map<String, dynamic>;
                      return SetCueScreen(
                        behaviorKey: extra['behaviorKey'] as String,
                        behaviorLabel: extra['behaviorLabel'] as String,
                        config: extra['config'] as HabitConfig,
                      );
                    },
                  ),
                  GoRoute(
                    path: 'new/confirm',
                    builder: (context, state) {
                      final extra = state.extra as Map<String, dynamic>;
                      return ConfirmPlanScreen(
                        behaviorKey: extra['behaviorKey'] as String,
                        behaviorLabel: extra['behaviorLabel'] as String,
                        config: extra['config'] as HabitConfig,
                        cues: (extra['cues'] as List<dynamic>)
                            .cast<IntentionCue>(),
                      );
                    },
                  ),
                  GoRoute(
                    path: ':intentionId',
                    builder: (context, state) => HabitDetailScreen(
                      intentionId: state.pathParameters['intentionId']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'srhi/:weekNumber',
                        builder: (context, state) {
                          final extra = state.extra as Map<String, dynamic>?;
                          return SrhiFormScreen(
                            intentionId:
                                state.pathParameters['intentionId']!,
                            weekNumber: int.parse(
                                state.pathParameters['weekNumber']!),
                            behaviorLabel:
                                extra?['behaviorLabel'] as String? ?? '',
                            srhiItems: (extra?['srhiItems']
                                        as List<dynamic>?)
                                    ?.cast<SrhiItem>() ??
                                const [],
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/recommend',
                builder: (context, state) => const GoalInputScreen(),
                routes: [
                  GoRoute(
                    path: 'loading',
                    builder: (context, state) => RecommendationLoadingScreen(
                      goal: state.extra as String? ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (context, state) => const UserSettingsScreen(),
                routes: [
                  GoRoute(
                    path: 'profile',
                    builder: (context, state) => const ProfileScreen(),
                  ),
                  GoRoute(
                    path: 'privacy',
                    builder: (context, state) => const LegalDocumentScreen(
                      documentType: LegalDocumentType.privacy,
                    ),
                  ),
                  GoRoute(
                    path: 'accessibility',
                    builder: (context, state) => const LegalDocumentScreen(
                      documentType: LegalDocumentType.accessibility,
                    ),
                  ),
                  GoRoute(
                    path: 'imprint',
                    builder: (context, state) => const LegalDocumentScreen(
                      documentType: LegalDocumentType.imprint,
                    ),
                  ),
                  GoRoute(
                    path: 'consent',
                    builder: (context, state) => const LegalDocumentScreen(
                      documentType: LegalDocumentType.consent,
                    ),
                  ),
                  GoRoute(
                    path: 'personal-info',
                    builder: (context, state) => const PersonalInfoScreen(),
                  ),
                ],
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
                    path: '/admin/questionnaires',
                    builder: (context, state) =>
                        const AdminQuestionnairesScreen(),
                  ),
                  GoRoute(
                    path: '/admin/comments',
                    builder: (context, state) => const AdminCommentsScreen(),
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
