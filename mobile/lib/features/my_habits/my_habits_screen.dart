/// Screen listing the current user's habit intentions with SRHI prompts.
library;

// mobile/lib/features/my_habits/my_habits_screen.dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/exceptions.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/app_colors.dart';
import '../../utils/date_format.dart';
import '../../widgets/contribution_graph_widget.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/srhi_sparkline_widget.dart';
import 'habit_onboarding_prefs.dart';
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
    final activityAsync = ref.watch(allHabitsActivityProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myHabitsTab),
        actions: [
          configAsync.when(
            data: (config) {
              // Study/group may disable self-service habit creation entirely.
              if (!config.selfHabitCreationEnabled) {
                return const SizedBox.shrink();
              }
              final activeCount =
                  intentionsAsync.value
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
          ref.invalidate(allHabitsActivityProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: ContributionGraphWidget(
                  counts: activityAsync.value ?? const {},
                ),
              ),
            ),
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
              loading: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
              error: (_, _) =>
                  const SliverToBoxAdapter(child: SizedBox.shrink()),
            ),
            // Only relevant once there's an actual dot to explain — a user
            // with no habits yet has nothing on screen for this hint to
            // point at.
            if (intentionsAsync.value?.any((i) => i.status == 'active') ??
                false)
              const SliverToBoxAdapter(child: _DotLegendCard()),
            intentionsAsync.when(
              data: (intentions) {
                final active = intentions
                    .where((i) => i.status == 'active')
                    .toList();
                if (active.isEmpty) {
                  final canCreate =
                      configAsync.value?.selfHabitCreationEnabled ?? false;
                  return SliverFillRemaining(
                    child: EmptyState(
                      icon: Icons.checklist_rtl,
                      message: l10n.noHabitsYet,
                      ctaLabel: canCreate ? l10n.newHabit : null,
                      onCta: canCreate
                          ? () => context.push('/habits/new/behavior')
                          : null,
                    ),
                  );
                }
                // §7.1 Habit Stacking — order stacked habits directly beneath
                // their anchor and indent them so the "staircase" is visible.
                final ordered = _orderWithStacks(active);
                return SliverList.builder(
                  itemCount: ordered.length,
                  itemBuilder: (context, i) => _HabitCard(
                    intention: ordered[i].intention,
                    isStackedChild: ordered[i].isStackedChild,
                  ),
                );
              },
              loading: () => const SliverFillRemaining(
                hasScrollBody: false,
                child: Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: HabitListSkeleton(),
                ),
              ),
              error: (e, _) =>
                  SliverFillRemaining(child: Center(child: Text(e.toString()))),
            ),
            // Automaticity-graduation flow — habits that became self-sustained
            // (an SRHI check confirmed strong habit strength after a silent
            // week) are greyed out here rather than removed, with a way back.
            intentionsAsync.when(
              data: (intentions) {
                final graduated = intentions
                    .where((i) => i.isGraduated)
                    .toList();
                if (graduated.isEmpty) {
                  return const SliverToBoxAdapter(child: SizedBox.shrink());
                }
                return SliverMainAxisGroup(
                  slivers: [
                    const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(16, 20, 16, 4),
                        child: Text(
                          'Graduated habits',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                    SliverList.builder(
                      itemCount: graduated.length,
                      itemBuilder: (context, i) =>
                          _GraduatedHabitCard(intention: graduated[i]),
                    ),
                  ],
                );
              },
              loading: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
              error: (_, _) => const SliverToBoxAdapter(child: SizedBox.shrink()),
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
    final colorScheme = Theme.of(context).colorScheme;
    final colors = context.appColors;
    final first = windows.first;
    return Card(
      margin: const EdgeInsets.all(16),
      color: colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: colors.primary, width: 1),
      ),
      child: ListTile(
        leading: Icon(Icons.psychology, color: colors.primary),
        title: Text(
          l10n.srhiCheckInTitle,
          style: TextStyle(color: colors.primaryDark, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          l10n.srhiCheckInSubtitle,
          style: TextStyle(color: colorScheme.onSurfaceVariant),
        ),
        trailing: FilledButton(
          style: FilledButton.styleFrom(minimumSize: Size.zero),
          onPressed: () => context.push(
            '/habits/${first.intentionId}/srhi/${first.weekNumber}',
            extra: {'behaviorLabel': behaviorLabel, 'srhiItems': srhiItems},
          ),
          child: Text(l10n.srhiStartButton),
        ),
      ),
    );
  }
}

/// One row in the ordered habit list: the intention plus whether it should be
/// rendered indented as a stacked child of the row above it (§7.1).
class _OrderedHabit {
  const _OrderedHabit(this.intention, {required this.isStackedChild});
  final Intention intention;
  final bool isStackedChild;
}

