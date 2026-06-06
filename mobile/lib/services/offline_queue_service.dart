import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../screens/donate/widgets/donate_form_widget.dart';

/// Persists failed habit submissions so they can be retried when connectivity
/// is restored.
///
/// Each entry is stored as a JSON-encoded map matching the `/habits/share`
/// request body schema.  The queue survives app restarts.
class OfflineQueueService {
  static const _key = 'offline_habit_queue';

  /// Appends [values] (submitted in [language]) to the persistent queue.
  Future<void> enqueue(DonateFormValues values, String language) async {
    await _append({
      'sentence': values.sentence,
      'language': language,
      'frequency': values.frequency,
      'duration': values.duration,
      'health_benefit': values.healthBenefit,
      'wellbeing_impact': values.wellbeing,
    });
  }

  /// Returns all pending payloads and atomically clears the queue.
  Future<List<Map<String, dynamic>>> drain() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    if (raw.isEmpty) return [];
    await prefs.remove(_key);
    return raw
        .map((s) => jsonDecode(s) as Map<String, dynamic>)
        .toList();
  }

  /// Re-adds [payload] after a failed retry so it is not lost.
  Future<void> requeue(Map<String, dynamic> payload) => _append(payload);

  /// Returns true when there is at least one pending submission.
  Future<bool> get hasPending async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_key) ?? []).isNotEmpty;
  }

  Future<void> _append(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    raw.add(jsonEncode(payload));
    await prefs.setStringList(_key, raw);
  }
}

/// Singleton provider — one instance for the app lifetime.
OfflineQueueService get offlineQueueService => _instance;
final _instance = OfflineQueueService();
