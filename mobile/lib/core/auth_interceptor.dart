import 'package:dio/dio.dart';
import '../services/auth_service.dart';

/// Dio interceptor that injects an Authorization Bearer token on every request.
///
/// The token is fetched via [AuthService.getAccessToken()] before each request.
/// If no token is available the request is forwarded without the header.
class AuthInterceptor extends Interceptor {
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
    }
    handler.next(options);
  }
}
