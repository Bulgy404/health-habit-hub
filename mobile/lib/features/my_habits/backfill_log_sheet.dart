/// Bottom sheet for retrospectively logging (or un-logging) a habit on one
/// of the last [kBackfillWindowDays] days — for participants who forgot to
/// check a habit off on the day itself. The backend already accepts any
/// date for a log (no "today only" constraint), so this is purely a mobile
/// UI affordance on top of the existing `logDay`/`deleteLog` calls.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../core/exceptions.dart';
import '../../l10n/app_localizations.dart';
import '../../utils/date_format.dart';
import 'my_habits_service.dart';

/// Number of past days (including today) offered for backfill logging.
const int kBackfillWindowDays = 7;

/// Opens the backfill sheet for [intentionId]. [logsMap] is the caller's
/// already-fetched log data (from `intentionLogsProvider`) keyed by
/// `YYYY-MM-DD` — reused here so opening the sheet needs no extra network
/// round trip. [onChanged] is called with the toggled day (`YYYY-MM-DD`) and
/// whether it was just logged (vs. un-logged) after every successful toggle,
/// so the caller can invalidate its own providers (log list, activity graph,
/// gamification) the same way the on-card checkbox already does — and, when
/// the toggled day is today, resync today's local habit-reminder
/// notification the same way too (#12: this sheet's window includes today,
/// so it's a second place a habit's same-day completion status can change,
/// not just the on-card checkbox).
Future<void> showBackfillLogSheet({
  required BuildContext context,
  required MyHabitsService service,
  required String intentionId,
  required Map<String, bool> logsMap,
  required Color typeColor,
  required void Function(String date, bool justLogged) onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    // Without this, the sheet is capped at a fixed fraction of the screen
    // height and its content can't scroll to fit — 7 day rows plus the
    // title/subtitle overflowed past that cap (worse still at larger
    // accessibility text sizes). isScrollControlled lets the sheet size to
    // its content up to the full screen, with the SingleChildScrollView
    // below as the safety net for whatever's still too tall to fit.
    isScrollControlled: true,
    builder: (_) => _BackfillLogSheet(
      service: service,
      intentionId: intentionId,
      logsMap: logsMap,
      typeColor: typeColor,
      onChanged: onChanged,
    ),
  );
}

class _BackfillLogSheet extends StatefulWidget {
  const _BackfillLogSheet({
    required this.service,
    required this.intentionId,
    required this.logsMap,
    required this.typeColor,
    required this.onChanged,
  });

  final MyHabitsService service;
  final String intentionId;
  final Map<String, bool> logsMap;
  final Color typeColor;
  final void Function(String date, bool justLogged) onChanged;

  @override
  State<_BackfillLogSheet> createState() => _BackfillLogSheetState();
}

class _BackfillLogSheetState extends State<_BackfillLogSheet> {
  // A local optimistic copy so toggling one row updates instantly without
  // waiting on the caller's provider to refetch; onChanged() still tells the
  // caller to refresh its own state once each toggle succeeds.
  late Map<String, bool> _logged;
  String? _pendingDate;

  @override
  void initState() {
    super.initState();
    _logged = Map.of(widget.logsMap);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).toString();
    final today = DateTime.now();
    // Stepping in UTC, not local time, avoids the DST bug documented in
    // ContributionGraphWidget: a local "+1 day" step can overshoot past
    // midnight on a DST transition and silently skip a calendar day.
    final todayUtc = DateTime.utc(today.year, today.month, today.day);
    final days = List.generate(
      kBackfillWindowDays,
      (i) => todayUtc.subtract(Duration(days: i)),
    );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
            Text(
              l10n.backfillSheetTitle,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              l10n.backfillSheetSubtitle,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurface.withAlpha(153),
              ),
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < days.length; i++)
              _DayRow(
                label: switch (i) {
                  0 => l10n.today,
                  1 => l10n.yesterday,
                  _ => DateFormat.MMMEd(locale).format(days[i]),
                },
                checked: _logged[formatDateYmd(days[i])] ?? false,
                pending: _pendingDate == formatDateYmd(days[i]),
                color: widget.typeColor,
                onTap: () => _toggle(days[i]),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _toggle(DateTime day) async {
    final dateStr = formatDateYmd(day);
    final wasLogged = _logged[dateStr] ?? false;
    final messenger = ScaffoldMessenger.of(context);
    final l10n = AppLocalizations.of(context)!;
    setState(() => _pendingDate = dateStr);
    try {
      if (wasLogged) {
        await widget.service.deleteLog(
          intentionId: widget.intentionId,
          date: dateStr,
        );
      } else {
        await widget.service.logDay(
          intentionId: widget.intentionId,
          date: dateStr,
          enacted: true,
        );
      }
      if (!mounted) return;
      setState(() {
        _logged[dateStr] = !wasLogged;
        _pendingDate = null;
      });
      unawaited(HapticFeedback.lightImpact());
      widget.onChanged(dateStr, !wasLogged);
    } catch (e) {
      if (!mounted) return;
      setState(() => _pendingDate = null);
      if (e is UnauthorisedException) return;
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.couldNotLogDay(e.toString()))),
      );
    }
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.label,
    required this.checked,
    required this.pending,
    required this.color,
    required this.onTap,
  });

  final String label;
  final bool checked;
  final bool pending;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: pending ? null : onTap,
      leading: pending
          ? const Padding(
              padding: EdgeInsets.all(2),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          : Icon(
              checked ? Icons.check_circle : Icons.radio_button_unchecked,
              color: checked ? color : Theme.of(context).colorScheme.outline,
            ),
      title: Text(label),
    );
  }
}
