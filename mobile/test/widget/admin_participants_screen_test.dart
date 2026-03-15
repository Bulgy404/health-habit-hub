// Widget tests for AdminParticipantsScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/models/admin_participant.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/admin/admin_participants_screen.dart';
import 'package:hhh/services/admin_service.dart';
import 'package:hhh/services/auth_service.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

class _FakeAdminService extends AdminService {
  final bool shouldThrow;
  final List<AdminParticipant> participants;
  final Completer<List<AdminParticipant>>? _completer;

  _FakeAdminService.loading()
      : shouldThrow = false,
        participants = const [],
        _completer = Completer<List<AdminParticipant>>(),
        super(_FakeAuthService());

  _FakeAdminService.throwing()
      : shouldThrow = true,
        participants = const [],
        _completer = null,
        super(_FakeAuthService());

  _FakeAdminService.empty()
      : shouldThrow = false,
        participants = const [],
        _completer = null,
        super(_FakeAuthService());

  _FakeAdminService.withData(this.participants)
      : shouldThrow = false,
        _completer = null,
        super(_FakeAuthService());

  @override
  Future<List<AdminParticipant>> fetchParticipants() {
    if (_completer != null) return _completer.future;
    if (shouldThrow) return Future.error(Exception('Network error'));
    return Future.value(participants);
  }
}

// Wrap in a GoRouter so context.push works if triggered.
Widget _buildSubject(AdminService service) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/admin/participants',
        builder: (_, _) => const AdminParticipantsScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, _) => const Scaffold(body: Text('Detail')),
          ),
        ],
      ),
    ],
    initialLocation: '/admin/participants',
  );
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      adminServiceProvider.overrideWithValue(service),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows Participants AppBar title', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.loading()));
    await tester.pump();

    expect(find.text('Participants'), findsOneWidget);
  });

  testWidgets('shows loading indicator while fetching', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.loading()));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.throwing()));
    await tester.pumpAndSettle();

    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when no participants', (tester) async {
    await tester.pumpWidget(_buildSubject(_FakeAdminService.empty()));
    await tester.pumpAndSettle();

    expect(find.text('No participants found.'), findsOneWidget);
  });

  testWidgets('shows participant row when data available', (tester) async {
    final participants = [
      AdminParticipant(
        id: 'p1',
        username: 'alice',
        group: 'G1',
        enrolledAt: DateTime(2024, 1, 15),
      ),
    ];
    await tester
        .pumpWidget(_buildSubject(_FakeAdminService.withData(participants)));
    await tester.pumpAndSettle();

    expect(find.text('alice'), findsOneWidget);
  });
}
