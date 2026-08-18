import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../screens/donate/widgets/donate_form_widget.dart';

/// A previously-failed habit submission pending retry, along with retry
/// bookkeeping so [OfflineQueueService] can give up on entries that keep
/// failing instead of holding onto them forever.
class QueuedSubmission {
  const QueuedSubmission({
    required this.payload,
    required this.attempts,
    required this.queuedAt,
  });

  final Map<String, dynamic> payload;
  final int attempts;
  final DateTime queuedAt;
}

/// Persists failed habit submissions so they can be retried when connectivity
/// is restored.
///
/// Entries contain free-text health data (`sentence`, `health_benefit`,
/// `wellbeing_impact`), so the queue is stored in [FlutterSecureStorage] —
/// the same encrypted-at-rest storage used for auth tokens — rather than
/// plaintext SharedPreferences. Entries that fail repeatedly or sit for too
/// long are dropped rather than retried indefinitely.
class OfflineQueueService {
  OfflineQueueService({FlutterSecureStorage? secureStorage})
    : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  static const _key = 'offline_habit_queue';

  /// Entries that have failed this many times are dropped — a payload the
  /// server keeps rejecting (e.g. validation error) would otherwise sit in
  /// storage and be retried forever on every reconnect.
  static const maxAttempts = 5;

  /// Entries older than this are dropped regardless of attempt count.
  static const maxAge = Duration(days: 7);

  final FlutterSecureStorage _secureStorage;

  /// Appends [values] (submitted in [language]) to the persistent queue.
  Future<void> enqueue(DonateFormValues values, String language) async {
    await _append(
      QueuedSubmission(
        payload: {
          'sentence': values.sentence,
          'language': language,
          'frequency': values.frequency,
          'health_benefit': values.healthBenefit,
          'wellbeing_impact': values.wellbeing,
          // The recorded audio itself isn't retried through the offline
          // queue (its local temp file isn't guaranteed to survive), but the
          // sentence's origin is still worth attributing correctly.
          'inputMode': values.inputMode,
        },
        attempts: 0,
        queuedAt: DateTime.now(),
      ),
    );
  }

  /// Returns all pending submissions and atomically clears the queue.
  Future<List<QueuedSubmission>> drain() async {
    final entries = await _readAll();
    if (entries.isEmpty) return [];
    await _secureStorage.delete(key: _key);
    return entries;
  }

  /// Re-adds [submission] after a failed retry, unless it has exceeded
  /// [maxAttempts] or [maxAge], in which case it is dropped permanently.
  Future<void> requeue(QueuedSubmission submission) async {
    final nextAttempts = submission.attempts + 1;
    final age = DateTime.now().difference(submission.queuedAt);
    if (nextAttempts >= maxAttempts || age >= maxAge) return;
    await _append(
      QueuedSubmission(
        payload: submission.payload,
        attempts: nextAttempts,
        queuedAt: submission.queuedAt,
      ),
    );
  }

  /// Returns true when there is at least one pending submission.
  Future<bool> get hasPending async => (await _readAll()).isNotEmpty;

  Future<List<QueuedSubmission>> _readAll() async {
    final raw = await _secureStorage.read(key: _key);
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw) as List<dynamic>;
    return decoded
        .map((e) {
          final m = e as Map<String, dynamic>;
          return QueuedSubmission(
            payload: m['payload'] as Map<String, dynamic>,
            attempts: m['attempts'] as int? ?? 0,
            queuedAt:
                DateTime.tryParse(m['queuedAt'] as String? ?? '') ??
                DateTime.now(),
          );
        })
        .toList();
  }

  Future<void> _append(QueuedSubmission submission) async {
    final entries = await _readAll()..add(submission);
    final encoded = jsonEncode(
      entries
          .map(
            (e) => {
              'payload': e.payload,
              'attempts': e.attempts,
              'queuedAt': e.queuedAt.toIso8601String(),
            },
          )
          .toList(),
    );
    await _secureStorage.write(key: _key, value: encoded);
  }
}

/// Singleton provider — one instance for the app lifetime.
OfflineQueueService get offlineQueueService => _instance;
final _instance = OfflineQueueService();
