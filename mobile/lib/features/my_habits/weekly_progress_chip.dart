/// Shared "X / Y this week" progress pill for a weekly-cadence habit (§
/// weekly-frequency habits), used on both the My Habits card
/// (`my_habits_screen.dart`) and the habit detail screen
/// (`habit_detail_screen.dart`).
library;

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../utils/date_format.dart';

/// Count of enacted logs falling in the current Monday-Sunday week, per
/// [logsMap] (already fully fetched by the caller, no extra network call).
/// Stepped in UTC, not local time, for the same DST-safety reason
/// documented in `ContributionGraphWidget`/`backfill_log_sheet.dart`.
int enactedCountThisWeek(Map<String, bool> logsMap, DateTime now) {
  final todayUtc = DateTime.utc(now.year, now.month, now.day);
  final mondayUtc = todayUtc.subtract(
    Duration(days: (todayUtc.weekday - DateTime.monday) % 7),
  );
  var count = 0;
  for (
    var d = mondayUtc;
    !d.isAfter(todayUtc);
    d = d.add(const Duration(days: 1))
  ) {
    if (logsMap[formatDateYmd(d)] ?? false) count += 1;
  }
  return count;
}

/// "X / Y this week" progress pill for a weekly-cadence habit — shown
/// alongside (not instead of) the daily "log today" checkbox/contribution
/// graph, since individual days are still logged the same way regardless of
/// cadence; this is purely how the total is interpreted.
class WeeklyProgressChip extends StatelessWidget {
  /// Creates a [WeeklyProgressChip].
  const WeeklyProgressChip({
    required this.logsMap,
    required this.targetPerWeek,
    required this.color,
    super.key,
  });

  /// Log-date-string → enacted map, already fetched by the caller.
  final Map<String, bool> logsMap;

  /// The habit's weekly target count.
  final int targetPerWeek;

  /// Accent color when the target is met (typically the habit's build/quit
  /// type color).
  final Color color;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final done = enactedCountThisWeek(logsMap, DateTime.now());
    final metTarget = done >= targetPerWeek;
    final tone = metTarget ? color : Theme.of(context).colorScheme.outline;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: tone.withAlpha(30),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        l10n.weeklyProgressLabel(done, targetPerWeek),
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: tone, fontWeight: FontWeight.w700),
      ),
    );
  }
}
