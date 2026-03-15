// Widget tests for RecommendScreen.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/recommendation.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/screens/recommend_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/recommendation_service.dart';
import 'package:hhh/services/recommendation_ws_service.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

class _FakeRecommendationService extends RecommendationService {
  final bool shouldThrow;
  final List<Recommendation> data;

  _FakeRecommendationService.empty()
      : shouldThrow = false,
        data = const [],
        super(authService: _FakeAuthService());

  _FakeRecommendationService.throwing()
      : shouldThrow = true,
        data = const [],
        super(authService: _FakeAuthService());

  _FakeRecommendationService.withData(this.data)
      : shouldThrow = false,
        super(authService: _FakeAuthService());

  @override
  Future<List<Recommendation>> fetchRecommendations(String userId) async {
    if (shouldThrow) throw Exception('Server error');
    return data;
  }
}

// Build a ProviderScope that overrides all relevant providers.
Widget _buildSubject({
  String? userId = 'user-123',
  bool userIdThrows = false,
  bool neverResolvesUserId = false,
  _FakeRecommendationService? recService,
}) {
  final effectiveRecService =
      recService ?? _FakeRecommendationService.empty();

  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      userIdProvider.overrideWith((ref) {
        if (neverResolvesUserId) return Completer<String?>().future;
        if (userIdThrows) return Future.error(Exception('Auth error'));
        return Future.value(userId);
      }),
      recommendationServiceProvider
          .overrideWithValue(effectiveRecService),
      recommendationWsServiceProvider.overrideWith((ref, uid) {
        final ws = RecommendationWsService(
          authService: _FakeAuthService(),
          recommendationService: effectiveRecService,
          userId: uid,
        );
        ref.onDispose(ws.dispose);
        return ws;
      }),
    ],
    child: const MaterialApp(home: RecommendScreen()),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('shows Recommendations AppBar title', (tester) async {
    await tester.pumpWidget(_buildSubject(neverResolvesUserId: true));
    await tester.pump();

    expect(find.text('Recommendations'), findsOneWidget);
  });

  testWidgets('shows loading skeleton while fetching userId', (tester) async {
    await tester.pumpWidget(_buildSubject(neverResolvesUserId: true));
    await tester.pump();

    // Loading skeleton uses Card widgets
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(Card), findsWidgets);
  });

  testWidgets('shows error state when userId is null (not authenticated)',
      (tester) async {
    await tester.pumpWidget(_buildSubject(userId: null));
    await tester.pumpAndSettle();

    expect(find.text('Not authenticated'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows error state when recommendation fetch fails', (tester) async {
    await tester.pumpWidget(_buildSubject(
      recService: _FakeRecommendationService.throwing(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when no recommendations', (tester) async {
    await tester.pumpWidget(_buildSubject(
      recService: _FakeRecommendationService.empty(),
    ));
    await tester.pumpAndSettle();

    expect(
        find.text(
            'No recommendations yet \u2014 complete your profile first'),
        findsOneWidget);
  });

  testWidgets('shows recommendation cards when data available', (tester) async {
    final rec = const Recommendation(
      id: 'rec-1',
      habitName: 'Morning Walk',
      category: 'exercise',
      confidenceScore: 0.9,
      rationale: 'Good for health',
    );
    await tester.pumpWidget(_buildSubject(
      recService: _FakeRecommendationService.withData([rec]),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Morning Walk'), findsOneWidget);
  });
}
