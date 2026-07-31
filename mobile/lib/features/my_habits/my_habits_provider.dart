// mobile/lib/features/my_habits/my_habits_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/locale_provider.dart';
import 'my_habits_models.dart';
import 'my_habits_service.dart';

/// Resolved cue configuration for the current user (study or public default).
final habitConfigProvider = FutureProvider<HabitConfig>((ref) {
  final lang = ref.watch(localeProvider).languageCode;
  return ref.watch(myHabitsServiceProvider).fetchHabitConfig(lang);
});

/// Whether the recommender feature is enabled for the current participant's
/// study. Defaults to `true` while the config is loading or on error, so the
/// recommender is only hidden once we positively know the study disabled it.
final recommenderEnabledProvider = Provider<bool>((ref) {
  return ref
      .watch(habitConfigProvider)
      .maybeWhen(data: (c) => c.recommenderEnabled, orElse: () => true);
});

/// Whether habit creation is enabled for the current participant's study.
/// When `false`, the participant has no way to ever get a habit (no catalog
/// fallback exists), so the My Habits tab is hidden entirely rather than
/// showing a screen that can never contain anything. Defaults to `true`
/// while the config is loading or on error, matching
/// [recommenderEnabledProvider]'s fail-open behaviour.
final habitCreationEnabledProvider = Provider<bool>((ref) {
  return ref
      .watch(habitConfigProvider)
      .maybeWhen(data: (c) => c.selfHabitCreationEnabled, orElse: () => true);
});

/// All active implementation intentions for the current user.
final intentionsProvider = FutureProvider<List<Intention>>((ref) {
  return ref.watch(myHabitsServiceProvider).listIntentions();
});

/// SRHI windows that are currently due for submission.
final dueSrhiProvider = FutureProvider<List<SrhiWindow>>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchDueSrhi();
});

/// Per-habit reminder-frequency tier (intentionId → 'daily'…'off'), used for
/// the §7.5 traffic-light indicator on each habit card.
final reminderFrequenciesProvider =
    FutureProvider<Map<String, String>>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchReminderFrequencies();
});

/// The participant's §7.3 Information Overload preferences/eligibility, used to
/// show and drive the opt-out toggle in settings.
final informationOverloadPrefsProvider =
    FutureProvider<InformationOverloadPrefs>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchInformationOverloadPrefs();
});

/// The §7.5 gamification summary (XP, level, badges) for the current user.
final gamificationProvider = FutureProvider<Gamification>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchGamification();
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

/// Daily enactment counts across every active intention, keyed by
/// midnight-normalised date — feeds the GitHub-style contribution graph at
/// the top of the My Habits page. A day's count is how many distinct habits
/// were logged as enacted that day, so busier days render darker green.
final allHabitsActivityProvider = FutureProvider<Map<DateTime, int>>((
  ref,
) async {
  final intentions = await ref.watch(intentionsProvider.future);
  final active = intentions.where((i) => i.status == 'active').toList();
  final service = ref.watch(myHabitsServiceProvider);
  final logsByIntention = await Future.wait(
    active.map((i) => service.fetchLogs(i.id)),
  );

  final counts = <DateTime, int>{};
  for (final logs in logsByIntention) {
    for (final log in logs) {
      if (!log.enacted) continue;
      final parts = log.date.split('-');
      if (parts.length != 3) continue;
      final year = int.tryParse(parts[0]);
      final month = int.tryParse(parts[1]);
      final day = int.tryParse(parts[2]);
      if (year == null || month == null || day == null) continue;
      final key = DateTime(year, month, day);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
});
