import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/bubble_graph.dart';
import '../services/habit_service.dart';

final bubbleGraphProvider = FutureProvider<BubbleGraph>((ref) {
  return ref.watch(habitServiceProvider).fetchBubbleGraph();
});
