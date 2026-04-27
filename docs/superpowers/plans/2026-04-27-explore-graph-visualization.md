# Explore Graph Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the explore-page graph with a real Neo4j-backed visualization using `flutter_graph_view`, showing both Habit and BCIOConcept hub nodes with real edges.

**Architecture:** New `GET /habits/graph` endpoint queries Neo4j for Habit↔BCIOConcept relationships and joins annotation counts from MongoDB. Flutter consumes this via a `FutureProvider<HabitGraph>`, and a rewritten `HabitGraphWidget` renders it with `flutter_graph_view` (force-directed layout, concept nodes as large orange spheres, habit nodes as smaller blue spheres). Tapping a habit opens the existing `_NodeDetailSheet`; tapping a concept opens a new `_ConceptDetailSheet`.

**Tech Stack:** Node.js/Express, Neo4j Cypher, Flutter 3, Riverpod FutureProvider, flutter_graph_view

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/db/habitQueries.js` | Modify | Add `getHabitGraph(queryNeo4j, getDb)` |
| `app/routes/habitsRouter.js` | Modify | Add `GET /graph` route |
| `app/tests/integration/habits.routes.test.js` | Modify | Tests for new route |
| `mobile/pubspec.yaml` | Modify | Add `flutter_graph_view` |
| `mobile/lib/models/habit_graph.dart` | Create | `GraphNode`, `GraphEdge`, `HabitGraph` |
| `mobile/lib/services/habit_service.dart` | Modify | Add `fetchHabitGraph()` |
| `mobile/lib/providers/habit_graph_provider.dart` | Create | `habitGraphProvider` |
| `mobile/lib/widgets/habit_graph_widget.dart` | Replace | flutter_graph_view-backed widget |
| `mobile/lib/screens/explore_screen.dart` | Modify | Use provider, add `_ConceptDetailSheet`, remove category filter |
| `mobile/test/widget/explore_screen_test.dart` | Modify | Update for provider-based approach |

---

### Task 1: Backend — `getHabitGraph` query + `GET /habits/graph` route

**Files:**
- Modify: `app/db/habitQueries.js`
- Modify: `app/routes/habitsRouter.js`
- Modify: `app/tests/integration/habits.routes.test.js`

Context: `habitQueries.js` exports plain async functions that accept a `queryNeo4j(cypher, params)` runner as their first argument — see existing `getAllHabits`, `getPublicHabits`. The router's `createMockNeo4jRun()` in the test file switches on cypher content using `.includes()`.

- [ ] **Step 1: Write failing tests** in `app/tests/integration/habits.routes.test.js`

Add a new fixture and update `createMockNeo4jRun` to handle the graph query. Also add the tests. Insert before the closing `after()` block:

```js
// ── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_GRAPH_ROWS = [
  {
    habitId: 'uuid-1',
    habitLabel: 'Drink water daily',
    originalText: 'Drink water daily',
    language: 'en',
    conceptId: 'bcio_001',
    conceptLabel: 'Self-monitoring',
  },
  {
    habitId: 'uuid-2',
    habitLabel: 'I meditate daily',
    originalText: 'Ich meditiere täglich',
    language: 'de',
    conceptId: 'bcio_001',
    conceptLabel: 'Self-monitoring',
  },
  // Duplicate row (same habit+concept via different Context) — must be deduped
  {
    habitId: 'uuid-1',
    habitLabel: 'Drink water daily',
    originalText: 'Drink water daily',
    language: 'en',
    conceptId: 'bcio_001',
    conceptLabel: 'Self-monitoring',
  },
];
```

Update `createMockNeo4jRun` to add a case before the default:

```js
function createMockNeo4jRun() {
  return async (cypher) => {
    if (cypher.includes('count(h) AS total')) {
      return [{ total: 2 }];
    }
    if (cypher.includes('AS category, cnt AS count')) {
      return [
        { category: 'hhh__Group1', count: 1 },
        { category: 'hhh__Group2', count: 1 },
      ];
    }
    if (cypher.includes('AS conceptId')) {
      return FIXTURE_GRAPH_ROWS;
    }
    if (cypher.includes('h.sentence AS original')) {
      return FIXTURE_DONATED_HABITS;
    }
    return FIXTURE_HABITS;
  };
}
```

Add these tests at the bottom of the file:

```js
// ── GET /habits/graph ─────────────────────────────────────────────────────────

