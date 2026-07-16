// Widget tests for SigningOutScreen in isolation.
//
// The screen runs AuthService.logout() on mount and then routes to
// [nextRoute]. It is `canPop: false`, so the one thing it must never do is
// strand the user on the spinner — even if logout() throws (e.g. a broken
// keychain making the storage deletes fail). The happy path through the
// settings hub is covered in user_settings_screen_test.dart; this file pins
// the failure path.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/signing_out_screen.dart';
import 'package:hhh/services/auth_service.dart';

class _ThrowingAuthService extends AuthService {
  int logoutCalls = 0;

  @override
  Future<void> logout() async {
    logoutCalls++;
    throw Exception('secure storage unavailable');
  }
}

class _SucceedingAuthService extends AuthService {
  int logoutCalls = 0;

  @override
  Future<void> logout() async {
    logoutCalls++;
  }
}

Widget _buildSubject(AuthService authService) {
  final router = GoRouter(
    initialLocation: '/signing-out',
    routes: [
      GoRoute(
        path: '/signing-out',
        builder: (context, state) => const SigningOutScreen(),
      ),
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const Scaffold(body: Text('Welcome')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [authServiceProvider.overrideWithValue(authService)],
    child: MaterialApp.router(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      routerConfig: router,
    ),
  );
}

void main() {
  testWidgets('navigates to nextRoute after a successful logout',
      (tester) async {
    final auth = _SucceedingAuthService();
    await tester.pumpWidget(_buildSubject(auth));
    await tester.pumpAndSettle();

    expect(auth.logoutCalls, 1);
    expect(find.text('Welcome'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets(
      'still navigates to nextRoute when logout() throws — the user must '
      'never be stranded on the canPop:false spinner', (tester) async {
    final auth = _ThrowingAuthService();
    await tester.pumpWidget(_buildSubject(auth));
    await tester.pumpAndSettle();

    expect(auth.logoutCalls, 1);
    expect(find.text('Welcome'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}
