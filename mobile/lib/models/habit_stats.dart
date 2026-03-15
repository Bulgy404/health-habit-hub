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
