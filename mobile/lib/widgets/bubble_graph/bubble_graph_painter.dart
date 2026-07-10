/// Individual bubble chip widget with pulse animation.
///
/// [BubbleChipWidget] renders a single [BubbleNode] as a circular chip and
/// plays a scale-and-glow entrance animation when [BubbleNode.pulse] is true.
library;

import 'package:flutter/material.dart';

import 'bubble_graph_data.dart';

/// A single animated bubble chip used by the bubble graph canvas.
///
/// Handles its own pulse animation lifecycle via [SingleTickerProviderStateMixin].
class BubbleChipWidget extends StatefulWidget {
  /// The bubble data to render.
  final BubbleNode bubble;

  /// Called when the chip is tapped.
  final VoidCallback onTap;

  /// Called with a pan delta when the user drags the chip.
  final void Function(Offset delta) onDrag;

  /// Creates a [BubbleChipWidget].
  const BubbleChipWidget({
    super.key,
    required this.bubble,
    required this.onTap,
    required this.onDrag,
  });

  @override
  State<BubbleChipWidget> createState() => _BubbleChipWidgetState();
}

class _BubbleChipWidgetState extends State<BubbleChipWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final Animation<double> _scaleAnim;
  late final Animation<double> _glowAnim;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _scaleAnim = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 1.12,
        ).chain(CurveTween(curve: Curves.easeOutCubic)),
        weight: 55,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.12,
          end: 1.0,
        ).chain(CurveTween(curve: Curves.easeInOutCubic)),
        weight: 45,
      ),
    ]).animate(_pulseController);
    _glowAnim = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeOutCubic,
    );
    if (widget.bubble.pulse) _pulseController.forward(from: 0);
  }

  @override
  void didUpdateWidget(covariant BubbleChipWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.bubble.pulse && widget.bubble.pulse) {
      _pulseController.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bubble = widget.bubble;
    final r = bubble.radius;
    final fontSize = (r * 0.28).clamp(8.0, 15.0);
    final subSize = (r * 0.22).clamp(7.0, 12.0);

    final semanticLabel = bubble.sublabel == null
        ? bubble.label
        : '${bubble.label}, ${bubble.sublabel}';

    return Semantics(
      label: semanticLabel,
      button: true,
      excludeSemantics: true,
      onTap: widget.onTap,
      child: GestureDetector(
        onTap: widget.onTap,
        onPanUpdate: (details) => widget.onDrag(details.delta),
        child: AnimatedBuilder(
          animation: _pulseController,
          builder: (context, child) {
            final glowBoost = bubble.pulse ? _glowAnim.value : 0.0;
            return Transform.scale(
              scale: bubble.pulse ? _scaleAnim.value : 1.0,
              child: Container(
                width: r * 2,
                height: r * 2,
                decoration: BoxDecoration(
                  color: bubble.color.withAlpha(220),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: bubble.color.withAlpha(
                        (90 + 110 * glowBoost).toInt(),
                      ),
                      blurRadius: 14 + 18 * glowBoost,
                      spreadRadius: 2 + 5 * glowBoost,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: child,
              ),
            );
          },
          child: Padding(
            padding: EdgeInsets.all(r * 0.14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  bubble.label,
                  textAlign: TextAlign.center,
                  maxLines: bubble.sublabel != null ? 3 : 4,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: fontSize,
                    fontWeight: FontWeight.bold,
                    height: 1.2,
                  ),
                ),
                if (bubble.sublabel != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    bubble.sublabel!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withAlpha(200),
                      fontSize: subSize,
                      height: 1.1,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
