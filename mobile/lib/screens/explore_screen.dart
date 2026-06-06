import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/bubble_graph.dart';
import '../models/habit_node.dart';
import '../providers/annotation_state_provider.dart';
import '../providers/bubble_graph_provider.dart';
import '../providers/show_in_graph_provider.dart';
import '../services/habit_service.dart';
import '../widgets/bubble_graph_widget.dart';
import 'stats_screen.dart';

/// Converts a [HabitBubble] from the graph model to a [HabitNode] used by
/// the detail sheet.
HabitNode _toHabitNode(HabitBubble bubble, DimensionBubble dimension) {
  return HabitNode(
    id: bubble.id,
    name: bubble.label,
    originalText: bubble.originalText,
    category: dimension.label,
    bcioClass: '',
    annotationCounts: bubble.annotationCounts,
    language: bubble.language,
    hasTranslation:
        bubble.originalText.isNotEmpty && bubble.originalText != bubble.label,
  );
}

/// Displays the user's habit graph in an interactive bubble visualisation.
///
/// Shows dimension bubbles at the top level; tapping a dimension drills in to
/// show individual habit bubbles.  Tapping a habit opens a [_NodeDetailSheet].
class ExploreScreen extends ConsumerStatefulWidget {
  /// Creates an [ExploreScreen].
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  BubbleGraph? _graphOverride;
  String? _pulseHabitId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _showHabitDetail(
    HabitBubble bubble,
    DimensionBubble dimension,
    BubbleGraph graph,
  ) {
    final habitNode = _toHabitNode(bubble, dimension);
    final allHabitNodes = dimension.habits
        .map((h) => _toHabitNode(h, dimension))
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
        onNodeUpdated: _applyNodeUpdate,
        onNavigateTo: (target) {
          Navigator.of(ctx).pop();
          final targetBubble = dimension.habits
              .where((h) => h.id == target.id)
              .firstOrNull;
          if (targetBubble != null) {
            WidgetsBinding.instance.addPostFrameCallback(
              (_) => _showHabitDetail(targetBubble, dimension, graph),
            );
          }
        },
      ),
    );
  }

  void _applyNodeUpdate(HabitNode updated) {
    final base = _graphOverride ?? ref.read(bubbleGraphProvider).value;
    if (base == null) return;

    final dimensions = base.dimensions.map((d) {
      final habits = d.habits.map((h) {
        if (h.id != updated.id) return h;
        return HabitBubble(
          id: h.id,
          label: h.label,
          originalText: h.originalText,
          language: h.language,
          annotationCounts: updated.annotationCounts,
        );
      }).toList();

      return DimensionBubble(
        id: d.id,
        label: d.label,
        habitCount: d.habitCount,
        habits: habits,
      );
    }).toList();

    setState(() {
      _graphOverride = BubbleGraph(dimensions: dimensions);
      _pulseHabitId = updated.id;
    });
    Future<void>.delayed(const Duration(milliseconds: 700), () {
      if (!mounted) return;
      if (_pulseHabitId != updated.id) return;
      setState(() => _pulseHabitId = null);
    });
  }

  void _handleShowInGraph(HabitGraphSelection selection) {
    final graph = _graphOverride ?? ref.read(bubbleGraphProvider).value;
    if (graph == null) return;
    final dimension = graph.dimensions
        .where((d) => d.id == selection.dimensionId)
        .firstOrNull;
    if (dimension == null) return;
    final habit = dimension.habits
        .where((h) => h.id == selection.habitId)
        .firstOrNull;
    if (habit == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _showHabitDetail(habit, dimension, graph);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final graphAsync = ref.watch(bubbleGraphProvider);

    // Handle "Show in Habit Graph" requests from the Stats tab.
    ref.listen<HabitGraphSelection?>(showInGraphProvider, (_, selection) {
      if (selection == null) return;
      ref.read(showInGraphProvider.notifier).clear();
      _handleShowInGraph(selection);
    });

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
            Text(
              l10n.failedToLoadHabits,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(bubbleGraphProvider),
              icon: const Icon(Icons.refresh),
              label: Text(l10n.retry),
            ),
          ],
        ),
      );
    } else {
      final graph = _graphOverride ?? graphAsync.value!;
      if (graph.dimensions.isEmpty) {
        body = Center(child: Text(l10n.noHabitDataYet));
      } else {
        body = BubbleGraphWidget(
          graph: graph,
          pulseHabitId: _pulseHabitId,
          onHabitTap: (bubble, dimension) =>
              _showHabitDetail(bubble, dimension, graph),
        );
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.exploreHabits),
        actions: [
          if (!graphAsync.isLoading)
            IconButton(
              onPressed: () {
                setState(() {
                  _graphOverride = null;
                  _pulseHabitId = null;
                });
                ref.invalidate(bubbleGraphProvider);
              },
              icon: const Icon(Icons.refresh),
              tooltip: l10n.refresh,
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(icon: const Icon(Icons.bubble_chart), text: l10n.graphTab),
            Tab(icon: const Icon(Icons.bar_chart), text: l10n.statsTab),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [body, const StatsScreen()],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Node detail bottom sheet
// ---------------------------------------------------------------------------

class _NodeDetailSheet extends ConsumerStatefulWidget {
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
  ConsumerState<_NodeDetailSheet> createState() => _NodeDetailSheetState();
}

class _NodeDetailSheetState extends ConsumerState<_NodeDetailSheet> {
  late HabitNode _node;
  String? _loadingType; // 'iDoThis' or 'helpful' while a request is in-flight

  @override
  void initState() {
    super.initState();
    _node = widget.initialNode;
  }

  Future<void> _annotate(String type) async {
    if (_loadingType != null) return;
    final notifier = ref.read(annotationStateProvider.notifier);
    final isRemove = notifier.isAnnotated(_node.id, type);
    setState(() => _loadingType = type);
    try {
      final newCounts = await widget.habitService.annotateHabit(
        _node.id,
        type,
        remove: isRemove,
      );
      notifier.toggle(_node.id, type);
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
      if (mounted) setState(() => _loadingType = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context)!;

    final annotationState = ref.watch(annotationStateProvider);
    final iDoThisActive =
        annotationState[_node.id]?.contains('iDoThis') ?? false;
    final helpfulActive =
        annotationState[_node.id]?.contains('helpful') ?? false;
    final busy = _loadingType != null;

    final related =
        widget.allHabits
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: cs.secondaryContainer,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.category_outlined,
                        size: 14,
                        color: cs.onSecondaryContainer,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _node.category,
                        style: tt.labelMedium?.copyWith(
                          color: cs.onSecondaryContainer,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

          const SizedBox(height: 20),
          Divider(color: cs.outlineVariant),
          const SizedBox(height: 12),

          // Community annotation counts
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
                icon: iDoThisActive ? Icons.thumb_up : Icons.thumb_up_outlined,
                label: l10n.iDoThisCount(
                  '${_node.annotationCounts['iDoThis'] ?? 0}',
                ),
                color: iDoThisActive ? Colors.green.shade700 : cs.primary,
              ),
              const SizedBox(width: 20),
              _CountBadge(
                icon: helpfulActive ? Icons.star : Icons.star_outline,
                label: l10n.helpfulCount(
                  '${_node.annotationCounts['helpful'] ?? 0}',
                ),
                color: helpfulActive ? Colors.amber : cs.tertiary,
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Toggle annotation buttons — always visible near the top
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : () => _annotate('iDoThis'),
                  style: iDoThisActive
                      ? OutlinedButton.styleFrom(
                          backgroundColor: Colors.green.shade50,
                          foregroundColor: Colors.green.shade700,
                          side: BorderSide(color: Colors.green.shade700),
                        )
                      : null,
                  icon: _loadingType == 'iDoThis'
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          iDoThisActive
                              ? Icons.thumb_up
                              : Icons.thumb_up_alt_outlined,
                        ),
                  label: Text(l10n.iDoThisToo),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: busy ? null : () => _annotate('helpful'),
                  icon: _loadingType == 'helpful'
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          helpfulActive ? Icons.star : Icons.star_outline,
                          color: helpfulActive ? Colors.amber : null,
                        ),
                  label: Text(l10n.helpful),
                ),
              ),
            ],
          ),

          // Related habits — bounded scrollable container, always below buttons
          if (related.isNotEmpty) ...[
            const SizedBox(height: 24),
            Row(
              children: [
                Icon(Icons.bubble_chart_outlined, size: 15, color: cs.primary),
                const SizedBox(width: 6),
                Text(
                  'Related habits  •  ${related.length}',
                  style: tt.labelLarge?.copyWith(
                    color: cs.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            // Show at most 5 habits; scroll if there are more.
            SizedBox(
              height: math.min(related.length, 5) * 48.0,
              child: ListView.builder(
                physics: const ClampingScrollPhysics(),
                itemCount: related.length,
                itemBuilder: (_, i) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(related[i].name, style: tt.bodyMedium),
                  trailing: Icon(
                    Icons.arrow_forward_ios,
                    size: 12,
                    color: cs.outline,
                  ),
                  onTap: () => widget.onNavigateTo(related[i]),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Small count badge
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