/// Orders [active] so each stacked habit (`stackedOn` set) appears immediately
/// beneath its anchor and is flagged for indentation. Stacked habits whose
/// anchor is not in the list (e.g. a free-typed or completed anchor) fall back
/// to their natural position, un-indented. Preserves the incoming order for
/// anchors/standalone habits.
List<_OrderedHabit> _orderWithStacks(List<Intention> active) {
  final byId = {for (final i in active) i.id: i};
  final childrenByAnchor = <String, List<Intention>>{};
  for (final i in active) {
    final anchor = i.stackedOn;
    if (anchor != null && byId.containsKey(anchor)) {
      childrenByAnchor.putIfAbsent(anchor, () => []).add(i);
    }
  }
  final result = <_OrderedHabit>[];
  for (final i in active) {
    // Skip stacked children here — they are emitted under their anchor.
    if (i.stackedOn != null && byId.containsKey(i.stackedOn)) continue;
    result.add(_OrderedHabit(i, isStackedChild: false));
    for (final child in childrenByAnchor[i.id] ?? const <Intention>[]) {
      result.add(_OrderedHabit(child, isStackedChild: true));
    }
  }
  return result;
}

class _HabitCard extends ConsumerWidget {
  const _HabitCard({required this.intention, this.isStackedChild = false});
  final Intention intention;

  /// Whether to render this card indented under its anchor (§7.1 staircase).
  final bool isStackedChild;

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
    final todayStr = formatDateYmd(today);
    final todayLogged = logsMap.containsKey(todayStr);
    final loggedColor = Theme.of(context).brightness == Brightness.dark
        ? Colors.green.shade900.withAlpha(90)
        : Colors.green.shade50;

    // §7.4 Habit Distinction — build habits read green, quit habits red, via a
    // coloured left accent border. A quick at-a-glance signal that doesn't
    // depend on reading the label.
    final bool isQuit = intention.habitType == HabitType.quit;
    final Color typeColor =
        isQuit ? Colors.red.shade400 : Colors.green.shade500;

    final card = Card(
      margin: EdgeInsets.only(
        // §7.1 — stacked children get no left margin here; the connector Row
        // that wraps the card supplies the indent instead.
        left: isStackedChild ? 0 : 16,
        right: 16,
        top: 6,
        bottom: 6,
      ),
      color: todayLogged ? loggedColor : null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: typeColor, width: 1.5),
      ),
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
              Row(
                children: [
                  // §7.5 Gamification — traffic-light of the reminder-frequency
                  // tier (red = daily … green = weekly/off), a direct read of
                  // the fading-reminders signal.
                  _TrafficLightDot(intentionId: intention.id),
                  const SizedBox(width: 8),
                  // §7.1 — a stacked habit shows a small link glyph.
                  if (intention.isStacked) ...[
                    const SizedBox(width: 4),
                    Icon(Icons.link, size: 16, color: typeColor),
                  ],
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      intention.behaviorLabel,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                intention.intentionStatement,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface.withAlpha(153),
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
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
                              style: Theme.of(context).textTheme.labelMedium
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
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.center,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: Size.zero,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                  ),
                  // Tapping again while logged un-logs today, so the button is
                  // always tappable and always does something visible.
                  onPressed: () async {
                    // Capture the messenger before the await so feedback still
                    // shows if the widget rebuilds.
                    final messenger = ScaffoldMessenger.of(context);
                    final wasLogged = todayLogged;
                    try {
                      final service = ref.read(myHabitsServiceProvider);
                      if (wasLogged) {
                        await service.deleteLog(
                          intentionId: intention.id,
                          date: todayStr,
                        );
                      } else {
                        await service.logDay(
                          intentionId: intention.id,
                          date: todayStr,
                          enacted: true,
                        );
                      }
                      // A short tap confirms the log landed without requiring
                      // the user to read the snackbar — this is the app's
                      // core loop, so it should feel rewarding.
                      unawaited(HapticFeedback.lightImpact());
                      ref.invalidate(intentionLogsProvider(intention.id));
                      // Also refresh the page-level aggregate contribution
                      // graph, so today's log shows up immediately instead of
                      // only after a manual pull-to-refresh.
                      ref.invalidate(allHabitsActivityProvider);
                      // Logging XP-earns immediately — refresh so the level/XP
                      // display doesn't show stale numbers until some other
                      // screen happens to refetch it.
                      ref.invalidate(gamificationProvider);
                      messenger.showSnackBar(
                        SnackBar(
                          content: Text(
                            wasLogged ? l10n.habitUnlogged : l10n.loggedToday,
                          ),
                          duration: const Duration(seconds: 2),
                        ),
                      );
                    } catch (e) {
                      // A dead session already gets ShellScreen's global
                      // "session expired, sign in again" prompt (triggered by
                      // the same 401 via sessionExpiredProvider) — showing
                      // this generic snackbar too would just be a confusing
                      // second, contradictory-looking toast on top of it.
                      if (e is UnauthorisedException) return;
                      // Otherwise surface the real reason so failures are
                      // diagnosable instead of silently doing nothing.
                      messenger.showSnackBar(
                        SnackBar(
                          content: Text(l10n.couldNotLogToday(e.toString())),
                        ),
                      );
                    }
                  },
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    transitionBuilder: (child, animation) => ScaleTransition(
                      scale: animation,
                      child: FadeTransition(opacity: animation, child: child),
                    ),
                    child: Text(
                      todayLogged ? l10n.loggedToday : l10n.logToday,
                      key: ValueKey(todayLogged),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    // §7.1 — a stacked child gets a small elbow connector on its left so the
    // staircase reads as "this habit hangs off the one above".
    if (!isStackedChild) return card;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 40,
          child: Icon(
            Icons.subdirectory_arrow_right,
            size: 20,
            color: typeColor,
          ),
        ),
        Expanded(child: card),
      ],
    );
  }
}

