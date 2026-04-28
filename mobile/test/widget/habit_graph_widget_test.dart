import 'package:flutter/material.dart';
import 'package:flutter_graph_view/flutter_graph_view.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/habit_graph.dart';
import 'package:hhh/widgets/habit_graph_widget.dart';

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

// Stateful wrapper to control which graph instance is passed to HabitGraphWidget.
class _GraphSwitcher extends StatefulWidget {
  const _GraphSwitcher({super.key});
  @override
  State<_GraphSwitcher> createState() => _GraphSwitcherState();
}

class _GraphSwitcherState extends State<_GraphSwitcher> {
  HabitGraph _graph = _twoNodeGraph();
  int rebuilds = 0;

  void switchGraph(HabitGraph g) => setState(() => _graph = g);

  @override
  Widget build(BuildContext context) {
    rebuilds++;
    return HabitGraphWidget(
      graph: _graph,
      onHabitTap: (_) {},
      onConceptTap: (_) {},
    );
  }
}

void main() {
  testWidgets('HabitGraphWidget renders without throwing', (tester) async {
    bool habitTapped = false;
    bool conceptTapped = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HabitGraphWidget(
            graph: _twoNodeGraph(),
            onHabitTap: (_) => habitTapped = true,
            onConceptTap: (_) => conceptTapped = true,
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));

    expect(tester.takeException(), isNull);
    expect(habitTapped, isFalse);
    expect(conceptTapped, isFalse);
  });

  testWidgets('same graph identity does not recreate FlutterGraphWidget', (tester) async {
    final key = GlobalKey<_GraphSwitcherState>();
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: _GraphSwitcher(key: key))),
    );
    await tester.pump(const Duration(milliseconds: 100));

    // Find the FlutterGraphWidget after initial build.
    final before = tester.widget<FlutterGraphWidget>(find.byType(FlutterGraphWidget));

    // Rebuild parent without changing graph identity.
    key.currentState!.switchGraph(key.currentState!._graph);
    await tester.pump();

    final after = tester.widget<FlutterGraphWidget>(find.byType(FlutterGraphWidget));

    // Same FlutterGraphWidget instance — physics state preserved.
    expect(identical(before, after), isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('new graph identity recreates FlutterGraphWidget', (tester) async {
    final key = GlobalKey<_GraphSwitcherState>();
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: _GraphSwitcher(key: key))),
    );
    await tester.pump(const Duration(milliseconds: 100));

    final before = tester.widget<FlutterGraphWidget>(find.byType(FlutterGraphWidget));

    // Replace with a different graph object.
    key.currentState!.switchGraph(_twoNodeGraph());
    await tester.pump();

    final after = tester.widget<FlutterGraphWidget>(find.byType(FlutterGraphWidget));

    // New FlutterGraphWidget instance — simulation restarted for new data.
    expect(identical(before, after), isFalse);
    expect(tester.takeException(), isNull);
  });
}
