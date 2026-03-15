// Model for a single habit donation entry from the admin habits feed.
class HabitDonation {
  HabitDonation({
    required this.id,
    required this.participantId,
    required this.habitName,
    required this.category,
    required this.donatedAt,
    this.group,
  });

  factory HabitDonation.fromJson(Map<String, dynamic> json) {
    return HabitDonation(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      participantId: (json['participantId'] ?? '').toString(),
      habitName: (json['habitName'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      donatedAt: json['donatedAt'] != null
          ? DateTime.tryParse(json['donatedAt'].toString()) ?? DateTime(0)
          : DateTime(0),
      group: json['group']?.toString(),
    );
  }

  final String id;
  final String participantId;
  final String habitName;
  final String category;
  final DateTime donatedAt;
  final String? group;
}

/// Paginated response from GET /api/v1/admin/habits/feed.
class HabitsFeedResult {
  HabitsFeedResult({
    required this.total,
    required this.page,
    required this.limit,
    required this.results,
  });

  factory HabitsFeedResult.fromJson(Map<String, dynamic> json) {
    final rawResults = json['results'] as List<dynamic>? ?? [];
    return HabitsFeedResult(
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? 50,
      results: rawResults
          .map((e) => HabitDonation.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final int total;
  final int page;
  final int limit;
  final List<HabitDonation> results;
}
