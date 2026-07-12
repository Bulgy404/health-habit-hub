import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import 'auth_provider.dart';

const _kLocaleKey = 'preferred_language';
const _storage = FlutterSecureStorage();

/// Holds the active app locale and persists it via the backend users API.
///
/// On construction, reads the cached locale from secure storage immediately
/// after build and refreshes the preference from GET /api/v1/users/me.
class LocaleNotifier extends Notifier<Locale> {
  bool _initialized = false;

  static const _apiBaseUrl = AppConfig.apiBaseUrl;

  @override
  Locale build() {
    if (!_initialized) {
      _initialized = true;
      scheduleMicrotask(_initFromStorage);
    }
    return const Locale('en');
  }

  /// Load cached locale from secure storage, then refresh from API.
  Future<void> _initFromStorage() async {
    final cached = await _storage.read(key: _kLocaleKey);
    if (cached != null && _isSupported(cached) && ref.mounted) {
      state = Locale(cached);
    }
    await _fetchFromApi();
  }

  /// Fetches preferredLanguage from GET /api/v1/users/me and applies it.
  Future<void> _fetchFromApi() async {
    try {
      final headers = await _authHeaders();
      if (headers.isEmpty) return;
      final response = await ref.read(dioProvider).get<Map<String, dynamic>>(
        '$_apiBaseUrl/users/me',
        options: Options(headers: headers),
      );
      final lang = response.data?['preferredLanguage'] as String?;
      if (!ref.mounted) return;
      if (lang != null && _isSupported(lang) && lang != state.languageCode) {
        state = Locale(lang);
        await _storage.write(key: _kLocaleKey, value: lang);
      }
    } catch (e, st) {
      debugPrint('LocaleNotifier._fetchFromApi: $e\n$st');
    }
  }

  Future<Map<String, String>> _authHeaders() async {
    final authService = ref.read(authServiceProvider);
    final token = await authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  bool _isSupported(String lang) =>
      lang == 'en' ||
      lang == 'de' ||
      lang == 'ja' ||
      lang == 'fr' ||
      lang == 'nl';

  /// Changes locale locally (immediately) and syncs to the API in the
  /// background.  Local state and storage are updated before the network call
  /// so a failed or slow request never blocks the UI or triggers a logout.
  Future<bool> setLocale(Locale locale) async {
    state = locale;
    await _storage.write(key: _kLocaleKey, value: locale.languageCode);
    _syncLocaleToApi(locale.languageCode).ignore();
    return true;
  }

  Future<void> _syncLocaleToApi(String langCode) async {
    try {
      final headers = await _authHeaders();
      if (headers.isEmpty) return;
      await ref.read(dioProvider).put<void>(
        '$_apiBaseUrl/users/me',
        data: {'preferredLanguage': langCode},
        options: Options(headers: headers),
      );
    } catch (e) {
      debugPrint('LocaleNotifier._syncLocaleToApi: $e');
    }
  }

  /// Triggers a fresh fetch from the API (call after successful auth).
  Future<void> loadPreference() => _fetchFromApi();
}

/// Provides the active [Locale] and exposes [LocaleNotifier.setLocale].
final localeProvider = NotifierProvider<LocaleNotifier, Locale>(
  LocaleNotifier.new,
);
