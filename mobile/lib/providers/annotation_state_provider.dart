/// Riverpod provider for tracking in-session habit annotation state.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Manages which annotation types the current user has toggled for each habit.
///
/// State is a map of habit ID → set of toggled annotation type strings.
/// This is ephemeral in-session state — it is not persisted to storage.
class AnnotationStateNotifier extends Notifier<Map<String, Set<String>>> {
  @override
  Map<String, Set<String>> build() => {};

  /// Returns true if [type] has been toggled on for [habitId].
  bool isAnnotated(String habitId, String type) =>
      state[habitId]?.contains(type) ?? false;

  /// Toggles [type] on or off for [habitId].
  void toggle(String habitId, String type) {
    final next = {
      for (final e in state.entries) e.key: Set<String>.from(e.value),
    };
    final set = next.putIfAbsent(habitId, Set.new);
    if (!set.remove(type)) set.add(type);
    state = next;
  }
}

/// Provides the in-session annotation toggle state.
///
/// Use [AnnotationStateNotifier.toggle] to toggle an annotation and
/// [AnnotationStateNotifier.isAnnotated] to read the current state.
final annotationStateProvider =
    NotifierProvider<AnnotationStateNotifier, Map<String, Set<String>>>(
  AnnotationStateNotifier.new,
);
