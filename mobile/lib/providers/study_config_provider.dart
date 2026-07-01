import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/study_group_config.dart';
import '../services/study_config_service.dart';

/// Resolved group config for the currently authenticated participant.
///
/// Returns null when the user is not enrolled in a study (public path).
/// Should be read on app startup after authentication.
final studyConfigProvider = FutureProvider<StudyGroupConfig?>((ref) {
  return ref.watch(studyConfigServiceProvider).fetchMyConfig();
});

/// Whether the user is enrolled in a study.
final isStudyParticipantProvider = Provider<bool>((ref) {
  return ref
      .watch(studyConfigProvider)
      .maybeWhen(data: (c) => c != null, orElse: () => false);
});

/// Whether habits should be automatically donated for the current group.
final autoDonateProvider = Provider<bool>((ref) {
  return ref
      .watch(studyConfigProvider)
      .maybeWhen(data: (c) => c?.autoDonate ?? false, orElse: () => false);
});
