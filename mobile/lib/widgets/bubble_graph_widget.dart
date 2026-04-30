import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/bubble_graph.dart';

// ---------------------------------------------------------------------------
// Dimension colours
// ---------------------------------------------------------------------------

const _kDimensionColors = {
  'TIME': Color(0xFF3B82F6),
  'BEHAVIOR': Color(0xFF22C55E),
  'PHYSICAL_SETTING': Color(0xFFF97316),
  'PRIOR_BEHAVIOR': Color(0xFFA855F7),
  'OTHER_PEOPLE': Color(0xFF06B6D4),
  'INTERNAL_STATE': Color(0xFFEC4899),
  'REASONING': Color(0xFF64748B),
};

Color _colorFor(String dimensionId) =>
    _kDimensionColors[dimensionId] ?? const Color(0xFF94A3B8);

// ---------------------------------------------------------------------------
// Internal data model for a single rendered bubble
// ---------------------------------------------------------------------------

class _Bubble {
  final String id;
  final String label;
  final String? sublabel;
  final double radius;
  final Color color;
  final dynamic payload; // DimensionBubble or HabitBubble
  final bool pulse;

  const _Bubble({
    required this.id,
    required this.label,
    this.sublabel,
    required this.radius,
    required this.color,
    required this.payload,
    this.pulse = false,
  });
}

// ---------------------------------------------------------------------------
// Circle-packing layout (force-directed, 200 iterations)
// ---------------------------------------------------------------------------

