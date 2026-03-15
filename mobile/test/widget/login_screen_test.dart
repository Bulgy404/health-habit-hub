// Widget tests for LoginScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/login_screen.dart';
import 'package:hhh/services/auth_service.dart';

// ---------------------------------------------------------------------------
// Fake auth service
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  final bool shouldThrow;
  final bool neverCompletes;

  _FakeAuthService({this.shouldThrow = false, this.neverCompletes = false});

  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> login([String? username, String? password]) {
    if (neverCompletes) return Completer<void>().future;
    if (shouldThrow) return Future.error(Exception('Invalid credentials'));
    // Success: in a real app this would trigger context.go('/home').
    // The router is not set up in unit widget tests, so success is not tested here.
    return Future.value();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Widget _buildSubject({
  bool shouldThrow = false,
  bool neverCompletes = false,
  String? user,
  String? token,
}) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(
        _FakeAuthService(
          shouldThrow: shouldThrow,
          neverCompletes: neverCompletes,
        ),
      ),
    ],
    child: MaterialApp(
      home: LoginScreen(initialUsername: user, initialPassword: token),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows username field, password field and login button',
      (tester) async {
    await tester.pumpWidget(_buildSubject());

    expect(find.byType(TextField), findsNWidgets(2));
    expect(find.text('Username'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Login'), findsOneWidget);
    expect(find.byIcon(Icons.health_and_safety), findsOneWidget);
  });

  testWidgets('pre-fills fields from constructor params', (tester) async {
    await tester.pumpWidget(_buildSubject(user: 'alice', token: 'secret'));

    final usernameField = tester.widget<TextField>(find.byType(TextField).first);
    expect(usernameField.controller?.text, 'alice');
  });

  testWidgets('shows loading indicator while logging in', (tester) async {
    await tester.pumpWidget(_buildSubject(neverCompletes: true));

    await tester.tap(find.text('Login'));
    await tester.pump(); // start async operation — login is pending

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error message on failed login', (tester) async {
    await tester.pumpWidget(_buildSubject(shouldThrow: true));

    await tester.tap(find.text('Login'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid credentials'), findsOneWidget);
  });
}
