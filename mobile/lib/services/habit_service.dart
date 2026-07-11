import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../core/exceptions.dart';
import '../models/bubble_graph.dart';
import '../models/habit_node.dart';
import '../models/habit_stats.dart'; // HabitStats, MyStats, etc.

/// Service for fetching public habit data and submitting anonymous annotations.
class HabitService {
  static const _baseUrl = AppConfig.apiBaseUrl;

  /// Creates a [HabitService] using [dio].
  HabitService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Returns all anonymized habit nodes from the public graph.
  Future<List<HabitNode>> fetchPublicHabits() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/habits/public',
    );
    return (response.data ?? [])
        .cast<Map<String, dynamic>>()
        .map(HabitNode.fromJson)
        .toList();
  }

  /// Returns the authenticated user's donated habits + dimension breakdown,
  /// with habit labels resolved in [lang].
  Future<MyStats> fetchMyStats(String lang) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/habits/my-stats',
        queryParameters: {'lang': lang},
      );
      return MyStats.fromJson(response.data ?? {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
  }

  /// Returns aggregated habit statistics (total, byCategory, byDay).
  Future<HabitStats> fetchStats() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/habits/stats',
    );
    return HabitStats.fromJson(response.data ?? {});
  }

  /// Returns the bubble-graph: dimensions → habits, for the drill-down view.
  /// [lang] resolves each habit's display label to the matching translation
  /// (or the original sentence, if the habit was donated in that language).
  Future<BubbleGraph> fetchBubbleGraph(String lang) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/habits/bubble-graph',
        queryParameters: {'lang': lang},
      );
      return BubbleGraph.fromJson(response.data ?? {'dimensions': []});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
  }

  /// Returns donated habits from the authenticated graph, with display text
  /// resolved in [lang] (e.g. 'en' or 'de').
  Future<List<HabitNode>> fetchDonatedHabits(String lang) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '$_baseUrl/habits',
        queryParameters: {'lang': lang},
      );
      return (response.data ?? [])
          .cast<Map<String, dynamic>>()
          .map((json) => HabitNode.fromDonatedJson(json, lang))
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
  }

  /// Returns the uuids of the habits most semantically similar to [id]
  /// (embedding similarity, most-similar first), capped at [limit]. Returns an
  /// empty list on error or when the habit has no embedding yet, so callers can
  /// fall back to a local heuristic.
  Future<List<String>> fetchRelatedHabitIds(String id, {int limit = 10}) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '$_baseUrl/habits/$id/related',
        queryParameters: {'limit': limit},
      );
      return (response.data ?? [])
          .whereType<Map<String, dynamic>>()
          .map((j) => (j['uuid'] ?? '').toString())
          .where((s) => s.isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Returns the current user's own annotations grouped by type.
  /// Keys are 'helpful' and 'iDoThis', values are lists of habit IDs.
  Future<Map<String, List<String>>> fetchMyAnnotations() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/habits/my-annotations',
      );
      final data = response.data ?? {};
      return {
        'helpful': List<String>.from(data['helpful'] as List? ?? []),
        'iDoThis': List<String>.from(data['iDoThis'] as List? ?? []),
      };
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      rethrow;
    }
  }

  /// Submits or removes an annotation of [type] ('helpful' or 'iDoThis') for
  /// habit [id]. Pass [remove] to undo a previous annotation.
  /// Returns the updated annotation counts.
  Future<Map<String, int>> annotateHabit(
    String id,
    String type, {
    bool remove = false,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/habits/$id/annotate',
      data: {'type': type, if (remove) 'remove': true},
    );
    return ((response.data?['annotationCounts'] as Map<String, dynamic>?) ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
  }

  /// Fetches anonymous community comments for habit [id], newest first.
  Future<List<HabitComment>> fetchComments(String id) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/habits/$id/comments',
    );
    return (response.data?['comments'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(HabitComment.fromJson)
        .toList();
  }

  /// Posts an anonymous comment on habit [id]. Returns the created comment.
  ///
  /// The comment may come back with [HabitComment.approved] false if the
  /// backend's auto-moderation flagged it — callers must not display it in
  /// that case (see [_NodeDetailSheetState._postComment]), even locally on
  /// the poster's own device.
  Future<HabitComment> addComment(String id, String text) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/habits/$id/comments',
      data: {'text': text},
    );
    return HabitComment.fromJson(
      response.data!['comment'] as Map<String, dynamic>,
    );
  }

  /// Reports comment [commentId] on habit [id] as objectionable.
  ///
  /// Immediately pulls it out of the public listing (server-side) and
  /// re-queues it for admin/researcher review — it stays hidden from
  /// everyone, including the original poster, until re-approved.
  Future<void> reportComment(String id, String commentId) {
    return _dio.post<void>('$_baseUrl/habits/$id/comments/$commentId/report');
  }
}

/// An anonymous community comment on a donated habit.
class HabitComment {
  /// Creates a [HabitComment].
  const HabitComment({
    required this.id,
    required this.text,
    required this.createdAt,
    this.approved = true,
  });

  /// Parses a comment from the API response.
  ///
  /// `approved` is absent from list-endpoint entries (already filtered
  /// server-side to approved-only), so it defaults to true there; the
  /// create-comment response always includes it explicitly.
  factory HabitComment.fromJson(Map<String, dynamic> json) => HabitComment(
        id: json['id']?.toString() ?? '',
        text: json['text']?.toString() ?? '',
        createdAt: json['createdAt']?.toString() ?? '',
        approved: json['approved'] as bool? ?? true,
      );

  /// Neo4j Comment node id.
  final String id;

  /// Comment text.
  final String text;

  /// ISO timestamp.
  final String createdAt;

  /// Whether this comment has passed moderation and is publicly visible.
  final bool approved;
}

/// Provides the singleton [HabitService] instance.
final habitServiceProvider = Provider<HabitService>((ref) {
  return HabitService(dio: ref.watch(dioProvider));
});

/// Fetches aggregated habit statistics (community totals).
/// Cached per Riverpod lifecycle; re-evaluated when habitServiceProvider rebuilds.
final habitStatsProvider = FutureProvider<HabitStats>((ref) {
  return ref.watch(habitServiceProvider).fetchStats();
});

/// The authenticated user's own annotations ('helpful'/'iDoThis'), grouped by
/// type. Backs the Explore "Saved" tab; invalidated whenever that tab is
/// revisited (see `ExploreScreen._handleTabChange`) so a habit annotated
/// moments ago — including one the user donated themself — shows up
/// immediately instead of waiting on a stale cached fetch.
final myAnnotationsProvider = FutureProvider<Map<String, List<String>>>((ref) {
  return ref.watch(habitServiceProvider).fetchMyAnnotations();
});
