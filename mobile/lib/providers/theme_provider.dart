import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kThemeModeKey = 'theme_mode';
const _storage = FlutterSecureStorage();

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

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);
