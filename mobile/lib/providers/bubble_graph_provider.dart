/// Riverpod providers for the habit bubble graph.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/bubble_graph.dart';
import '../services/habit_service.dart';

/// Fetches the habit bubble graph from the backend API.
///
/// Watches [habitServiceProvider] so a new request is made whenever the
/// underlying service instance changes (e.g. after login/logout).
final bubbleGraphProvider = FutureProvider<BubbleGraph>((ref) {
  return ref.watch(habitServiceProvider).fetchBubbleGraph();
});
