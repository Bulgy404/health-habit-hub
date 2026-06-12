/// Screen listing the current user's habit intentions with SRHI prompts.
library;

// mobile/lib/features/my_habits/my_habits_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import '../../widgets/day_strip_widget.dart';
import '../../widgets/srhi_sparkline_widget.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

/// Displays the user's active habit intentions with daily log strips and
/// SRHI sparklines.  Opens SRHI prompts when weekly check-ins are due.
class MyHabitsScreen extends ConsumerWidget {
  /// Creates a [MyHabitsScreen].
  const MyHabitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final configAsync = ref.watch(habitConfigProvider);
    final intentionsAsync = ref.watch(intentionsProvider);
    final dueSrhiAsync = ref.watch(dueSrhiProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myHabitsTab),
        actions: [
          configAsync.when(
            data: (config) {
              final activeCount = intentionsAsync.value
                      ?.where((i) => i.status == 'active')
                      .length ??
                  0;
              final limitReached =
                  config.maxHabits != null && activeCount >= config.maxHabits!;
              if (limitReached) return const SizedBox.shrink();
              return TextButton(
                onPressed: () {
                  context.push('/habits/new/behavior');
                },
                child: Text(l10n.newHabit),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(habitConfigProvider);
          ref.invalidate(intentionsProvider);
          ref.invalidate(dueSrhiProvider);
        },
        child: CustomScrollView(
          slivers: [
            dueSrhiAsync.when(
              data: (windows) {
                if (windows.isEmpty) {
                  return const SliverToBoxAdapter(child: SizedBox.shrink());
                }
                final first = windows.first;
                final srhiItems =
                    configAsync.value?.srhiItems ?? const <SrhiItem>[];
                final matchedIntention = intentionsAsync.value
                    ?.where((i) => i.id == first.intentionId)
                    .firstOrNull;
                final behaviorLabel = matchedIntention?.behaviorLabel ?? '';
                return SliverToBoxAdapter(
                  child: _SrhiPromptCard(
                    windows: windows,
                    srhiItems: srhiItems,
                    behaviorLabel: behaviorLabel,
                  ),
                );
              },
              loading: () =>
                  const SliverToBoxAdapter(child: SizedBox.shrink()),
              error: (_, _) =>
                  const SliverToBoxAdapter(child: SizedBox.shrink()),
            ),
            intentionsAsync.when(
              data: (intentions) {
                final active =
                    intentions.where((i) => i.status == 'active').toList();
                if (active.isEmpty) {
                  return SliverFillRemaining(
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          l10n.noHabitsYet,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurface
                                    .withAlpha(128),
                              ),
                        ),
                      ),
                    ),
                  );
                }
                return SliverList.builder(
                  itemCount: active.length,
                  itemBuilder: (context, i) =>
                      _HabitCard(intention: active[i]),
                );
              },
              loading: () => const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => SliverFillRemaining(
                child: Center(child: Text(e.toString())),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SrhiPromptCard extends StatelessWidget {
  const _SrhiPromptCard({
    required this.windows,
    required this.srhiItems,
    required this.behaviorLabel,
  });
  final List<SrhiWindow> windows;
  final List<SrhiItem> srhiItems;
  final String behaviorLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final first = windows.first;
    return Card(
      margin: const EdgeInsets.all(16),
      color: const Color(0xFFEDF7E5),
      child: ListTile(
        leading: const Icon(Icons.psychology, color: Color(0xFF45B700)),
        title: Text(l10n.srhiCheckInTitle,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(l10n.srhiCheckInSubtitle),
        trailing: FilledButton(
          style: FilledButton.styleFrom(minimumSize: Size.zero),
          onPressed: () => context.push(
            '/habits/${first.intentionId}/srhi/${first.weekNumber}',
            extra: {
              'behaviorLabel': behaviorLabel,
              'srhiItems': srhiItems,
            },
          ),
          child: Text(l10n.srhiStartButton),
        ),
      ),
    );
  }
}

class _HabitCard extends ConsumerWidget {
  const _HabitCard({required this.intention});
  final Intention intention;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final logsAsync = ref.watch(intentionLogsProvider(intention.id));
    final trajectoryAsync = ref.watch(srhiTrajectoryProvider(intention.id));

    final logsMap = logsAsync.when(
      data: (logs) => {for (final l in logs) l.date: l.enacted},
      loading: () => <String, bool>{},
      error: (_, _) => <String, bool>{},
    );

    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final todayLogged = logsMap.containsKey(todayStr);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () {
          context.push('/habits/${intention.id}');
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(intention.behaviorLabel,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 4),
              Text(
                intention.intentionStatement,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withAlpha(153),
                    ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              DayStripWidget(
                logs: logsMap,
                startDate: intention.createdAt,
              ),
              trajectoryAsync.when(
                data: (trajectory) {
                  final submitted = trajectory
                      .where((p) => p.score != null)
                      .toList();
                  if (submitted.length < 2) return const SizedBox.shrink();
                  final latest = submitted.last.score!;
                  final previous = submitted[submitted.length - 2].score!;
                  final delta = latest - previous;
                  final trendIcon = delta > 0.05
                      ? Icons.trending_up
                      : delta < -0.05
                          ? Icons.trending_down
                          : Icons.trending_flat;
                  final trendColor = delta > 0.05
                      ? Colors.green.shade700
                      : delta < -0.05
                          ? Colors.orange.shade800
                          : Colors.grey;
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              l10n.habitStrengthLabel,
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                            const Spacer(),
                            Icon(trendIcon, size: 16, color: trendColor),
                            const SizedBox(width: 4),
                            Text(
                              '${latest.toStringAsFixed(1)} / 7',
                              style: Theme.of(context)
                                  .textTheme
                                  .labelMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: trendColor,
                                  ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        SrhiSparklineWidget(trajectory: trajectory),
                      ],
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: Size.zero,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  ),
                  onPressed: todayLogged
                      ? null
                      : () async {
                          try {
                            await ref.read(myHabitsServiceProvider).logDay(
                                  intentionId: intention.id,
                                  date: todayStr,
                                  enacted: true,
                                );
                            ref.invalidate(intentionLogsProvider(intention.id));
                          } catch (_) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Failed to log — please try again.')),
                              );
                            }
                          }
                        },
                  child: Text(todayLogged ? l10n.loggedToday : l10n.logToday),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
