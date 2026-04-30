class BubbleGraph {
  final List<DimensionBubble> dimensions;
  const BubbleGraph({required this.dimensions});

  factory BubbleGraph.fromJson(Map<String, dynamic> json) {
    return BubbleGraph(
      dimensions: ((json['dimensions'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(DimensionBubble.fromJson)
          .toList(),
    );
  }
}

class DimensionBubble {
  final String id;
  final String label;
  final int habitCount;
  final List<HabitBubble> habits;

  const DimensionBubble({
    required this.id,
    required this.label,
    required this.habitCount,
    required this.habits,
  });

  factory DimensionBubble.fromJson(Map<String, dynamic> json) {
    return DimensionBubble(
      id: json['id'] as String,
      label: json['label'] as String,
      habitCount: (json['habitCount'] as num).toInt(),
      habits: ((json['habits'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(HabitBubble.fromJson)
          .toList(),
    );
  }
}

class HabitBubble {
  final String id;
  final String label;
  final String originalText;
  final String language;
  final Map<String, int> annotationCounts;

  const HabitBubble({
    required this.id,
    required this.label,
    required this.originalText,
    required this.language,
    required this.annotationCounts,
  });

  int get totalAnnotations =>
      annotationCounts.values.fold(0, (s, c) => s + c);

  factory HabitBubble.fromJson(Map<String, dynamic> json) {
    final counts = ((json['annotationCounts'] as Map<String, dynamic>?) ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
    return HabitBubble(
      id: json['id'] as String,
      label: json['label'] as String? ?? '',
      originalText: json['originalText'] as String? ?? '',
      language: json['language'] as String? ?? '',
      annotationCounts: counts,
    );
  }
}
