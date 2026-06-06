import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/auth_provider.dart';
import 'recommendation_feature_service.dart';
import 'recommendation_models.dart';
import 'results_screen.dart';

// ---------------------------------------------------------------------------
// Phase descriptor
// ---------------------------------------------------------------------------

class _Phase {
  final String label;
  final IconData icon;

  const _Phase({required this.label, required this.icon});
}

const _phases = [
  _Phase(label: 'Asking experts\u2026', icon: Icons.menu_book),
  _Phase(
    label: 'Looking through your habits database\u2026',
    icon: Icons.hub,
  ),
  _Phase(label: 'Reading academic papers\u2026', icon: Icons.article),
  _Phase(
    label: 'Generating your personalised recommendations\u2026',
    icon: Icons.auto_awesome,
  ),
];

const _minPhaseDuration = Duration(seconds: 2);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/// Animated loading screen that cycles through four phases while the
/// recommendation API call runs in the background.
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

  // Animation controllers
  late AnimationController _iconPulse;
  late AnimationController _labelFade;

  // Holds the API result (null while in-flight, error or response when done)
  RecommendationResponse? _response;
  Object? _error;
  bool _apiDone = false;

  @override
  void initState() {
    super.initState();
    _iconPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _labelFade = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
      value: 1,
    );

    _startApiCall();
    _runPhases();
  }

  // ---------------------------------------------------------------------------
  // API call (fires immediately, result stored when complete)
  // ---------------------------------------------------------------------------

  Future<void> _startApiCall() async {
    try {
      final userId = await ref.read(userIdProvider.future);
      if (userId == null) {
        // No valid token — logout clears credentials; GoRouter will redirect
        // to the welcome screen automatically via the auth state listener.
        if (mounted) await ref.read(authServiceProvider).logout();
        return;
      }
      final service = ref.read(recommendationFeatureServiceProvider);
      final response = await service.generateRecommendations(
        userId: userId,
        goal: widget.goal,
        sessionId: DateTime.now().millisecondsSinceEpoch.toString(),
      );
      if (mounted) setState(() => _response = response);
    } catch (e) {
      // 401/403 errors: the AuthInterceptor called getAccessToken() which
      // attempted reauthentication. If that failed, logout() was already
      // called and GoRouter redirects automatically.
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _apiDone = true);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase cycling — each phase lasts at least _minPhaseDuration
  // ---------------------------------------------------------------------------

  Future<void> _runPhases() async {
    for (var i = 0; i < _phases.length; i++) {
      if (!mounted) return;
      final phaseStart = DateTime.now();

      if (i > 0) {
        // Fade out then in for the label transition
        await _labelFade.reverse();
        if (mounted) setState(() => _phaseIndex = i);
        await _labelFade.forward();
      }

      // Wait for the minimum phase time
      final elapsed = DateTime.now().difference(phaseStart);
      final remaining = _minPhaseDuration - elapsed;
      if (remaining > Duration.zero) {
        await Future.delayed(remaining);
      }
    }

    // All phases done — wait for API if still in-flight
    while (!_apiDone && mounted) {
      await Future.delayed(const Duration(milliseconds: 100));
    }

    if (!mounted) return;
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
            error: _error.toString(),
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
    _iconPulse.dispose();
    _labelFade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final phase = _phases[_phaseIndex];
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Phase-specific widget
                SizedBox(
                  height: 120,
                  child: _PhaseWidget(
                    phaseIndex: _phaseIndex,
                    pulseController: _iconPulse,
                  ),
                ),
                const SizedBox(height: 32),
                // Phase label
                FadeTransition(
                  opacity: _labelFade,
                  child: Text(
                    phase.label,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: colorScheme.onSurface,
                        ),
                  ),
                ),
                const SizedBox(height: 24),
                // Progress dots
                _PhaseDots(
                  total: _phases.length,
                  current: _phaseIndex,
                  color: colorScheme.primary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Phase widget — renders different animation per phase
// ---------------------------------------------------------------------------

class _PhaseWidget extends StatelessWidget {
  final int phaseIndex;
  final AnimationController pulseController;

  const _PhaseWidget({
    required this.phaseIndex,
    required this.pulseController,
  });

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    switch (phaseIndex) {
      case 0:
        // Book icon — gentle pulse
        return AnimatedBuilder(
          animation: pulseController,
          builder: (context, _) => Transform.scale(
            scale: 1.0 + pulseController.value * 0.12,
            child: Icon(Icons.menu_book, size: 80, color: color),
          ),
        );
      case 1:
        // Force-directed graph (simple animated nodes)
        return _ForceDirectedGraph(controller: pulseController, color: color);
      case 2:
        // Document with scanning line
        return _ScanningDocument(controller: pulseController, color: color);
      case 3:
        // Pulsing sparkle / brain icon
        return AnimatedBuilder(
          animation: pulseController,
          builder: (context, _) => Transform.scale(
            scale: 1.0 + pulseController.value * 0.18,
            child: Icon(Icons.auto_awesome, size: 80, color: color),
          ),
        );
      default:
        return Icon(Icons.hourglass_empty, size: 80, color: color);
    }
  }
}

// ---------------------------------------------------------------------------
// Force-directed graph animation (phase 2)
// ---------------------------------------------------------------------------

class _ForceDirectedGraph extends StatelessWidget {
  final AnimationController controller;
  final Color color;

  const _ForceDirectedGraph({
    required this.controller,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return CustomPaint(
          size: const Size(120, 120),
          painter: _GraphPainter(
            animValue: controller.value,
            color: color,
          ),
        );
      },
    );
  }
}

