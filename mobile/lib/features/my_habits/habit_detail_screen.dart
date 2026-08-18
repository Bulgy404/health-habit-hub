/// Detail view for a single habit intention.
library;

// mobile/lib/features/my_habits/habit_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/exceptions.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/app_colors.dart';
import '../../utils/date_format.dart';
import '../../widgets/automaticity_chart_widget.dart';
import '../../widgets/contribution_graph_widget.dart';
import '../../widgets/srhi_chart_widget.dart';
import 'backfill_log_sheet.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';
import 'weekly_progress_chip.dart';

/// A dead session previously showed as a raw `UnauthorisedException: Session
/// expired` string here — technically correct but unreadable, and easy to
/// mistake for the section still loading. [ShellScreen] already prompts to
/// sign back in (see [sessionExpiredProvider]); this just makes the inline
/// error legible instead of cryptic.
String _errorText(AppLocalizations l10n, Object error) =>
    error is UnauthorisedException
        ? l10n.sessionExpiredMessage
        : error.toString();

/// Shows log history, SRHI trajectory chart, and actions for a habit intention.
class HabitDetailScreen extends ConsumerWidget {
  /// Creates a [HabitDetailScreen] for [intentionId].
  const HabitDetailScreen({required this.intentionId, super.key});

  /// The habit intention identifier to display.
  final String intentionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final intentionsAsync = ref.watch(intentionsProvider);
    final logsAsync = ref.watch(intentionLogsProvider(intentionId));
    final trajectoryAsync = ref.watch(srhiTrajectoryProvider(intentionId));
    final configAsync = ref.watch(habitConfigProvider);

