/// Riverpod provider for the community-comments on/off switch, persisted in
/// secure storage.
///
/// This is this app's equivalent of App Store Guideline 1.2's "ability to
/// block abusive users from the service": comments are anonymous by design
/// (no identity to block a specific poster from), so instead a participant
/// can turn the whole comment feature off for themselves from Settings.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kCommentsEnabledKey = 'comments_enabled';
const _storage = FlutterSecureStorage();

/// Manages whether community comments are enabled, persisting the choice in
/// secure storage. Defaults to enabled.
class CommentsEnabledNotifier extends Notifier<bool> {
  bool _initialized = false;

  @override
  bool build() {
    if (!_initialized) {
      _initialized = true;
      scheduleMicrotask(_load);
    }
    return true;
  }

  Future<void> _load() async {
    final value = await _storage.read(key: _kCommentsEnabledKey);
    if (!ref.mounted) return;
    state = value != 'false';
  }

  /// Enables or disables community comments and persists the choice.
  Future<void> setEnabled(bool value) async {
    state = value;
    await _storage.write(
      key: _kCommentsEnabledKey,
      value: value.toString(),
    );
  }
}

/// Provides whether community comments are enabled.
final commentsEnabledProvider =
    NotifierProvider<CommentsEnabledNotifier, bool>(
  CommentsEnabledNotifier.new,
);