class _GraphPainter extends CustomPainter {
  final double animValue;
  final Color color;

  _GraphPainter({required this.animValue, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final r = math.min(cx, cy) * 0.8;

    // 7 nodes: 1 center + 6 around
    final nodes = <Offset>[
      Offset(cx, cy),
      ...List.generate(6, (i) {
        final angle = (i / 6) * 2 * math.pi + animValue * 0.4;
        return Offset(
          cx + r * math.cos(angle),
          cy + r * math.sin(angle),
        );
      }),
    ];

    final linePaint = Paint()
      ..color = color.withAlpha((60 + (animValue * 40).round()))
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;
    final nodePaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    // Draw edges from center to all outer nodes and between adjacent outer nodes
    for (var i = 1; i < nodes.length; i++) {
      canvas.drawLine(nodes[0], nodes[i], linePaint);
    }
    for (var i = 1; i < nodes.length; i++) {
      final j = i % (nodes.length - 1) + 1;
      canvas.drawLine(nodes[i], nodes[j], linePaint);
    }

    // Draw nodes
    for (var i = 0; i < nodes.length; i++) {
      final radius = i == 0 ? 6.0 : 4.0 + animValue * 2;
      canvas.drawCircle(nodes[i], radius, nodePaint);
    }
  }

  @override
  bool shouldRepaint(_GraphPainter old) =>
      old.animValue != animValue || old.color != color;
}

// ---------------------------------------------------------------------------
// Scanning document animation (phase 3)
// ---------------------------------------------------------------------------

class _ScanningDocument extends StatelessWidget {
  final AnimationController controller;
  final Color color;

  const _ScanningDocument({
    required this.controller,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return CustomPaint(
          size: const Size(90, 110),
          painter: _DocumentPainter(
            scanProgress: controller.value,
            color: color,
          ),
        );
      },
    );
  }
}

class _DocumentPainter extends CustomPainter {
  final double scanProgress;
  final Color color;

  _DocumentPainter({required this.scanProgress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final docPaint = Paint()
      ..color = color.withAlpha(30)
      ..style = PaintingStyle.fill;
    final outlinePaint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final linePaint = Paint()
      ..color = color.withAlpha(80)
      ..strokeWidth = 1.5;
    final scanPaint = Paint()
      ..color = color.withAlpha(200)
      ..strokeWidth = 2.5;

    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, size.width, size.height),
      const Radius.circular(4),
    );

    canvas.drawRRect(rect, docPaint);
    canvas.drawRRect(rect, outlinePaint);

    // Text lines
    final lineCount = 5;
    for (var i = 0; i < lineCount; i++) {
      final y = 20.0 + i * 16;
      final lineWidth = i == lineCount - 1 ? size.width * 0.55 : size.width - 20;
      canvas.drawLine(Offset(10, y), Offset(lineWidth, y), linePaint);
    }

    // Scanning line
    final scanY = scanProgress * size.height;
    canvas.drawLine(Offset(0, scanY), Offset(size.width, scanY), scanPaint);
  }

  @override
  bool shouldRepaint(_DocumentPainter old) =>
      old.scanProgress != scanProgress || old.color != color;
}

// ---------------------------------------------------------------------------
// Progress dots
// ---------------------------------------------------------------------------

class _PhaseDots extends StatelessWidget {
  final int total;
  final int current;
  final Color color;

  const _PhaseDots({
    required this.total,
    required this.current,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(total, (i) {
        final active = i == current;
        final done = i < current;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: active ? 14 : 8,
          height: 8,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            color: done || active ? color : color.withAlpha(60),
          ),
        );
      }),
    );
  }
}
