/// Model for a single habit donation entry from the admin habits feed.
class HabitDonation {
  /// Creates a [HabitDonation].
  HabitDonation({
    required this.id,
    required this.participantId,
    required this.habitName,
    required this.category,
    required this.donatedAt,
    this.group,
  });

  /// Deserialises a [HabitDonation] from JSON.
  factory HabitDonation.fromJson(Map<String, dynamic> json) {
    return HabitDonation(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      participantId: (json['participantId'] ?? '').toString(),
      habitName: (json['habitName'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      donatedAt: json['donatedAt'] != null
          ? DateTime.tryParse(json['donatedAt'].toString())
          : null,
      group: json['group']?.toString(),
    );
  }

  /// Unique donation identifier.
  final String id;

  /// Identifier of the participant who donated this habit.
  final String participantId;

  /// Habit name as stored in the graph.
  final String habitName;

  /// Category / dimension the habit was assigned to.
  final String category;

  /// Timestamp when the habit was donated (nullable if not recorded).
  final DateTime? donatedAt;

  /// Study group of the donating participant (nullable).
  final String? group;
}

/// Paginated response from GET /api/v1/admin/habits/feed.
class HabitsFeedResult {
  /// Creates a [HabitsFeedResult].
  HabitsFeedResult({
    required this.total,
    required this.page,
    required this.limit,
    required this.results,
  });

  /// Deserialises a [HabitsFeedResult] from the API JSON payload.
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

  /// Total number of donations matching the query.
  final int total;

  /// Current page number (1-indexed).
  final int page;

  /// Page size requested.
  final int limit;

  /// Donations on the current page.
  final List<HabitDonation> results;
}
