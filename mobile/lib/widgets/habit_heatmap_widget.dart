/// GitHub-style calendar heatmap widget for habit enactment history.
library;

// mobile/lib/widgets/habit_heatmap_widget.dart
import 'package:flutter/material.dart';

/// GitHub-style calendar heatmap for daily habit enactment.
///
/// [logs] maps 'YYYY-MM-DD' → true (enacted) / false (explicit miss).
/// Days with no entry are rendered grey (no judgment).
/// [startDate] is the date the intention was created; the grid starts there.
class HabitHeatmapWidget extends StatelessWidget {
  /// Creates a [HabitHeatmapWidget].
  const HabitHeatmapWidget({
    required this.logs,
    required this.startDate,
    super.key,
  });

  /// Daily enactment map: `'YYYY-MM-DD'` → true (enacted) / false (missed).
  final Map<String, bool> logs;

  /// Date the habit intention was created; the grid starts from here.
  final DateTime startDate;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayNorm = DateTime(today.year, today.month, today.day);
    final startNorm =
        DateTime(startDate.year, startDate.month, startDate.day);
    final totalDays = todayNorm.difference(startNorm).inDays + 1;

    // Build list of (dateStr, enacted?) tuples.
    final days = List.generate(totalDays, (i) {
      final d = startNorm.add(Duration(days: i));
      final key =
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      return (key, logs[key]);
    });

    // Group into weeks of 7, left-padding the first week.
    final leadingEmpties = startNorm.weekday % 7; // 0=Sun offset
    final paddedDays = [
      ...List.generate(leadingEmpties, (_) => (null, null)),
      ...days,
    ];

    final weeks = <List<(String?, bool?)>>[];
    for (var i = 0; i < paddedDays.length; i += 7) {
      weeks.add(paddedDays.sublist(
          i, i + 7 > paddedDays.length ? paddedDays.length : i + 7));
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: weeks.map((week) {
          return Column(
            children: week.map((entry) {
              final (dateStr, enacted) = entry;
              if (dateStr == null) {
                return const SizedBox(width: 14, height: 14);
              }
              return Padding(
                padding: const EdgeInsets.all(1),
                child: HeatmapCell(enacted: enacted),
              );
            }).toList(),
          );
        }).toList(),
      ),
    );
  }
}

/// A single cell in the heatmap grid.
class HeatmapCell extends StatelessWidget {
  /// Creates a [HeatmapCell] with the given [enacted] status.
  const HeatmapCell({required this.enacted, super.key});

  /// true = green (enacted), false = red (missed), null = grey (no log).
  final bool? enacted;

  @override
  Widget build(BuildContext context) {
    final Color color;
    if (enacted == true) {
      color = const Color(0xFF45B700);
    } else if (enacted == false) {
      color = const Color(0xFFE53935);
    } else {
      color = const Color(0xFFE5E7EB);
    }
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
