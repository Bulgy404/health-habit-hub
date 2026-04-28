import 'package:flutter/material.dart';
import 'package:flutter_graph_view/flutter_graph_view.dart';

import '../models/habit_graph.dart';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const Color _kConceptColor = Color(0xFFFF9800); // orange
const Color _kHabitColor = Color(0xFF2196F3); // blue

double _habitRadius(GraphNode node) {
  return (12.0 + node.totalAnnotations * 0.5).clamp(12.0, 22.0);
}

// ---------------------------------------------------------------------------
// Custom DataConvertor for HabitGraph
// ---------------------------------------------------------------------------

class _HabitGraphConvertor extends MapConvertor {
  @override
  Iterable originVertexes(dynamic data) => data['vertexes'] as Iterable;

  @override
  Iterable originEdges(dynamic data) => data['edges'] as Iterable;

  @override
  Vertex convertVertex(v, g) {
    final vertex = super.convertVertex(v, g);
    // Store GraphNode in properties to survive vertexAsGraphComponse overwriting .data
    final node = v['data'] as GraphNode;
    vertex.properties['graphNode'] = node;
    if (node.isConcept) {
      vertex.radius = 28.0;
    } else {
      vertex.radius = _habitRadius(node);
    }
    return vertex;
  }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/// A force-directed graph widget that renders [graph] using the
/// `flutter_graph_view` package.
///
/// Concept nodes appear as large orange circles; habit nodes as smaller blue
/// circles whose radius scales with [GraphNode.totalAnnotations].
/// Tapping a habit node calls [onHabitTap]; tapping a concept node calls
/// [onConceptTap].
class HabitGraphWidget extends StatefulWidget {
  final HabitGraph graph;
  final void Function(GraphNode habitNode) onHabitTap;
  final void Function(GraphNode conceptNode) onConceptTap;

  const HabitGraphWidget({
    super.key,
    required this.graph,
    required this.onHabitTap,
    required this.onConceptTap,
  });

  @override
  State<HabitGraphWidget> createState() => _HabitGraphWidgetState();
}

class _HabitGraphWidgetState extends State<HabitGraphWidget> {
  late FlutterGraphWidget _graphWidget;

  @override
  void initState() {
    super.initState();
    _graphWidget = _buildGraphWidget();
  }

  @override
  void didUpdateWidget(HabitGraphWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Rebuild only when the underlying graph data changes, not on every
    // parent rebuild — avoids restarting the force-directed simulation.
    if (!identical(oldWidget.graph, widget.graph)) {
      setState(() {
        _graphWidget = _buildGraphWidget();
      });
    }
  }

  Map<String, dynamic> _buildGraphData() {
    final vertexes = widget.graph.nodes.map((node) {
      return {
        'id': node.id,
        'tag': node.type,
        'tags': [node.type],
        'data': node,
        'solid': true,
      };
    }).toList();

    final edges = widget.graph.edges.map((edge) {
      return {
        'srcId': edge.source,
        'dstId': edge.target,
        'edgeName': 'connects',
        'ranking': 1,
      };
    }).toList();

    return {'vertexes': vertexes, 'edges': edges};
  }

  FlutterGraphWidget _buildGraphWidget() {
    final data = _buildGraphData();

    return FlutterGraphWidget(
      data: data,
      algorithm: ForceDirected(),
      convertor: _HabitGraphConvertor(),
      options: Options()
        ..enableHit = true
        ..showText = true
        ..textGetter = (vertex) {
          final node = vertex.properties['graphNode'] as GraphNode?;
          if (node == null) return '${vertex.id}';
          final label = node.label;
          return label.length > 10 ? label.substring(0, 10) : label;
        }
        ..graphStyle = (GraphStyle()
          ..tagColor = {
            'concept': _kConceptColor,
            'habit': _kHabitColor,
          }
          ..vertexTextStyleGetter = (vertex, shape) {
            return const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            );
          })
        ..edgeShape = EdgeLineShape()
        ..vertexShape = VertexCircleShape()
        ..backgroundBuilder = (ctx) {
          return Container(color: Theme.of(ctx).colorScheme.surface);
        }
        // widget.onHabitTap / widget.onConceptTap are read via State.widget,
        // so they always reflect the current widget even if callbacks change.
        ..onVertexTapUp = (vertex, _) {
          final node = vertex.properties['graphNode'] as GraphNode?;
          if (node == null) return null;
          if (node.isHabit) {
            widget.onHabitTap(node);
          } else if (node.isConcept) {
            widget.onConceptTap(node);
          }
          return null;
        },
    );
  }

  @override
  Widget build(BuildContext context) {
    return _graphWidget;
  }
}
