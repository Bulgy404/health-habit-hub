import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/models/bubble_graph.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/bubble_graph_provider.dart';
import 'package:hhh/screens/explore_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/widgets/bubble_graph_widget.dart';

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

BubbleGraph _sampleGraph() {
  return BubbleGraph.fromJson({
    'dimensions': [
      {
        'id': 'TIME',
        'label': 'Time',
        'habitCount': 1,
        'habits': [
          {
            'id': 'uuid-1',
            'label': 'Drink water',
            'originalText': 'Drink water',
            'language': 'en',
            'annotationCounts': {'helpful': 0, 'iDoThis': 0},
          },
        ],
      },
    ],
  });
}

Widget _buildWithGraph(Future<BubbleGraph> Function() graphFactory) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      bubbleGraphProvider.overrideWith((_) => graphFactory()),
    ],
    child: const MaterialApp(
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: [Locale('en')],
      home: ExploreScreen(),
    ),
  );
}

void main() {
  testWidgets('shows Explore Habits AppBar title', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => const BubbleGraph(dimensions: [])),
    );
    await tester.pump();
    expect(find.text('Explore Habits'), findsOneWidget);
  });

  testWidgets('shows loading indicator while fetching graph', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(_FakeAuthService()),
          bubbleGraphProvider.overrideWithValue(const AsyncLoading()),
        ],
        child: const MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: [Locale('en')],
          home: ExploreScreen(),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(
        () => Future<BubbleGraph>.error(Exception('Network error')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Failed to load habits'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when graph has no dimensions', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => const BubbleGraph(dimensions: [])),
    );
    await tester.pumpAndSettle();
    expect(find.byType(BubbleGraphWidget), findsNothing);
  });

  testWidgets('shows TabBar with Graph and Stats tabs', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => const BubbleGraph(dimensions: [])),
    );
    await tester.pump();
    expect(find.text('Graph'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
  });

  testWidgets('shows BubbleGraphWidget when graph has dimensions', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => _sampleGraph()),
    );
    await tester.pumpAndSettle();
    expect(find.byType(BubbleGraphWidget), findsOneWidget);
  });

  testWidgets(
      'impact filter narrows dimension habitCount independently of the '
      'build/quit filter', (tester) async {
    final graph = BubbleGraph.fromJson({
      'dimensions': [
        {
          'id': 'TIME',
          'label': 'Time',
          'habitCount': 2,
          'habits': [
            {
              'id': 'uuid-1',
              'label': 'Meditate',
              'originalText': 'Meditate',
              'language': 'en',
              'annotationCounts': {'helpful': 0, 'iDoThis': 0},
              'healthBenefit': 5,
              'wellbeingImpact': 5,
            },
            {
              'id': 'uuid-2',
              'label': 'Smoke when stressed',
              'originalText': 'Smoke when stressed',
              'language': 'en',
              'annotationCounts': {'helpful': 0, 'iDoThis': 0},
              'healthBenefit': 1,
              'wellbeingImpact': 1,
            },
          ],
        },
      ],
    });

    await tester.pumpWidget(_buildWithGraph(() async => graph));
    await tester.pumpAndSettle();

    expect(find.text('2 habits'), findsOneWidget);

    await tester.tap(find.text('High impact'));
    await tester.pumpAndSettle();
    expect(find.text('1 habit'), findsOneWidget);

    await tester.tap(find.text('Low impact'));
    await tester.pumpAndSettle();
    expect(find.text('1 habit'), findsOneWidget);
  });
}
