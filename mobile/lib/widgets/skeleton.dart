/// Reusable loading-skeleton primitives.
///
/// Skeletons read as "faster" than a spinner because they preview the shape
/// of the content that's about to appear instead of an indeterminate wait.
library;

import 'package:flutter/material.dart';

/// A single pulsing placeholder block. Compose these to build skeleton
/// layouts that mirror the real content's shape.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius = 8,
  });

  final double? width;
  final double height;
  final double borderRadius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _opacity = Tween<double>(
      begin: 0.4,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final baseColor = Theme.of(context).colorScheme.onSurface.withAlpha(20);
    return FadeTransition(
      opacity: _opacity,
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: baseColor,
          borderRadius: BorderRadius.circular(widget.borderRadius),
        ),
      ),
    );
  }
}

/// A skeleton placeholder shaped like a [_HabitCard] in `my_habits_screen.dart`.
class HabitCardSkeleton extends StatelessWidget {
  const HabitCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SkeletonBox(width: 180, height: 18),
            const SizedBox(height: 8),
            const SkeletonBox(width: 240, height: 13),
            const SizedBox(height: 16),
            SkeletonBox(width: double.infinity, height: 32),
          ],
        ),
      ),
    );
  }
}

/// A short list of [HabitCardSkeleton]s used while the habits list loads.
class HabitListSkeleton extends StatelessWidget {
  const HabitListSkeleton({super.key, this.count = 3});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(count, (_) => const HabitCardSkeleton()),
    );
  }
}
