/// Riverpod providers for the habit bubble graph.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/bubble_graph.dart';
import '../services/habit_service.dart';
import 'locale_provider.dart';

/// Fetches the habit bubble graph from the backend API.
///
/// Watches [habitServiceProvider] so a new request is made whenever the
/// underlying service instance changes (e.g. after login/logout), and
/// [localeProvider] so habit labels re-resolve to the new language as soon
/// as the user switches the app's language.
final bubbleGraphProvider = FutureProvider<BubbleGraph>((ref) {
  final lang = ref.watch(localeProvider).languageCode;
  return ref.watch(habitServiceProvider).fetchBubbleGraph(lang);
});