test('GET /api/v1/habits/graph returns 401 without token', async () => {
  const res = await get('/api/v1/habits/graph');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/habits/graph returns graph with nodes and edges', async () => {
  const res = await get('/api/v1/habits/graph', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.ok(Array.isArray(body.nodes));
  assert.ok(Array.isArray(body.edges));

  const habitNodes = body.nodes.filter((n) => n.type === 'habit');
  const conceptNodes = body.nodes.filter((n) => n.type === 'concept');

  // 2 unique habits, 1 unique concept
  assert.strictEqual(habitNodes.length, 2);
  assert.strictEqual(conceptNodes.length, 1);

  // Habit node shape
  const h = habitNodes[0];
  assert.ok(h.id.startsWith('h:'));
  assert.strictEqual(h.type, 'habit');
  assert.ok(typeof h.label === 'string');
  assert.ok(typeof h.habitId === 'string');
  assert.ok(typeof h.originalText === 'string');
  assert.ok(typeof h.language === 'string');
  assert.ok(typeof h.annotationCounts === 'object');
  assert.ok('helpful' in h.annotationCounts);
  assert.ok('iDoThis' in h.annotationCounts);

  // Concept node shape
  const c = conceptNodes[0];
  assert.ok(c.id.startsWith('c:'));
  assert.strictEqual(c.type, 'concept');
  assert.ok(typeof c.label === 'string');

  // Edges: 2 habits × 1 concept = 2 edges (duplicate deduped)
  assert.strictEqual(body.edges.length, 2);
  const edge = body.edges[0];
  assert.ok(edge.source.startsWith('h:'));
  assert.ok(edge.target.startsWith('c:'));
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd /Users/felixreinsch/Github/health-habit-hub
node --test app/tests/integration/habits.routes.test.js 2>&1 | grep -E "FAIL|PASS|Error" | tail -20
```

Expected: the two new graph tests fail (route not found / 404).

- [ ] **Step 3: Add `getHabitGraph` to `app/db/habitQueries.js`**

Append after `getHabitsByCategory`:

```js
/**
 * Return the Neo4j graph structure: Habit nodes, BCIOConcept nodes, and edges.
 * Deduplication is done by the caller (see createHabitsRouter GET /graph).
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getHabitGraph(queryNeo4j) {
  return queryNeo4j(`
    MATCH (b:BCIOConcept)<-[:MAPS_TO]-(:Context)<-[:HAS_CONTEXT]-(h:Habit)
    RETURN DISTINCT
      h.uuid                                   AS habitId,
      coalesce(h.translationEN, h.sentence)    AS habitLabel,
      coalesce(h.sentence, '')                 AS originalText,
      coalesce(h.language, '')                 AS language,
      b.bcio_concept_id                        AS conceptId,
      b.bcio_concept_label                     AS conceptLabel
  `);
}
```

- [ ] **Step 4: Add `GET /graph` route to `app/routes/habitsRouter.js`**

Add the import at the top (update the existing destructured import of habitQueries):

```js
import {
  getAllHabits,
  getPublicHabits,
  getHabitTotal,
  getHabitsByCategory,
  getHabitGraph,
} from '../db/habitQueries.js';
```

Add the route inside `createHabitsRouter`, before `router.post('/share', handleShareHabit)`:

```js
  // GET /api/v1/habits/graph
  // Returns {nodes, edges} for the Neo4j Habit↔BCIOConcept graph.
  // Habit nodes include annotation counts joined from MongoDB.
  router.get('/graph', async (req, res) => {
    try {
      const [rows, database] = await Promise.all([
        getHabitGraph(queryNeo4j),
        getDb(),
      ]);

      // Collect unique habits and concepts
      const habitMap = new Map();  // habitId → row
      const conceptMap = new Map(); // conceptId → conceptLabel
      const edgeSet = new Set();   // 'h:<habitId>|c:<conceptId>'

      for (const row of rows) {
        if (row.habitId && !habitMap.has(row.habitId)) {
          habitMap.set(row.habitId, row);
        }
        if (row.conceptId && !conceptMap.has(row.conceptId)) {
          conceptMap.set(row.conceptId, row.conceptLabel || '');
        }
        if (row.habitId && row.conceptId) {
          edgeSet.add(`h:${row.habitId}|c:${row.conceptId}`);
        }
      }

      // Join annotation counts from MongoDB for habit nodes
      const habitIds = [...habitMap.keys()];
      const annotations = habitIds.length > 0
        ? await database
            .collection('habit_annotations')
            .find({ habitId: { $in: habitIds } })
            .toArray()
        : [];

      const countsByHabit = {};
      for (const ann of annotations) {
        if (!countsByHabit[ann.habitId])
          countsByHabit[ann.habitId] = { helpful: 0, iDoThis: 0 };
        if (ann.type === 'helpful') countsByHabit[ann.habitId].helpful++;
        if (ann.type === 'iDoThis') countsByHabit[ann.habitId].iDoThis++;
      }

      // Build nodes array
      const nodes = [
        ...[...habitMap.values()].map((row) => ({
          id: `h:${row.habitId}`,
          type: 'habit',
          label: row.habitLabel || '',
          habitId: row.habitId,
          originalText: row.originalText || '',
          language: row.language || '',
          annotationCounts: countsByHabit[row.habitId] || { helpful: 0, iDoThis: 0 },
        })),
        ...[...conceptMap.entries()].map(([conceptId, label]) => ({
          id: `c:${conceptId}`,
          type: 'concept',
          label: label,
          habitId: null,
          originalText: '',
          language: '',
          annotationCounts: { helpful: 0, iDoThis: 0 },
        })),
      ];

      const edges = [...edgeSet].map((key) => {
        const [source, target] = key.split('|');
        return { source, target };
      });

      res.json({ nodes, edges });
    } catch (err) {
      console.error('[route] GET /habits/graph error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
node --test app/tests/integration/habits.routes.test.js 2>&1 | grep -E "FAIL|PASS|▶|×|✓" | tail -30
```

Expected: all tests PASS including the two new graph tests.

- [ ] **Step 6: Commit**

```bash
git add app/db/habitQueries.js app/routes/habitsRouter.js app/tests/integration/habits.routes.test.js
git commit -m "feat: add GET /habits/graph endpoint with Neo4j relationship data"
```

---

### Task 2: Flutter — `HabitGraph` models

**Files:**
- Create: `mobile/lib/models/habit_graph.dart`

Context: Flutter models follow the pattern in `habit_node.dart` — named constructors, `fromJson` factory, computed getters. Dart 3 records are used elsewhere (e.g. `profile_fields.dart`).

- [ ] **Step 1: Write failing model tests** in a new file `mobile/test/widget/habit_graph_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/models/habit_graph.dart';

void main() {
  group('HabitGraph.fromJson', () {
    final rawJson = {
      'nodes': [
        {
          'id': 'h:uuid-1',
          'type': 'habit',
          'label': 'Drink water daily',
          'habitId': 'uuid-1',
          'originalText': 'Drink water daily',
          'language': 'en',
          'annotationCounts': {'helpful': 3, 'iDoThis': 1},
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
    };

    test('parses nodes and edges correctly', () {
      final graph = HabitGraph.fromJson(rawJson);
      expect(graph.nodes.length, 2);
      expect(graph.edges.length, 1);
    });

    test('habit node has correct fields', () {
      final graph = HabitGraph.fromJson(rawJson);
      final habit = graph.nodes.first;
      expect(habit.id, 'h:uuid-1');
      expect(habit.type, 'habit');
      expect(habit.label, 'Drink water daily');
      expect(habit.habitId, 'uuid-1');
      expect(habit.originalText, 'Drink water daily');
      expect(habit.language, 'en');
      expect(habit.annotationCounts['helpful'], 3);
      expect(habit.annotationCounts['iDoThis'], 1);
    });

    test('concept node has correct fields', () {
      final graph = HabitGraph.fromJson(rawJson);
      final concept = graph.nodes.last;
      expect(concept.id, 'c:bcio_001');
      expect(concept.type, 'concept');
      expect(concept.label, 'Self-monitoring');
      expect(concept.habitId, isNull);
    });

    test('habitNodes returns only habit-type nodes', () {
      final graph = HabitGraph.fromJson(rawJson);
      expect(graph.habitNodes.length, 1);
      expect(graph.habitNodes.first.type, 'habit');
    });

    test('conceptNodes returns only concept-type nodes', () {
      final graph = HabitGraph.fromJson(rawJson);
      expect(graph.conceptNodes.length, 1);
      expect(graph.conceptNodes.first.type, 'concept');
    });

    test('habitsForConcept returns correct habits', () {
      final graph = HabitGraph.fromJson(rawJson);
      final habits = graph.habitsForConcept('c:bcio_001');
      expect(habits.length, 1);
      expect(habits.first.id, 'h:uuid-1');
    });

    test('conceptForHabit returns correct concept node', () {
      final graph = HabitGraph.fromJson(rawJson);
      final concept = graph.conceptForHabit('h:uuid-1');
      expect(concept?.id, 'c:bcio_001');
    });

    test('HabitGraph.empty() has no nodes or edges', () {
      final graph = HabitGraph.empty();
      expect(graph.nodes, isEmpty);
      expect(graph.edges, isEmpty);
    });
  });
}
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/widget/habit_graph_test.dart 2>&1 | tail -15
```

Expected: compilation error (file doesn't exist yet).

- [ ] **Step 3: Create `mobile/lib/models/habit_graph.dart`**

```dart
class GraphNode {
  final String id;
  final String type;
  final String label;
  final String? habitId;
  final String originalText;
  final String language;
  final Map<String, int> annotationCounts;

  const GraphNode({
    required this.id,
    required this.type,
    required this.label,
    this.habitId,
    this.originalText = '',
    this.language = '',
    this.annotationCounts = const {},
  });

  bool get isHabit => type == 'habit';
  bool get isConcept => type == 'concept';

  int get totalAnnotations =>
      annotationCounts.values.fold(0, (sum, c) => sum + c);

  factory GraphNode.fromJson(Map<String, dynamic> json) {
    final counts = (json['annotationCounts'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, (v as num).toInt()));
    return GraphNode(
      id: json['id'] as String,
      type: json['type'] as String,
      label: json['label'] as String? ?? '',
      habitId: json['habitId'] as String?,
      originalText: json['originalText'] as String? ?? '',
      language: json['language'] as String? ?? '',
      annotationCounts: counts,
    );
  }
}

class GraphEdge {
  final String source;
  final String target;

  const GraphEdge({required this.source, required this.target});

  factory GraphEdge.fromJson(Map<String, dynamic> json) => GraphEdge(
        source: json['source'] as String,
        target: json['target'] as String,
      );
}

class HabitGraph {
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;

  const HabitGraph({required this.nodes, required this.edges});

  factory HabitGraph.empty() =>
      const HabitGraph(nodes: [], edges: []);

  factory HabitGraph.fromJson(Map<String, dynamic> json) {
    final nodes = (json['nodes'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(GraphNode.fromJson)
        .toList();
    final edges = (json['edges'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(GraphEdge.fromJson)
        .toList();
    return HabitGraph(nodes: nodes, edges: edges);
  }

  List<GraphNode> get habitNodes =>
      nodes.where((n) => n.isHabit).toList();

  List<GraphNode> get conceptNodes =>
      nodes.where((n) => n.isConcept).toList();

  List<GraphNode> habitsForConcept(String conceptId) {
    final connectedIds = edges
        .where((e) => e.target == conceptId)
        .map((e) => e.source)
        .toSet();
    return nodes.where((n) => connectedIds.contains(n.id)).toList();
  }

  GraphNode? conceptForHabit(String habitId) {
    final conceptId = edges
        .where((e) => e.source == habitId)
        .map((e) => e.target)
        .firstOrNull;
    if (conceptId == null) return null;
    return nodes.where((n) => n.id == conceptId).firstOrNull;
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
flutter test test/widget/habit_graph_test.dart 2>&1 | tail -10
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/models/habit_graph.dart mobile/test/widget/habit_graph_test.dart
git commit -m "feat: add HabitGraph model with GraphNode and GraphEdge"
```

---

### Task 3: Flutter — `fetchHabitGraph()` service method + `habitGraphProvider`

**Files:**
- Modify: `mobile/lib/services/habit_service.dart`
- Create: `mobile/lib/providers/habit_graph_provider.dart`

Context: `HabitService` uses Dio and `AppConfig.apiBaseUrl`. Existing providers use simple `FutureProvider` (see `habitStatsProvider`). The `habitServiceProvider` is a `Provider<HabitService>`.

- [ ] **Step 1: Write a failing service contract test** in `mobile/test/core/auth_interceptor_contract_test.dart` — actually, add it to a new file `mobile/test/widget/habit_graph_provider_test.dart`:

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:hhh/models/habit_graph.dart';
import 'package:hhh/providers/habit_graph_provider.dart';
import 'package:hhh/services/habit_service.dart';

const _base = 'http://localhost:3000/api/v1';

void main() {
  group('HabitService.fetchHabitGraph', () {
    late Dio dio;
    late DioAdapter adapter;
    late HabitService service;

    setUp(() {
      dio = Dio();
      adapter = DioAdapter(dio: dio, matcher: const FullHttpRequestMatcher());
      service = HabitService(dio: dio);
    });

    test('sends GET /habits/graph and parses HabitGraph', () async {
      adapter.onGet(
        '$_base/habits/graph',
        (server) => server.reply(200, {
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
        }),
      );

      final graph = await service.fetchHabitGraph();

      expect(graph.nodes.length, 2);
      expect(graph.edges.length, 1);
      expect(graph.habitNodes.first.label, 'Drink water');
      expect(graph.conceptNodes.first.label, 'Self-monitoring');
    });
  });
}
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/widget/habit_graph_provider_test.dart 2>&1 | tail -10
```

Expected: compilation error — `fetchHabitGraph` doesn't exist yet.

- [ ] **Step 3: Add `fetchHabitGraph()` to `mobile/lib/services/habit_service.dart`**

Add after the existing `fetchStats()` method, before `annotateHabit()`:

```dart
  /// Returns the full Habit↔BCIOConcept graph from Neo4j.
  Future<HabitGraph> fetchHabitGraph() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/habits/graph',
    );
    return HabitGraph.fromJson(response.data ?? {'nodes': [], 'edges': []});
  }
```

Also add the import at the top of habit_service.dart:

```dart
import '../models/habit_graph.dart';
```

- [ ] **Step 4: Run service test to confirm it passes**

```bash
flutter test test/widget/habit_graph_provider_test.dart 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Create `mobile/lib/providers/habit_graph_provider.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/habit_graph.dart';
import '../services/habit_service.dart';

/// Fetches the Habit↔BCIOConcept graph. Re-evaluated on invalidation (refresh).
final habitGraphProvider = FutureProvider<HabitGraph>((ref) {
  return ref.watch(habitServiceProvider).fetchHabitGraph();
});
```

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/models/habit_graph.dart \
        mobile/lib/services/habit_service.dart \
        mobile/lib/providers/habit_graph_provider.dart \
        mobile/test/widget/habit_graph_provider_test.dart
git commit -m "feat: add fetchHabitGraph() service method and habitGraphProvider"
```

---

### Task 4: Flutter — Replace `HabitGraphWidget` with `flutter_graph_view`

**Files:**
- Modify: `mobile/pubspec.yaml`
- Replace: `mobile/lib/widgets/habit_graph_widget.dart`

Context: The current `HabitGraphWidget` is a `StatefulWidget` with custom CustomPainter physics. It is being **entirely replaced**. Its external API changes from `(nodes: List<HabitNode>, onNodeTap, selectedNodeId)` to `(graph: HabitGraph, onHabitTap, onConceptTap)`.

**Visual requirements:**
- Concept nodes: radius ~28dp, orange `Color(0xFFFF9800)`, white label inside
- Habit nodes: radius ~14dp (scaled by `node.totalAnnotations`), blue `Color(0xFF2196F3)`, short label inside when zoomed
- Edges: thin line, color matches the concept node color (orange for this version)
- Force-directed layout so habits cluster near their concept hubs

**Package docs:** Check README and examples at https://pub.dev/packages/flutter_graph_view before implementing.

- [ ] **Step 1: Add `flutter_graph_view` to `mobile/pubspec.yaml`**

In the `dependencies:` section, after `flutter_local_notifications`, add:

```yaml
  flutter_graph_view: ^0.5.0
```

Then run:

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter pub add flutter_graph_view
```

This will resolve and pin the correct version. Verify with:

```bash
flutter pub get 2>&1 | tail -5
```

Expected: `Got dependencies!`

- [ ] **Step 2: Read the flutter_graph_view package README**

Run to confirm the package installed and find the example:

```bash
find ~/.pub-cache/hosted -path "*/flutter_graph_view*/example/lib/main.dart" 2>/dev/null | head -1
```

Read the example `main.dart` to understand the widget API (key classes: look for the main widget, graph data class, node builder, edge builder, algorithm class). The implementation below follows the typical pattern — adjust API calls if they differ from the installed version.

- [ ] **Step 3: Write a smoke test** in `mobile/test/widget/habit_graph_widget_test.dart`

```dart
import 'package:flutter/material.dart';
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

    // Widget tree renders without error
    expect(tester.takeException(), isNull);
    expect(habitTapped, isFalse);
    expect(conceptTapped, isFalse);
  });
}
```

- [ ] **Step 4: Run the smoke test to confirm it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/widget/habit_graph_widget_test.dart 2>&1 | tail -10
```

