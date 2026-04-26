import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/habit_node.dart';

// ---------------------------------------------------------------------------
// Category → Color mapping (Material 3 tonal palette)
// ---------------------------------------------------------------------------

const Map<String, Color> _kCategoryColors = {
  'nutrition': Color(0xFF4CAF50),
  'exercise': Color(0xFF2196F3),
  'sleep': Color(0xFF9C27B0),
  'mental': Color(0xFFFF9800),
  'social': Color(0xFFE91E63),
  'mindfulness': Color(0xFF00BCD4),
  'productivity': Color(0xFFFF5722),
  'hygiene': Color(0xFF8BC34A),
  'other': Color(0xFF607D8B),
};

Color _colorForCategory(String category) {
  final lc = category.toLowerCase();
  for (final entry in _kCategoryColors.entries) {
    if (lc.contains(entry.key)) return entry.value;
  }
  final palette = _kCategoryColors.values.toList();
  return palette[lc.hashCode.abs() % palette.length];
}

/// Node radius in logical pixels, clamped to [8, 24].
double _nodeRadius(HabitNode node) {
  final total = node.totalAnnotations;
  return (8.0 + (total / 10.0) * 16.0).clamp(8.0, 24.0);
}

// ---------------------------------------------------------------------------
// Internal physics state per node
// ---------------------------------------------------------------------------

class _NodeState {
  Offset pos;
  Offset vel;

  _NodeState(this.pos) : vel = Offset.zero;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/// Force-directed graph widget that renders [nodes] as an interactive canvas.
///
/// Nodes repel each other (Coulomb) while nodes of the same category attract
/// via a spring force. Supports pinch-to-zoom and pan. When [onNodeTap] is
/// provided, tapping a node fires the callback. [selectedNodeId] highlights
/// the currently selected node with a ring. Text labels appear when zoomed in.
class HabitGraphWidget extends StatefulWidget {
  final List<HabitNode> nodes;
  final void Function(HabitNode)? onNodeTap;
  final String? selectedNodeId;

  const HabitGraphWidget({
    super.key,
    required this.nodes,
    this.onNodeTap,
    this.selectedNodeId,
  });

  @override
  State<HabitGraphWidget> createState() => _HabitGraphWidgetState();
}

class _HabitGraphWidgetState extends State<HabitGraphWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _ticker;
  late List<_NodeState> _states;

  // Viewport transform
  Offset _panOffset = Offset.zero;
  double _zoom = 1.0;
  Offset? _focalPoint;
  double? _baseZoom;

  // Tap detection
  Offset? _scaleLocalStart;
  bool _moved = false;

  // Canvas size tracked via LayoutBuilder.
  Size _canvasSize = Size.zero;

  // Show hint overlay until the user taps a node for the first time.
  bool _showHint = true;

  // Physics constants
  static const double _kRep = 4000.0;
  static const double _kSpring = 0.04;
  static const double _kRestLen = 110.0;
  static const double _kGravity = 0.025;
  static const double _kDamp = 0.88;
  static const double _dt = 0.016;

