# Explore Graph Visualization Design

## Goal

Replace the current explore-page graph — which uses same-category grouping as a proxy for relationships — with a real Neo4j graph rendered by `flutter_graph_view`. Both Habit nodes and BCIOConcept hub nodes are visible. Tapping any node opens a detail view. The graph loads at app start and can be refreshed.

## Architecture

Three layers of change:

1. **Backend**: new `GET /habits/graph` endpoint that queries Neo4j for Habit nodes, BCIOConcept nodes, and the edges between them.
2. **Flutter data layer**: new models (`GraphNode`, `GraphEdge`, `HabitGraph`) and a Riverpod `AsyncNotifier` that fetches the graph and exposes it to the UI.
3. **Flutter UI layer**: replace the custom `HabitGraphWidget` `CustomPainter` with a `flutter_graph_view`-backed widget; add concept and habit tap handlers.

---

## Backend

### Endpoint

`GET /api/v1/habits/graph` — authenticated (participant/admin/researcher), no body.

### Cypher Query

```cypher
MATCH (b:BCIOConcept)<-[:MAPS_TO]-(:Context)<-[:HAS_CONTEXT]-(h:Habit)
RETURN
  h.id          AS habitId,
  h.translationEN AS habitLabel,
  b.id          AS conceptId,
  b.label       AS conceptLabel
```

Habits with no BCIOConcept link are excluded — they have no meaningful position in this graph.

### Response Shape

```json
{
  "nodes": [
    { "id": "h:<uuid>",    "type": "habit",   "label": "Drink water",     "habitId": "<uuid>" },
    { "id": "c:<bcio_id>", "type": "concept", "label": "Self-monitoring", "habitId": null }
  ],
  "edges": [
    { "source": "h:<uuid>", "target": "c:<bcio_id>" }
  ]
}
```

- Node `id` is prefixed (`h:` for habits, `c:` for concepts) to guarantee uniqueness across types.
- Concept nodes have `habitId: null`.
- Duplicate edges (same habit linked to same concept via multiple contexts) are deduplicated server-side before returning.

### File Changes

- **Modify** `app/db/habitQueries.js` — add `getHabitGraph(db)` function
- **Modify** `app/routes/habitsRouter.js` — add `GET /graph` route calling `getHabitGraph`

---

## Flutter — Data Models

**Create** `mobile/lib/models/habit_graph.dart`:

```dart
class GraphNode {
  final String id;
  final String type;   // 'habit' | 'concept'
  final String label;
  final String? habitId;
}

class GraphEdge {
  final String source;
  final String target;
}

class HabitGraph {
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
  const HabitGraph({required this.nodes, required this.edges});
  factory HabitGraph.fromJson(Map<String, dynamic> json);
}
```

---

## Flutter — Provider

**Create** `mobile/lib/providers/habit_graph_provider.dart`:

```dart
@riverpod
class HabitGraphNotifier extends _$HabitGraphNotifier {
  @override
  Future<HabitGraph> build() async { /* GET /habits/graph */ }
}
```

The explore page calls `ref.invalidate(habitGraphNotifierProvider)` when the refresh button is tapped.

---

## Flutter — Graph Widget

**Replace** the existing `HabitGraphWidget` in `mobile/lib/widgets/habit_graph_widget.dart` with a widget that wraps `flutter_graph_view`.

### Node Rendering

| Node type | Radius | Color | Glow |
|-----------|--------|-------|------|
| Concept hub | 28 dp | Orange (`#FF9800`) | yes |
| Habit | 14 dp | Primary blue | no |

Labels render below each node, truncated to 14 characters for habits.

### Layout

`flutter_graph_view` force-directed layout. Concept-to-habit spring constant set higher than concept-to-concept so habits cluster tightly around their hub.

### Tap Behaviour

- **Tap habit node** → opens existing `_NodeDetailSheet` (fetches full habit by `habitId` via `annotateHabit`)
- **Tap concept node** → opens `ConceptDetailSheet`: shows concept label as title, scrollable list of habit names connected to it

### Pan / Zoom

`flutter_graph_view` provides built-in pan and pinch-to-zoom; no custom gesture handling needed.

---

## Flutter — Explore Screen

**Modify** `mobile/lib/screens/explore_screen.dart`:

- Watch `habitGraphNotifierProvider` instead of building a local node list.
- Replace the `HabitGraphWidget` instantiation with the new graph widget.
- Refresh button calls `ref.invalidate(habitGraphNotifierProvider)`.
- While loading: centered `CircularProgressIndicator`.
- On error: error message with retry button.

---

## Testing

- **Backend unit test** (`app/tests/`): mock Neo4j driver, assert `getHabitGraph` deduplicates edges and prefixes IDs correctly.
- **Backend integration test**: mock driver returns known rows; assert response JSON shape matches spec.
- **Flutter widget test** (`mobile/test/`): mock provider returning a small 2-concept, 4-habit graph; assert nodes and edges render without throwing.
- Manual smoke test: launch app on simulator, open Explore tab, verify concept hub nodes appear as larger spheres, habit nodes cluster around them, tap a habit opens detail sheet, tap a concept opens concept sheet.

---

## Out of Scope

- Filtering the graph by concept (future feature)
- Animated transitions when graph data refreshes
- Offline caching of graph data
- Habits with no BCIOConcept link (excluded)
