import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import 'auth_interceptor.dart';

/// Provides a shared [Dio] instance configured with [AuthInterceptor].
///
/// All service providers consume this so auth headers are injected on every
/// request without duplicating token-fetching logic in each service.
final dioProvider = Provider<Dio>((ref) {
  final authService = ref.watch(authServiceProvider);
  // Without explicit timeouts Dio waits forever, so a single slow or stuck
  // backend call freezes the UI indefinitely (e.g. the spinner on "Create
  // habit"). These bounds let requests fail fast; callers already handle
  // DioException. receiveTimeout is generous to accommodate the LLM
  // stitch-intention call.
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 30),
    ),
  );
  dio.interceptors.add(AuthInterceptor(authService));
  return dio;
});
