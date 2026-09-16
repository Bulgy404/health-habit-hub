import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../analytics/analytics_service.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/motion.dart';
import '../../widgets/entrance_fade.dart';
import '../../widgets/skeleton.dart';
import 'recommendation_feature_service.dart';
import 'recommendation_models.dart';
import 'results_screen.dart';

// ---------------------------------------------------------------------------
// Phase descriptor
// ---------------------------------------------------------------------------

/// Number of phase labels the rotating heading cycles through. Kept
/// independent of the localized strings below so the cycling logic never
/// needs `context`.
const _phaseCount = 4;

/// How long each phase label stays on screen before rotating to the next —
/// looping indefinitely, not stopping after one pass. The old version waited
/// a fixed 4 × 2s = 8s regardless of how long the actual recommend call
/// took, then sat stalled on the last phase for however much longer the API
/// needed — looking broken on a slow call and rushed on a fast one. The
/// label rotation and the skeleton pulse below are both now driven purely by
/// how long the request actually takes.
const _phaseDuration = Duration(milliseconds: 2500);

/// Matches the backend's `_MAX_RECOMMENDATIONS` cap (recommend.py) — the
/// skeleton previews exactly as many cards as can actually come back.
const _skeletonCardCount = 3;

/// How long the one-time staggered build-up of the skeleton cards takes —
/// they appear one at a time, not all at once, while the request is still
/// in flight; once built, they just sit there pulsing for the rest of the
/// wait. Deliberately a fixed duration, not a spring: this paces an
/// `Interval`-sliced staggered reveal across a known timeline, which a
/// spring's emergent settle time can't reliably reproduce (an
/// animation-review pass caught an earlier version of this using
/// `animateWithSpring`, which collapsed the whole staggered build-up to a
/// few hundred ms).
const _skeletonBuildDuration = Duration(milliseconds: 2200);

/// Floor under the total time this screen is shown. At least
/// [_skeletonBuildDuration] plus a short settle, so a near-instant response
/// (e.g. a cache hit) can never cut the staggered card build-up off
/// mid-animation — the user always sees all three cards finish appearing.
const _minDisplayDuration = Duration(milliseconds: 2600);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/// Loading screen shown while the recommendation API call runs in the
/// background: a rotating status label above a green-tinted pulsing
/// skeleton previewing the shape of the results screen's cards.
class RecommendationLoadingScreen extends ConsumerStatefulWidget {
  /// The user's health goal passed from [GoalInputScreen].
  final String goal;

  /// Creates a [RecommendationLoadingScreen] for [goal].
  const RecommendationLoadingScreen({super.key, required this.goal});

  @override
  ConsumerState<RecommendationLoadingScreen> createState() =>
      _RecommendationLoadingScreenState();
}

