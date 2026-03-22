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
  final dio = Dio();
  dio.interceptors.add(AuthInterceptor(authService));
  return dio;
});