/// §7.5 Gamification — a small traffic-light dot reflecting a habit's current
/// reminder-frequency tier: red = `daily`, amber = `every_2_days`/
/// `twice_weekly`, green = `weekly`/`off`. It is a direct visualisation of the
/// existing fading-reminders signal (reminderPlanService), no new backend
/// logic. Falls back to a neutral dot while the plan is loading.
class _TrafficLightDot extends ConsumerWidget {
  const _TrafficLightDot({required this.intentionId});

  final String intentionId;

  /// Maps a reminder-frequency tier to its traffic-light colour.
  static Color colorForFrequency(String? frequency) {
    switch (frequency) {
      case 'weekly':
      case 'off':
        return Colors.green;
      case 'every_2_days':
      case 'twice_weekly':
        return Colors.amber;
      case 'daily':
      default:
        return Colors.red;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final freqAsync = ref.watch(reminderFrequenciesProvider);
    final frequency = freqAsync.maybeWhen(
      data: (map) => map[intentionId],
      orElse: () => null,
    );
    final color = frequency == null
        ? Theme.of(context).disabledColor
        : colorForFrequency(frequency);
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

/// First-time explainer for the traffic-light dot on each habit card (see
/// [_TrafficLightDot]) — shown once, dismissible via a small close button,
/// and never shown again on this device (see [HabitOnboardingPrefs]).
class _DotLegendCard extends StatefulWidget {
  const _DotLegendCard();

  @override
  State<_DotLegendCard> createState() => _DotLegendCardState();
}

class _DotLegendCardState extends State<_DotLegendCard> {
  // Null while the stored value is still loading — treated as "don't show
  // yet" so the card doesn't flash in and immediately disappear.
  bool? _hasSeen;

  @override
  void initState() {
    super.initState();
    HabitOnboardingPrefs.hasSeenDotLegendIntro().then((seen) {
      if (mounted) setState(() => _hasSeen = seen);
    });
  }

  void _dismiss() {
    setState(() => _hasSeen = true);
    HabitOnboardingPrefs.markDotLegendIntroSeen();
  }

  @override
  Widget build(BuildContext context) {
    if (_hasSeen != false) return const SizedBox.shrink();
    // A fixed, pre-checked-for-contrast green/on-green pair (see
    // AppColors.greenLight/onGreenLight) rather than an alpha-blended
    // colorScheme.primaryContainer — the latter turns into a muddy,
    // low-contrast tint in dark mode since it depends on whatever's behind
    // the card.
    final colors = context.appColors;
    final tt = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Card(
        elevation: 0,
        color: colors.greenLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'What does the dot mean?',
                      style: tt.titleSmall?.copyWith(
                        color: colors.onGreenLight,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _DotLegendRow(
                      color: Colors.red,
                      textColor: colors.onGreenLight,
                      text:
                          'Red: this habit is new, so reminders come daily.',
                    ),
                    const SizedBox(height: 4),
                    _DotLegendRow(
                      color: Colors.amber,
                      textColor: colors.onGreenLight,
                      text: 'Amber: you\'re building momentum, and reminders '
                          'are easing off.',
                    ),
                    const SizedBox(height: 4),
                    _DotLegendRow(
                      color: Colors.green,
                      textColor: colors.onGreenLight,
                      text: 'Green: the habit is sticking, and reminders '
                          'have mostly faded away.',
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(Icons.close, size: 18, color: colors.onGreenLight),
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: _dismiss,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DotLegendRow extends StatelessWidget {
  const _DotLegendRow({
    required this.color,
    required this.text,
    required this.textColor,
  });
  final Color color;
  final String text;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: textColor,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}

/// A greyed-out card for a habit that graduated (became self-sustained via
/// the automaticity-graduation flow) — kept visible rather than hidden, with
/// a way back to active tracking if the participant wants it.
class _GraduatedHabitCard extends ConsumerWidget {
  const _GraduatedHabitCard({required this.intention});
  final Intention intention;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      color: cs.surfaceContainerHighest.withValues(alpha: 0.5),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(Icons.school_outlined, color: cs.onSurfaceVariant),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    intention.behaviorLabel,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    'Graduated — this habit is fully self-sustained.',
                    style: TextStyle(
                      fontSize: 12,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () async {
                await ref
                    .read(myHabitsServiceProvider)
                    .updateStatus(intention.id, 'active');
                ref.invalidate(intentionsProvider);
              },
              child: const Text('Reactivate'),
            ),
          ],
        ),
      ),
    );
  }
}
