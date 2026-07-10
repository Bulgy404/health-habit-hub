import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import '../../theme/app_colors.dart';

/// Storage key for the onboarding-complete flag.
const String kOnboardingCompleteKey = 'onboarding_complete';

/// Checks whether the user has already completed onboarding.
Future<bool> isOnboardingComplete() async {
  const storage = FlutterSecureStorage();
  final value = await storage.read(key: kOnboardingCompleteKey);
  return value == 'true';
}

// ---------------------------------------------------------------------------
// Data model for each walkthrough step
// ---------------------------------------------------------------------------

class _WalkthroughStep {
  final IconData icon;
  final String title;
  final String description;

  const _WalkthroughStep({
    required this.icon,
    required this.title,
    required this.description,
  });
}

// ---------------------------------------------------------------------------
// WelcomeScreen
// ---------------------------------------------------------------------------

/// Full-screen onboarding flow shown only on first app launch.
///
/// Page 0 is the splash/welcome page; pages 1–3 are the three walkthrough
/// steps.  The screen bypasses itself (redirects in the router) when the
/// [kOnboardingCompleteKey] flag is already set in secure storage.
class WelcomeScreen extends StatefulWidget {
  /// Creates a [WelcomeScreen].
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _pageController = PageController();
  int _currentPage = 0;

  // 4 pages total: 1 welcome page + 3 walkthrough steps.
  static const int _totalPages = 4;

  List<_WalkthroughStep> _steps(AppLocalizations l10n) => [
    _WalkthroughStep(
      icon: Icons.volunteer_activism,
      title: l10n.onboardingShareHabitTitle,
      description: l10n.onboardingShareHabitDescription,
    ),
    _WalkthroughStep(
      icon: Icons.account_tree,
      title: l10n.onboardingExploreAnnotateTitle,
      description: l10n.onboardingExploreAnnotateDescription,
    ),
    _WalkthroughStep(
      icon: Icons.lightbulb_outline,
      title: l10n.onboardingRecommendationsTitle,
      description: l10n.onboardingRecommendationsDescription,
    ),
  ];

  void _nextPage() {
    _pageController.nextPage(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _skipToLast() {
    _pageController.animateToPage(
      _totalPages - 1,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _onContinue() {
    context.go('/onboarding/consent');
  }

  void _onRestore() {
    context.push('/onboarding/restore');
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final steps = _steps(l10n);
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView(
                controller: _pageController,
                onPageChanged: (page) => setState(() => _currentPage = page),
                children: [
                  _WelcomePage(onGetStarted: _nextPage, onRestore: _onRestore),
                  for (var i = 0; i < steps.length; i++)
                    _WalkthroughPage(
                      step: steps[i],
                      isLast: i == steps.length - 1,
                      onNext: i == steps.length - 1 ? _onContinue : _nextPage,
                      onSkip: i == steps.length - 1 ? null : _skipToLast,
                    ),
                ],
              ),
            ),
            // Page indicator dots shown only during the walkthrough pages.
            if (_currentPage > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    steps.length,
                    (i) => AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: i == _currentPage - 1 ? 20 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: i == _currentPage - 1
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.outline,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Welcome (splash) page — page 0
// ---------------------------------------------------------------------------

class _WelcomePage extends StatelessWidget {
  final VoidCallback onGetStarted;
  final VoidCallback onRestore;

  const _WelcomePage({required this.onGetStarted, required this.onRestore});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final colors = context.appColors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: colors.greenLight,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: colors.primary.withAlpha(0x2E),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Icon(Icons.favorite, size: 44, color: colors.primary),
          ),
          const SizedBox(height: 28),
          Text(
            // appTitle is the app's brand name and is not translated; the
            // line break here is purely presentational.
            l10n.appTitle.replaceFirst(' ', '\n'),
            style: TextStyle(
              fontSize: 36,
              fontWeight: FontWeight.w900,
              color: colors.text,
              height: 1.1,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          Text(
            l10n.onboardingSubtitle,
            style: TextStyle(fontSize: 15, color: colors.muted, height: 1.55),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 40),
          FilledButton(
            onPressed: onGetStarted,
            child: Text(l10n.onboardingGetStarted),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: onRestore,
            child: Text(l10n.onboardingRestoreAccount),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Walkthrough page — pages 1–3
// ---------------------------------------------------------------------------

class _WalkthroughPage extends StatelessWidget {
  final _WalkthroughStep step;
  final bool isLast;
  final VoidCallback onNext;

  /// Null on the last page (no Skip shown there).
  final VoidCallback? onSkip;

  const _WalkthroughPage({
    required this.step,
    required this.isLast,
    required this.onNext,
    this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final colors = context.appColors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        children: [
          Align(
            alignment: Alignment.topRight,
            child: onSkip != null
                ? TextButton(
                    onPressed: onSkip,
                    child: Text(l10n.onboardingSkip),
                  )
                : const SizedBox(height: 40),
          ),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: colors.greenLight,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: colors.primary.withAlpha(0x2E),
                        blurRadius: 24,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Icon(step.icon, size: 44, color: colors.primary),
                ),
                const SizedBox(height: 32),
                Text(
                  step.title,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: colors.text,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                Text(
                  step.description,
                  style: TextStyle(
                    fontSize: 15,
                    color: colors.muted,
                    height: 1.55,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 32),
            child: FilledButton(
              onPressed: onNext,
              child: Text(
                isLast ? l10n.onboardingContinue : l10n.onboardingNext,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
