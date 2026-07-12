import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import 'auth_interceptor.dart';

// Without explicit timeouts Dio waits forever, so a single slow or stuck
// backend call freezes the UI indefinitely (e.g. the spinner on "Create
// habit"). These bounds let requests fail fast; callers already handle
// DioException. receiveTimeout is generous to accommodate the LLM
// stitch-intention call.
BaseOptions _timeoutBaseOptions() => BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 30),
    );

/// Provides a timeout-configured [Dio] with no [AuthInterceptor], for the
/// direct Keycloak calls [AuthService] itself makes (token/refresh/revoke).
///
/// Kept separate from [dioProvider] to avoid a circular dependency:
/// [dioProvider] needs the constructed [AuthService] to build its
/// [AuthInterceptor], so [AuthService] cannot in turn depend on
/// [dioProvider]. Those Keycloak calls also have no use for the app's own
/// Bearer token, so skipping the interceptor is correct as well as necessary.
final authDioProvider = Provider<Dio>((ref) => Dio(_timeoutBaseOptions()));

/// Provides a shared [Dio] instance configured with [AuthInterceptor].
///
/// All service providers consume this so auth headers are injected on every
/// request without duplicating token-fetching logic in each service.
final dioProvider = Provider<Dio>((ref) {
  final authService = ref.watch(authServiceProvider);
  final dio = Dio(_timeoutBaseOptions());
  dio.interceptors.add(AuthInterceptor(authService));
  return dio;
});
