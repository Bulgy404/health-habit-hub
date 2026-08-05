/// Shared motion vocabulary for the app, translating Apple's "Designing
/// Fluid Interfaces" spring parameters (damping ratio + response) onto
/// Flutter's native [SpringSimulation] — no third-party physics package
/// needed. Use [AppSpring.standard] for state-driven UI motion and
/// [AppSpring.momentum] only for motion that follows a drag/flick release.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

/// A spring described the way Apple's design tools describe it — damping
/// ratio and response time — rather than raw mass/stiffness/damping.
class AppSpring {
  const AppSpring({required this.damping, required this.response});

  /// 1.0 = critically damped (settles with no overshoot). Lower values
  /// overshoot and oscillate; only use those for momentum-driven motion.
  final double damping;

  /// How quickly the spring approaches its target, in seconds. Not a fixed
  /// duration — the actual settle time emerges from damping + response.
  final double response;

  /// Critically damped default for state-driven UI motion (selection,
  /// reveal, sheet/dialog open, tab switch) — graceful, no overshoot.
  static const standard = AppSpring(damping: 1.0, response: 0.35);

  /// Critically damped, fast response — for high-frequency or
  /// press-adjacent feedback (button press scale, a habit-log checkbox
  /// tapped tens of times/day) where [standard]'s ~0.35s response reads as
  /// sluggish. Settles in roughly the 100–160ms button-press-feedback
  /// window instead of [standard]'s reveal/sheet-grade timing.
  static const quick = AppSpring(damping: 1.0, response: 0.15);

  /// Slight overshoot (damping ~0.8), reserved for motion that continues a
  /// gesture that already carried momentum — a flick, a drag release. Do
  /// not use this for anything that just appears without a preceding
  /// gesture (see apple-design skill: overshoot on a plain fade-in feels
  /// wrong; overshoot on a flicked element feels right).
  static const momentum = AppSpring(damping: 0.8, response: 0.35);

  SpringDescription toDescription({double mass = 1.0}) {
    final angularFrequency = 2 * math.pi / response;
    final stiffness = mass * angularFrequency * angularFrequency;
    final dampingCoefficient = damping * 2 * math.sqrt(mass * stiffness);
    return SpringDescription(
      mass: mass,
      stiffness: stiffness,
      damping: dampingCoefficient,
    );
  }
}

/// Drives an [AnimationController] with an [AppSpring] instead of a fixed
/// [Curve] + [Duration].
extension SpringAnimationController on AnimationController {
  /// Animates from the controller's *current* (presentation) value to
  /// [target] — never from the target itself, so an animation interrupted
  /// mid-flight retargets smoothly instead of jumping. Pass the gesture's
  /// release [velocity] to carry it through the retarget rather than
  /// hard-cutting it (avoids the "brick wall" reversal the apple-design
  /// skill warns about).
  TickerFuture animateWithSpring(
    double target, {
    AppSpring spring = AppSpring.standard,
    double velocity = 0,
  }) {
    final simulation = SpringSimulation(
      spring.toDescription(),
      value,
      target,
      velocity,
    );
    return animateWith(simulation);
  }
}

/// Whether the platform's reduced-motion accessibility setting is enabled.
/// Gate infinite/looping animations and large slide/spring transitions on
/// this; swap them for a short opacity cross-fade rather than removing
/// feedback entirely (reduced motion isn't *no* motion).
bool reducedMotion(BuildContext context) =>
    MediaQuery.of(context).disableAnimations;

/// Shared `BoxShadow` recipes, consolidating what used to be near-identical
/// `_kCardShadow`/`_kGreenGlow` constants duplicated across
/// `donate_screen.dart`, `donate_form_widget.dart`, `settings_card.dart`, and
/// `user_settings_screen.dart`. Flat cards don't need `BackdropFilter` blur
/// (that's reserved for floating chrome like sheet/dialog scrims) — depth
/// here comes entirely from these hand-authored shadows.
class AppShadows {
  const AppShadows._();

  /// Soft neutral drop shadow used under ordinary cards.
  static const card = [
    BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
  ];

  /// Brand-green glow used behind the donate screen's hero/progress card and
  /// the settings screen's highlighted item.
  static const greenGlow = [
    BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8)),
  ];
}

/// Size-correlated tracking (letter-spacing) for small uppercase
/// labels/eyebrows, replacing ad hoc per-widget magic numbers (this app had
/// both `letterSpacing: 1` and `letterSpacing: 0.8` for the same visual
/// role in different screens). Roughly 8% of the font size, matching the
/// app's existing 10–13px label sizes.
double trackingForLabel(double fontSize) => fontSize * 0.08;

/// Wraps [child] so it scales down instantly on press and springs back on
/// release/cancel. Use for custom tappables (pill CTAs, option chips over a
/// colored fill) where a Material [InkWell] ripple isn't the right visual
/// language but bare [GestureDetector] leaves zero feedback until the tap
/// completes.
class PressableScale extends StatefulWidget {
  const PressableScale({
    super.key,
    required this.child,
    required this.onTap,
    this.scale = 0.97,
  });

  final Widget child;
  final VoidCallback onTap;

  /// How much the child shrinks while pressed (1.0 = no shrink).
  final double scale;

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, value: 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _setPressed(bool pressed) {
    // AppSpring.quick, not .standard — press feedback needs to feel instant
    // (100–160ms per the animation-review standards), not reveal-paced.
    _controller.animateWithSpring(pressed ? 1 : 0, spring: AppSpring.quick);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final scale = 1.0 - _controller.value * (1 - widget.scale);
          return Transform.scale(scale: scale, child: child);
        },
        child: widget.child,
      ),
    );
  }
}