    final intention = intentionsAsync.value
        ?.where((i) => i.id == intentionId)
        .firstOrNull;
    // §7.1 — when the anchor is itself a tracked habit, resolve it from the
    // same list so we can show (and link to) the real habit, not just its
    // name. Null for a free-typed anchor the app doesn't track.
    final anchorIntention = intention?.stackedOn != null
        ? intentionsAsync.value
            ?.where((i) => i.id == intention!.stackedOn)
            .firstOrNull
        : null;
    // § weekly-frequency habits — same client-derived "X / Y this week"
    // logic as the habit card (my_habits_screen.dart); reused here from the
    // already-watched logsAsync rather than a second fetch.
    final logsMap = {
      for (final l in logsAsync.value ?? const <DailyLog>[]) l.date: l.enacted,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.habitDetailTitle),
        actions: [
          if (intention != null && intention.status == 'active')
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'backfill') {
                  showBackfillLogSheet(
                    context: context,
                    service: ref.read(myHabitsServiceProvider),
                    intentionId: intentionId,
                    logsMap: logsMap,
                    typeColor: Theme.of(context).colorScheme.primary,
                    onChanged: () {
                      ref.invalidate(intentionLogsProvider);
                      ref.invalidate(allHabitsActivityProvider);
                      ref.invalidate(gamificationProvider);
                    },
                  );
                  return;
                }
                if (value == 'abandon') {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (dialogContext) => AlertDialog(
                      title: Text(l10n.abandonHabit),
                      content: Text(l10n.abandonConfirm),
                      actions: [
                        TextButton(
                          onPressed: () =>
                              Navigator.pop(dialogContext, false),
                          child: Text(l10n.cancel),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(dialogContext, true),
                          child: Text(l10n.confirm),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await ref
                        .read(myHabitsServiceProvider)
                        .updateStatus(intentionId, 'abandoned');
                    ref.invalidate(intentionsProvider);
                    // An abandoned habit's already-generated SRHI windows
                    // stop being "due" server-side, but this list is its own
                    // cached provider — without invalidating it too, the
                    // My Habits screen keeps showing the stale weekly
                    // check-in for this habit until something else happens
                    // to invalidate it (e.g. backgrounding the app).
                    ref.invalidate(dueSrhiProvider);
                    if (context.mounted) context.pop();
                  }
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'backfill',
                  child: Text(l10n.logForAnotherDay),
                ),
                PopupMenuItem(
                  value: 'abandon',
                  child: Text(l10n.abandonHabit),
                ),
              ],
            ),
        ],
      ),
      body: intentionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
        data: (_) {
          if (intention == null) {
            return Center(child: Text(l10n.habitDetailTitle));
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(intentionLogsProvider(intentionId));
              ref.invalidate(srhiTrajectoryProvider(intentionId));
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // ── Intention summary ────────────────────────────────────
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(intention.behaviorLabel,
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text(intention.intentionStatement,
                            style: Theme.of(context).textTheme.bodyMedium),
                        if (intention.cadence.isWeekly) ...[
                          const SizedBox(height: 8),
                          WeeklyProgressChip(
                            logsMap: logsMap,
                            targetPerWeek: intention.cadence.targetPerWeek!,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ],
                        // §7.1 — the stacking anchor is its own field, kept
                        // visible after creation too, not just at setup. When
                        // the anchor is itself a tracked habit, show it as a
                        // tappable link to its own detail page rather than
                        // just naming it.
                        if (intention.isStacked &&
                            (intention.anchorLabel?.isNotEmpty ?? false)) ...[
                          const SizedBox(height: 12),
                          if (anchorIntention != null)
                            _AnchorHabitTile(anchor: anchorIntention)
                          else
                            Chip(
                              avatar: const Icon(Icons.link, size: 18),
                              label: Text(
                                l10n.stackedOntoLabel(intention.anchorLabel!),
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
                ),
                // ── Activity log (GitHub-style contribution graph) ────────
                const SizedBox(height: 16),
                Text(l10n.heatmapTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                logsAsync.when(
                  data: (logs) {
                    if (logs.isEmpty) {
                      return Text(l10n.noLogsYet,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.grey));
                    }
                    final counts = <DateTime, int>{
                      for (final l in logs)
                        if (l.enacted) _parseDateKey(l.date): 1,
                    };
                    return ContributionGraphWidget(counts: counts);
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text(_errorText(l10n, e)),
                ),
                // ── Habit strength (SRHI) ─────────────────────────────────
                const SizedBox(height: 24),
                Text(l10n.trajectoryTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                trajectoryAsync.when(
                  data: (trajectory) {
                    final submitted =
                        trajectory.where((p) => p.score != null).toList();
                    final latestScore =
                        submitted.isEmpty ? null : submitted.last.score;
                    final duePoints = trajectory
                        .where((p) => p.submittedAt == null && p.scheduledFor != null)
                        .toList();
                    final nextDuePoint = duePoints.isEmpty
                        ? null
                        : duePoints.reduce(
                            (earliest, p) => p.scheduledFor!
                                    .isBefore(earliest.scheduledFor!)
                                ? p
                                : earliest,
                          );
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SrhiExplanationCard(
                          score: latestScore,
                          nextDue: nextDuePoint?.scheduledFor,
                          weekNumber: nextDuePoint?.weekNumber,
                          intentionId: intentionId,
                          behaviorLabel: intention.behaviorLabel,
                          srhiItems: configAsync.value?.srhiItems ?? const [],
                        ),
                        const SizedBox(height: 12),
                        if (submitted.isEmpty)
                          Text(l10n.noTrajectoryYet,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: Colors.grey))
                        else
                          SrhiChartWidget(
                            trajectory: trajectory,
                            height: 220,
                          ),
                      ],
                    );
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text(_errorText(l10n, e)),
                ),
                // ── Automaticity ───────────────────────────────────────────
                const SizedBox(height: 24),
                Text(l10n.automaticityTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(l10n.automaticityExplanationBody,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey)),
                const SizedBox(height: 8),
                trajectoryAsync.when(
                  data: (trajectory) {
                    final hasAutomaticity =
                        trajectory.any((p) => p.autonomyScore != null);
                    if (!hasAutomaticity) {
                      return Text(l10n.noAutomaticityYet,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.grey));
                    }
                    return AutomaticityChartWidget(
                      trajectory: trajectory,
                      height: 220,
                    );
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text(_errorText(l10n, e)),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// §7.1 Habit Stacking — tappable row linking to the tracked anchor habit's
/// own detail page, shown in place of the plain text chip when the anchor
/// (unlike a free-typed one) is itself one of the user's habits.
class _AnchorHabitTile extends StatelessWidget {
  const _AnchorHabitTile({required this.anchor});

  /// The anchor habit this one is stacked onto.
  final Intention anchor;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/habits/${anchor.id}'),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(Icons.link, size: 18, color: cs.onSurfaceVariant),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.stackedOntoLabel(anchor.behaviorLabel),
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// Parses a `'YYYY-MM-DD'` log date string into a midnight-normalised
/// [DateTime], matching [ContributionGraphWidget]'s key format.
DateTime _parseDateKey(String date) {
  final parts = date.split('-');
  return DateTime(
    int.parse(parts[0]),
    int.parse(parts[1]),
    int.parse(parts[2]),
  );
}

/// SRHI score figure, next-check-in date, a "start check-in" action when one
/// is due, and a short dismissible explanation of what SRHI is. Shown above
/// the trajectory sparkline.
class _SrhiExplanationCard extends StatefulWidget {
  const _SrhiExplanationCard({
    required this.score,
    required this.nextDue,
    required this.weekNumber,
    required this.intentionId,
    required this.behaviorLabel,
    required this.srhiItems,
  });

  /// Latest submitted SRHI score (1–7 scale), or `null` if none yet.
  final double? score;

  /// Date of the next not-yet-submitted check-in, or `null` if none scheduled.
  final DateTime? nextDue;

  /// Study week number of [nextDue]'s window — needed to route into the SRHI
  /// form, since it's keyed by (intentionId, weekNumber). `null` alongside a
  /// `null` [nextDue].
  final int? weekNumber;

  /// This habit's intention id, so the "start check-in" action (mirroring
  /// the list screen's [_SrhiPromptCard]) can route straight into the form
  /// without the user having to go back and find it from the habit list.
  final String intentionId;

  final String behaviorLabel;
  final List<SrhiItem> srhiItems;

  @override
  State<_SrhiExplanationCard> createState() => _SrhiExplanationCardState();
}

class _SrhiExplanationCardState extends State<_SrhiExplanationCard> {
  bool _explanationDismissed = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final colorScheme = Theme.of(context).colorScheme;
    final today = DateTime.now();
    final todayNorm = DateTime(today.year, today.month, today.day);
    final nextDue = widget.nextDue;
    final isDue = nextDue != null && !nextDue.isAfter(todayNorm);
    final nextDueLabel = nextDue == null
        ? l10n.srhiNextCheckInNone
        : (isDue ? l10n.srhiNextCheckInDue : formatDateYmd(nextDue));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _SrhiStat(
                    label: l10n.srhiScoreLabel,
                    value: widget.score == null
                        ? l10n.srhiScoreUnavailable
                        : widget.score!.toStringAsFixed(1),
                    valueColor: context.appColors.primary,
                  ),
                ),
                Expanded(
                  child: _SrhiStat(
                    label: l10n.srhiNextCheckInLabel,
                    value: nextDueLabel,
                    valueColor: colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            if (isDue && widget.weekNumber != null) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    textStyle: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  icon: const Icon(Icons.psychology, size: 22),
                  onPressed: () => context.push(
                    '/habits/${widget.intentionId}/srhi/${widget.weekNumber}',
                    extra: {
                      'behaviorLabel': widget.behaviorLabel,
                      'srhiItems': widget.srhiItems,
                    },
                  ),
                  label: Text(l10n.srhiStartButton),
                ),
              ),
            ],
            if (!_explanationDismissed) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.srhiExplanationTitle,
                            style: Theme.of(context)
                                .textTheme
                                .labelLarge
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            l10n.srhiExplanationBody,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      visualDensity: VisualDensity.compact,
                      tooltip: MaterialLocalizations.of(context)
                          .closeButtonTooltip,
                      onPressed: () =>
                          setState(() => _explanationDismissed = true),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SrhiStat extends StatelessWidget {
  const _SrhiStat({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w800, color: valueColor),
        ),
      ],
    );
  }
}
