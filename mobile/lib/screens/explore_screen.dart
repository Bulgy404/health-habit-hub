import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/habit_node.dart';
import '../providers/locale_provider.dart';
import '../services/habit_service.dart';
import '../widgets/habit_graph_widget.dart';
import 'stats_screen.dart';

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  late HabitService _habitService;
  List<HabitNode> _allHabits = [];
  bool _loading = true;
  String? _error;
  String? _selectedCategory;
  String? _selectedNodeId;

  /// The language code used for the last fetch; used to detect locale changes.
  String _fetchedLang = '';

  @override
  void initState() {
    super.initState();
    _habitService = ref.read(habitServiceProvider);
    _fetchHabits();
  }

  Future<void> _fetchHabits() async {
    final lang = ref.read(localeProvider).languageCode;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final habits = await _habitService.fetchDonatedHabits(lang);
      if (mounted) {
        setState(() {
          _allHabits = habits;
          _fetchedLang = lang;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _fetchedLang = lang;
          _loading = false;
        });
      }
    }
  }

  List<String> get _categories {
    final seen = <String>{};
    return _allHabits
        .map((h) => h.category)
        .where((c) => c.isNotEmpty && seen.add(c))
        .toList()
      ..sort();
  }

  List<HabitNode> get _filteredHabits {
    if (_selectedCategory == null) return _allHabits;
    return _allHabits.where((h) => h.category == _selectedCategory).toList();
  }

  // ---------------------------------------------------------------------------
  // Node detail bottom sheet
  // ---------------------------------------------------------------------------

  void _showNodeDetail(HabitNode initialNode) {
    HabitNode node =
        _allHabits.firstWhere((h) => h.id == initialNode.id, orElse: () => initialNode);

    setState(() => _selectedNodeId = node.id);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _NodeDetailSheet(
        initialNode: node,
        allHabits: _allHabits,
        habitService: _habitService,
        onNodeUpdated: (updated) {
          setState(() {
            final idx = _allHabits.indexWhere((h) => h.id == updated.id);
            if (idx != -1) _allHabits[idx] = updated;
          });
        },
        onNavigateTo: (target) {
          Navigator.of(ctx).pop();
          WidgetsBinding.instance.addPostFrameCallback(
            (_) => _showNodeDetail(target),
          );
        },
      ),
    ).whenComplete(() {
      if (mounted) setState(() => _selectedNodeId = null);
    });
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final currentLang = ref.watch(localeProvider).languageCode;

    if (!_loading && currentLang != _fetchedLang) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fetchHabits());
    }

    Widget body;

    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
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
              onPressed: _fetchHabits,
              icon: const Icon(Icons.refresh),
              label: Text(l10n.retry),
            ),
          ],
        ),
      );
    } else if (_allHabits.isEmpty) {
      body = Center(child: Text(l10n.noHabitDataYet));
    } else {
      body = Column(
        children: [
          Expanded(
            child: HabitGraphWidget(
              nodes: _filteredHabits,
              onNodeTap: _showNodeDetail,
              selectedNodeId: _selectedNodeId,
            ),
          ),
          _CategoryFilterBar(
            categories: _categories,
            selected: _selectedCategory,
            onSelect: (cat) => setState(() {
              _selectedCategory = _selectedCategory == cat ? null : cat;
            }),
          ),
        ],
      );
    }

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.exploreHabits),
          actions: [
            if (!_loading)
              IconButton(
                onPressed: _fetchHabits,
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
// Node detail bottom sheet — extracted widget for clean StatefulBuilder-free code
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
                style: tt.labelLarge
                    ?.copyWith(fontWeight: FontWeight.w600),
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

// ---------------------------------------------------------------------------
// Category filter bar
// ---------------------------------------------------------------------------

class _CategoryFilterBar extends StatelessWidget {
  final List<String> categories;
  final String? selected;
  final void Function(String) onSelect;

  const _CategoryFilterBar({
    required this.categories,
    required this.selected,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 52,
      color: Theme.of(context).scaffoldBackgroundColor,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final cat = categories[i];
          final isSelected = cat == selected;
          return FilterChip(
            label: Text(cat),
            selected: isSelected,
            onSelected: (_) => onSelect(cat),
          );
        },
      ),
    );
  }
}
