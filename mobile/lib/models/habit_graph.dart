/// Represents a single node in the habit graph, either a habit or a concept.
///
/// [id] is a prefixed identifier: 'h:<uuid>' for habit nodes,
/// 'c:<bcio_id>' for concept nodes.
/// [type] is either 'habit' or 'concept'.
/// [habitId] is the raw UUID for habit nodes, null for concept nodes.
/// [annotationCounts] maps annotation type (e.g. 'helpful', 'iDoThis') to count.
class GraphNode {
  final String id;
  final String type;
  final String label;
  final String? habitId;
  final String originalText;
  final String language;
  final Map<String, int> annotationCounts;

  const GraphNode({
    required this.id,
    required this.type,
    required this.label,
    this.habitId,
    this.originalText = '',
    this.language = '',
    this.annotationCounts = const {},
  });

  bool get isHabit => type == 'habit';
  bool get isConcept => type == 'concept';

  /// Sum of all annotation counts across all annotation types.
  int get totalAnnotations =>
      annotationCounts.values.fold(0, (sum, c) => sum + c);

  factory GraphNode.fromJson(Map<String, dynamic> json) {
    final counts = (json['annotationCounts'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
    final node = GraphNode(
      id: json['id'] as String,
      type: json['type'] as String,
      label: json['label'] as String? ?? '',
      habitId: json['habitId'] as String?,
      originalText: json['originalText'] as String? ?? '',
      language: json['language'] as String? ?? '',
      annotationCounts: counts,
    );
    assert(node.type == 'habit' || node.type == 'concept',
        'Unknown GraphNode type: ${node.type}');
    return node;
  }
}

/// Represents a directed edge between two nodes in the habit graph.
///
/// Edges connect habit nodes (source) to concept nodes (target).
class GraphEdge {
  final String source;
  final String target;

  const GraphEdge({required this.source, required this.target});

  factory GraphEdge.fromJson(Map<String, dynamic> json) => GraphEdge(
        source: json['source'] as String,
        target: json['target'] as String,
      );
}

/// A directed graph of habits and BCIO concepts, parsed from the
/// GET /api/v1/graph response.
///
/// Edges run from habit nodes to concept nodes, enabling queries in
/// both directions via [habitsForConcept] and [conceptForHabit].
class HabitGraph {
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;

  const HabitGraph({required this.nodes, required this.edges});

  /// Creates an empty graph with no nodes or edges.
  factory HabitGraph.empty() => const HabitGraph(nodes: [], edges: []);

  factory HabitGraph.fromJson(Map<String, dynamic> json) {
    final nodes = (json['nodes'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(GraphNode.fromJson)
        .toList();
    final edges = (json['edges'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(GraphEdge.fromJson)
        .toList();
    return HabitGraph(nodes: nodes, edges: edges);
  }

  /// Returns all nodes with type == 'habit'.
  List<GraphNode> get habitNodes => nodes.where((n) => n.isHabit).toList();

  /// Returns all nodes with type == 'concept'.
  List<GraphNode> get conceptNodes => nodes.where((n) => n.isConcept).toList();

  /// Returns all habit nodes that have an edge targeting [conceptId].
  List<GraphNode> habitsForConcept(String conceptId) {
    final connectedIds = edges
        .where((e) => e.target == conceptId)
        .map((e) => e.source)
        .toSet();
    return nodes.where((n) => connectedIds.contains(n.id)).toList();
  }

  /// Returns the concept node that [habitNodeId] points to, or null if none.
  GraphNode? conceptForHabit(String habitNodeId) {
    final conceptId = edges
        .where((e) => e.source == habitNodeId)
        .map((e) => e.target)
        .firstOrNull;
    if (conceptId == null) return null;
    return nodes.where((n) => n.id == conceptId).firstOrNull;
  }
}
