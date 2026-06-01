// mobile/lib/features/my_habits/habit_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/habit_heatmap_widget.dart';
import '../../widgets/srhi_sparkline_widget.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

class HabitDetailScreen extends ConsumerWidget {
  const HabitDetailScreen({required this.intentionId, super.key});

  final String intentionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final intentionsAsync = ref.watch(intentionsProvider);
    final logsAsync = ref.watch(intentionLogsProvider(intentionId));
    final trajectoryAsync = ref.watch(srhiTrajectoryProvider(intentionId));

    final intention = intentionsAsync.value?.firstWhere(
      (i) => i.id == intentionId,
      orElse: () => throw StateError('not found'),
    );

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
                    builder: (_) => AlertDialog(
                      title: Text(l10n.abandonHabit),
                      content: Text(l10n.abandonConfirm),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: Text(l10n.cancel),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
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
                    final logsMap = {for (final l in logs) l.date: l.enacted};
                    return HabitHeatmapWidget(
                      logs: logsMap,
                      startDate: intention.createdAt,
                    );
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text(e.toString()),
                ),
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
                    if (submitted.isEmpty) {
                      return Text(l10n.noTrajectoryYet,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.grey));
                    }
                    return SrhiSparklineWidget(
                      trajectory: trajectory,
                      height: 120,
                    );
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text(e.toString()),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
