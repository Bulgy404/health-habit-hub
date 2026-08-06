/// Aggregated habit statistics returned by GET /api/v1/habits/stats.
class HabitStats {
  /// Total number of donated habits in the community.
  final int total;

  /// Habit counts broken down by category.
  final List<CategoryCount> byCategory;

  /// Habit counts broken down by submission date.
  final List<DayCount> byDay;

  /// Creates a [HabitStats].
  const HabitStats({
    required this.total,
    required this.byCategory,
    required this.byDay,
  });

  /// Deserialises [HabitStats] from the API JSON payload.
  factory HabitStats.fromJson(Map<String, dynamic> json) {
    return HabitStats(
      total: (json['total'] as num? ?? 0).toInt(),
      byCategory: ((json['byCategory'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(CategoryCount.fromJson)
          .toList(),
      byDay: ((json['byDay'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(DayCount.fromJson)
          .toList(),
    );
  }
}

/// Habit count for a single category.
class CategoryCount {
  /// Category name.
  final String category;

  /// Number of habits in this category.
  final int count;

  /// Creates a [CategoryCount].
  const CategoryCount({required this.category, required this.count});

  /// Deserialises a [CategoryCount] from JSON.
  factory CategoryCount.fromJson(Map<String, dynamic> json) {
    return CategoryCount(
      category: json['category'] as String? ?? 'Unknown',
      count: (json['count'] as num? ?? 0).toInt(),
    );
  }
}

/// Habit count for a single behaviour dimension.
class DimensionStat {
  /// Dimension identifier.
  final String dimension;

  /// Human-readable dimension label.
  final String label;

  /// Number of habits in this dimension.
  final int count;

  /// Creates a [DimensionStat].
  const DimensionStat({
    required this.dimension,
    required this.label,
    required this.count,
  });

  /// Deserialises a [DimensionStat] from JSON.
  factory DimensionStat.fromJson(Map<String, dynamic> json) {
    return DimensionStat(
      dimension: json['dimension'] as String? ?? '',
      label: json['label'] as String? ?? '',
      count: (json['count'] as num? ?? 0).toInt(),
    );
  }
}

/// A donated habit belonging to the current authenticated user.
class MyHabit {
  /// Unique habit identifier.
  final String id;

  /// Display label (may be translated).
  final String label;

  /// Original text as submitted by the contributor.
  final String originalText;

  /// ISO 639-1 language code of the original habit text.
  final String language;

  /// Dimension identifiers this habit belongs to.
  final List<String> dimensions;

  /// Maps annotation type identifiers to cumulative counts.
  final Map<String, int> annotationCounts;

  /// When this habit was donated, if known.
  final DateTime? createdAt;

  /// Creates a [MyHabit].
  const MyHabit({
    required this.id,
    required this.label,
    required this.originalText,
    required this.language,
    required this.dimensions,
    required this.annotationCounts,
    this.createdAt,
  });

  /// Sum of all annotation counts across all annotation types.
  int get totalAnnotations =>
      annotationCounts.values.fold(0, (s, c) => s + c);

  /// Deserialises a [MyHabit] from JSON.
  factory MyHabit.fromJson(Map<String, dynamic> json) {
    final counts =
        ((json['annotationCounts'] as Map<String, dynamic>?) ?? {})
            .map((k, v) => MapEntry(k, (v as num).toInt()));
    return MyHabit(
      id: json['id'] as String? ?? '',
      label: json['label'] as String? ?? '',
      originalText: json['originalText'] as String? ?? '',
      language: json['language'] as String? ?? '',
      dimensions: ((json['dimensions'] as List<dynamic>?) ?? [])
          .cast<String>()
          .toList(),
      annotationCounts: counts,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
    );
  }
}

/// Aggregated stats for the current authenticated user's donated habits.
class MyStats {
  /// Total number of habits donated by this user.
  final int total;

  /// Per-dimension breakdown of the user's habits.
  final List<DimensionStat> byDimension;

  /// The user's individual donated habits.
  final List<MyHabit> habits;

  /// Creates a [MyStats].
  const MyStats({
    required this.total,
    required this.byDimension,
    required this.habits,
  });

  /// Deserialises [MyStats] from the API JSON payload.
  factory MyStats.fromJson(Map<String, dynamic> json) {
    return MyStats(
      total: (json['total'] as num? ?? 0).toInt(),
      byDimension: ((json['byDimension'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(DimensionStat.fromJson)
          .toList(),
      habits: ((json['habits'] as List<dynamic>?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(MyHabit.fromJson)
          .toList(),
    );
  }
}

/// Habit submission count for a specific calendar date.
class DayCount {
  /// ISO 8601 date string (e.g. `'2025-06-01'`).
  final String date;

  /// Number of habits donated on this date.
  final int count;

  /// Creates a [DayCount].
  const DayCount({required this.date, required this.count});

  /// Deserialises a [DayCount] from JSON.
  factory DayCount.fromJson(Map<String, dynamic> json) {
    return DayCount(
      date: json['date'] as String? ?? '',
      count: (json['count'] as num? ?? 0).toInt(),
    );
  }
}
