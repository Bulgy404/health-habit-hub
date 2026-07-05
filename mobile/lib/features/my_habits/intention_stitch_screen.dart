/// Animated "stitching" step: calls the LLM to weave the cue(s) + action into
/// one implementation intention, keeping the user engaged while it runs, then
/// reveals the result with a short, evidence-based explainer.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
import '../../services/study_config_service.dart';
import 'habit_onboarding_widgets.dart';
import 'my_habits_models.dart';

/// Minimum time the animation is shown so a fast (or cached) response does not
/// flash past — the reveal should feel calm and intentional.
const _minAnimationDuration = Duration(milliseconds: 3600);

/// Full-screen animated intermediate step between cues and confirmation.
class IntentionStitchScreen extends ConsumerStatefulWidget {
  /// Creates an [IntentionStitchScreen].
  const IntentionStitchScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    required this.cues,
    super.key,
  });

  /// The selected behaviour key.
  final String behaviorKey;

  /// Human-readable behaviour label.
  final String behaviorLabel;

  /// Resolved habit configuration.
  final HabitConfig config;

  /// Cues entered/assigned in the previous step.
  final List<IntentionCue> cues;

  @override
  ConsumerState<IntentionStitchScreen> createState() =>
      _IntentionStitchScreenState();
}

class _IntentionStitchScreenState extends ConsumerState<IntentionStitchScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  Timer? _messageTimer;
  int _messageIndex = 0;
  bool _revealed = false;
  String? _sentence;

  static const _messagesEn = [
    'Bringing your cue and habit together…',
    'Forming your plan…',
    'Almost ready…',
  ];
  static const _messagesDe = [
    'Auslöser und Gewohnheit werden verbunden…',
    'Dein Plan entsteht…',
    'Gleich fertig…',
  ];
  static const _messagesJa = ['きっかけと習慣をつなげています…', 'プランを作成中…', 'もうすぐ完成…'];

  @override
  void initState() {
    super.initState();
    // Slow, continuous flow (3s per cycle) so the joining animation feels calm
    // rather than frantic.
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3000),
    )..repeat();
    // Messages change gently, well spaced apart (~2.6s), matching the calm
    // cadence of the recommender's waiting screen.
    _messageTimer = Timer.periodic(const Duration(milliseconds: 2600), (_) {
      if (!mounted) return;
      setState(() {
        // Advance but hold on the final message so it doesn't loop distractingly.
        if (_messageIndex < _messagesEn.length - 1) _messageIndex++;
      });
    });
    _runStitch();
  }

  @override
  void dispose() {
    _messageTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  String _localFallbackSentence() {
    final cueText = widget.cues.map((c) => c.text).join(', ');
    return '$cueText, I will ${widget.behaviorLabel.toLowerCase()}.';
  }

  Future<void> _runStitch() async {
    final lang = ref.read(localeProvider).languageCode;
    final started = DateTime.now();

    String? stitched;
    try {
      stitched = await ref
          .read(studyConfigServiceProvider)
          .stitchIntention(
            action: widget.behaviorLabel,
            cues: widget.cues.map((c) => c.text).toList(),
            language: lang,
          );
    } catch (_) {
      stitched = null;
    }

    // Enforce the minimum on-screen animation time.
    final elapsed = DateTime.now().difference(started);
    if (elapsed < _minAnimationDuration) {
      await Future<void>.delayed(_minAnimationDuration - elapsed);
    }
    if (!mounted) return;

    _controller.stop();
    setState(() {
      _sentence = (stitched != null && stitched.trim().isNotEmpty)
          ? stitched.trim()
          : _localFallbackSentence();
      _revealed = true;
    });
  }

  void _continue() {
    context.pushReplacement(
      '/habits/new/confirm',
      extra: <String, dynamic>{
        'behaviorKey': widget.behaviorKey,
        'behaviorLabel': widget.behaviorLabel,
        'config': widget.config,
        'cues': widget.cues,
        'stitchedSentence': _sentence,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 400),
          child: _revealed ? _buildReveal(context) : _buildLoading(context),
        ),
      ),
    );
  }

  Widget _buildLoading(BuildContext context) {
    final lang = ref.watch(localeProvider).languageCode;
    final messages = switch (lang) {
      'de' => _messagesDe,
      'ja' => _messagesJa,
      _ => _messagesEn,
    };
    final scheme = Theme.of(context).colorScheme;
    final cueLabel = switch (lang) {
      'de' => 'Auslöser',
      'ja' => 'きっかけ',
      _ => 'Cue',
    };
    final habitLabel = switch (lang) {
      'de' => 'Gewohnheit',
      'ja' => '習慣',
      _ => 'Habit',
    };
    return Center(
      key: const ValueKey('loading'),
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Two orbs — the cue and the habit — gently flowing together and
            // merging in the middle.
            SizedBox(
              height: 150,
              width: double.infinity,
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) => CustomPaint(
                  painter: _JoiningPainter(
                    progress: _controller.value,
                    color: scheme.primary,
                    leftLabel: cueLabel,
                    rightLabel: habitLabel,
                    labelColor: scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 36),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 600),
              child: Text(
                messages[_messageIndex],
                key: ValueKey(_messageIndex),
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(color: scheme.onSurface),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 28),
            _ProgressDots(
              count: _messagesEn.length,
              active: _messageIndex,
              color: scheme.primary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReveal(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final lang = ref.watch(localeProvider).languageCode;
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      key: const ValueKey('reveal'),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),
                  Icon(Icons.check_circle, color: scheme.primary, size: 44),
                  const SizedBox(height: 16),
                  Text(
                    HabitOnboardingCopy.intentionRevealTitleFor(lang),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Card(
                    color: const Color(0xFFEDF7E5),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Text(
                        _sentence ?? '',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w600,
                              height: 1.5,
                            ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    HabitOnboardingCopy.intentionExplainerFor(lang),
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(height: 1.5),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    HabitOnboardingCopy.intentionCitationFor(lang),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontStyle: FontStyle.italic,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _continue,
              child: Text(l10n.continueButton),
            ),
          ),
        ],
      ),
    );
  }
}

