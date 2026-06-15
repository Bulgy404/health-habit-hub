/// Data models for the habit bubble graph returned by
/// GET /api/v1/habits/graph.
library;

/// Top-level graph model containing a list of behaviour dimensions.
class BubbleGraph {
  /// The list of behaviour dimensions in the graph.
  final List<DimensionBubble> dimensions;

  /// Creates a [BubbleGraph].
  const BubbleGraph({required this.dimensions});

  /// Deserialises a [BubbleGraph] from the API JSON payload.
  factory BubbleGraph.fromJson(Map<String, dynamic> json) {
    return BubbleGraph(
      dimensions: ((json['dimensions'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(DimensionBubble.fromJson)
          .toList(),
    );
  }
}

/// A single behaviour dimension node in the bubble graph.
class DimensionBubble {
  /// Unique dimension identifier (e.g. `'TIME'`).
  final String id;

  /// Human-readable dimension label.
  final String label;

  /// Number of habits grouped under this dimension.
  final int habitCount;

  /// Individual habit bubbles within this dimension.
  final List<HabitBubble> habits;

  /// Creates a [DimensionBubble].
  const DimensionBubble({
    required this.id,
    required this.label,
    required this.habitCount,
    required this.habits,
  });

  /// Deserialises a [DimensionBubble] from JSON.
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

/// A single donated habit node within a [DimensionBubble].
class HabitBubble {
  /// Unique habit identifier.
  final String id;

  /// Display label (may be translated).
  final String label;

  /// Original text as submitted by the contributor.
  final String originalText;

  /// ISO 639-1 language code of the original habit text.
  final String language;

  /// Maps annotation type identifiers to their cumulative counts.
  final Map<String, int> annotationCounts;

  /// Creates a [HabitBubble].
  const HabitBubble({
    required this.id,
    required this.label,
    required this.originalText,
    required this.language,
    required this.annotationCounts,
  });

  /// Sum of all annotation counts across all annotation types.
  int get totalAnnotations =>
      annotationCounts.values.fold(0, (s, c) => s + c);

  /// Number of users who marked this habit as "I do this too".
  int get iDoThisCount => annotationCounts['iDoThis'] ?? 0;

  /// Deserialises a [HabitBubble] from JSON.
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
