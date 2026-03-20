import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'auth_provider.dart';

/// Holds the active app locale and persists it via the backend users API.
class LocaleNotifier extends StateNotifier<Locale> {
  LocaleNotifier(this._ref) : super(const Locale('en'));

  final Ref _ref;
  final _dio = Dio();

  static const _apiBaseUrl = AppConfig.apiBaseUrl;

  Future<Map<String, String>> _authHeaders() async {
    final authService = _ref.read(authServiceProvider);
    final token = await authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  /// Changes locale locally and calls PUT /api/v1/users/me to persist.
  ///
  /// Returns true on success, false on API error.
  Future<bool> setLocale(Locale locale) async {
    final langCode = locale.languageCode;
    try {
      final headers = await _authHeaders();
      await _dio.put<void>(
        '$_apiBaseUrl/users/me',
        data: {'preferredLanguage': langCode},
        options: Options(headers: headers),
      );
      state = locale;
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Applies a locale that was already persisted (e.g. loaded on startup).
  void applyLocale(Locale locale) {
    state = locale;
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>(
  (ref) => LocaleNotifier(ref),
);