/// Paints two orbs — the cue and the habit — with particles flowing from each
/// toward a pulsing point in the middle, conveying the two being joined into
/// one implementation intention.
class _JoiningPainter extends CustomPainter {
  _JoiningPainter({
    required this.progress,
    required this.color,
    required this.leftLabel,
    required this.rightLabel,
    required this.labelColor,
  });

  final double progress; // 0..1, continuously repeating
  final Color color;
  final String leftLabel;
  final String rightLabel;
  final Color labelColor;

  @override
  void paint(Canvas canvas, Size size) {
    final cy = size.height * 0.42;
    final left = Offset(size.width * 0.25, cy);
    final right = Offset(size.width * 0.75, cy);
    final center = Offset(size.width * 0.5, cy);
    const orbRadius = 16.0;

    // Gentle breathing derived from the continuous progress.
    final breathe = 0.5 - 0.5 * math.cos(progress * 2 * math.pi);

    // ── Connecting line ──────────────────────────────────────────────
    final linePaint = Paint()
      ..color = color.withValues(alpha: 0.18)
      ..strokeWidth = 2;
    canvas.drawLine(left, right, linePaint);

    // ── Flowing particles from each orb toward the centre ────────────
    const particles = 3;
    for (var k = 0; k < particles; k++) {
      final t = (progress + k / particles) % 1.0;
      final fade = (1.0 - t).clamp(0.0, 1.0);
      final pLeft = Offset.lerp(left, center, t)!;
      final pRight = Offset.lerp(right, center, t)!;
      final pPaint = Paint()..color = color.withValues(alpha: 0.5 * fade);
      canvas.drawCircle(pLeft, 3.5 * fade + 1, pPaint);
      canvas.drawCircle(pRight, 3.5 * fade + 1, pPaint);
    }

    // ── Central "joining" glow ───────────────────────────────────────
    canvas.drawCircle(
      center,
      8 + breathe * 7,
      Paint()..color = color.withValues(alpha: 0.15 + 0.25 * breathe),
    );
    canvas.drawCircle(
      center,
      4 + breathe * 2,
      Paint()..color = color.withValues(alpha: 0.6 + 0.4 * breathe),
    );

    // ── The two orbs (cue + habit) ───────────────────────────────────
    for (final c in [left, right]) {
      canvas.drawCircle(
        c,
        orbRadius + 4 + breathe * 3,
        Paint()..color = color.withValues(alpha: 0.10),
      );
      canvas.drawCircle(c, orbRadius, Paint()..color = color);
    }

    // ── Labels under each orb ────────────────────────────────────────
    _drawLabel(canvas, leftLabel, Offset(left.dx, cy + orbRadius + 12));
    _drawLabel(canvas, rightLabel, Offset(right.dx, cy + orbRadius + 12));
  }

  void _drawLabel(Canvas canvas, String text, Offset topCenter) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: labelColor,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(topCenter.dx - tp.width / 2, topCenter.dy));
  }

  @override
  bool shouldRepaint(covariant _JoiningPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.color != color ||
      oldDelegate.leftLabel != leftLabel ||
      oldDelegate.rightLabel != rightLabel;
}

/// Small row of progress dots mirroring the recommender waiting screen.
class _ProgressDots extends StatelessWidget {
  const _ProgressDots({
    required this.count,
    required this.active,
    required this.color,
  });

  final int count;
  final int active;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(count, (i) {
        final isActive = i == active;
        final isDone = i < active;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: isActive ? 14 : 8,
          height: 8,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            color: (isDone || isActive) ? color : color.withValues(alpha: 0.25),
          ),
        );
      }),
    );
  }
}
