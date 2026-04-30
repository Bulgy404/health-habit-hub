import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/habit_stats.dart';
import '../services/habit_service.dart';

class HabitGraphSelection {
  final String habitId;
  final String dimensionId;
  const HabitGraphSelection({required this.habitId, required this.dimensionId});
}

class ShowInGraphNotifier extends Notifier<HabitGraphSelection?> {
  @override
  HabitGraphSelection? build() => null;

  void select(HabitGraphSelection selection) => state = selection;
  void clear() => state = null;
}

/// Set this to request the Explore screen to open a specific habit's detail.
/// The ExploreScreen will clear it after handling.
final showInGraphProvider =
    NotifierProvider<ShowInGraphNotifier, HabitGraphSelection?>(
  ShowInGraphNotifier.new,
);

/// The authenticated user's donated habits + dimension stats.
final myStatsProvider = FutureProvider<MyStats>((ref) {
  return ref.watch(habitServiceProvider).fetchMyStats();
});
