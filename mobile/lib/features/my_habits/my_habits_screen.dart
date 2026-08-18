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
import '../../theme/motion.dart';
import '../../utils/date_format.dart';
import '../../widgets/contribution_graph_widget.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/srhi_sparkline_widget.dart';
import 'backfill_log_sheet.dart';
import 'habit_onboarding_prefs.dart';
import 'weekly_progress_chip.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

// The app's shape language (see app.dart's CardThemeData/ButtonThemeData) is
// two shapes only: cards are a 20px rounded rect, and every interactive
// control (buttons, dots, this screen's log toggle) is fully round. Several
// cards on this screen need a custom `shape` anyway (a coloured border side,
// or a non-default elevation/fill), which forces overriding the app-wide
// CardTheme default — these constants keep every one of those overrides
// pinned to the same values instead of drifting to one-off numbers.
const double _kCardRadius = 20;
const double _kCardBorderWidth = 1.5;

/// Width of the connector gutter to the left of a stacked habit card (§7.1)
/// — wider than a standalone card's 16px left margin so the indent itself
/// is unmistakable at a glance, not just the drawn line inside it.
const double _kStackGutterWidth = 48;

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
                    isLastStackedChild: ordered[i].isLastStackedChild,
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
        borderRadius: BorderRadius.circular(_kCardRadius),
        side: BorderSide(color: colors.primary, width: _kCardBorderWidth),
      ),
      // A plain Row+Padding instead of ListTile: ListTile's default vertical
      // padding is tight enough that the button ends up crowding the card's
      // green border. Generous padding here gives the button room to breathe
      // inside the frame instead of looking smashed against it.
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Icon(Icons.psychology, color: colors.primary, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.srhiCheckInTitle,
                    style: TextStyle(
                      color: colors.primaryDark,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.srhiCheckInSubtitle,
                    style: TextStyle(color: colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            FilledButton(
              style: FilledButton.styleFrom(
                // The app-wide FilledButton theme defaults to a
                // full-width minimumSize (for primary CTAs); this button
                // instead sizes to its content inside the Row, so that
                // default must be overridden or it blows up layout with
                // an infinite-width constraint.
                minimumSize: Size.zero,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 16,
                ),
              ),
              onPressed: () => context.push(
                '/habits/${first.intentionId}/srhi/${first.weekNumber}',
                extra: {'behaviorLabel': behaviorLabel, 'srhiItems': srhiItems},
              ),
              child: Text(l10n.srhiStartButton),
            ),
          ],
        ),
      ),
    );
  }
}

/// One row in the ordered habit list: the intention plus whether it should be
/// rendered indented as a stacked child of the row above it (§7.1).
class _OrderedHabit {
  const _OrderedHabit(
    this.intention, {
    required this.isStackedChild,
    this.isLastStackedChild = false,
  });
  final Intention intention;
  final bool isStackedChild;

  /// Whether this is the last stacked child under its anchor — the
  /// connector trunk stops at this row's elbow instead of continuing down
  /// to a sibling (§7.1 staircase, see _StackConnectorPainter).
  final bool isLastStackedChild;
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
    final children = childrenByAnchor[i.id] ?? const <Intention>[];
    for (var idx = 0; idx < children.length; idx++) {
      result.add(
        _OrderedHabit(
          children[idx],
          isStackedChild: true,
          isLastStackedChild: idx == children.length - 1,
        ),
      );
    }
  }
  return result;
}

class _HabitCard extends ConsumerWidget {
  const _HabitCard({
    required this.intention,
    this.isStackedChild = false,
    this.isLastStackedChild = false,
  });
  final Intention intention;

  /// Whether to render this card indented under its anchor (§7.1 staircase).
  final bool isStackedChild;