Expected: compilation error — `HabitGraphWidget` still has old API.

- [ ] **Step 5: Replace `mobile/lib/widgets/habit_graph_widget.dart`**

The entire file is replaced. Use the flutter_graph_view package API (check the example you located in Step 2). The new file must:

1. Export a `HabitGraphWidget` with this interface:
   ```dart
   class HabitGraphWidget extends StatelessWidget {
     final HabitGraph graph;
     final void Function(GraphNode habitNode) onHabitTap;
     final void Function(GraphNode conceptNode) onConceptTap;
     const HabitGraphWidget({
       super.key,
       required this.graph,
       required this.onHabitTap,
       required this.onConceptTap,
     });
   }
   ```

2. Build the graph data from `graph.nodes` and `graph.edges`, mapping each to the flutter_graph_view node/edge types.

3. Use a force-directed layout algorithm (whatever the package calls it).

4. For each node, build a widget that:
   - If `node.isConcept`: orange `Color(0xFFFF9800)` circle, radius ~28, white bold label inside
   - If `node.isHabit`: blue `Color(0xFF2196F3)` circle, radius between 12 and 22 (use `(12.0 + node.totalAnnotations * 0.5).clamp(12.0, 22.0)`), white label (first 10 chars) inside

5. Wrap each node widget in a `GestureDetector.onTap` that calls `onHabitTap(node)` or `onConceptTap(node)` depending on `node.type`.

