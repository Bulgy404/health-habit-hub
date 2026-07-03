import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/habit_stats.dart';
import '../providers/show_in_graph_provider.dart';

/// Displays the current user's habit statistics and per-dimension breakdown.
class StatsScreen extends ConsumerWidget {
  /// Creates a [StatsScreen].
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(myStatsProvider);

    return statsAsync.when(
      loading: () => const _StatsSkeleton(),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 12),
            Text('Failed to load your habits',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(myStatsProvider),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (stats) => _StatsContent(stats: stats),
    );
  }
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

class _StatsContent extends ConsumerWidget {
  final MyStats stats;
  const _StatsContent({required this.stats});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tt = Theme.of(context).textTheme;

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myStatsProvider),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _TotalCard(total: stats.total),
          if (stats.byDimension.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text('Habits by Context',
                style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            SizedBox(
              height: 220,
              child: _DimensionBarChart(data: stats.byDimension),
            ),
          ],
          if (stats.habits.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text('My Donated Habits',
                style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            for (final habit in stats.habits)
              _HabitCard(
                habit: habit,
                onShowInGraph: () {
                  // ExploreScreen owns the TabController and listens to this
                  // provider — it switches to the Graph tab and opens the
                  // habit. (The Stats tab has no DefaultTabController ancestor,
                  // so it must not drive the tabs itself.)
                  ref.read(showInGraphProvider.notifier).select(
                        HabitGraphSelection(
                          habitId: habit.id,
                          dimensionId: habit.dimensions.isNotEmpty
                              ? habit.dimensions.first
                              : '',
                        ),
                      );
                },
              ),
          ] else ...[
            const SizedBox(height: 48),
            Center(
              child: Text(
                'No habits donated yet.\nShare your first habit!',
                textAlign: TextAlign.center,
                style: tt.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.outline),
              ),
            ),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Total count card
// ---------------------------------------------------------------------------

class _TotalCard extends StatelessWidget {
  final int total;
  const _TotalCard({required this.total});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
        child: Row(
          children: [
            Icon(Icons.volunteer_activism,
                size: 40,
                color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$total',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                ),
                Text('habits donated',
                    style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Bar chart: user's habits by context dimension
// ---------------------------------------------------------------------------

class _DimensionBarChart extends StatelessWidget {
  final List<DimensionStat> data;
  const _DimensionBarChart({required this.data});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final maxCount =
        data.map((d) => d.count).fold(0, (a, b) => math.max(a, b));

    final groups = data.asMap().entries.map((e) {
      return BarChartGroupData(
        x: e.key,
        barRods: [
          BarChartRodData(
            toY: e.value.count.toDouble(),
            color: colorScheme.primary,
            width: 20,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    }).toList();

    return BarChart(
      BarChartData(
        barGroups: groups,
        maxY: maxCount > 0 ? maxCount * 1.3 : 5,
        gridData: const FlGridData(show: true, drawVerticalLine: false),
        borderData: FlBorderData(show: false),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => colorScheme.inverseSurface,
            getTooltipItem: (group, _, rod, _) => BarTooltipItem(
              '${data[group.x].label}\n${rod.toY.toInt()}',
              TextStyle(color: colorScheme.onInverseSurface, fontSize: 12),
            ),
          ),
        ),
        titlesData: FlTitlesData(
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 32,
              getTitlesWidget: (value, _) => Text(
                value.toInt().toString(),
                style: const TextStyle(fontSize: 11),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 72,
              getTitlesWidget: (value, _) {
                final idx = value.toInt();
                if (idx < 0 || idx >= data.length) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: RotatedBox(
                    quarterTurns: 1,
                    child: Text(data[idx].label,
                        style: const TextStyle(fontSize: 10)),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Individual habit card
// ---------------------------------------------------------------------------

class _HabitCard extends StatelessWidget {
  final MyHabit habit;
  final VoidCallback onShowInGraph;

  const _HabitCard({required this.habit, required this.onShowInGraph});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(habit.label,
                style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            if (habit.dimensions.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                children: habit.dimensions
                    .where((d) => d != 'BEHAVIOR')
                    .map((d) => _DimChip(dimension: d))
                    .toList(),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.thumb_up_outlined, size: 14, color: cs.primary),
                const SizedBox(width: 4),
                Text('${habit.annotationCounts['iDoThis'] ?? 0}',
                    style: tt.labelSmall),
                const SizedBox(width: 12),
                Icon(Icons.star_outline, size: 14, color: cs.tertiary),
                const SizedBox(width: 4),
                Text('${habit.annotationCounts['helpful'] ?? 0}',
                    style: tt.labelSmall),
                const Spacer(),
                if (habit.dimensions.isNotEmpty)
                  TextButton.icon(
                    onPressed: onShowInGraph,
                    icon: const Icon(Icons.hub_outlined, size: 14),
                    label: const Text('Show in Graph',
                        style: TextStyle(fontSize: 12)),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      minimumSize: Size.zero,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DimChip extends StatelessWidget {
  final String dimension;
  const _DimChip({required this.dimension});

  static const _labels = {
    'TIME': 'Time',
    'PHYSICAL_SETTING': 'Location',
    'PRIOR_BEHAVIOR': 'Prior Behavior',
    'OTHER_PEOPLE': 'Social',
    'INTERNAL_STATE': 'Mental State',
    'REASONING': 'Reasoning',
  };

  @override
  Widget build(BuildContext context) {
    final label = _labels[dimension] ??
        dimension.toLowerCase().replaceAll('_', ' ');
    return Chip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      padding: EdgeInsets.zero,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );
  }
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

class _StatsSkeleton extends StatelessWidget {
  const _StatsSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SkeletonBox(width: double.infinity, height: 88),
        const SizedBox(height: 24),
        _SkeletonBox(width: 160, height: 20),
        const SizedBox(height: 12),
        _SkeletonBox(width: double.infinity, height: 220),
        const SizedBox(height: 24),
        _SkeletonBox(width: 180, height: 20),
        const SizedBox(height: 12),
        _SkeletonBox(width: double.infinity, height: 90),
        const SizedBox(height: 10),
        _SkeletonBox(width: double.infinity, height: 90),
      ],
    );
  }
}

class _SkeletonBox extends StatelessWidget {
  final double width;
  final double height;
  const _SkeletonBox({required this.width, required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context)
            .colorScheme
            .surfaceContainerHighest
            .withAlpha(120),
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}
