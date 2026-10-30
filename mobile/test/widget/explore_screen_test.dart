import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/models/bubble_graph.dart';
import 'package:hhh/providers/auth_provider.dart';
import 'package:hhh/providers/bubble_graph_provider.dart';
import 'package:hhh/providers/comments_enabled_provider.dart';
import 'package:hhh/providers/show_in_graph_provider.dart';
import 'package:hhh/screens/explore_screen.dart';
import 'package:hhh/services/auth_service.dart';
import 'package:hhh/services/habit_service.dart';
import 'package:hhh/widgets/bubble_graph/bubble_graph_painter.dart';
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
      // Keeps the Stats tab off the network, and its static error state lets
      // pumpAndSettle finish when a test lands on that tab.
      myStatsProvider.overrideWithValue(
        AsyncError(Exception('offline'), StackTrace.empty),
      ),
      habitStatsProvider.overrideWithValue(
        AsyncError(Exception('offline'), StackTrace.empty),
      ),
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
      'health benefit filter (opened from the filter icon) narrows '
      'dimension habitCount independently of the build/quit filter',
      (tester) async {
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

    // Filters are collapsed behind an app-bar icon + popup rather than
    // always-visible chip rows.
    await tester.tap(find.byIcon(Icons.filter_list));
    await tester.pumpAndSettle();

    await tester.tap(find.text('High benefit'));
    await tester.pumpAndSettle();
    expect(find.text('1 habit'), findsOneWidget);

    await tester.tap(find.text('Low benefit'));
    await tester.pumpAndSettle();
    expect(find.text('1 habit'), findsOneWidget);
  });

  double tabPage(WidgetTester tester) =>
      tester.widget<PageView>(find.byType(PageView)).controller!.page!;

  testWidgets(
      'dragging a bubble sideways moves the bubble under the finger '
      'instead of swiping to the Stats tab', (tester) async {
    await tester.pumpWidget(_buildWithGraph(() async => _sampleGraph()));
    await tester.pumpAndSettle();

    final chip = find.byType(BubbleChipWidget).first;
    final gesture = await tester.startGesture(tester.getCenter(chip));
    for (var i = 0; i < 12; i++) {
      await gesture.moveBy(const Offset(-8, 0));
      await tester.pump(const Duration(milliseconds: 16));
    }

    // Before the fix the page swipe claimed the drag after 18 px, the
    // bubble never moved, and the view slid toward Stats.
    expect(tabPage(tester), 0);
    final translation = tester
        .widget<Transform>(
          find.ancestor(of: chip, matching: find.byType(Transform)).first,
        )
        .transform
        .getTranslation();
    // The full 96 px, including the travel spent reaching the pan slop.
    expect(translation.x, -96);
    expect(translation.y, 0);

    await gesture.up();
    await tester.pumpAndSettle();
    expect(tabPage(tester), 0);
  });

  testWidgets('swiping from the Stats tab still returns to the Graph tab',
      (tester) async {
    await tester.pumpWidget(_buildWithGraph(() async => _sampleGraph()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Stats'));
    await tester.pumpAndSettle();
    expect(tabPage(tester), 1);

    await tester.fling(find.byType(TabBarView), const Offset(400, 0), 1000);
    await tester.pumpAndSettle();
    expect(tabPage(tester), 0);
  });

  group('#4 copy a community habit into my habits', () {
    const freeEntry = HabitConfig(
      cueCount: 'multi',
      cueSource: 'self_selected',
      behaviorOptions: [],
      srhiItems: [],
    );
    const catalog = HabitConfig(
      cueCount: 'multi',
      cueSource: 'high_quality',
      behaviorOptions: [BehaviorOption(key: 'walk', label: 'Walking')],
      srhiItems: [],
    );
    final graph = BubbleGraph.fromJson({
      'dimensions': [
        {
          'id': 'TIME',
          'label': 'Time',
          'habitCount': 1,
          'habits': [
            {
              'id': 'habit-123',
              'label': 'No phone after 10pm',
              'originalText': 'No phone after 10pm',
              'language': 'en',
              'annotationCounts': {'helpful': 0, 'iDoThis': 0},
              'habitType': 'quit',
              'contextText': 'after 10pm',
            },
          ],
        },
      ],
    });

    Future<void> openHabitSheet(WidgetTester tester, HabitConfig config) async {
      tester.view.physicalSize = const Size(800, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final router = GoRouter(
        initialLocation: '/explore',
        routes: [
          GoRoute(
            path: '/explore',
            builder: (context, state) => const ExploreScreen(),
          ),
          GoRoute(
            path: '/habits/new/behavior',
            builder: (context, state) {
              final extra = state.extra as Map<String, dynamic>;
              return Scaffold(
                body: Text(
                  'NEW:${extra['initialBehaviorLabel']}|${extra['habitType']}'
                  '|${extra['sourceHabitId']}|${extra['initialCue']}',
                ),
              );
            },
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authServiceProvider.overrideWithValue(_FakeAuthService()),
            bubbleGraphProvider.overrideWith((_) async => graph),
            habitConfigProvider.overrideWith((_) async => config),
            habitServiceProvider.overrideWithValue(_NoNetworkHabitService()),
            commentsEnabledProvider.overrideWith(_CommentsOff.new),
          ],
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
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Time'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('No phone after 10pm'));
      await tester.pumpAndSettle();
    }

    testWidgets('the detail sheet starts the new-habit flow with the copied '
        'text, type and id, its situation moved into the cue', (tester) async {
      await openHabitSheet(tester, freeEntry);

      final button = find.text('Add to my habits');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();

      expect(
        find.text('NEW:No phone|quit|habit-123|after 10pm'),
        findsOneWidget,
      );
    });

    testWidgets('no copy button when the study restricts habits to a catalog',
        (tester) async {
      await openHabitSheet(tester, catalog);

      expect(find.text('I do this too'), findsOneWidget);
      expect(find.text('Add to my habits'), findsNothing);
    });
  });
}

class _NoNetworkHabitService extends HabitService {
  _NoNetworkHabitService() : super(dio: Dio());

  @override
  Future<List<String>> fetchRelatedHabitIds(String id, {int limit = 10}) async =>
      [];
}

class _CommentsOff extends CommentsEnabledNotifier {
  @override
  bool build() => false;
}
