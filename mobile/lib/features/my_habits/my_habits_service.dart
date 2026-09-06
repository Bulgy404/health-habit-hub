/// Service layer for the My Habits feature.
library;

// mobile/lib/features/my_habits/my_habits_service.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../core/exceptions.dart';
import 'my_habits_models.dart';

/// REST client for the habit intentions and SRHI API endpoints.
class MyHabitsService {
  /// Creates a [MyHabitsService] using the given Dio [dio] instance.
  MyHabitsService({required Dio dio}) : _dio = dio;

  final Dio _dio;
  static const _base = AppConfig.apiBaseUrl;

  /// Fetches the participant's resolved habit configuration from the
  /// backend, with any locale-dependent content (e.g. assigned cue text)
  /// resolved in [lang] (e.g. 'en' or 'de').
  Future<HabitConfig> fetchHabitConfig(String lang) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '$_base/me/habit-config',
        queryParameters: {'lang': lang},
      );
      return HabitConfig.fromJson(res.data ?? {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Reads the §7.5 gamification summary (XP, level, earned badges). The
  /// backend persists newly-earned badges so `newlyEarned` fires exactly once.
  Future<Gamification> fetchGamification() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '$_base/habits/intentions/gamification',
      );
      return Gamification.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Reads the participant's §7.3 preferences: whether they've opted out of the
  /// Information Overload guard, and whether opting out is even permitted for
  /// their study condition (so the settings toggle can be hidden).
  Future<InformationOverloadPrefs> fetchInformationOverloadPrefs() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('$_base/me/preferences');
      return InformationOverloadPrefs.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Sets the §7.3 Information Overload opt-out. Throws [ValidationException]
  /// (403) if opting out isn't allowed for the participant's study condition.
  Future<void> setInformationOverloadOptOut(bool optOut) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '$_base/me/preferences/information-overload-opt-out',
        data: {'optOut': optOut},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      if (e.response?.statusCode == 403) {
        throw const ValidationException('Opt-out not permitted');
      }
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Returns each active intention's current reminder-frequency tier, keyed by
  /// intention id (§7.5 traffic-light + §7.2 reminder content). The tier is the
  /// fading-reminders signal from `GET /habits/intentions/reminder-plans`.
  Future<Map<String, String>> fetchReminderFrequencies() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '$_base/habits/intentions/reminder-plans',
      );
      final plans = (res.data?['plans'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>();
      return {
        for (final p in plans)
          (p['intentionId']?.toString() ?? ''):
              (p['frequency']?.toString() ?? 'daily'),
      }..removeWhere((k, _) => k.isEmpty);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Returns all habit intentions for the current user.
  Future<List<Intention>> listIntentions() async {
    try {
      final res = await _dio.get<List<dynamic>>('$_base/habits/intentions');
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(Intention.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Creates a new habit intention and returns the persisted [Intention].
  ///
  /// Throws [ValidationException] when the participant has reached their
  /// maximum allowed intentions.
  Future<Intention> createIntention({
    required String behaviorKey,
    required String behaviorLabel,
    required int durationMinutes,
    required List<IntentionCue> cues,
    required String intentionStatement,
    // §7.4 Habit Distinction — required build/quit choice.
    required HabitType habitType,
    String? reminderTime,
    // §7.1 Habit Stacking — anchor reference, human-readable anchor label
    // (shown as its own field, not folded into cues), and creation mode.
    String? stackedOn,
    String? anchorLabel,
    String creationMode = 'standalone',
    // § weekly-frequency habits — daily by default, so a caller that never
    // passes this gets identical behavior to before this field existed.
    Cadence cadence = Cadence.daily,
    // Recommendation lineage — UUID returned by the recommendation service.
    String? recommendationId,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_base/habits/intentions',
        data: {
          'behaviorKey': behaviorKey,
          'behaviorLabel': behaviorLabel,
          'durationMinutes': durationMinutes,
          'cues': cues.map((c) => c.toJson()).toList(),
          'intentionStatement': intentionStatement,
          'habitType': habitType.wire,
          'creationMode': creationMode,
          'cadence': cadence.toJson(),
          'stackedOn': ?stackedOn,
          'anchorLabel': ?anchorLabel,
          'reminderTime': ?reminderTime,
          'sourceRecommendationId': ?recommendationId,
        },
      );
      if (res.statusCode == 409) {
        throw _limitException(res.data);
      }
      return Intention.fromJson(res.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      if (e.response?.statusCode == 409) {
        throw _limitException(e.response?.data);
      }
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Maps a 409 body to the right exception. §7.3 Information Overload returns
  /// a structured reason + the tier an existing habit must reach to unlock a
  /// new slot, so the UI can explain *why* rather than just refusing.
  Exception _limitException(dynamic body) {
    if (body is Map && body['reason'] == 'information_overload') {
      return InformationOverloadException(
        unlockTier: body['unlockTier'] as String? ?? 'weekly',
        currentTier: body['currentTier'] as String? ?? 'daily',
      );
    }
    return const ValidationException('Habit limit reached');
  }

  /// Updates the lifecycle [status] of a habit intention.
  Future<void> updateStatus(String intentionId, String status) async {
    try {
      await _dio.patch(
        '$_base/habits/intentions/$intentionId/status',
        data: {'status': status},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Logs whether the habit was [enacted] on [date] (`'YYYY-MM-DD'`).
  Future<void> logDay({
    required String intentionId,
    required String date,
    required bool enacted,
  }) async {
    try {
      await _dio.post(
        '$_base/habits/intentions/$intentionId/logs',
        data: {'date': date, 'enacted': enacted},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Removes the log entry for [intentionId] on [date] entirely, undoing a
  /// previous [logDay] call (as opposed to logging `enacted: false`, which
  /// would record an explicit miss instead of clearing the entry).
  Future<void> deleteLog({
    required String intentionId,
    required String date,
  }) async {
    try {
      await _dio.delete('$_base/habits/intentions/$intentionId/logs/$date');
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Returns daily logs for [intentionId], optionally filtered to [from]–[to].
  Future<List<DailyLog>> fetchLogs(
    String intentionId, {
    String? from,
    String? to,
  }) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        '$_base/habits/intentions/$intentionId/logs',
        queryParameters: {'from': ?from, 'to': ?to},
      );
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(DailyLog.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Returns all SRHI measurement windows that are currently due.
  Future<List<SrhiWindow>> fetchDueSrhi() async {
    try {
      final res = await _dio.get<List<dynamic>>('$_base/srhi/due');
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(SrhiWindow.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Submits SRHI [items] for [intentionId] at [weekNumber].
  ///
  /// Returns the resulting [SrhiTrajectoryPoint] with the computed score.
  Future<SrhiTrajectoryPoint> submitSrhi({
    required String intentionId,
    required int weekNumber,
    required Map<String, int> items,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_base/srhi/$intentionId/week/$weekNumber',
        data: {'items': items},
      );
      return SrhiTrajectoryPoint.fromJson(res.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  /// Returns the full SRHI score trajectory for [intentionId].
  Future<List<SrhiTrajectoryPoint>> fetchTrajectory(String intentionId) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        '$_base/srhi/$intentionId/trajectory',
      );
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(SrhiTrajectoryPoint.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }
}

/// Provides the singleton [MyHabitsService] instance.
final myHabitsServiceProvider = Provider<MyHabitsService>((ref) {
  return MyHabitsService(dio: ref.watch(dioProvider));
});