**Typical flutter_graph_view pattern (verify against installed package docs):**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_graph_view/flutter_graph_view.dart';
import '../models/habit_graph.dart';

class HabitGraphWidget extends StatelessWidget {
  final HabitGraph graph;
  final void Function(GraphNode habitNode) onHabitTap;
  final void Function(GraphNode conceptNode) onConceptTap;

  const HabitGraphWidget({
    super.key,
    required this.graph,
    required this.onHabitTap,
    required this.onConceptTap,
  });

  @override
  Widget build(BuildContext context) {
    // Build flutter_graph_view data.
    // NOTE: Verify exact class names against the installed package version.
    // The package maps "vertex" → node, "edge" → edge.
    final vertices = graph.nodes.map((n) => Vertex(n.id, data: n)).toList();
    final vertexMap = {for (final v in vertices) v.id: v};
    final edges = graph.edges
        .map((e) => Edge(
              vertexMap[e.source]!,
              vertexMap[e.target]!,
            ))
        .toList();

    return FlutterGraphView(
      data: GraphViewData(
        vertexes: vertices,
        edges: edges,
      ),
      algorithm: ForceDirectedAlgorithm(),
      config: GraphConfig(
        // Stronger attraction so habits stay near their concept hub
        repulsionFactor: 0.5,
        attractionFactor: 2.0,
      ),
      callbackBuilder: (graphData, size, config) => _buildCallbacks(
        context,
        graph.nodes,
      ),
    );
  }

