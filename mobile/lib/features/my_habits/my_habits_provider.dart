// mobile/lib/features/my_habits/my_habits_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'my_habits_models.dart';
import 'my_habits_service.dart';

/// Resolved cue configuration for the current user (study or public default).
final habitConfigProvider = FutureProvider<HabitConfig>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchHabitConfig();
});

/// All active implementation intentions for the current user.
final intentionsProvider = FutureProvider<List<Intention>>((ref) {
  return ref.watch(myHabitsServiceProvider).listIntentions();
});

/// SRHI windows that are currently due for submission.
final dueSrhiProvider = FutureProvider<List<SrhiWindow>>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchDueSrhi();
});

/// Daily logs for a specific intention. Keyed by intentionId.
final intentionLogsProvider =
    FutureProvider.family<List<DailyLog>, String>((ref, intentionId) {
  return ref.watch(myHabitsServiceProvider).fetchLogs(intentionId);
});

/// SRHI trajectory (submitted weeks) for a specific intention. Keyed by intentionId.
final srhiTrajectoryProvider =
    FutureProvider.family<List<SrhiTrajectoryPoint>, String>(
        (ref, intentionId) {
  return ref
      .watch(myHabitsServiceProvider)
      .fetchTrajectory(intentionId);
});
