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
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

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

    final intention = intentionsAsync.value
        ?.where((i) => i.id == intentionId)
        .firstOrNull;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.habitDetailTitle),
        actions: [
          if (intention != null && intention.status == 'active')
            PopupMenuButton<String>(
              onSelected: (value) async {
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
                    if (context.mounted) context.pop();
                  }
                }
              },
              itemBuilder: (_) => [
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
                    final nextDue = trajectory
                        .where((p) => p.submittedAt == null && p.scheduledFor != null)
                        .map((p) => p.scheduledFor!)
                        .fold<DateTime?>(
                          null,
                          (earliest, d) =>
                              earliest == null || d.isBefore(earliest)
                                  ? d
                                  : earliest,
                        );
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SrhiExplanationCard(
                          score: latestScore,
                          nextDue: nextDue,
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

/// SRHI score figure, next-check-in date, and a short dismissible
/// explanation of what SRHI is. Shown above the trajectory sparkline.
class _SrhiExplanationCard extends StatefulWidget {
  const _SrhiExplanationCard({required this.score, required this.nextDue});

  /// Latest submitted SRHI score (1–7 scale), or `null` if none yet.
  final double? score;

  /// Date of the next not-yet-submitted check-in, or `null` if none scheduled.
  final DateTime? nextDue;

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
    final nextDueLabel = nextDue == null
        ? l10n.srhiNextCheckInNone
        : (!nextDue.isAfter(todayNorm)
            ? l10n.srhiNextCheckInDue
            : formatDateYmd(nextDue));

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
