// Widget tests for LoginScreen (admin PKCE login).
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
    if (shouldThrow) return Future.error(Exception('Login failed'));
    // Success: in widget tests the router is not set up, so navigation is not tested.
    return Future.value();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Widget _buildSubject({
  bool shouldThrow = false,
  bool neverCompletes = false,
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
    child: const MaterialApp(
      home: LoginScreen(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows admin login button and icon', (tester) async {
    await tester.pumpWidget(_buildSubject());

    expect(find.text('Login with Admin Account'), findsOneWidget);
    expect(find.byIcon(Icons.admin_panel_settings), findsOneWidget);
    // "Admin Login" appears in both the AppBar title and the heading.
    expect(find.text('Admin Login'), findsAtLeastNWidgets(1));
  });

  testWidgets('shows no username or password text fields', (tester) async {
    await tester.pumpWidget(_buildSubject());

    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('shows loading indicator while logging in', (tester) async {
    await tester.pumpWidget(_buildSubject(neverCompletes: true));

    await tester.tap(find.text('Login with Admin Account'));
    await tester.pump(); // start async operation — login is pending

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error message on failed login', (tester) async {
    await tester.pumpWidget(_buildSubject(shouldThrow: true));

    await tester.tap(find.text('Login with Admin Account'));
    await tester.pumpAndSettle();

    expect(find.text('Login failed. Please try again.'), findsOneWidget);
  });
}
