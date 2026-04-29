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
  void _showHabitDetail(GraphNode graphNode, HabitGraph graph) {
    assert(graphNode.isHabit, '_showHabitDetail called with non-habit node: ${graphNode.id}');
    final habitNode = _toHabitNode(graphNode, graph);
    final allHabitNodes = graph.habitNodes
        .map((n) => _toHabitNode(n, graph))
        .toList();

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
        // Annotation counts in the open sheet update via _NodeDetailSheet's
        // own setState. The provider cache stays stale until next refresh —
        // acceptable tradeoff to avoid re-fetching the whole graph on every tap.
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
    );
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
                style: tt.labelLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final habit in habits) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(habit.label, style: tt.bodyMedium),
            ),
            Divider(height: 1, color: cs.outlineVariant),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Node detail bottom sheet (reused for habit taps)
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
                  'Could not submit annotation',
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

    // Related: same category, different node, sorted by total annotations.
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
          // Drag handle
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

          // Full habit text
          Text(_node.name, style: tt.titleLarge?.copyWith(height: 1.35)),

          // Translation info
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

          // Category badge
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

          // Related habits in the same category
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

          // Community counts
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

          // Action buttons
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

// ---------------------------------------------------------------------------
// Small count badge widget
// ---------------------------------------------------------------------------

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
