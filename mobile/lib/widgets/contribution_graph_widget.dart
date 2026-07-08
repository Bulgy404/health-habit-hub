/// GitHub-style contribution/activity calendar graph.
///
/// Renders weeks as columns (Sunday at the top of each column, like GitHub's
/// own contribution graph and the `contributions_chart` package this mirrors:
/// https://pub.dev/packages/contributions_chart), with month labels above and
/// weekday labels on the left. Colour intensity scales with the count for
/// that day; an all-zero grid (e.g. before any habit has been logged) still
/// renders — every cell simply shows as "empty".
///
/// Colours are theme-aware: the empty-cell colour and the green scale both
/// derive from [ColorScheme] so the graph reads correctly in light and dark
/// mode, rather than a fixed light-grey/green pair that only works on a
/// light background.
library;

import 'package:flutter/material.dart';

class ContributionGraphWidget extends StatelessWidget {
  /// Creates a [ContributionGraphWidget].
  const ContributionGraphWidget({
    required this.counts,
    this.weeks = 20,
    this.cellSize = 12,
    this.maxLevel,
    super.key,
  });

  /// Activity count per day, keyed by a date normalised to midnight.
  /// Days absent from the map are treated as zero (empty).
  final Map<DateTime, int> counts;

  /// How many weeks of history to render, ending on the current week.
  final int weeks;

  /// Side length of one day cell, in logical pixels.
  final double cellSize;

  /// The count that maps to the most saturated green. Defaults to the
  /// highest value present in [counts] (minimum 1), so a single-habit graph
  /// (values are always 0 or 1) renders as a clean two-tone grid, while a
  /// multi-habit aggregate graph scales its shades to the busiest day.
  final int? maxLevel;

  static DateTime _atMidnight(DateTime d) => DateTime(d.year, d.month, d.day);

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final today = _atMidnight(DateTime.now());
    // Start on the Sunday on/before (today - weeks*7 + 1 days), so the grid
    // always ends with the current, possibly-partial week.
    final daysBack = weeks * 7 - 1;
    final rangeStart = today.subtract(Duration(days: daysBack));
    final gridStart = rangeStart.subtract(
      Duration(days: rangeStart.weekday % 7),
    );

    final resolvedMax =
        maxLevel ?? counts.values.fold<int>(1, (a, b) => a > b ? a : b);

    final columns = <List<DateTime?>>[];
    var cursor = gridStart;
    while (!cursor.isAfter(today)) {
      final column = <DateTime?>[];
      for (var i = 0; i < 7; i++) {
        column.add(cursor.isAfter(today) ? null : cursor);
        cursor = cursor.add(const Duration(days: 1));
      }
      columns.add(column);
    }

    Color colorFor(DateTime? day) {
      if (day == null) return Colors.transparent;
      final count = counts[_atMidnight(day)] ?? 0;
      if (count <= 0) {
        return colorScheme.surfaceContainerHighest;
      }
      final level = (count / resolvedMax).clamp(0.25, 1.0);
      // Blend from a light tint of the brand green up to a saturated one, so
      // "some activity" and "a lot of activity" stay visually distinct.
      return Color.lerp(
        const Color(0xFFB7E6A0),
        const Color(0xFF2E8C00),
        level,
      )!;
    }

    String? monthLabelFor(int columnIndex) {
      final firstDayOfColumn = columns[columnIndex].firstWhere(
        (d) => d != null,
        orElse: () => null,
      );
      if (firstDayOfColumn == null || firstDayOfColumn.day > 7) return null;
      // Only label the first column of each month.
      if (columnIndex > 0) {
        final prevColumn = columns[columnIndex - 1].firstWhere(
          (d) => d != null,
          orElse: () => null,
        );
        if (prevColumn != null && prevColumn.month == firstDayOfColumn.month) {
          return null;
        }
      }
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return monthNames[firstDayOfColumn.month - 1];
    }

    final labelStyle = TextStyle(
      fontSize: 10,
      color: colorScheme.onSurfaceVariant,
    );

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Weekday labels (Mon/Wed/Fri, GitHub-style sparse labelling).
            Padding(
              padding: EdgeInsets.only(top: cellSize + 6),
              child: Column(
                children: List.generate(7, (i) {
                  final label = i == 1 ? 'Mon' : i == 3 ? 'Wed' : i == 5 ? 'Fri' : '';
                  return SizedBox(
                    height: cellSize + 2,
                    child: Text(label, style: labelStyle),
                  );
                }),
              ),
            ),
            const SizedBox(width: 4),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: List.generate(columns.length, (i) {
                    final label = monthLabelFor(i);
                    return SizedBox(
                      width: cellSize + 2,
                      child: label == null
                          ? null
                          : Text(label, style: labelStyle),
                    );
                  }),
                ),
                const SizedBox(height: 2),
                Row(
                  children: columns.map((column) {
                    return Column(
                      children: column.map((day) {
                        return Padding(
                          padding: const EdgeInsets.all(1),
                          child: Tooltip(
                            message: day == null
                                ? ''
                                : '${day.year}-${day.month.toString().padLeft(2, '0')}-'
                                    '${day.day.toString().padLeft(2, '0')}: '
                                    '${counts[_atMidnight(day)] ?? 0}',
                            child: Container(
                              width: cellSize,
                              height: cellSize,
                              decoration: BoxDecoration(
                                color: colorFor(day),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  }).toList(),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