class _RecommendationLoadingScreenState
    extends ConsumerState<RecommendationLoadingScreen>
    with TickerProviderStateMixin {
  int _phaseIndex = 0;
  late final AnimationController _labelFade;
  late final AnimationController _skeletonBuild;
  Timer? _phaseTimer;
  final _startedAt = DateTime.now();

  // Holds the API result (null while in-flight, error or response when done)
  RecommendationResponse? _response;
  String? _error;

  @override
  void initState() {
    super.initState();
    _labelFade = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
      value: 1,
    );
    _skeletonBuild = AnimationController(
      vsync: this,
      duration: _skeletonBuildDuration,
    )..forward();
    _phaseTimer = Timer.periodic(_phaseDuration, (_) => _advancePhase());
    _startApiCall();
  }

  Future<void> _advancePhase() async {
    if (!mounted) return;
    // §1.7 — the rotation itself is informational (it tracks real request
    // progress), so the Timer.periodic driving it keeps running under
    // reduced motion; only the decorative fade transition is dropped in
    // favor of a plain instant text swap.
    if (reducedMotion(context)) {
      setState(() => _phaseIndex = (_phaseIndex + 1) % _phaseCount);
      return;
    }
    await _labelFade.animateWithSpring(0);
    if (!mounted) return;
    setState(() => _phaseIndex = (_phaseIndex + 1) % _phaseCount);
    await _labelFade.animateWithSpring(1);
  }

  // ---------------------------------------------------------------------------
  // API call (fires immediately, result stored when complete)
  // ---------------------------------------------------------------------------

  Future<void> _startApiCall() async {
    try {
      unawaited(
        ref.read(analyticsProvider).capture('recommendation_requested'),
      );
      final userId = await ref.read(userIdProvider.future);
      if (userId == null) {
        // No token available right now — surface this like any other
        // failure rather than clearing the session. The session is only
        // ever cleared by an explicit user action (Settings -> Sign out).
        if (mounted) {
          _error = AppLocalizations.of(
            context,
          )!.recommendationLoadingGenericError;
        }
        return;
      }
      final service = ref.read(recommendationFeatureServiceProvider);
      final response = await service.generateRecommendations(
        userId: userId,
        goal: widget.goal,
        sessionId: DateTime.now().millisecondsSinceEpoch.toString(),
      );
      _response = response;
      unawaited(
        ref.read(analyticsProvider).capture('recommendation_viewed', {
          'recommendation_id': response.recommendationId,
          'count': response.recommendations.length,
        }),
      );
    } catch (e) {
      if (mounted) _error = _friendlyErrorMessage(e);
    } finally {
      await _finishAndNavigate();
    }
  }

  /// Extracts the server's message from an error, falling back to a generic
  /// one. A 422 carries the guard's refusal reason (e.g. "Only health-related
  /// goals are supported.") in `detail`, which the user should see verbatim.
  String _friendlyErrorMessage(Object e) {
    final l10n = AppLocalizations.of(context)!;
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final detail = data['detail'] ?? data['error'];
        if (detail is String && detail.trim().isNotEmpty) return detail;
      }
      final code = e.response?.statusCode;
      if (code == 504 || e.type == DioExceptionType.receiveTimeout) {
        return l10n.recommendationLoadingTimeoutError;
      }
    }
    return l10n.recommendationLoadingGenericError;
  }

  Future<void> _finishAndNavigate() async {
    final elapsed = DateTime.now().difference(_startedAt);
    final remaining = _minDisplayDuration - elapsed;
    if (remaining > Duration.zero) await Future.delayed(remaining);
    if (!mounted) return;
    _phaseTimer?.cancel();
    _navigate();
  }

  void _navigate() {
    if (_error != null) {
      // Navigate to results screen which shows the error
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => RecommendationResultsScreen(
            goal: widget.goal,
            response: null,
            error: _error,
          ),
        ),
      );
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => RecommendationResultsScreen(
            goal: widget.goal,
            response: _response,
          ),
        ),
      );
    }
  }

  @override
  void dispose() {
    _phaseTimer?.cancel();
    _labelFade.dispose();
    _skeletonBuild.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final phaseLabels = [
      l10n.recommendationLoadingPhaseCommunity,
      l10n.recommendationLoadingPhaseHistory,
      l10n.recommendationLoadingPhaseResearch,
      l10n.recommendationLoadingPhaseGenerating,
    ];

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 32),
            FadeTransition(
              opacity: _labelFade,
              child: Text(
                phaseLabels[_phaseIndex],
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              child: ListView(
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (var i = 0; i < _skeletonCardCount; i++)
                    EntranceFade(
                      animation: _skeletonBuild,
                      interval: Interval(
                        (i * 0.32).clamp(0.0, 1.0),
                        (i * 0.32 + 0.5).clamp(0.0, 1.0),
                        curve: Curves.easeOut,
                      ),
                      child: const _RecommendationCardSkeleton(),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Skeleton preview of the results screen's recommendation cards
// ---------------------------------------------------------------------------

/// Mirrors `_RecommendationCard` in results_screen.dart (title, body lines,
/// rationale, action button) so the loading state previews the shape of
/// what's about to appear, tinted green via [SkeletonBox]'s `color`.
class _RecommendationCardSkeleton extends StatelessWidget {
  const _RecommendationCardSkeleton();

  @override
  Widget build(BuildContext context) {
    final green = context.appColors.primary;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonBox(width: 180, height: 18, color: green),
            const SizedBox(height: 12),
            SkeletonBox(width: double.infinity, height: 13, color: green),
            const SizedBox(height: 6),
            SkeletonBox(width: double.infinity, height: 13, color: green),
            const SizedBox(height: 6),
            SkeletonBox(width: 220, height: 13, color: green),
            const SizedBox(height: 16),
            SkeletonBox(width: 90, height: 11, color: green),
            const SizedBox(height: 6),
            SkeletonBox(width: double.infinity, height: 12, color: green),
            const SizedBox(height: 16),
            SkeletonBox(
              width: double.infinity,
              height: 40,
              borderRadius: 100,
              color: green,
            ),
          ],
        ),
      ),
    );
  }
}
