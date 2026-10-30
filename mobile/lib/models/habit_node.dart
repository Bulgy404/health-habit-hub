/// Represents a single donated habit node in the habit graph.
///
/// [annotationCounts] maps annotation type (e.g. 'thumbUp', 'star') to count.
/// [bcioClass] is the BCIO ontology class URI assigned to this habit.
/// [language] is the original language code of the habit (e.g. 'en', 'de').
/// [hasTranslation] indicates whether [name] is a translation (vs. original).
/// [originalText] is the raw text as submitted by the contributor.
class HabitNode {
  /// Unique habit identifier (UUID).
  final String id;

  /// Display name (possibly translated, see [hasTranslation]).
  final String name;

  /// Raw text as submitted by the contributor.
  final String originalText;

  /// Habit category label (e.g. `'Nutrition'`).
  final String category;

  /// BCIO ontology class URI assigned to this habit.
  final String bcioClass;

  /// Annotation type → count map (e.g. `{'thumbUp': 3, 'star': 1}`).
  final Map<String, int> annotationCounts;

  /// ISO 639-1 code of the habit's original language (empty if unknown).
  final String language;

  /// True when [name] is a translation into the requested locale;
  /// false when [name] is the original text (no translation available).
  final bool hasTranslation;

  /// The exact phrase the classifier matched for [category] (e.g.
  /// `'at the gym'` for Location) — a substring of [originalText], used to
  /// bold that span in the detail sheet instead of only showing the
  /// category badge. Empty when nothing was matched.
  final String contextText;

  /// `'build'` or `'quit'` (§7.4), as the donor set it. Carried over when a
  /// participant copies this habit into their own habits (#4).
  final String habitType;

  /// Creates a [HabitNode].
  const HabitNode({
    required this.id,
    required this.name,
    this.originalText = '',
    required this.category,
    required this.bcioClass,
    required this.annotationCounts,
    this.language = '',
    this.hasTranslation = true,
    this.contextText = '',
    this.habitType = 'build',
  });

  /// Sum of all annotation counts across all annotation types.
  int get totalAnnotations =>
      annotationCounts.values.fold(0, (sum, c) => sum + c);

  /// Splits [name] for copying into the participant's own habits (#4): the
  /// [contextText] phrase becomes the cue and the rest the behaviour, so the
  /// plan does not name the situation twice ("No phone after 10pm" → "No
  /// phone" + "after 10pm"). When the phrase is empty, not in [name] (which
  /// is then a translation), or the whole of it, [name] is the behaviour and
  /// there is no cue.
  ({String behavior, String? cue}) splitForCopy() {
    final phrase = contextText.trim();
    final at = phrase.isEmpty ? -1 : name.indexOf(phrase);
    if (at < 0) return (behavior: name, cue: null);
    final rest =
        '${name.substring(0, at)} ${name.substring(at + phrase.length)}'
            .replaceAll(RegExp(r'\s+'), ' ')
            .replaceAllMapped(RegExp(r' ([,;:.!?])'), (m) => m[1]!)
            .replaceAll(RegExp(r'^[\s,;:.–—-]+|[\s,;:.–—-]+$'), '');
    if (rest.isEmpty) return (behavior: name, cue: null);
    // A phrase that opened a capitalised sentence ("After work, go for a
    // walk") leaves the behaviour starting mid-sentence.
    final behavior = at == 0 && name[0] != name[0].toLowerCase()
        ? rest[0].toUpperCase() + rest.substring(1)
        : rest;
    return (behavior: behavior, cue: phrase);
  }

  static Map<String, int> _parseCounts(dynamic raw) {
    if (raw is! Map) return {};
    return raw.map((k, v) => MapEntry(k as String, (v as num).toInt()));
  }

  /// Deserialises from the habit graph API response.
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
