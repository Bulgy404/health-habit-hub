/// Riverpod providers for cross-screen navigation into the habit graph.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/habit_stats.dart';
import '../services/habit_service.dart';

/// Identifies a specific habit within a dimension for graph navigation.
class HabitGraphSelection {
  /// Unique habit identifier.
  final String habitId;

  /// Dimension identifier the habit belongs to.
  final String dimensionId;

  /// Creates a [HabitGraphSelection].
  const HabitGraphSelection({required this.habitId, required this.dimensionId});
}

/// Manages the pending graph selection request.
///
/// Set a selection to prompt [ExploreScreen] to open the matching habit's
/// detail sheet; the screen clears the selection after handling it.
class ShowInGraphNotifier extends Notifier<HabitGraphSelection?> {
  @override
  HabitGraphSelection? build() => null;

  /// Requests that the Explore screen navigate to [selection].
  void select(HabitGraphSelection selection) => state = selection;

  /// Clears any pending navigation request.
  void clear() => state = null;
}

/// Set this to request the Explore screen to open a specific habit's detail.
///
/// The [ExploreScreen] will clear it after handling.
final showInGraphProvider =
    NotifierProvider<ShowInGraphNotifier, HabitGraphSelection?>(
  ShowInGraphNotifier.new,
);

/// The authenticated user's donated habits and dimension stats.
///
/// Fetches from [HabitService.fetchMyStats].
final myStatsProvider = FutureProvider<MyStats>((ref) {
  return ref.watch(habitServiceProvider).fetchMyStats();
});
