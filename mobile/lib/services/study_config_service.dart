import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../models/study_group_config.dart';

/// Fetches the authenticated participant's resolved group config.
class StudyConfigService {
  StudyConfigService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Returns the study group config, or null if the user is not enrolled.
  Future<StudyGroupConfig?> fetchMyConfig() async {
    final res = await _dio.get<dynamic>(
      '${AppConfig.apiBaseUrl}/study-config/me',
    );
    if (res.data == null) return null;
    return StudyGroupConfig.fromJson(res.data as Map<String, dynamic>);
  }

  /// Calls the stitch-intention LLM endpoint.
  ///
  /// Returns a single implementation intention sentence combining [action]
  /// and [cues], or null on failure (caller should fall back to local assembly).
  Future<String?> stitchIntention({
    required String action,
    required List<String> cues,
    String language = 'en',
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/stitch-intention',
        data: {'action': action, 'cues': cues, 'language': language},
      );
      return res.data?['sentence'] as String?;
    } catch (_) {
      return null;
    }
  }

  /// §7.1 Habit Stacking — calls the stack-merge LLM endpoint, which is
  /// purpose-built to combine an anchor habit and a new behaviour into one
  /// "after/when I [anchor], I will [behaviour]" sentence, rather than
  /// treating the anchor as a generic cue (see stitchIntention above).
  ///
  /// Returns the merged sentence, or null on failure (caller should fall
  /// back to local assembly).
  Future<String?> stackMerge({
    required String anchorText,
    required String newBehaviorText,
    String language = 'en',
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/stack-merge',
        data: {
          'anchor_text': anchorText,
          'new_behavior_text': newBehaviorText,
          'language': language,
        },
      );
      return res.data?['sentence'] as String?;
    } catch (_) {
      return null;
    }
  }
}

final studyConfigServiceProvider = Provider<StudyConfigService>(
  (ref) => StudyConfigService(dio: ref.watch(dioProvider)),
);
