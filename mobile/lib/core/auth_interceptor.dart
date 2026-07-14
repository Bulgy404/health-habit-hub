import 'package:dio/dio.dart';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';

/// Dio interceptor that injects an Authorization Bearer token on every request.
///
/// The token is fetched via [AuthService.getAccessToken()] before each request.
/// If no token is available the request is forwarded without the header.
class AuthInterceptor extends Interceptor {
  /// Creates an [AuthInterceptor] backed by [_authService].
  const AuthInterceptor(this._authService, {this.onUnauthorised});

  final AuthService _authService;

  /// Invoked once per response the backend answers with 401 — regardless of
  /// which screen/provider made the request. [AuthService] deliberately never
  /// auto-logs-out on a dead session (see its docs), which previously meant a
  /// 401 was a silent dead end: every screen showed its own generic error
  /// with no indication the fix is "sign in again." This lets the app show
  /// one consistent, actionable prompt instead.
  final void Function()? onUnauthorised;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _authService.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
      // Claims include the user's Keycloak subject ID (PII) — only decode
      // and log them in debug builds. debugPrint is not stripped from
      // release builds, so this must not run unconditionally.
      if (kDebugMode && options.path.contains('/habits/share')) {
        try {
          final parts = token.split('.');
          if (parts.length == 3) {
            final payload =
                utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
            final claims = jsonDecode(payload) as Map<String, dynamic>;
            debugPrint(
              'AuthInterceptor /habits/share token present: '
              'sub=${claims['sub']} iss=${claims['iss']} '
              'aud=${claims['aud']} exp=${claims['exp']}',
            );
          } else {
            debugPrint(
              'AuthInterceptor /habits/share token present but malformed JWT',
            );
          }
        } catch (e) {
          debugPrint(
            'AuthInterceptor /habits/share token present but could not decode claims: $e',
          );
        }
      }
    } else if (kDebugMode && options.path.contains('/habits/share')) {
      debugPrint('AuthInterceptor /habits/share: no access token available');
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) onUnauthorised?.call();
    handler.next(err);
  }
}
