import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/habit_graph.dart';
import '../services/habit_service.dart';

/// Fetches the Habit↔BCIOConcept graph. Re-evaluated on invalidation (refresh).
final habitGraphProvider = FutureProvider<HabitGraph>((ref) {
  return ref.watch(habitServiceProvider).fetchHabitGraph();
});
