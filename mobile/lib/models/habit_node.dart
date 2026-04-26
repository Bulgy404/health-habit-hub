/// Represents a single donated habit node in the habit graph.
///
/// [annotationCounts] maps annotation type (e.g. 'thumbUp', 'star') to count.
/// [bcioClass] is the BCIO ontology class URI assigned to this habit.
/// [language] is the original language code of the habit (e.g. 'en', 'de').
/// [hasTranslation] indicates whether [name] is a translation (vs. original).
/// [originalText] is the raw text as submitted by the contributor.
class HabitNode {
  final String id;
  final String name;
  final String originalText;
  final String category;
  final String bcioClass;
  final Map<String, int> annotationCounts;

  /// ISO 639-1 code of the habit's original language (empty if unknown).
  final String language;

  /// True when [name] is a translation into the requested locale;
  /// false when [name] is the original text (no translation available).
  final bool hasTranslation;

  const HabitNode({
    required this.id,
    required this.name,
    this.originalText = '',
    required this.category,
    required this.bcioClass,
    required this.annotationCounts,
    this.language = '',
    this.hasTranslation = true,
  });

  /// Sum of all annotation counts across all annotation types.
  int get totalAnnotations =>
      annotationCounts.values.fold(0, (sum, c) => sum + c);

  static Map<String, int> _parseCounts(dynamic raw) {
    if (raw is! Map) return {};
    return raw.map((k, v) => MapEntry(k as String, (v as num).toInt()));
  }

  factory HabitNode.fromJson(Map<String, dynamic> json) {
    return HabitNode(
      id: json['id'] as String,
      name: json['name'] as String,
      category: json['category'] as String? ?? '',
      bcioClass: json['bcioClass'] as String? ?? '',
      annotationCounts: _parseCounts(json['annotationCounts']),
    );
  }

  /// Creates a [HabitNode] from the GET /api/v1/habits?lang=X response format.
  factory HabitNode.fromDonatedJson(
    Map<String, dynamic> json,
    String requestedLang,
  ) {
    final original = json['original'] as String? ?? '';
    final lang = json['language'] as String? ?? '';
    final displayText = json['displayText'] as String?;
    final name = displayText ?? original;
    final isTranslated = displayText != null && displayText != original;
    return HabitNode(
      id: json['uuid'] as String,
      name: name,
      originalText: original,
      category: json['category'] as String? ?? 'Other',
      bcioClass: json['bcioClass'] as String? ?? '',
      annotationCounts: _parseCounts(json['annotationCounts']),
      language: lang,
      hasTranslation: lang == requestedLang || isTranslated,
    );
  }
}
