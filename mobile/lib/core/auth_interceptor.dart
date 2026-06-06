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
  const AuthInterceptor(this._authService);

  final AuthService _authService;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _authService.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
      if (options.path.contains('/habits/share')) {
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
    } else if (options.path.contains('/habits/share')) {
      debugPrint('AuthInterceptor /habits/share: no access token available');
    }
    handler.next(options);
  }
}
