/// Day strip widget showing the last 7 days of habit enactment.
library;

// mobile/lib/widgets/day_strip_widget.dart
import 'package:flutter/material.dart';

/// A row of up to 7 day circles showing enacted/missed/pending status.
///
/// [logs] maps 'YYYY-MM-DD' → true (enacted) / false (explicit miss).
/// [startDate] clamps the strip to only show days since the habit was created.
/// If null, always shows 7 days ending today.
class DayStripWidget extends StatelessWidget {
  /// Creates a [DayStripWidget].
  const DayStripWidget({
    required this.logs,
    required this.startDate,
    super.key,
  });

  /// Daily enactment map: `'YYYY-MM-DD'` → true (enacted) / false (missed).
  final Map<String, bool> logs;

  /// Date the habit intention started; `null` shows the last 7 days from today.
  final DateTime? startDate;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayNorm = DateTime(today.year, today.month, today.day);

    // Determine first day to show (at most 6 days before today).
    final earliest = startDate != null
        ? DateTime(startDate!.year, startDate!.month, startDate!.day)
        : todayNorm.subtract(const Duration(days: 6));
    final firstDay =
        earliest.isAfter(todayNorm.subtract(const Duration(days: 6)))
            ? earliest
            : todayNorm.subtract(const Duration(days: 6));

    final dayCount = todayNorm.difference(firstDay).inDays + 1;

    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      children: List.generate(dayCount, (i) {
        final day = firstDay.add(Duration(days: i));
        final key =
            '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
        final enacted = logs[key];
        return Padding(
          padding: const EdgeInsets.only(right: 4),
          child: DayCell(enacted: enacted),
        );
      }),
    );
  }
}

/// A single circle cell in the day strip.
class DayCell extends StatelessWidget {
  /// Creates a [DayCell] with the given [enacted] status.
  const DayCell({required this.enacted, super.key});

  /// true = enacted (green), false = missed (red), null = pending (grey).
  final bool? enacted;

  @override
  Widget build(BuildContext context) {
    final Color color;
    final Widget child;
    if (enacted == true) {
      color = const Color(0xFF45B700);
      child = const Icon(Icons.check, size: 12, color: Colors.white);
    } else if (enacted == false) {
      color = const Color(0xFFE53935);
      child = const Icon(Icons.close, size: 12, color: Colors.white);
    } else {
      color = const Color(0xFFE5E7EB);
      child = const SizedBox.shrink();
    }
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Center(child: child),
    );
  }
}