  // Maps vertex IDs to tap callbacks for the graph view.
  Map<String, VoidCallback> _buildCallbacks(
    BuildContext context,
    List<GraphNode> nodes,
  ) {
    return {
      for (final node in nodes)
        node.id: () {
          if (node.isHabit) {
            onHabitTap(node);
          } else {
            onConceptTap(node);
          }
        },
    };
  }
}
```

**If the flutter_graph_view API differs significantly from the above**, adapt to match the installed package. The key invariants that must hold:
- All `graph.nodes` appear as renderable vertices
- All `graph.edges` appear as rendered edges between them
- Tapping a habit node calls `onHabitTap(node)` with the corresponding `GraphNode`
- Tapping a concept node calls `onConceptTap(node)` with the corresponding `GraphNode`
- Concept nodes visually distinct (larger, orange) from habit nodes (smaller, blue)

- [ ] **Step 6: Run the smoke test to confirm it passes**

```bash
flutter test test/widget/habit_graph_widget_test.dart 2>&1 | tail -10
```

Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add mobile/pubspec.yaml mobile/pubspec.lock \
        mobile/lib/widgets/habit_graph_widget.dart \
        mobile/test/widget/habit_graph_widget_test.dart
git commit -m "feat: replace HabitGraphWidget with flutter_graph_view renderer"
```

