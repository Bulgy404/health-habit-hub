import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/bubble_graph.dart';
import '../models/habit_node.dart';
import '../providers/annotation_state_provider.dart';
import '../providers/bubble_graph_provider.dart';
import '../providers/comments_enabled_provider.dart';
import '../providers/locale_provider.dart';
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
  int _lastTabIndex = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_handleTabChange);
  }

  @override
  void dispose() {
    _tabController.removeListener(_handleTabChange);
    _tabController.dispose();
    super.dispose();
  }

  // Stats are fetched once and cached; re-pull them every time the user
  // revisits the Stats tab so newly donated/annotated habits show up without
  // requiring a manual pull-to-refresh.
  void _handleTabChange() {
    final index = _tabController.index;
    if (index == _lastTabIndex) return;
    _lastTabIndex = index;
    if (index == 1) {
      ref.invalidate(myStatsProvider);
      ref.invalidate(habitStatsProvider);
    } else if (index == 2) {
      ref.invalidate(myAnnotationsProvider);
    }
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

    // Locate the habit by id. Prefer the requested dimension when it matches,
    // otherwise fall back to whichever dimension actually contains the habit —
    // the caller may not know (or send) a dimension id.
    for (final d in graph.dimensions) {
      final match = d.habits.where((h) => h.id == selection.habitId).firstOrNull;
      if (match != null &&
          (selection.dimensionId.isEmpty || d.id == selection.dimensionId)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _showHabitDetail(match, d, graph);
        });
        return;
      }
    }
    for (final d in graph.dimensions) {
      final match = d.habits.where((h) => h.id == selection.habitId).firstOrNull;
      if (match != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _showHabitDetail(match, d, graph);
        });
        return;
      }
    }
    // Habit not present in the graph (e.g. no context yet) — nothing to open.
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final graphAsync = ref.watch(bubbleGraphProvider);

    // Handle "Show in Habit Graph" requests from the Stats / My Habits tabs.
    // ExploreScreen owns the TabController, so it also performs the tab switch.
    ref.listen<HabitGraphSelection?>(showInGraphProvider, (_, selection) {
      if (selection == null) return;
      ref.read(showInGraphProvider.notifier).clear();
      if (_tabController.index != 0) _tabController.animateTo(0);
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
            Tab(icon: const Icon(Icons.bookmark_outline), text: l10n.exploreSavedTab),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          body,
          const StatsScreen(),
          _MyHabitsTab(
            graph: graphAsync.value,
            onHabitTap: (habitId, dimensionId) {
              _tabController.animateTo(0);
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted) return;
                ref.read(showInGraphProvider.notifier).select(
                  HabitGraphSelection(
                    habitId: habitId,
                    dimensionId: dimensionId,
                  ),
                );
              });
            },
          ),
        ],
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
  String? _loadingType; // annotation type while a request is in-flight
  List<HabitComment>? _comments;
  final _commentController = TextEditingController();
  bool _postingComment = false;
  // Similarity-ranked related habits from the backend; null until loaded (the
  // build falls back to a local same-category heuristic in the meantime).
  List<HabitNode>? _relatedOverride;

  @override
  void initState() {
    super.initState();
    _node = widget.initialNode;
    if (ref.read(commentsEnabledProvider)) _loadComments();
    _loadRelated();
  }

  Future<void> _loadRelated() async {
    try {
      final ids =
          await widget.habitService.fetchRelatedHabitIds(_node.id, limit: 10);
      if (ids.isEmpty) return;
      final byId = {for (final h in widget.allHabits) h.id: h};
      final ordered = [
        for (final id in ids)
          if (byId[id] != null) byId[id]!,
      ];
      if (mounted && ordered.isNotEmpty) {
        setState(() => _relatedOverride = ordered);
      }
    } catch (_) {
      // Keep the local fallback.
    }
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadComments() async {
    try {
      final comments = await widget.habitService.fetchComments(_node.id);
      if (mounted) setState(() => _comments = comments);
    } catch (_) {
      if (mounted) setState(() => _comments = const []);
    }
  }

  Future<void> _postComment() async {
    final text = _commentController.text.trim();
    if (text.isEmpty || _postingComment) return;
    setState(() => _postingComment = true);
    try {
      final created = await widget.habitService.addComment(_node.id, text);
      _commentController.clear();
      if (mounted) {
        // A flagged comment must never be shown, even on the poster's own
        // device — it only becomes visible once a researcher/admin approves
        // it, at which point it will appear via the normal fetch-on-open path.
        if (created.approved) {
          setState(() => _comments = [created, ...?_comments]);
        } else if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context)!.commentPendingReview),
            ),
          );
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context)!.couldNotPostComment),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _postingComment = false);
    }
  }

  /// Reports [comment] as objectionable (Guideline 1.2). The backend pulls it
  /// out of the public listing immediately and re-queues it for admin
  /// review, so it's removed from the local list right away too.
  Future<void> _reportComment(HabitComment comment) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.reportCommentTitle),
        content: Text(l10n.reportCommentBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.reportComment),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(
      () => _comments = _comments?.where((c) => c.id != comment.id).toList(),
    );
    try {
      await widget.habitService.reportComment(_node.id, comment.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.commentReported)),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _comments = [comment, ...?_comments]);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.couldNotReportComment)),
        );
      }
    }
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
    final commentsEnabled = ref.watch(commentsEnabledProvider);
    final viewerLang = ref.watch(localeProvider).languageCode;
    // The habit's own donation language matching the viewer's language means
    // the displayed text already IS that original — nothing is missing, so
    // don't show the "no translation yet" warning in that case.
    final sameLangAsViewer =
        _node.language.toLowerCase() == viewerLang.toLowerCase();

    // Prefer similarity-ranked related habits from the backend; otherwise fall
    // back to a local same-category heuristic. Either way, cap at 10.
    List<HabitNode> related;
    if (_relatedOverride != null) {
      related = _relatedOverride!.take(10).toList();
    } else {
      related = widget.allHabits
          .where((h) => h.id != _node.id && h.category == _node.category)
          .toList()
        ..sort((a, b) => b.totalAnnotations.compareTo(a.totalAnnotations));
      related = related.take(10).toList();
    }

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
          ] else if (!_node.hasTranslation &&
              _node.language.isNotEmpty &&
              !sameLangAsViewer) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.translate, size: 14, color: cs.tertiary),
                const SizedBox(width: 6),
                Text(
                  'In ${_node.language.toUpperCase()}, no translation yet',
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
                icon: helpfulActive ? Icons.bookmark : Icons.bookmark_outline,
                label: l10n.helpfulCount(
                  '${_node.annotationCounts['helpful'] ?? 0}',
                ),
                color: helpfulActive ? cs.primary : cs.tertiary,
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
                  style: helpfulActive
                      ? FilledButton.styleFrom(
                          backgroundColor:
                              Theme.of(context).colorScheme.primaryContainer,
                          foregroundColor:
                              Theme.of(context).colorScheme.onPrimaryContainer,
                        )
                      : null,
                  icon: _loadingType == 'helpful'
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          helpfulActive
                              ? Icons.bookmark
                              : Icons.bookmark_outline,
                        ),
                  label: Text(l10n.helpful),
                ),
              ),
            ],
          ),

          // ── Community comments ─────────────────────────────────────
          const SizedBox(height: 20),
          Text(l10n.commentsTitle, style: tt.titleSmall),
          const SizedBox(height: 8),
          if (!commentsEnabled)
            Text(l10n.commentsDisabledMessage, style: tt.bodySmall)
          else ...[
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _commentController,
                    maxLength: 500,
                    decoration: InputDecoration(
                      hintText: l10n.commentHint,
                      counterText: '',
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _postingComment ? null : _postComment,
                  icon: _postingComment
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send, size: 18),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_comments == null)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(8),
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            else if (_comments!.isEmpty)
              Text(l10n.noCommentsYet, style: tt.bodySmall)
            else
              ..._comments!.take(20).map(
                    (c) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.chat_bubble_outline,
                              size: 14, color: cs.outline),
                          const SizedBox(width: 8),
                          Expanded(child: Text(c.text, style: tt.bodySmall)),
                          Tooltip(
                            message: l10n.reportComment,
                            child: InkWell(
                              onTap: () => _reportComment(c),
                              borderRadius: BorderRadius.circular(12),
                              child: Padding(
                                padding: const EdgeInsets.all(4),
                                child: Icon(
                                  Icons.flag_outlined,
                                  size: 14,
                                  color: cs.outline,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
          ],

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

// ---------------------------------------------------------------------------
// My Habits tab — overview of the user's saved and iDoThis annotations
// ---------------------------------------------------------------------------

class _MyHabitsTab extends ConsumerWidget {
  final BubbleGraph? graph;
  final void Function(String habitId, String dimensionId) onHabitTap;

  const _MyHabitsTab({
    required this.graph,
    required this.onHabitTap,
  });

  String _habitName(String id) {
    if (graph == null) return id;
    for (final dim in graph!.dimensions) {
      for (final h in dim.habits) {
        if (h.id == id) return h.label;
      }
    }
    return id;
  }

  String? _dimensionId(String habitId) {
    if (graph == null) return null;
    for (final dim in graph!.dimensions) {
      for (final h in dim.habits) {
        if (h.id == habitId) return dim.id;
      }
    }
    return null;
  }

  void _tapHabit(String habitId) {
    final dimId = _dimensionId(habitId);
    if (dimId == null) return;
    onHabitTap(habitId, dimId);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context)!;
    final annotationsAsync = ref.watch(myAnnotationsProvider);

    return annotationsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Failed to load', style: tt.bodyMedium),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: () => ref.invalidate(myAnnotationsProvider),
              icon: const Icon(Icons.refresh),
              label: Text(l10n.retry),
            ),
          ],
        ),
      ),
      data: (annotations) {
        final iDoThisIds = annotations['iDoThis'] ?? [];
        final savedIds = annotations['helpful'] ?? [];

        if (iDoThisIds.isEmpty && savedIds.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.bookmark_outline, size: 48, color: cs.outline),
                const SizedBox(height: 12),
                Text(
                  l10n.exploreSavedTab,
                  style: tt.titleMedium?.copyWith(color: cs.outline),
                ),
                const SizedBox(height: 6),
                Text(
                  'Tap "${l10n.iDoThisToo}" or "${l10n.helpful}" on any habit to see it here.',
                  style: tt.bodySmall?.copyWith(color: cs.outline),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(myAnnotationsProvider),
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              if (iDoThisIds.isNotEmpty)
                _AnnotationSection(
                  icon: Icons.thumb_up,
                  label: l10n.iDoThisToo,
                  color: Colors.green.shade700,
                  habitIds: iDoThisIds,
                  habitName: _habitName,
                  onTap: _tapHabit,
                  canNavigate: graph != null,
                ),
              if (savedIds.isNotEmpty)
                _AnnotationSection(
                  icon: Icons.bookmark,
                  label: l10n.savedSection,
                  color: cs.primary,
                  habitIds: savedIds,
                  habitName: _habitName,
                  onTap: _tapHabit,
                  canNavigate: graph != null,
                ),
            ],
          ),
        );
      },
    );
  }
}

