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

/// Bumps a counter once each time any authenticated API request comes back
/// with a 401 — regardless of which screen or provider made the call. This
/// is a UI-only signal for prompting the user to sign back in; it does not
/// change auth state itself (see [AuthService.getAccessToken] for why the
/// app never auto-logs-out on a dead session). Listen to it (e.g. in
/// [ShellScreen]) to show a single consistent "session expired" prompt
/// instead of each screen failing silently with its own generic error.
class SessionExpiredNotifier extends Notifier<int> {
  @override
  int build() => 0;

  /// Records another 401 response.
  void bump() => state++;
}

/// See [SessionExpiredNotifier].
final sessionExpiredProvider =
    NotifierProvider<SessionExpiredNotifier, int>(SessionExpiredNotifier.new);

/// Provides a shared [Dio] instance configured with [AuthInterceptor].
///
/// All service providers consume this so auth headers are injected on every
/// request without duplicating token-fetching logic in each service.
final dioProvider = Provider<Dio>((ref) {
  final authService = ref.watch(authServiceProvider);
  final dio = Dio(_timeoutBaseOptions());
  dio.interceptors.add(
    AuthInterceptor(
      authService,
      onUnauthorised: () => ref.read(sessionExpiredProvider.notifier).bump(),
    ),
  );
  return dio;
});