---

### Task 5: Flutter — Update `ExploreScreen` + concept detail sheet + fix tests

**Files:**
- Modify: `mobile/lib/screens/explore_screen.dart`
- Modify: `mobile/test/widget/explore_screen_test.dart`

Context: `ExploreScreen` currently fetches `List<HabitNode>` via local state + `HabitService`. This is replaced with `habitGraphProvider`. The `_CategoryFilterBar` widget is removed (the graph structure replaces categorical filtering visually). The existing `_NodeDetailSheet` stays and is reused for habit taps. A new `_ConceptDetailSheet` is added for concept node taps.

The existing `_NodeDetailSheet` needs a `HabitNode`. Build it from a `GraphNode`:

```dart
HabitNode _toHabitNode(GraphNode node, HabitGraph graph) {
  final concept = graph.conceptForHabit(node.id);
  return HabitNode(
    id: node.habitId!,
    name: node.label,
    originalText: node.originalText,
    category: concept?.label ?? '',
    bcioClass: concept?.id.replaceFirst('c:', '') ?? '',
    annotationCounts: node.annotationCounts,
    language: node.language,
    hasTranslation: node.language.isNotEmpty && node.originalText != node.label,
  );
}
```

- [ ] **Step 1: Write updated explore screen tests** in `mobile/test/widget/explore_screen_test.dart`

Replace the entire file:

```dart
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

Widget _buildWithProvider(Override graphOverride) {
  return ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService()),
      graphOverride,
    ],
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: const ExploreScreen(),
    ),
  );
}

void main() {
  testWidgets('shows Explore Habits AppBar title', (tester) async {
    await tester.pumpWidget(
      _buildWithProvider(
        habitGraphProvider.overrideWith((_) async => HabitGraph.empty()),
      ),
    );
    await tester.pump();
    expect(find.text('Explore Habits'), findsOneWidget);
  });

  testWidgets('shows loading indicator while fetching graph', (tester) async {
    await tester.pumpWidget(
      _buildWithProvider(
        habitGraphProvider.overrideWith(
          (_) => Future<HabitGraph>.delayed(const Duration(seconds: 60)),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state and retry button on failure', (tester) async {
    await tester.pumpWidget(
      _buildWithProvider(
        habitGraphProvider.overrideWith(
          (_) => Future<HabitGraph>.error(Exception('Network error')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Failed to load habits'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows empty state when graph has no nodes', (tester) async {
    await tester.pumpWidget(
      _buildWithProvider(
        habitGraphProvider.overrideWith((_) async => HabitGraph.empty()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('No habit data available yet.'), findsOneWidget);
  });

  testWidgets('shows TabBar with Graph and Stats tabs', (tester) async {
    await tester.pumpWidget(
      _buildWithProvider(
        habitGraphProvider.overrideWith((_) async => HabitGraph.empty()),
      ),
    );
    await tester.pump();
    expect(find.text('Graph'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/widget/explore_screen_test.dart 2>&1 | tail -15
```

Expected: compilation errors — `ExploreScreen` still uses old API; `habitGraphProvider` doesn't exist in test imports.

- [ ] **Step 3: Rewrite `mobile/lib/screens/explore_screen.dart`**

