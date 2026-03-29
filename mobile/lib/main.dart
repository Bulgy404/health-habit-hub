import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'firebase_options.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'l10n/app_localizations.dart';
import 'models/admin_survey.dart';
import 'providers/auth_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/admin/admin_devices_screen.dart';
import 'screens/admin/admin_habits_screen.dart';
import 'screens/admin/admin_participant_detail_screen.dart';
import 'screens/admin/admin_participants_screen.dart';
import 'screens/admin/admin_settings_screen.dart';
import 'screens/admin/admin_shell_screen.dart';
import 'screens/admin/admin_surveys_screen.dart';
import 'features/questionnaire/questionnaire_screen.dart';
import 'features/recommendation/goal_input_screen.dart';
import 'features/recommendation/loading_screen.dart';
import 'screens/donate_screen.dart';
import 'screens/explore_screen.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding/passphrase_screen.dart';
import 'screens/onboarding/restore_screen.dart';
import 'screens/onboarding/study_code_screen.dart';
import 'screens/onboarding/welcome_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/shell_screen.dart';
import 'screens/user_settings_screen.dart';
import 'providers/locale_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // Firebase not configured — push notifications unavailable.
  }
  runApp(const ProviderScope(child: HhhApp()));
}

// ---------------------------------------------------------------------------
// Router provider
// ---------------------------------------------------------------------------

/// GoRouter wrapped in a Riverpod Provider so the redirect guard can access
/// auth state via [userRolesProvider] without relying on BuildContext.
final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authNotifierProvider);
  final router = GoRouter(
    initialLocation: '/onboarding/welcome',
    refreshListenable: authNotifier,
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

      // Auth guard: unauthenticated users may not access app screens.
      const protectedPrefixes = [
        '/share',
        '/donate',
        '/explore',
        '/recommend',
        '/profile',
        '/settings',
        '/questionnaire',
      ];
      final location = state.matchedLocation;
      if (protectedPrefixes.any((p) => location.startsWith(p))) {
        try {
          final isLoggedIn = await ref.read(isLoggedInProvider.future);
          if (!isLoggedIn) {
            return '/onboarding/welcome';
          }
        } catch (_) {
          return '/onboarding/welcome';
        }
      }

      // Onboarding bypass: if the user has already completed onboarding,
      // skip the welcome and login screens and go straight to the app.
      // Must also verify the user is authenticated: if tokens have expired
      // or been cleared, redirecting to /share would cause a loop because
      // the auth guard would immediately send them back to /onboarding/welcome.
      if (location.startsWith('/onboarding/welcome') ||
          location == '/login') {
        if (await isOnboardingComplete()) {
          try {
            final isLoggedIn = await ref.read(isLoggedInProvider.future);
            if (isLoggedIn) return '/share';
          } catch (_) {
            // isLoggedIn check failed — treat as unauthenticated.
          }
          // Onboarding complete but unauthenticated: stay on welcome so the
          // user can use the restore flow without looping.
          return location == '/login' ? '/onboarding/welcome' : null;
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
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (context, state) => const UserSettingsScreen(),
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
// Brand theme
// ---------------------------------------------------------------------------

// HabShare brand colors.
const _kPrimary = Color(0xFF45b700);
const _kPrimaryDark = Color(0xFF237c00);
const _kAccent = Color(0xFFe679ab);
const _kSurface = Color(0xFFdadada);
const _kNavBar = Color(0xFF454446);
const _kChipGreen = Color(0xFF4cd49e);

ThemeData _buildLightTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: _kPrimary,
    primary: _kPrimary,
    secondary: _kAccent,
    surface: _kSurface,
    onPrimary: Colors.white,
    onSecondary: Colors.white,
    brightness: Brightness.light,
  );

  // Start with a base theme using our color scheme.
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: Colors.white,
  );

  // Extend with Google Fonts and component themes.
  return base.copyWith(
    textTheme: GoogleFonts.figtreeTextTheme(base.textTheme),
    primaryColor: _kPrimary,
    appBarTheme: const AppBarTheme(
      backgroundColor: _kNavBar,
      foregroundColor: Colors.white,
      iconTheme: IconThemeData(color: Colors.white),
      actionsIconTheme: IconThemeData(color: Colors.white),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: _kNavBar,
      indicatorColor: _kPrimary,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: Colors.white);
        }
        return IconThemeData(color: Colors.white.withAlpha(153));
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return GoogleFonts.figtree(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          );
        }
        return GoogleFonts.figtree(
          color: Colors.white.withAlpha(153),
          fontSize: 12,
        );
      }),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: _kPrimary,
        side: const BorderSide(color: _kPrimary, width: 1.5),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: _kPrimary,
        textStyle: GoogleFonts.figtree(),
      ),
    ),
    cardTheme: CardThemeData(
      color: _kSurface,
      elevation: 4,
      shadowColor: const Color(0x40000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: _kPrimary, width: 2),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: _kChipGreen,
      labelStyle: const TextStyle(color: Colors.white),
      selectedColor: _kPrimaryDark,
    ),
  );
}

ThemeData _buildDarkTheme() {
  const kDarkBackground = Color(0xFF1a1a1a);
  const kDarkSurface = Color(0xFF2a2a2a);
  const kDarkOnSurface = Color(0xFFf0f0f0);

  final colorScheme = ColorScheme.fromSeed(
    seedColor: _kPrimary,
    primary: _kPrimary,
    secondary: _kAccent,
    surface: kDarkSurface,
    onPrimary: Colors.white,
    onSecondary: Colors.white,
    onSurface: kDarkOnSurface,
    brightness: Brightness.dark,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: kDarkBackground,
  );

  return base.copyWith(
    textTheme: GoogleFonts.figtreeTextTheme(base.textTheme),
    primaryColor: _kPrimary,
    appBarTheme: const AppBarTheme(
      backgroundColor: _kNavBar,
      foregroundColor: Colors.white,
      iconTheme: IconThemeData(color: Colors.white),
      actionsIconTheme: IconThemeData(color: Colors.white),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: _kNavBar,
      indicatorColor: _kPrimary,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: Colors.white);
        }
        return IconThemeData(color: Colors.white.withAlpha(153));
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return GoogleFonts.figtree(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          );
        }
        return GoogleFonts.figtree(
          color: Colors.white.withAlpha(153),
          fontSize: 12,
        );
      }),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: _kPrimary,
        side: const BorderSide(color: _kPrimary, width: 1.5),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: _kPrimary,
        textStyle: GoogleFonts.figtree(),
      ),
    ),
    cardTheme: CardThemeData(
      color: kDarkSurface,
      elevation: 4,
      shadowColor: const Color(0x40000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: _kPrimary, width: 2),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: _kChipGreen,
      labelStyle: const TextStyle(color: Colors.white),
      selectedColor: _kPrimaryDark,
    ),
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

class HhhApp extends ConsumerWidget {
  const HhhApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'Health Habit Hub',
      theme: _buildLightTheme(),
      darkTheme: _buildDarkTheme(),
      themeMode: themeMode,
      locale: locale,
      routerConfig: router,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'),
        Locale('de'),
      ],
    );
  }
}
