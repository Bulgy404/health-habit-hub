import 'package:flutter_riverpod/flutter_riverpod.dart';

class AnnotationStateNotifier extends Notifier<Map<String, Set<String>>> {
  @override
  Map<String, Set<String>> build() => {};

  bool isAnnotated(String habitId, String type) =>
      state[habitId]?.contains(type) ?? false;

  void toggle(String habitId, String type) {
    final next = {
      for (final e in state.entries) e.key: Set<String>.from(e.value),
    };
    final set = next.putIfAbsent(habitId, Set.new);
    if (!set.remove(type)) set.add(type);
    state = next;
  }
}

final annotationStateProvider =
    NotifierProvider<AnnotationStateNotifier, Map<String, Set<String>>>(
  AnnotationStateNotifier.new,
);