  /// Whether this is the last stacked child under its anchor — see
  /// _OrderedHabit.isLastStackedChild.
  final bool isLastStackedChild;

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
        borderRadius: BorderRadius.circular(_kCardRadius),
        side: BorderSide(color: typeColor, width: _kCardBorderWidth),
      ),
      // Matches the Card's own shape above — previously mismatched (12 vs
      // 20), so the ripple's rounded corners poked out past the card's
      // actual visible border on tap.
      child: InkWell(
        borderRadius: BorderRadius.circular(_kCardRadius),
        onTap: () {
          context.push('/habits/${intention.id}');
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          // Outer Row: habit content on the left, the log checkbox on the
          // right — centered on the *whole* card's height (title + subtitle
          // + trend), not just squeezed into the title row.
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        // §7.5 Gamification — traffic-light of the
                        // reminder-frequency tier (red = daily … green =
                        // weekly/off), a direct read of the
                        // fading-reminders signal.
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
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      intention.intentionStatement,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(
                          context,
                        ).colorScheme.onSurface.withAlpha(153),
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    // § weekly-frequency habits — a "2 / 3 this week" summary
                    // in place of (well, alongside — see _LogCheckbox) a
                    // daily streak, which doesn't mean much for a habit
                    // whose target is only a few days a week. Purely
                    // client-derived from logsMap, already fully fetched.
                    if (intention.cadence.isWeekly) ...[
                      const SizedBox(height: 4),
                      WeeklyProgressChip(
                        logsMap: logsMap,
                        targetPerWeek: intention.cadence.targetPerWeek!,
                        color: typeColor,
                      ),
                    ],
                    trajectoryAsync.when(
                      data: (trajectory) {
                        final submitted = trajectory
                            .where((p) => p.score != null)
                            .toList();
                        if (submitted.length < 2) {
                          return const SizedBox.shrink();
                        }
                        final latest = submitted.last.score!;
                        final previous =
                            submitted[submitted.length - 2].score!;
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
                                    style: Theme.of(
                                      context,
                                    ).textTheme.labelSmall,
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
                  ],
                ),
              ),
              const SizedBox(width: 12),
              // Moved here (from the title row, then from its own full-width
              // row below the card) so it stays vertically centered against
              // the card's full content height regardless of how tall the
              // trend section makes the card. A checkbox rather than a
              // labelled button — logging today is the single most frequent
              // action on this screen, so it reads faster as an at-a-glance
              // on/off toggle than as text.
              Tooltip(
                message: todayLogged ? l10n.loggedToday : l10n.logToday,
                // Tooltip's default touch trigger is long-press, which would
                // otherwise fight with _LogCheckbox's own onLongPress (opens
                // the backfill sheet) for the same gesture-arena pointer.
                // Manual keeps hover-to-show on desktop/web but disables the
                // touch long-press trigger, leaving long-press exclusively
                // for the backfill sheet on mobile.
                triggerMode: TooltipTriggerMode.manual,
                child: _LogCheckbox(
                  checked: todayLogged,
                  color: typeColor,
                  // Tapping again while logged un-logs today, so the
                  // checkbox is always tappable and always does something
                  // visible.
                  onTap: () async {
                    // Capture the messenger before the await so feedback
                    // still shows if the widget rebuilds.
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
                      // The checkbox itself flips to reflect the new state,
                      // so a haptic tap is enough confirmation — a snackbar
                      // on top of that for the single most frequent action
                      // on this screen was just noise.
                      unawaited(HapticFeedback.lightImpact());
                      _refreshAfterLogChange(ref);
                    } catch (e) {
                      // A dead session already gets ShellScreen's global
                      // "session expired, sign in again" prompt (triggered
                      // by the same 401 via sessionExpiredProvider) —
                      // showing this generic snackbar too would just be a
                      // confusing second, contradictory-looking toast on
                      // top of it.
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
                  // A long press opens the "log a different day" sheet, for
                  // participants who forgot to check a habit off a day or
                  // two ago — the tap gesture stays reserved for the single
                  // most frequent action (today), so this doesn't slow it
                  // down or risk an accidental sheet open on a normal tap.
                  onLongPress: () {
                    unawaited(HapticFeedback.selectionClick());
                    showBackfillLogSheet(
                      context: context,
                      service: ref.read(myHabitsServiceProvider),
                      intentionId: intention.id,
                      logsMap: logsMap,
                      typeColor: typeColor,
                      onChanged: () => _refreshAfterLogChange(ref),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );

    // §7.1 — a stacked child gets a drawn elbow connector on its left, in a
    // wider gutter than before, so the staircase reads clearly as "this
    // habit hangs off the one above" rather than a subtle single-icon hint.
    // CrossAxisAlignment.stretch makes the gutter span this row's full
    // height (margin included), so the vertical trunk's top/bottom edges
    // land exactly in the 12px gaps between cards — meeting a continuing
    // trunk from the row above/below with no visible seam. IntrinsicHeight
    // is required for stretch to work here at all: this Row sits directly
    // in a sliver list item, which gives it an *unbounded* height (so the
    // card can size itself) — stretch alone has nothing to stretch to
    // without IntrinsicHeight resolving a concrete height first.
    if (!isStackedChild) return card;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: _kStackGutterWidth,
            child: CustomPaint(
              painter: _StackConnectorPainter(
                color: typeColor,
                continuesBelow: !isLastStackedChild,
              ),
            ),
          ),
          Expanded(child: card),
        ],
      ),
    );
  }
}

