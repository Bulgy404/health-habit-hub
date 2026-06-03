/// Gesture-handling canvas for the bubble graph.
///
/// [BubbleCanvasWidget] computes the circle-packing layout from a list of
/// [BubbleNode]s and renders them inside an [InteractiveViewer].  Individual
/// bubbles can be dragged to new positions within the canvas.
library;

import 'package:flutter/material.dart';

import 'bubble_graph_data.dart';
import 'bubble_graph_painter.dart';

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
class BubbleCanvasWidgetState extends State<BubbleCanvasWidget> {
  late List<Offset> _positions;
  late Size _canvasSize;

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

  /// Recomputes the circle-packing layout from the current bubble list.
  void _computeLayout() {
    final radii = widget.bubbles.map((b) => b.radius).toList();
    final result = packBubbles(radii);
    _positions = result.$1;
    _canvasSize = result.$2;
  }

  /// Moves bubble at [index] by [delta] in response to a drag gesture.
  void _onBubbleDrag(int index, Offset delta) {
    setState(() {
      _positions[index] = _positions[index] + delta;
    });
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
                left: _positions[i].dx - widget.bubbles[i].radius,
                top: _positions[i].dy - widget.bubbles[i].radius,
                child: BubbleChipWidget(
                  bubble: widget.bubbles[i],
                  onTap: () => widget.onTap(widget.bubbles[i]),
                  onDrag: (delta) => _onBubbleDrag(i, delta),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
