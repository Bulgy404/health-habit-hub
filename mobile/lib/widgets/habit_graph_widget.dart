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

/// Converts our [HabitGraph] model into the flutter_graph_view internal
/// [Graph] representation.
///
/// Vertex map shape used internally:
/// ```
/// {
///   'id': String,       // node.id
///   'tag': String,      // 'concept' | 'habit'
///   'tags': [String],   // same single-element list used for tag-based colour
///   'data': GraphNode,  // original node reference
///   'solid': true,      // use solid colour from [tagColor]
///   'scale': double,    // radiusScale override (ignored — we override via tagColor/radius)
/// }
/// ```
///
/// Edge map shape:
/// ```
/// {
///   'srcId': String,
///   'dstId': String,
///   'edgeName': 'connects',
///   'ranking': 1,
/// }
/// ```
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
class HabitGraphWidget extends StatelessWidget {
  final HabitGraph graph;
  final void Function(GraphNode habitNode) onHabitTap;
  final void Function(GraphNode conceptNode) onConceptTap;

  const HabitGraphWidget({
    super.key,
    required this.graph,
    required this.onHabitTap,
    required this.onConceptTap,
  });

  /// Convert [HabitGraph] to the Map-based format expected by [MapConvertor].
  Map<String, dynamic> _buildGraphData() {
    final vertexes = graph.nodes.map((node) {
      return {
        'id': node.id,
        'tag': node.type, // 'habit' or 'concept'
        'tags': [node.type],
        'data': node,
        'solid': true,
      };
    }).toList();

    final edges = graph.edges.map((edge) {
      return {
        'srcId': edge.source,
        'dstId': edge.target,
        'edgeName': 'connects',
        'ranking': 1,
      };
    }).toList();

    return {
      'vertexes': vertexes,
      'edges': edges,
    };
  }

  @override
  Widget build(BuildContext context) {
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
        ..onVertexTapUp = (vertex, _) {
          final node = vertex.properties['graphNode'] as GraphNode?;
          if (node == null) return null;
          if (node.isHabit) {
            onHabitTap(node);
          } else if (node.isConcept) {
            onConceptTap(node);
          }
          return null;
        },
    );
  }
}
