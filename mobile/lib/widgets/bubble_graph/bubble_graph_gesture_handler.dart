/// Gesture-handling canvas for the bubble graph.
///
/// [BubbleCanvasWidget] computes the circle-packing layout from a list of
/// [BubbleNode]s and renders them inside an [InteractiveViewer].  Individual
/// bubbles can be dragged to new positions within the canvas.
library;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

import 'bubble_graph_data.dart';
import 'bubble_graph_painter.dart';

/// Rubber-band resistance for a drag that has gone past a boundary.
///
/// The further past the bound, the less the position follows — matches the
/// Apple "Designing Fluid Interfaces" formula so bubbles resist leaving the
/// canvas instead of stopping dead at the edge.
double _rubberband(double overshoot, double dimension, [double constant = 0.55]) {
  return (overshoot * dimension * constant) / (dimension + constant * overshoot.abs());
}

/// A zoomable, pannable canvas that renders a list of [BubbleNode]s.
///
/// Uses [packBubbles] for initial layout and allows the user to drag
/// individual bubbles.  Tap events are forwarded via [onTap].
class BubbleCanvasWidget extends StatefulWidget {
  /// Bubbles to lay out and render.
  final List<BubbleNode> bubbles;

  /// Called when a bubble is tapped, passing the tapped [BubbleNode].
  final void Function(BubbleNode) onTap;

  /// Creates a [BubbleCanvasWidget].
  const BubbleCanvasWidget({
    super.key,
    required this.bubbles,
    required this.onTap,
  });

  @override
  State<BubbleCanvasWidget> createState() => BubbleCanvasWidgetState();
}

/// State for [BubbleCanvasWidget].
class BubbleCanvasWidgetState extends State<BubbleCanvasWidget>
    with TickerProviderStateMixin {
  /// Static per-bubble layout position from [packBubbles] — only changes
  /// when [_computeLayout] runs (the bubble list itself changed), never
  /// during a drag or fling. Kept separate from [_dragOffsets] so
  /// [Positioned] stays stable across animation frames and only
  /// [Transform.translate] (compositor-only, no relayout) needs updating
  /// while a bubble is moving — animating [Positioned]'s left/top directly
  /// forces a layout pass every frame, the same cost as animating CSS
  /// top/left on the web.
  late List<Offset> _basePositions;

  /// Per-bubble offset from [_basePositions], applied via
  /// [Transform.translate]. Zero at rest; non-zero while dragging or
  /// flinging.
  late List<Offset> _dragOffsets;

  late Size _canvasSize;

  /// Per-bubble momentum animations, keyed by bubble index. Two independent
  /// controllers (x, y) per bubble so the fling can decompose into
  /// independent-axis friction, matching each axis's own release velocity.
  final Map<int, (AnimationController, AnimationController)> _flingControllers = {};

  @override
  void initState() {
    super.initState();
    _computeLayout();
  }

  @override
  void didUpdateWidget(BubbleCanvasWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.bubbles != widget.bubbles) _computeLayout();
  }

  @override
  void dispose() {
    for (final (cx, cy) in _flingControllers.values) {
      cx.dispose();
      cy.dispose();
    }
    super.dispose();
  }

  /// Recomputes the circle-packing layout from the current bubble list.
  void _computeLayout() {
    final radii = widget.bubbles.map((b) => b.radius).toList();
    final result = packBubbles(radii);
    _basePositions = result.$1;
    _canvasSize = result.$2;
    _dragOffsets = List.filled(_basePositions.length, Offset.zero);
  }

  /// Cancels any in-flight momentum fling for [index] so a fresh grab starts
  /// from the bubble's live on-screen position, never from a stale target.
  void _onBubbleDragStart(int index) {
    final controllers = _flingControllers.remove(index);
    controllers?.$1.stop();
    controllers?.$2.stop();
    controllers?.$1.dispose();
    controllers?.$2.dispose();
  }

  /// Moves bubble at [index] by [delta] in response to a drag gesture,
  /// applying rubber-band resistance once the bubble's centre passes the
  /// canvas bounds instead of hard-stopping at the edge. Updates only
  /// [_dragOffsets] — [_basePositions] (and therefore each bubble's
  /// [Positioned]) never changes during a drag.
  void _onBubbleDrag(int index, Offset delta) {
    setState(() {
      final base = _basePositions[index];
      final nextAbsolute = base + _dragOffsets[index] + delta;
      final r = widget.bubbles[index].radius;
      double resolve(double value, double delta, double dimension) {
        if (delta == 0) return value;
        final withinBounds = value >= 0 && value <= dimension;
        if (withinBounds) return value;
        final overshoot = value < 0 ? value : value - dimension;
        final bound = value < 0 ? 0.0 : dimension;
        return bound + _rubberband(overshoot, dimension.clamp(1.0, double.infinity));
      }

      final resolvedAbsolute = Offset(
        resolve(nextAbsolute.dx, delta.dx, _canvasSize.width == 0 ? r * 2 : _canvasSize.width),
        resolve(nextAbsolute.dy, delta.dy, _canvasSize.height == 0 ? r * 2 : _canvasSize.height),
      );
      _dragOffsets[index] = resolvedAbsolute - base;
    });
  }

  /// Carries the release velocity into a decaying fling, so the bubble keeps
  /// moving past the release point and settles instead of stopping dead.
  /// Animates [_dragOffsets] only, same as [_onBubbleDrag].
  void _onBubbleDragEnd(int index, Offset velocity) {
    if (velocity.distance < 80) return; // negligible flick — treat as a tap-drag
    final base = _basePositions[index];
    final startAbsolute = base + _dragOffsets[index];

    final cx = AnimationController.unbounded(vsync: this)
      ..animateWith(FrictionSimulation(0.135, startAbsolute.dx, velocity.dx));
    final cy = AnimationController.unbounded(vsync: this)
      ..animateWith(FrictionSimulation(0.135, startAbsolute.dy, velocity.dy));

    void tick() {
      if (!mounted) return;
      setState(() {
        _dragOffsets[index] = Offset(cx.value, cy.value) - base;
      });
    }

    cx.addListener(tick);
    cy.addListener(tick);
    cx.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _flingControllers.remove(index);
        cx.dispose();
        cy.dispose();
      }
    });

    _flingControllers[index] = (cx, cy);
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      constrained: false,
      boundaryMargin: const EdgeInsets.all(300),
      minScale: 0.2,
      maxScale: 4.0,
      child: SizedBox(
        width: _canvasSize.width,
        height: _canvasSize.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            for (int i = 0; i < widget.bubbles.length; i++)
              Positioned(
                // Static base position — see _basePositions' doc comment.
                left: _basePositions[i].dx - widget.bubbles[i].radius,
                top: _basePositions[i].dy - widget.bubbles[i].radius,
                child: Transform.translate(
                  offset: _dragOffsets[i],
                  child: BubbleChipWidget(
                    bubble: widget.bubbles[i],
                    onTap: () => widget.onTap(widget.bubbles[i]),
                    onDrag: (delta) => _onBubbleDrag(i, delta),
                    onDragStart: () => _onBubbleDragStart(i),
                    onDragEnd: (velocity) => _onBubbleDragEnd(i, velocity),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
