/// Represents a single donated habit node in the habit graph.
///
/// [annotationCounts] maps annotation type (e.g. 'thumbUp', 'star') to count.
/// [bcioClass] is the BCIO ontology class URI assigned to this habit.
class HabitNode {
  final String id;
  final String name;
  final String category;
  final String bcioClass;
  final Map<String, int> annotationCounts;

  const HabitNode({
    required this.id,
    required this.name,
    required this.category,
    required this.bcioClass,
    required this.annotationCounts,
  });

  /// Sum of all annotation counts across all annotation types.
  int get totalAnnotations =>
      annotationCounts.values.fold(0, (sum, c) => sum + c);

  factory HabitNode.fromJson(Map<String, dynamic> json) {
    final counts =
        (json['annotationCounts'] as Map<String, dynamic>? ?? {}).map(
      (k, v) => MapEntry(k, (v as num).toInt()),
    );
    return HabitNode(
      id: json['id'] as String,
      name: json['name'] as String,
      category: json['category'] as String? ?? '',
      bcioClass: json['bcioClass'] as String? ?? '',
      annotationCounts: counts,
    );
  }
}
