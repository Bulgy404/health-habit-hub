/// Riverpod provider for the app theme mode with secure-storage persistence.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kThemeModeKey = 'theme_mode';
const _storage = FlutterSecureStorage();

/// Manages the app [ThemeMode] and persists the user's choice in secure storage.
///
/// Initialises to [ThemeMode.system] and reads the persisted preference
/// asynchronously on first build.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  bool _initialized = false;

  @override
  ThemeMode build() {
    if (!_initialized) {
      _initialized = true;
      scheduleMicrotask(_load);
    }
    return ThemeMode.system;
  }

  Future<void> _load() async {
    final value = await _storage.read(key: _kThemeModeKey);
    if (!ref.mounted) return;
    state = switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  /// Updates the active theme [mode] and writes the choice to secure storage.
  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    await _storage.write(
      key: _kThemeModeKey,
      value: switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      },
    );
  }
}

/// Provides the current [ThemeMode] with secure-storage persistence.
///
/// Watch this in the root widget to drive [MaterialApp.themeMode].
final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);