  @override
  void initState() {
    super.initState();
    _states = _buildStates(widget.nodes);
    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(days: 1),
    )
      ..addListener(_stepPhysics)
      ..repeat();
  }

  @override
  void didUpdateWidget(HabitGraphWidget old) {
    super.didUpdateWidget(old);
    if (old.nodes != widget.nodes) {
      _states = _buildStates(widget.nodes);
    }
  }

  List<_NodeState> _buildStates(List<HabitNode> nodes) {
    final rng = math.Random(0);
    return nodes.map((n) {
      final angle = rng.nextDouble() * 2 * math.pi;
      final r = 60.0 + rng.nextDouble() * 180.0;
      return _NodeState(Offset(r * math.cos(angle), r * math.sin(angle)));
    }).toList();
  }

  void _stepPhysics() {
    final n = _states.length;
    if (n == 0) return;
    final nodes = widget.nodes;

    final forces = List<Offset>.generate(n, (_) => Offset.zero);

    for (int i = 0; i < n; i++) {
      forces[i] = forces[i] - _states[i].pos * _kGravity;

      for (int j = i + 1; j < n; j++) {
        final delta = _states[i].pos - _states[j].pos;
        final dist = delta.distance.clamp(1.0, double.infinity);
        final dir = delta / dist;

        final rep = _kRep / (dist * dist);
        forces[i] = forces[i] + dir * rep;
        forces[j] = forces[j] - dir * rep;

        if (nodes[i].category == nodes[j].category) {
          final spring = _kSpring * (dist - _kRestLen);
          forces[i] = forces[i] - dir * spring;
          forces[j] = forces[j] + dir * spring;
        }
      }
    }

    for (int i = 0; i < n; i++) {
      _states[i].vel = (_states[i].vel + forces[i] * _dt) * _kDamp;
      _states[i].pos = _states[i].pos + _states[i].vel * _dt;
    }
  }

  void _handleTapAt(Offset localPos) {
    if (widget.onNodeTap == null || _canvasSize == Size.zero) return;
    final center =
        Offset(_canvasSize.width / 2, _canvasSize.height / 2) + _panOffset;
    final graphPos = (localPos - center) / _zoom;
    for (int i = 0; i < widget.nodes.length; i++) {
      if (i >= _states.length) break;
      final r = _nodeRadius(widget.nodes[i]);
      if ((_states[i].pos - graphPos).distance <= r + 8) {
        setState(() => _showHint = false);
        widget.onNodeTap!.call(widget.nodes[i]);
        return;
      }
    }
  }

  void _resetView() {
    setState(() {
      _panOffset = Offset.zero;
      _zoom = 1.0;
    });
  }

  Widget _buildLegend(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor =
        isDark ? Colors.black.withAlpha(204) : Colors.white.withAlpha(220);
    final textColor = isDark ? Colors.white : Colors.black87;

    // Build per-category counts.
    final counts = <String, int>{};
    for (final n in widget.nodes) {
      final key = n.category.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }

    final cats = counts.keys.toList()..sort();
    if (cats.isEmpty) return const SizedBox.shrink();

    final rows = cats.map((cat) {
      final color = _colorForCategory(cat);
      final label = cat[0].toUpperCase() + cat.substring(1);
      final count = counts[cat]!;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              '$label ($count)',
              style: TextStyle(
                fontSize: 11,
                color: textColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      );
    }).toList();

    final content = cats.length > 6
        ? SizedBox(
            height: (6 * 22.0) + 12,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: rows,
              ),
            ),
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: rows,
          );

    return IgnorePointer(
      child: Container(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(8),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(20),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: content,
      ),
    );
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onScaleStart: (details) {
        _focalPoint = details.focalPoint;
        _baseZoom = _zoom;
        _scaleLocalStart = details.localFocalPoint;
        _moved = false;
      },
      onScaleUpdate: (details) {
        if (_focalPoint != null) {
          final panDelta = details.focalPoint - _focalPoint!;
          if (panDelta.distance > 6) _moved = true;
        }
        if ((details.scale - 1.0).abs() > 0.05) _moved = true;
        setState(() {
          if (_focalPoint != null) {
            _panOffset += details.focalPoint - _focalPoint!;
            _focalPoint = details.focalPoint;
          }
          if (_baseZoom != null) {
            _zoom = (_baseZoom! * details.scale).clamp(0.2, 5.0);
          }
        });
      },
      onScaleEnd: (_) {
        if (!_moved && _scaleLocalStart != null) {
          _handleTapAt(_scaleLocalStart!);
        }
        _focalPoint = null;
        _baseZoom = null;
        _scaleLocalStart = null;
        _moved = false;
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          _canvasSize = constraints.biggest;
          return Stack(
            children: [
              // Graph canvas
              AnimatedBuilder(
                animation: _ticker,
                builder: (_, _) => CustomPaint(
                  painter: _GraphPainter(
                    nodes: widget.nodes,
                    states: _states,
                    panOffset: _panOffset,
                    zoom: _zoom,
                    selectedNodeId: widget.selectedNodeId,
                    selectionColor: cs.primary,
                  ),
                  size: Size.infinite,
                ),
              ),

              // Hint overlay — fades after first tap
              if (_showHint && widget.nodes.isNotEmpty)
                Positioned(
                  bottom: 60,
                  left: 0,
                  right: 0,
                  child: IgnorePointer(
                    child: Center(
                      child: AnimatedOpacity(
                        opacity: _showHint ? 1.0 : 0.0,
                        duration: const Duration(milliseconds: 500),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(
                            color: Colors.black.withAlpha(160),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.touch_app,
                                  color: Colors.white, size: 15),
                              SizedBox(width: 6),
                              Text(
                                'Tap a dot · pinch to zoom',
                                style: TextStyle(
                                    color: Colors.white, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

              // Legend
              if (widget.nodes.isNotEmpty)
                Positioned(
                  bottom: 8,
                  right: 8,
                  child: _buildLegend(context),
                ),

              // Zoom reset button — only visible when view is not default
              if (_zoom != 1.0 || _panOffset != Offset.zero)
                Positioned(
                  top: 8,
                  right: 8,
                  child: Material(
                    color: cs.surfaceContainerHighest.withAlpha(220),
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: _resetView,
                      child: const Padding(
                        padding: EdgeInsets.all(6),
                        child: Icon(Icons.center_focus_strong, size: 18),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Painter
// ---------------------------------------------------------------------------

class _GraphPainter extends CustomPainter {
  final List<HabitNode> nodes;
  final List<_NodeState> states;
  final Offset panOffset;
  final double zoom;
  final String? selectedNodeId;
  final Color selectionColor;

  _GraphPainter({
    required this.nodes,
    required this.states,
    required this.panOffset,
    required this.zoom,
    required this.selectionColor,
    this.selectedNodeId,
  });

  static const _innerLabelStyle = TextStyle(
    color: Colors.white,
    fontSize: 9,
    fontWeight: FontWeight.w600,
  );

  static const _outerLabelStyle = TextStyle(
    color: Color(0xFF1A1A1A),
    fontSize: 10,
    fontWeight: FontWeight.w500,
    shadows: [
      Shadow(
        color: Colors.white,
        blurRadius: 3,
      ),
    ],
  );

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2) + panOffset;

    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.scale(zoom);

    // Draw edges for same-category nodes.
    // When zoomed in, make them more opaque and slightly thicker.
    final edgeOpacity = (0.06 + (zoom - 1.0).clamp(0, 2) * 0.08).clamp(0.06, 0.22);
    final edgePaint = Paint()
      ..color = Colors.black.withAlpha((edgeOpacity * 255).round())
      ..strokeWidth = (0.6 + zoom * 0.2).clamp(0.6, 1.5)
      ..style = PaintingStyle.stroke;

    for (int i = 0; i < nodes.length; i++) {
      for (int j = i + 1; j < nodes.length; j++) {
        if (nodes[i].category == nodes[j].category &&
            i < states.length &&
            j < states.length) {
          canvas.drawLine(states[i].pos, states[j].pos, edgePaint);
        }
      }
    }

    final paint = Paint()..style = PaintingStyle.fill;

    for (int i = 0; i < nodes.length; i++) {
      if (i >= states.length) break;
      final node = nodes[i];
      final pos = states[i].pos;
      final r = _nodeRadius(node);
      final color = _colorForCategory(node.category);
      final isSelected = node.id == selectedNodeId;

      // Selection ring (drawn behind node)
      if (isSelected) {
        paint
          ..color = selectionColor.withAlpha(80)
          ..style = PaintingStyle.fill;
        canvas.drawCircle(pos, r + 8, paint);
        paint
          ..color = selectionColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5;
        canvas.drawCircle(pos, r + 5, paint);
        paint.style = PaintingStyle.fill;
      }

      // Node fill
      paint.color = color;
      canvas.drawCircle(pos, r, paint);

      // Subtle border
      paint
        ..color = color.withAlpha(180)
        ..style = PaintingStyle.stroke
        ..strokeWidth = isSelected ? 2.0 : 1.2;
      canvas.drawCircle(pos, r, paint);
      paint
        ..style = PaintingStyle.fill
        ..strokeWidth = 0;

      // Inner label: abbreviated text when node is large enough
      if (r >= 13) {
        final maxChars = (r / 4.5).floor().clamp(4, 16);
        final label = node.name.length > maxChars
            ? '${node.name.substring(0, maxChars)}…'
            : node.name;
        final tp = TextPainter(
          text: TextSpan(text: label, style: _innerLabelStyle),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: r * 2.2);
        tp.paint(canvas, pos + Offset(-tp.width / 2, -tp.height / 2));
      }

      // Outer text label: first few words shown below node when zoomed in
      if (zoom >= 1.3) {
        final words = node.name.split(' ');
        final snippet = words.take(4).join(' ') +
            (words.length > 4 ? '…' : '');
        final tp = TextPainter(
          text: TextSpan(text: snippet, style: _outerLabelStyle),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: 110);
        tp.paint(canvas, pos + Offset(-tp.width / 2, r + 4));
      }

      // Annotation badge — green dot when community notes exist
      if (node.totalAnnotations > 0 && r >= 10) {
        const badgeColor = Color(0xFF45B700);
        const badgeRadius = 4.0;
        final badgeOffset = Offset(r * 0.7, -r * 0.7);

        paint
          ..color = Colors.white
          ..style = PaintingStyle.fill
          ..strokeWidth = 0;
        canvas.drawCircle(pos + badgeOffset, badgeRadius + 1.5, paint);
        paint.color = badgeColor;
        canvas.drawCircle(pos + badgeOffset, badgeRadius, paint);
      }
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GraphPainter old) =>
      old.selectedNodeId != selectedNodeId ||
      old.zoom != zoom ||
      old.panOffset != panOffset ||
      true; // always repaint for physics animation
}
