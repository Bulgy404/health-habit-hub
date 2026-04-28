// Widget tests for ExploreScreen.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/models/habit_graph.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/habit_graph_provider.dart';
import 'package:hhh/screens/explore_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/widgets/habit_graph_widget.dart';

class _FakeAuthService extends AuthService {
  @override
  Future<bool> isLoggedIn() async => false;

  @override
  Future<String?> getAccessToken() async => null;
}

HabitGraph _twoNodeGraph() {
  return HabitGraph.fromJson({
    'nodes': [
      {
        'id': 'h:uuid-1',
        'type': 'habit',
        'label': 'Drink water',
        'habitId': 'uuid-1',
        'originalText': 'Drink water',
        'language': 'en',
        'annotationCounts': {'helpful': 0, 'iDoThis': 0},
      },
      {
        'id': 'c:bcio_001',
        'type': 'concept',
        'label': 'Self-monitoring',
        'habitId': null,
        'originalText': '',
        'language': '',
        'annotationCounts': {'helpful': 0, 'iDoThis': 0},
      },
    ],
    'edges': [
      {'source': 'h:uuid-1', 'target': 'c:bcio_001'},
    ],
  });
}

Widget _buildWithGraph(Future<HabitGraph> Function() graphFactory) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      habitGraphProvider.overrideWith((_) => graphFactory()),
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
      _buildWithGraph(() async => HabitGraph.empty()),
    );
    await tester.pump();
    expect(find.text('Explore Habits'), findsOneWidget);
  });

  testWidgets('shows loading indicator while fetching graph', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(_FakeAuthService()),
          habitGraphProvider.overrideWithValue(const AsyncLoading()),
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
        () => Future<HabitGraph>.error(Exception('Network error')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Failed to load habits'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when graph has no nodes', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => HabitGraph.empty()),
    );
    await tester.pumpAndSettle();
    expect(find.text('No habit data available yet.'), findsOneWidget);
  });

  testWidgets('shows TabBar with Graph and Stats tabs', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => HabitGraph.empty()),
    );
    await tester.pump();
    expect(find.text('Graph'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
  });

  testWidgets('shows HabitGraphWidget when graph has nodes', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => _twoNodeGraph()),
    );
    // flutter_graph_view runs continuous physics — pump a fixed duration instead
    // of pumpAndSettle (which would time out waiting for animations to stop).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(HabitGraphWidget), findsOneWidget);
  });

  testWidgets('tapping concept node opens concept detail sheet', (tester) async {
    await tester.pumpWidget(
      _buildWithGraph(() async => _twoNodeGraph()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Grab the HabitGraphWidget and invoke its onConceptTap directly —
    // the flutter_graph_view canvas is not easily tappable in widget tests.
    final widget = tester.widget<HabitGraphWidget>(find.byType(HabitGraphWidget));
    final conceptNode = _twoNodeGraph().conceptNodes.first;
    widget.onConceptTap(conceptNode);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // _ConceptDetailSheet should show the concept label.
    expect(find.text('Self-monitoring'), findsOneWidget);
  });
}
