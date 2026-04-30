/// Aggregated habit statistics returned by GET /api/v1/habits/stats.
class HabitStats {
  final int total;
  final List<CategoryCount> byCategory;
  final List<DayCount> byDay;

  const HabitStats({
    required this.total,
    required this.byCategory,
    required this.byDay,
  });

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

class CategoryCount {
  final String category;
  final int count;

  const CategoryCount({required this.category, required this.count});

  factory CategoryCount.fromJson(Map<String, dynamic> json) {
    return CategoryCount(
      category: json['category'] as String? ?? 'Unknown',
      count: (json['count'] as num? ?? 0).toInt(),
    );
  }
}

class DimensionStat {
  final String dimension;
  final String label;
  final int count;

  const DimensionStat({
    required this.dimension,
    required this.label,
    required this.count,
  });

  factory DimensionStat.fromJson(Map<String, dynamic> json) {
    return DimensionStat(
      dimension: json['dimension'] as String? ?? '',
      label: json['label'] as String? ?? '',
      count: (json['count'] as num? ?? 0).toInt(),
    );
  }
}

class MyHabit {
  final String id;
  final String label;
  final String originalText;
  final String language;
  final List<String> dimensions;
  final Map<String, int> annotationCounts;

  const MyHabit({
    required this.id,
    required this.label,
    required this.originalText,
    required this.language,
    required this.dimensions,
    required this.annotationCounts,
  });

  int get totalAnnotations =>
      annotationCounts.values.fold(0, (s, c) => s + c);

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
    );
  }
}

class MyStats {
  final int total;
  final List<DimensionStat> byDimension;
  final List<MyHabit> habits;

  const MyStats({
    required this.total,
    required this.byDimension,
    required this.habits,
  });

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

class DayCount {
  final String date;
  final int count;

  const DayCount({required this.date, required this.count});

  factory DayCount.fromJson(Map<String, dynamic> json) {
    return DayCount(
      date: json['date'] as String? ?? '',
      count: (json['count'] as num? ?? 0).toInt(),
    );
  }
}