/// Draws a tree-style "elbow" connector for a stacked habit card (§7.1): a
/// vertical trunk down to a fixed elbow height, then a horizontal branch out
/// to the card. [continuesBelow] extends the trunk past the elbow to the
/// bottom of this row, so a chain of several habits stacked onto the same
/// anchor reads as one continuous line with a branch off it per habit,
/// rather than several disconnected elbows.
class _StackConnectorPainter extends CustomPainter {
  const _StackConnectorPainter({
    required this.color,
    required this.continuesBelow,
  });

  final Color color;
  final bool continuesBelow;

  /// Distance from the top of this row to the elbow — lines up with the
  /// vertical centre of the card's icon/title row (6px item gap + 16px card
  /// padding + roughly half the icon row's height).
  static const _elbowY = 32.0;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withAlpha(180)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final midX = size.width / 2;

    canvas.drawLine(Offset(midX, 0), Offset(midX, _elbowY), paint);
    canvas.drawLine(Offset(midX, _elbowY), Offset(size.width, _elbowY), paint);
    if (continuesBelow) {
      canvas.drawLine(Offset(midX, _elbowY), Offset(midX, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StackConnectorPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.continuesBelow != continuesBelow;
}

/// Invalidates every provider a log change (today's checkbox, or a
/// backfilled past day from [showBackfillLogSheet]) can affect, so the rest
/// of the screen — log history, the aggregate contribution graph, and
/// gamification's XP/streak — reflects it immediately rather than after a
/// manual pull-to-refresh.
void _refreshAfterLogChange(WidgetRef ref) {
  ref.invalidate(intentionLogsProvider);
  ref.invalidate(allHabitsActivityProvider);
  ref.invalidate(gamificationProvider);
}

/// Big, tappable on/off checkbox for "did you do this today", shown on each
/// habit tile. Deliberately larger than a stock [Checkbox] (which renders at
/// a fixed ~18dp regardless of layout) so it reads clearly at a glance
/// instead of looking like a squeezed-in afterthought next to the habit name.
/// Fully circular rather than a rounded square — this screen's cards are all
/// a 20px rounded rect, and every *interactive control* (buttons, the
/// traffic-light dot right next to this one) is fully round; a rounded
/// square here would be a third, off-brand shape mixed into both.
class _LogCheckbox extends StatefulWidget {
  const _LogCheckbox({
    required this.checked,
    required this.color,
    required this.onTap,
    this.onLongPress,
  });

  final bool checked;
  final Color color;
  final VoidCallback onTap;

  /// Opens the "log a different day" backfill sheet. Optional so other
  /// hypothetical callers of this widget aren't forced to wire it up.
  final VoidCallback? onLongPress;

  @override
  State<_LogCheckbox> createState() => _LogCheckboxState();
}

class _LogCheckboxState extends State<_LogCheckbox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller =
        AnimationController(vsync: this, value: widget.checked ? 1 : 0);
  }

  @override
  void didUpdateWidget(covariant _LogCheckbox oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A fast double-tap should feel continuous, not restart from a jump —
    // retarget the live value instead of the old fixed-duration swap.
    // AppSpring.quick, not .standard: this is logged tens of times/day, the
    // app's single highest-frequency tap — it needs to feel instant, not
    // reveal-paced.
    if (oldWidget.checked != widget.checked) {
      _controller.animateWithSpring(
        widget.checked ? 1 : 0,
        spring: AppSpring.quick,
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: widget.onTap,
        onLongPress: widget.onLongPress,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final t = _controller.value;
            return Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Color.lerp(Colors.transparent, widget.color, t),
                border: Border.all(color: widget.color, width: 2),
                shape: BoxShape.circle,
              ),
              child: Opacity(
                opacity: t,
                child: Transform.scale(
                  scale: t,
                  child: const Icon(
                    Icons.check,
                    color: Colors.white,
                    size: 26,
                  ),
                ),
              ),
            );
          },
        ),
      ),
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_kCardRadius),
        ),
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
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(_kCardRadius),
      ),
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
