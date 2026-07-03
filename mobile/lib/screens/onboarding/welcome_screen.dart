import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

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

  static const List<_WalkthroughStep> _steps = [
    _WalkthroughStep(
      icon: Icons.volunteer_activism,
      title: 'Share a Habit',
      description:
          'Share your personal habits with researchers to help build a richer '
          'understanding of everyday behaviour. Your contributions are '
          'anonymised and used only for scientific research. Every habit you '
          'share makes the dataset more valuable for everyone.',
    ),
    _WalkthroughStep(
      icon: Icons.account_tree,
      title: 'Explore & Annotate',
      description:
          'Browse the interactive habit graph to discover how habits relate '
          'to each other across the community. You can annotate connections '
          'and add context to improve the shared knowledge base. The more you '
          'explore, the richer the graph becomes.',
    ),
    _WalkthroughStep(
      icon: Icons.lightbulb_outline,
      title: 'Get Recommendations',
      description:
          'Receive personalised habit recommendations based on your profile '
          'and the collective dataset. Our recommendation engine learns from '
          'community contributions to suggest habits that fit your lifestyle. '
          'Discover new habits that others with similar profiles have found '
          'helpful.',
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
                  _WelcomePage(
                    onGetStarted: _nextPage,
                    onRestore: _onRestore,
                  ),
                  for (var i = 0; i < _steps.length; i++)
                    _WalkthroughPage(
                      step: _steps[i],
                      isLast: i == _steps.length - 1,
                      onNext: i == _steps.length - 1 ? _onContinue : _nextPage,
                      onSkip: i == _steps.length - 1 ? null : _skipToLast,
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
                    _steps.length,
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

  const _WelcomePage({
    required this.onGetStarted,
    required this.onRestore,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              color: const Color(0xFFEDF7E5),
              borderRadius: BorderRadius.circular(24),
              boxShadow: const [BoxShadow(color: Color(0x2E45B700), blurRadius: 24, offset: Offset(0, 8))],
            ),
            child: const Icon(Icons.favorite, size: 44, color: Color(0xFF45B700)),
          ),
          const SizedBox(height: 28),
          const Text(
            'Health\nHabit Hub',
            style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Color(0xFF111827), height: 1.1),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          const Text(
            'A citizen-science platform where your habits help build a richer understanding of everyday behaviour.',
            style: TextStyle(fontSize: 15, color: Color(0xFF6B7280), height: 1.55),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 40),
          FilledButton(onPressed: onGetStarted, child: const Text('Get Started')),
          const SizedBox(height: 12),
          TextButton(onPressed: onRestore, child: const Text('Restore existing account')),
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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        children: [
          Align(
            alignment: Alignment.topRight,
            child: onSkip != null
                ? TextButton(onPressed: onSkip, child: const Text('Skip'))
                : const SizedBox(height: 40),
          ),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEDF7E5),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: const [BoxShadow(color: Color(0x2E45B700), blurRadius: 24, offset: Offset(0, 8))],
                  ),
                  child: Icon(step.icon, size: 44, color: const Color(0xFF45B700)),
                ),
                const SizedBox(height: 32),
                Text(
                  step.title,
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Color(0xFF111827)),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                Text(
                  step.description,
                  style: const TextStyle(fontSize: 15, color: Color(0xFF6B7280), height: 1.55),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 32),
            child: FilledButton(
              onPressed: onNext,
              child: Text(isLast ? 'Continue' : 'Next'),
            ),
          ),
        ],
      ),
    );
  }
}
