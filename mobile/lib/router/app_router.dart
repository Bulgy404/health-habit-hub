/// GoRouter configuration for the Health Habit Hub app.
///
/// All route definitions and the [routerProvider] live here so that
/// [main.dart] remains a thin entry point.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../features/my_habits/habit_detail_screen.dart';
import '../features/my_habits/intention_stitch_screen.dart';
import '../features/my_habits/my_habits_models.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../features/my_habits/my_habits_screen.dart';
import '../features/my_habits/new_habit_screen_1_behavior.dart';
import '../features/my_habits/new_habit_screen_2_cue.dart';
import '../features/my_habits/new_habit_screen_3_confirm.dart';
import '../features/my_habits/srhi_form_screen.dart';
import '../features/questionnaire/questionnaire_screen.dart';
import '../features/recommendation/goal_input_screen.dart';
import '../features/recommendation/loading_screen.dart';
import '../providers/auth_provider.dart';
import '../screens/achievements_screen.dart';
import '../screens/donate_screen.dart';
import '../screens/explore_screen.dart';
import '../screens/help_support_screen.dart';
import '../screens/legal_document_screen.dart';
import '../screens/onboarding/consent_screen.dart';
import '../screens/onboarding/passphrase_screen.dart';
import '../screens/onboarding/profile_setup_screen.dart';
import '../screens/onboarding/restore_screen.dart';
import '../screens/onboarding/study_code_screen.dart';
import '../screens/onboarding/study_consent_screen.dart';
import '../screens/onboarding/welcome_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/project_info_screen.dart';
import '../screens/rotate_passphrase_screen.dart';
import '../screens/shell_screen.dart';
import '../screens/signing_out_screen.dart';
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
      getRecommenderEnabled: () async => ref.read(recommenderEnabledProvider),
      // A LOCAL read, deliberately: this guard runs on every navigation and
      // must not depend on the network. The slug is written at enrolment and
      // deleted once the server has recorded the acceptance.
      getStudyConsentPending: () async {
        final slug = await const FlutterSecureStorage()
            .read(key: kPendingStudyConsentSlugKey);
        return slug != null && slug.isNotEmpty;
      },
    ),
    routes: [
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/signing-out',
        builder: (context, state) => SigningOutScreen(
          nextRoute: (state.extra as String?) ?? '/onboarding/welcome',
        ),
      ),
      GoRoute(
        path: '/onboarding/consent',
        builder: (context, state) => const ConsentScreen(),
      ),
      GoRoute(
        // Verified-identity studies only. Reached via the router's consent
        // gate after enrolment, never as a step in the onboarding chain — the
        // study, and therefore the document, is unknown until the code is
        // redeemed.
        path: '/onboarding/study-consent',
        builder: (context, state) => const StudyConsentScreen(),
      ),
      GoRoute(
        path: '/consent-update',
        builder: (context, state) => const ConsentScreen(isUpdate: true),
      ),
      GoRoute(
        path: '/about-project',
        builder: (context, state) => const ProjectInfoScreen(),
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
          habitUuid: state.uri.queryParameters['habitUuid'],
        ),
        routes: [
          GoRoute(
            path: 'confirmation',
            builder: (context, state) => QuestionnaireConfirmationScreen(
              slug: state.pathParameters['slug'] ?? '',
              habitUuid: state.uri.queryParameters['habitUuid'],
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
                        habitType:
                            HabitType.fromWire(extra['habitType'] as String?),
                        initialCue: extra['initialCue'] as String?,
                      );
                    },
                  ),
                  GoRoute(
                    path: 'new/stitching',
                    builder: (context, state) {
                      final extra = state.extra as Map<String, dynamic>;
                      return IntentionStitchScreen(
                        behaviorKey: extra['behaviorKey'] as String,
                        behaviorLabel: extra['behaviorLabel'] as String,
                        config: extra['config'] as HabitConfig,
                        habitType:
                            HabitType.fromWire(extra['habitType'] as String?),
                        stackedOn: extra['stackedOn'] as String?,
                        creationMode:
                            extra['creationMode'] as String? ?? 'standalone',
                        anchorText: extra['anchorText'] as String?,
                        alsoTrackAnchor:
                            extra['alsoTrackAnchor'] as bool? ?? false,
                        cues: (extra['cues'] as List<dynamic>)
                            .cast<IntentionCue>(),
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
                        habitType:
                            HabitType.fromWire(extra['habitType'] as String?),
                        stackedOn: extra['stackedOn'] as String?,
                        creationMode:
                            extra['creationMode'] as String? ?? 'standalone',
                        anchorText: extra['anchorText'] as String?,
                        alsoTrackAnchor:
                            extra['alsoTrackAnchor'] as bool? ?? false,
                        cues: (extra['cues'] as List<dynamic>)
                            .cast<IntentionCue>(),
                        stitchedSentence:
                            extra['stitchedSentence'] as String?,
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
                          // Left null (not defaulted to '' / const []) when
                          // extra is absent — e.g. a tapped SRHI notification
                          // deep link, which can only carry a path string —
                          // so SrhiFormScreen knows to resolve both itself
                          // from providers instead of rendering with zero
                          // questions.
                          return SrhiFormScreen(
                            intentionId:
                                state.pathParameters['intentionId']!,
                            weekNumber: int.parse(
                                state.pathParameters['weekNumber']!),
                            behaviorLabel: extra?['behaviorLabel'] as String?,
                            srhiItems: (extra?['srhiItems'] as List<dynamic>?)
                                ?.cast<SrhiItem>(),
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
                    path: 'achievements',
                    builder: (context, state) => const AchievementsScreen(),
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
                    path: 'help',
                    builder: (context, state) => const HelpSupportScreen(),
                  ),
                  GoRoute(
                    path: 'rotate-passphrase',
                    builder: (context, state) => const RotatePassphraseScreen(),
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