class _AnnotationSection extends StatefulWidget {
  final IconData icon;
  final String label;
  final Color color;
  final List<String> habitIds;
  final String Function(String id) habitName;
  final void Function(String id) onTap;
  final bool canNavigate;

  const _AnnotationSection({
    required this.icon,
    required this.label,
    required this.color,
    required this.habitIds,
    required this.habitName,
    required this.onTap,
    required this.canNavigate,
  });

  @override
  State<_AnnotationSection> createState() => _AnnotationSectionState();
}

class _AnnotationSectionState extends State<_AnnotationSection> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Icon(widget.icon, size: 18, color: widget.color),
                const SizedBox(width: 8),
                Text(
                  '${widget.label} (${widget.habitIds.length})',
                  style: tt.titleSmall?.copyWith(
                    color: widget.color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  color: cs.outline,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
        if (_expanded)
          ...widget.habitIds.map(
            (id) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
              child: Card(
                margin: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(widget.icon, color: widget.color, size: 20),
                  title: Text(widget.habitName(id)),
                  trailing: widget.canNavigate
                      ? Icon(Icons.arrow_forward_ios, size: 12, color: cs.outline)
                      : null,
                  tileColor: cs.surfaceContainerLow,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  onTap: widget.canNavigate ? () => widget.onTap(id) : null,
                ),
              ),
            ),
          ),
        const SizedBox(height: 8),
      ],
    );
  }
}