Replace the entire file with:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/habit_graph.dart';
import '../models/habit_node.dart';
import '../providers/habit_graph_provider.dart';
import '../services/habit_service.dart';
import '../widgets/habit_graph_widget.dart';
import 'stats_screen.dart';

// Converts a graph habit node to the HabitNode model used by _NodeDetailSheet.
HabitNode _toHabitNode(GraphNode node, HabitGraph graph) {
  final concept = graph.conceptForHabit(node.id);
  return HabitNode(
    id: node.habitId!,
    name: node.label,
    originalText: node.originalText,
    category: concept?.label ?? '',
    bcioClass: concept?.id.replaceFirst('c:', '') ?? '',
    annotationCounts: node.annotationCounts,
    language: node.language,
    hasTranslation: node.language.isNotEmpty && node.originalText != node.label,
  );
}

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  String? _selectedNodeId;

  void _showHabitDetail(GraphNode graphNode, HabitGraph graph) {
    final habitNode = _toHabitNode(graphNode, graph);
    final allHabitNodes = graph.habitNodes
        .map((n) => _toHabitNode(n, graph))
        .toList();

    setState(() => _selectedNodeId = graphNode.id);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _NodeDetailSheet(
        initialNode: habitNode,
        allHabits: allHabitNodes,
        habitService: ref.read(habitServiceProvider),
        onNodeUpdated: (_) {},
        onNavigateTo: (target) {
          Navigator.of(ctx).pop();
          final targetGraphNode = graph.habitNodes
              .where((n) => n.habitId == target.id)
              .firstOrNull;
          if (targetGraphNode != null) {
            WidgetsBinding.instance.addPostFrameCallback(
              (_) => _showHabitDetail(targetGraphNode, graph),
            );
          }
        },
      ),
    ).whenComplete(() {
      if (mounted) setState(() => _selectedNodeId = null);
    });
  }

  void _showConceptDetail(GraphNode conceptNode, HabitGraph graph) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _ConceptDetailSheet(
        conceptNode: conceptNode,
        habits: graph.habitsForConcept(conceptNode.id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final graphAsync = ref.watch(habitGraphProvider);

    Widget body;

    if (graphAsync.isLoading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (graphAsync.hasError) {
      body = Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 12),
            Text(l10n.failedToLoadHabits,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(habitGraphProvider),
              icon: const Icon(Icons.refresh),
              label: Text(l10n.retry),
            ),
          ],
        ),
      );
    } else {
      final graph = graphAsync.value!;
      if (graph.nodes.isEmpty) {
        body = Center(child: Text(l10n.noHabitDataYet));
      } else {
        body = HabitGraphWidget(
          graph: graph,
          onHabitTap: (node) => _showHabitDetail(node, graph),
          onConceptTap: (node) => _showConceptDetail(node, graph),
        );
      }
    }

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.exploreHabits),
          actions: [
            if (!graphAsync.isLoading)
              IconButton(
                onPressed: () => ref.invalidate(habitGraphProvider),
                icon: const Icon(Icons.refresh),
                tooltip: l10n.refresh,
              ),
          ],
          bottom: TabBar(
            tabs: [
              Tab(icon: const Icon(Icons.hub), text: l10n.graphTab),
              Tab(icon: const Icon(Icons.bar_chart), text: l10n.statsTab),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            body,
            const StatsScreen(),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Concept detail bottom sheet
// ---------------------------------------------------------------------------

class _ConceptDetailSheet extends StatelessWidget {
  final GraphNode conceptNode;
  final List<GraphNode> habits;

  const _ConceptDetailSheet({
    required this.conceptNode,
    required this.habits,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.5,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: cs.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: const BoxDecoration(
                  color: Color(0xFFFF9800),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text('Behaviour Change Concept',
                  style: tt.labelMedium?.copyWith(color: cs.outline)),
            ],
          ),
          const SizedBox(height: 6),
          Text(conceptNode.label, style: tt.titleLarge),
          const SizedBox(height: 16),
          Row(
            children: [
              Icon(Icons.hub_outlined, size: 15, color: cs.primary),
              const SizedBox(width: 6),
              Text(
                'Related habits  •  ${habits.length}',
                style: tt.labelLarge
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final habit in habits) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(habit.label,
                  style: tt.bodyMedium),
            ),
            Divider(height: 1, color: cs.outlineVariant),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Node detail bottom sheet (unchanged from original — reused for habit taps)
// ---------------------------------------------------------------------------

class _NodeDetailSheet extends StatefulWidget {
  final HabitNode initialNode;
  final List<HabitNode> allHabits;
  final HabitService habitService;
  final void Function(HabitNode updated) onNodeUpdated;
  final void Function(HabitNode target) onNavigateTo;

  const _NodeDetailSheet({
    required this.initialNode,
    required this.allHabits,
    required this.habitService,
    required this.onNodeUpdated,
    required this.onNavigateTo,
  });

  @override
  State<_NodeDetailSheet> createState() => _NodeDetailSheetState();
}

class _NodeDetailSheetState extends State<_NodeDetailSheet> {
  late HabitNode _node;
  bool _annotating = false;

  @override
  void initState() {
    super.initState();
    _node = widget.initialNode;
  }

  Future<void> _annotate(String type) async {
    if (_annotating) return;
    setState(() => _annotating = true);
    try {
      final newCounts = await widget.habitService.annotateHabit(_node.id, type);
      final updated = HabitNode(
        id: _node.id,
        name: _node.name,
        originalText: _node.originalText,
        category: _node.category,
        bcioClass: _node.bcioClass,
        annotationCounts: newCounts,
        language: _node.language,
        hasTranslation: _node.hasTranslation,
      );
      widget.onNodeUpdated(updated);
      if (mounted) setState(() => _node = updated);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppLocalizations.of(context)?.couldNotSubmitAnnotation ??
                  'Could not submit',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _annotating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context)!;

    final related = widget.allHabits
        .where((h) => h.id != _node.id && h.category == _node.category)
        .toList()
      ..sort((a, b) => b.totalAnnotations.compareTo(a.totalAnnotations));

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.92,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: cs.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          Text(_node.name, style: tt.titleLarge?.copyWith(height: 1.35)),
          if (_node.hasTranslation &&
              _node.originalText.isNotEmpty &&
              _node.originalText != _node.name) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.translate, size: 14, color: cs.outline),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Original: ${_node.originalText}',
                    style: tt.bodySmall?.copyWith(color: cs.outline),
                  ),
                ),
              ],
            ),
          ] else if (!_node.hasTranslation && _node.language.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.translate, size: 14, color: cs.tertiary),
                const SizedBox(width: 6),
                Text(
                  'In ${_node.language.toUpperCase()} — no translation yet',
                  style: tt.bodySmall?.copyWith(color: cs.tertiary),
                ),
              ],
            ),
          ],
          const SizedBox(height: 14),
          if (_node.category.isNotEmpty)
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: cs.secondaryContainer,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.category_outlined,
                          size: 14, color: cs.onSecondaryContainer),
                      const SizedBox(width: 6),
                      Text(
                        _node.category,
                        style: tt.labelMedium
                            ?.copyWith(color: cs.onSecondaryContainer),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          if (related.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                Icon(Icons.hub_outlined, size: 15, color: cs.primary),
                const SizedBox(width: 6),
                Text(
                  'Related habits  •  ${related.length}',
                  style: tt.labelLarge
                      ?.copyWith(color: cs.onSurface, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: related.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final rel = related[i];
                  final label = rel.name.length > 32
                      ? '${rel.name.substring(0, 32)}…'
                      : rel.name;
                  return ActionChip(
                    label: Text(label, style: const TextStyle(fontSize: 12)),
                    onPressed: () => widget.onNavigateTo(rel),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 20),
          Divider(color: cs.outlineVariant),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.people_outline, size: 15, color: cs.primary),
              const SizedBox(width: 6),
              Text(
                l10n.communityAnnotations,
                style: tt.labelLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _CountBadge(
                icon: Icons.thumb_up_outlined,
                label: l10n.iDoThisCount(
                    '${_node.annotationCounts['iDoThis'] ?? 0}'),
                color: cs.primary,
              ),
              const SizedBox(width: 20),
              _CountBadge(
                icon: Icons.star_outline,
                label: l10n.helpfulCount(
                    '${_node.annotationCounts['helpful'] ?? 0}'),
                color: cs.tertiary,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _annotating ? null : () => _annotate('iDoThis'),
                  icon: const Icon(Icons.thumb_up),
                  label: Text(l10n.iDoThisToo),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _annotating ? null : () => _annotate('helpful'),
                  icon: _annotating
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.star),
                  label: Text(l10n.helpful),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _CountBadge({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 5),
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
      ],
    );
  }
}
```

- [ ] **Step 4: Run the explore screen tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter test test/widget/explore_screen_test.dart 2>&1 | tail -15
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full Flutter test suite to check for regressions**

```bash
flutter test 2>&1 | tail -20
```

Expected: all tests pass. If any test references `_CategoryFilterBar`, `_fetchHabits`, `fetchDonatedHabits` in explore context, fix those tests.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/screens/explore_screen.dart \
        mobile/test/widget/explore_screen_test.dart
git commit -m "feat: update ExploreScreen to use habitGraphProvider and concept detail sheet"
```

---

## Manual Smoke Test (after all tasks)

1. Launch app on simulator: `cd mobile && flutter run`
2. Open the **Explore** tab
3. Verify concept hub nodes appear as large orange spheres
4. Verify habit nodes cluster around their concept hubs as smaller blue spheres
5. Tap a habit node → existing detail sheet with name, annotations, "I do this" / "Helpful" buttons
6. Tap a concept node → concept detail sheet with concept name and list of connected habit names
7. Tap the refresh button (top-right) → graph reloads
8. Pinch to zoom and pan — verify smooth interaction
