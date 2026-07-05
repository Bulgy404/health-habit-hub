/// Interactive bubble graph widget for habit-dimension visualisation.
///
/// Composes [BubbleCanvasWidget], [BubbleNode] data helpers, and the
/// dimension drill-in header into a single scrollable graph surface.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../models/bubble_graph.dart';
import 'bubble_graph/bubble_graph_data.dart';
import 'bubble_graph/bubble_graph_gesture_handler.dart';

// ---------------------------------------------------------------------------
// Public widget
// ---------------------------------------------------------------------------

/// Renders a two-level interactive bubble graph for habit exploration.
///
/// The top level shows one bubble per behaviour dimension, sized by habit
/// count.  Tapping a dimension drills in to show individual habit bubbles
/// within that dimension.  Tapping a habit bubble calls [onHabitTap].
class BubbleGraphWidget extends StatefulWidget {
  /// The graph data to render.
  final BubbleGraph graph;

  /// Called when the user taps a habit bubble.
  final void Function(HabitBubble habit, DimensionBubble dimension) onHabitTap;

  /// When set, the matching habit bubble plays a pulse animation on first render.
  final String? pulseHabitId;

  /// Creates a [BubbleGraphWidget].
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

  // ── Overview level (dimension bubbles) ────────────────────────────────────

  List<BubbleNode> _dimensionBubbles() {
    final l10n = AppLocalizations.of(context)!;
    final dims = widget.graph.dimensions;
    if (dims.isEmpty) return [];
    final maxCount = dims.map((d) => d.habitCount).reduce(math.max);
    return dims.map((d) {
      final ratio = maxCount > 0 ? math.sqrt(d.habitCount / maxCount) : 0.5;
      final r = 44.0 + ratio * 56.0; // 44–100 px
      return BubbleNode(
        id: d.id,
        label: d.label,
        sublabel: l10n.bubbleGraphHabitCount(d.habitCount),
        radius: r,
        color: colorFor(d.id),
        payload: d,
      );
    }).toList();
  }

  // ── Habit level (habit bubbles inside a dimension) ─────────────────────────

  List<BubbleNode> _habitBubbles(DimensionBubble dim) {
    final habits = dim.habits;
    if (habits.isEmpty) return [];
    final maxAnnot = habits.map((h) => h.iDoThisCount + 1).reduce(math.max);
    final color = colorFor(dim.id);
    return habits.map((h) {
      final ratio = math.sqrt((h.iDoThisCount + 1) / maxAnnot);
      final r =
          18.0 + ratio * 42.0; // 18–60 px, driven by "I do this too" count
      return BubbleNode(
        id: h.id,
        label: h.label,
        radius: r,
        color: color,
        payload: h,
        pulse: widget.pulseHabitId == h.id,
      );
    }).toList();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final active = _active;

    Widget content;
    if (active == null) {
      // ── Overview ─────────────────────────────────────────────────────────
      content = BubbleCanvasWidget(
        key: const ValueKey('overview'),
        bubbles: _dimensionBubbles(),
        onTap: (b) => _drillInto(b.payload as DimensionBubble),
      );
    } else {
      // ── Drill-in ─────────────────────────────────────────────────────────
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
                      l10n.bubbleGraphNoHabitsInDimension,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  )
                : BubbleCanvasWidget(
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
// Dimension drill-in header bar
// ---------------------------------------------------------------------------

/// Top bar displayed when the user has drilled into a [DimensionBubble].
///
/// Shows the dimension colour, name, and habit count alongside a back button.
class _DimensionBar extends StatelessWidget {
  final DimensionBubble dimension;
  final VoidCallback onBack;

  const _DimensionBar({required this.dimension, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final color = colorFor(dimension.id);
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 6, 16, 6),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back),
            tooltip: l10n.bubbleGraphAllCategories,
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
            l10n.bubbleGraphHabitCount(dimension.habitCount),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}