(List<Offset>, Size) _pack(List<double> radii, {double padding = 56}) {
  final n = radii.length;
  if (n == 0) return ([], Size.zero);
  if (n == 1) {
    return (
      [Offset(radii[0] + padding, radii[0] + padding)],
      Size(radii[0] * 2 + padding * 2, radii[0] * 2 + padding * 2),
    );
  }

  // Initial positions: spread on a circle proportional to total circumference.
  final totalR = radii.fold(0.0, (s, r) => s + r);
  final initR = totalR / math.pi;
  final xs = List<double>.generate(
    n,
    (i) => initR * math.cos(2 * math.pi * i / n),
  );
  final ys = List<double>.generate(
    n,
    (i) => initR * math.sin(2 * math.pi * i / n),
  );

  const iterations = 250;
  for (int iter = 0; iter < iterations; iter++) {
    final alpha = 1.0 - iter / iterations;

    // Repulsion: push overlapping circles apart.
    for (int i = 0; i < n; i++) {
      for (int j = i + 1; j < n; j++) {
        final ddx = xs[i] - xs[j];
        final ddy = ys[i] - ys[j];
        final dist = math.sqrt(ddx * ddx + ddy * ddy);
        final minDist = radii[i] + radii[j] + 6;
        if (dist < minDist && dist > 0.01) {
          final push = (minDist - dist) / 2 * alpha;
          final nx = ddx / dist;
          final ny = ddy / dist;
          xs[i] += nx * push;
          ys[i] += ny * push;
          xs[j] -= nx * push;
          ys[j] -= ny * push;
        }
      }
    }

    // Gentle pull to origin.
    final centerStrength = 0.012 * alpha;
    for (int i = 0; i < n; i++) {
      xs[i] *= (1 - centerStrength);
      ys[i] *= (1 - centerStrength);
    }
  }

  // Compute bounding box.
  double minX = double.infinity, maxX = double.negativeInfinity;
  double minY = double.infinity, maxY = double.negativeInfinity;
  for (int i = 0; i < n; i++) {
    minX = math.min(minX, xs[i] - radii[i]);
    maxX = math.max(maxX, xs[i] + radii[i]);
    minY = math.min(minY, ys[i] - radii[i]);
    maxY = math.max(maxY, ys[i] + radii[i]);
  }

  final positions = List<Offset>.generate(
    n,
    (i) => Offset(xs[i] - minX + padding, ys[i] - minY + padding),
  );
  final size = Size(maxX - minX + padding * 2, maxY - minY + padding * 2);
  return (positions, size);
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class BubbleGraphWidget extends StatefulWidget {
  final BubbleGraph graph;
  final void Function(HabitBubble habit, DimensionBubble dimension) onHabitTap;
  final String? pulseHabitId;

  const BubbleGraphWidget({
    super.key,
    required this.graph,
    required this.onHabitTap,
    this.pulseHabitId,
  });

  @override
  State<BubbleGraphWidget> createState() => _BubbleGraphWidgetState();
}

class _BubbleGraphWidgetState extends State<BubbleGraphWidget>
    with SingleTickerProviderStateMixin {
  DimensionBubble? _active;
  late AnimationController _animController;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
    _fadeAnim = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _drillInto(DimensionBubble dim) {
    setState(() => _active = dim);
    _animController.forward(from: 0);
  }

  void _drillOut() {
    setState(() => _active = null);
    _animController.forward(from: 0);
  }

  // ---------------------------------------------------------------------------
  // Build overview (dimension level)
  // ---------------------------------------------------------------------------

  List<_Bubble> _dimensionBubbles() {
    final dims = widget.graph.dimensions;
    if (dims.isEmpty) return [];
    final maxCount = dims.map((d) => d.habitCount).reduce(math.max);
    return dims.map((d) {
      final ratio = maxCount > 0 ? math.sqrt(d.habitCount / maxCount) : 0.5;
      final r = 44.0 + ratio * 56.0; // 44 – 100 px
      return _Bubble(
        id: d.id,
        label: d.label,
        sublabel: '${d.habitCount} habit${d.habitCount == 1 ? '' : 's'}',
        radius: r,
        color: _colorFor(d.id),
        payload: d,
      );
    }).toList();
  }

  // ---------------------------------------------------------------------------
  // Build habit level
  // ---------------------------------------------------------------------------

  List<_Bubble> _habitBubbles(DimensionBubble dim) {
    final habits = dim.habits;
    if (habits.isEmpty) return [];
    final maxAnnot = habits.map((h) => h.totalAnnotations + 1).reduce(math.max);
    final color = _colorFor(dim.id);
    return habits.map((h) {
      final ratio = math.sqrt((h.totalAnnotations + 1) / maxAnnot);
      final r = 18.0 + ratio * 32.0; // 18 – 50 px
      return _Bubble(
        id: h.id,
        label: h.label,
        radius: r,
        color: color,
        payload: h,
        pulse: widget.pulseHabitId == h.id,
      );
    }).toList();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final active = _active;

    Widget content;
    if (active == null) {
      final bubbles = _dimensionBubbles();
      content = _BubbleCanvas(
        key: const ValueKey('overview'),
        bubbles: bubbles,
        onTap: (b) => _drillInto(b.payload as DimensionBubble),
      );
    } else {
      final bubbles = _habitBubbles(active);
      content = Column(
        key: ValueKey(active.id),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _DimensionBar(dimension: active, onBack: _drillOut),
          Expanded(
            child: bubbles.isEmpty
                ? Center(
                    child: Text(
                      'No habits in this dimension yet.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  )
                : _BubbleCanvas(
                    bubbles: bubbles,
                    onTap: (b) =>
                        widget.onHabitTap(b.payload as HabitBubble, active),
                  ),
          ),
        ],
      );
    }

    return FadeTransition(opacity: _fadeAnim, child: content);
  }
}

// ---------------------------------------------------------------------------
// Top bar shown when drilling into a dimension
// ---------------------------------------------------------------------------

class _DimensionBar extends StatelessWidget {
  final DimensionBubble dimension;
  final VoidCallback onBack;

  const _DimensionBar({required this.dimension, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final color = _colorFor(dimension.id);
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 6, 16, 6),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back),
            tooltip: 'All categories',
          ),
          Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              dimension.label,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          Text(
            '${dimension.habitCount} habit${dimension.habitCount == 1 ? '' : 's'}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Canvas: computes layout and renders bubbles
// ---------------------------------------------------------------------------

class _BubbleCanvas extends StatefulWidget {
  final List<_Bubble> bubbles;
  final void Function(_Bubble) onTap;

  const _BubbleCanvas({super.key, required this.bubbles, required this.onTap});

  @override
  State<_BubbleCanvas> createState() => _BubbleCanvasState();
}

class _BubbleCanvasState extends State<_BubbleCanvas> {
  late List<Offset> _positions;
  late Size _canvasSize;

  @override
  void initState() {
    super.initState();
    _computeLayout();
  }

  @override
  void didUpdateWidget(_BubbleCanvas old) {
    super.didUpdateWidget(old);
    if (old.bubbles != widget.bubbles) _computeLayout();
  }

  void _computeLayout() {
    final radii = widget.bubbles.map((b) => b.radius).toList();
    final result = _pack(radii);
    _positions = result.$1;
    _canvasSize = result.$2;
  }

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
                child: _BubbleChip(
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

// ---------------------------------------------------------------------------
// Single bubble chip
// ---------------------------------------------------------------------------

class _BubbleChip extends StatefulWidget {
  final _Bubble bubble;
  final VoidCallback onTap;
  final void Function(Offset delta) onDrag;

  const _BubbleChip({
    required this.bubble,
    required this.onTap,
    required this.onDrag,
  });

  @override
  State<_BubbleChip> createState() => _BubbleChipState();
}

class _BubbleChipState extends State<_BubbleChip>
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
  void didUpdateWidget(covariant _BubbleChip oldWidget) {
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

    return GestureDetector(
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
    );
  }
}
