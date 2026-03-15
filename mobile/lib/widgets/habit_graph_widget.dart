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
/// via a spring force.  An AnimationController drives the simulation at 60 fps.
/// Supports pinch-to-zoom and pan via [GestureDetector].
///
/// When [onNodeTap] is provided, tapping a node (as opposed to panning) fires
/// the callback with the tapped [HabitNode].
class HabitGraphWidget extends StatefulWidget {
  final List<HabitNode> nodes;
  final void Function(HabitNode)? onNodeTap;

  const HabitGraphWidget({super.key, required this.nodes, this.onNodeTap});

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

  // Tap detection — track whether the gesture moved/scaled significantly.
  Offset? _scaleLocalStart;
  bool _moved = false;

  // Canvas size tracked via LayoutBuilder.
  Size _canvasSize = Size.zero;

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
      final r = 50.0 + rng.nextDouble() * 150.0;
      return _NodeState(Offset(r * math.cos(angle), r * math.sin(angle)));
    }).toList();
  }

  void _stepPhysics() {
    final n = _states.length;
    if (n == 0) return;
    final nodes = widget.nodes;

    final forces = List<Offset>.generate(n, (_) => Offset.zero);

    for (int i = 0; i < n; i++) {
      // Center gravity — pull toward origin
      forces[i] = forces[i] - _states[i].pos * _kGravity;

      for (int j = i + 1; j < n; j++) {
        final delta = _states[i].pos - _states[j].pos;
        final dist = delta.distance.clamp(1.0, double.infinity);
        final dir = delta / dist;

        // Coulomb repulsion between every pair
        final rep = _kRep / (dist * dist);
        forces[i] = forces[i] + dir * rep;
        forces[j] = forces[j] - dir * rep;

        // Spring attraction for same-category pairs
        if (nodes[i].category == nodes[j].category) {
          final spring = _kSpring * (dist - _kRestLen);
          forces[i] = forces[i] - dir * spring;
          forces[j] = forces[j] + dir * spring;
        }
      }
    }

    // Euler integration with velocity damping
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
      // Add 4px hit-test slop on top of the drawn radius.
      if ((_states[i].pos - graphPos).distance <= r + 4) {
        widget.onNodeTap!.call(widget.nodes[i]);
        return;
      }
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
        builder: (_, constraints) {
          _canvasSize = constraints.biggest;
          return AnimatedBuilder(
            animation: _ticker,
            builder: (_, _) => CustomPaint(
              painter: _GraphPainter(
                nodes: widget.nodes,
                states: _states,
                panOffset: _panOffset,
                zoom: _zoom,
              ),
              size: Size.infinite,
            ),
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

  _GraphPainter({
    required this.nodes,
    required this.states,
    required this.panOffset,
    required this.zoom,
  });

  static const _labelStyle = TextStyle(
    color: Colors.white,
    fontSize: 9,
    fontWeight: FontWeight.w500,
  );

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2) + panOffset;

    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.scale(zoom);

    // Draw edges (same-category pairs) as light lines
    final edgePaint = Paint()
      ..color = Colors.black12
      ..strokeWidth = 0.8
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

    // Draw nodes
    final nodePaint = Paint()..style = PaintingStyle.fill;

    for (int i = 0; i < nodes.length; i++) {
      if (i >= states.length) break;
      final node = nodes[i];
      final pos = states[i].pos;
      final r = _nodeRadius(node);
      final color = _colorForCategory(node.category);

      // Fill
      nodePaint.color = color;
      canvas.drawCircle(pos, r, nodePaint);

      // Subtle border
      nodePaint
        ..color = color.withAlpha(180)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5;
      canvas.drawCircle(pos, r, nodePaint);
      nodePaint
        ..style = PaintingStyle.fill
        ..strokeWidth = 0;

      // Label — abbreviated to fit inside node
      if (r >= 12) {
        final maxChars = (r / 4.5).floor().clamp(4, 16);
        final label = node.name.length > maxChars
            ? '${node.name.substring(0, maxChars)}…'
            : node.name;
        final tp = TextPainter(
          text: TextSpan(text: label, style: _labelStyle),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: r * 2.2);
        tp.paint(canvas, pos + Offset(-tp.width / 2, -tp.height / 2));
      }
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GraphPainter old) => true;
}
