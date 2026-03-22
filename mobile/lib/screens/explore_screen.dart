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
          _fetchedLang = lang; // prevent infinite refetch on repeated build
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
    // Find the live node (counts may have updated since the tap).
    HabitNode node =
        _allHabits.firstWhere((h) => h.id == initialNode.id, orElse: () => initialNode);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          Future<void> annotate(String type) async {
            final l10n = AppLocalizations.of(ctx)!;
            try {
              final newCounts = await _habitService.annotateHabit(node.id, type);
              final updated = HabitNode(
                id: node.id,
                name: node.name,
                category: node.category,
                bcioClass: node.bcioClass,
                annotationCounts: newCounts,
              );
              // Update live list so graph reflects new counts.
              setState(() {
                final idx = _allHabits.indexWhere((h) => h.id == node.id);
                if (idx != -1) _allHabits[idx] = updated;
              });
              // Update bottom sheet display.
              setSheetState(() => node = updated);
            } catch (e, st) {
              debugPrint('ERROR in ExploreScreen._showNodeDetail annotate: $e\n$st');
              if (ctx.mounted) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(content: Text(l10n.couldNotSubmitAnnotation)),
                );
              }
            }
          }

          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Drag handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Habit name (displayText or original)
                Text(
                  node.name,
                  style: Theme.of(ctx).textTheme.titleLarge,
                ),
                if (!node.hasTranslation && node.language.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.translate,
                          size: 14, color: Colors.orange),
                      const SizedBox(width: 4),
                      Text(
                        'Original (${node.language})',
                        style: const TextStyle(
                            fontSize: 12, color: Colors.orange),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),

                // Category chip
                Wrap(
                  spacing: 8,
                  children: [
                    if (node.category.isNotEmpty)
                      Chip(
                        label: Text(node.category.isEmpty
                            ? AppLocalizations.of(ctx)!.unknown
                            : node.category),
                        avatar: const Icon(Icons.category, size: 16),
                      ),
                    if (node.bcioClass.isNotEmpty)
                      Chip(
                        label: Text(
                          node.bcioClass.length > 40
                              ? '…${node.bcioClass.substring(node.bcioClass.length - 40)}'
                              : node.bcioClass,
                          style: const TextStyle(fontSize: 11),
                        ),
                        avatar: const Icon(Icons.science, size: 16),
                      ),
                  ],
                ),
                const SizedBox(height: 16),

                // Annotation counts
                Text(AppLocalizations.of(ctx)!.communityAnnotations,
                    style: Theme.of(ctx).textTheme.labelLarge),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.thumb_up_outlined, size: 18),
                    const SizedBox(width: 6),
                    Text(AppLocalizations.of(ctx)!.iDoThisCount('${node.annotationCounts['iDoThis'] ?? 0}')),
                    const SizedBox(width: 24),
                    const Icon(Icons.star_outline, size: 18),
                    const SizedBox(width: 6),
                    Text(AppLocalizations.of(ctx)!.helpfulCount('${node.annotationCounts['helpful'] ?? 0}')),
                  ],
                ),
                const SizedBox(height: 24),

                // Action buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => annotate('iDoThis'),
                        icon: const Icon(Icons.thumb_up),
                        label: Text(AppLocalizations.of(ctx)!.iDoThisToo),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => annotate('helpful'),
                        icon: const Icon(Icons.star),
                        label: Text(AppLocalizations.of(ctx)!.helpful),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final currentLang = ref.watch(localeProvider).languageCode;

    // Refetch when locale changes.
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
            Text(l10n.failedToLoadHabits, style: Theme.of(context).textTheme.titleMedium),
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
          // Graph occupies most of the screen
          Expanded(
            child: HabitGraphWidget(
              nodes: _filteredHabits,
              onNodeTap: _showNodeDetail,
            ),
          ),

          // Category filter chips
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
      color: Theme.of(context).colorScheme.surfaceContainerHighest.withAlpha(80),
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
