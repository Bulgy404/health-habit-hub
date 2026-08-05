/// Shared "fade + slide up" entrance animation, used to stagger a list of
/// items appearing one at a time rather than all at once — e.g. the About
/// page's data-flow diagram sources, or a skeleton loader's placeholder
/// cards building up gradually while a request is in flight.
library;

import 'package:flutter/material.dart';

/// Fades and slides [child] in once, over [animation]'s [interval] slice.
/// Give each item in a list its own [Interval] (e.g. `Interval(i * 0.3,
/// i * 0.3 + 0.5)`) to stagger their entrance by index.
///
/// [animation] is owned by the caller, not by this widget — drive it with
/// `AnimationController(vsync: this)..animateWithSpring(1)` (see
/// `theme/motion.dart`) rather than `.forward()` on a fixed-duration
/// [AnimationController], so the whole staggered group settles with the
/// app's standard spring instead of a linear ease curve.
class EntranceFade extends StatelessWidget {
  const EntranceFade({
    super.key,
    required this.animation,
    required this.interval,
    required this.child,
  });

  final Animation<double> animation;
  final Interval interval;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final curved = CurvedAnimation(parent: animation, curve: interval);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.15),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}
