import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';
import 'auth_provider.dart';

const _kLocaleKey = 'preferred_language';
const _storage = FlutterSecureStorage();

/// Holds the active app locale and persists it via the backend users API.
///
/// On construction, reads the cached locale from secure storage immediately
/// (no flash of wrong language). In the background, fetches the up-to-date
/// preference from GET /api/v1/users/me and updates state if different.
class LocaleNotifier extends StateNotifier<Locale> {
  LocaleNotifier(this._ref) : super(const Locale('en')) {
    _initFromStorage();
  }

  final Ref _ref;
  final _dio = Dio();

  static const _apiBaseUrl = AppConfig.apiBaseUrl;

  /// Load cached locale from secure storage, then refresh from API.
  Future<void> _initFromStorage() async {
    final cached = await _storage.read(key: _kLocaleKey);
    if (cached != null && _isSupported(cached)) {
      state = Locale(cached);
    }
    // Refresh from API in the background (only succeeds when authenticated).
    await _fetchFromApi();
  }

  /// Fetches preferredLanguage from GET /api/v1/users/me and applies it.
  Future<void> _fetchFromApi() async {
    try {
      final headers = await _authHeaders();
      if (headers.isEmpty) return; // Not authenticated yet.
      final response = await _dio.get<Map<String, dynamic>>(
        '$_apiBaseUrl/users/me',
        options: Options(headers: headers),
      );
      final lang = response.data?['preferredLanguage'] as String?;
      if (lang != null && _isSupported(lang) && lang != state.languageCode) {
        state = Locale(lang);
        await _storage.write(key: _kLocaleKey, value: lang);
      }
    } catch (_) {
      // Silently keep current state (storage or default).
    }
  }

  Future<Map<String, String>> _authHeaders() async {
    final authService = _ref.read(authServiceProvider);
    final token = await authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  bool _isSupported(String lang) => lang == 'en' || lang == 'de';

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
      await _storage.write(key: _kLocaleKey, value: langCode);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Triggers a fresh fetch from the API (call after successful auth).
  Future<void> loadPreference() => _fetchFromApi();
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>(
  (ref) => LocaleNotifier(ref),
);
