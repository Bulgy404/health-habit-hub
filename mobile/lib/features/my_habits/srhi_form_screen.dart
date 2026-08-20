/// Weekly SRHI (Self-Report Habit Index) check-in form screen.
library;

// mobile/lib/features/my_habits/srhi_form_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dio_provider.dart';
import '../../l10n/app_localizations.dart';
import '../../services/reminder_scheduler_service.dart';
import '../../theme/app_colors.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

/// Screen for completing the weekly SRHI habit strength questionnaire.
///
/// [behaviorLabel] and [srhiItems] are normally passed via router `extra`
/// when navigated to from in-app (see my_habits_screen.dart's
/// `_SrhiPromptCard`). They're left `null`-able so a bare deep link — e.g. a
/// tapped SRHI local notification, which can only carry a path string — still
/// works: the screen fetches both itself from [habitConfigProvider] and
/// [intentionsProvider] in that case.
class SrhiFormScreen extends ConsumerStatefulWidget {
  /// Creates a [SrhiFormScreen] for [intentionId] at [weekNumber].
  const SrhiFormScreen({
    required this.intentionId,
    required this.weekNumber,
    this.behaviorLabel,
    this.srhiItems,
    super.key,
  });

  /// The habit intention being assessed.
  final String intentionId;

  /// Study week number for this check-in.
  final int weekNumber;

  /// Human-readable behaviour label shown in the form header, when supplied
  /// by the caller — otherwise resolved from [intentionsProvider].
  final String? behaviorLabel;

  /// SRHI question items to present, when supplied by the caller —
  /// otherwise resolved from [habitConfigProvider].
  final List<SrhiItem>? srhiItems;

  @override
  ConsumerState<SrhiFormScreen> createState() => _SrhiFormScreenState();
}

class _SrhiFormScreenState extends ConsumerState<SrhiFormScreen> {
  // Stores 1–7 rating for each item; missing entries default to 1 (slider
  // minimum) at read time, so this never needs eager population.
  final Map<String, int> _answers = {};
  // Tracks which items have been explicitly touched by the user.
  final Set<String> _touched = {};
  bool _submitting = false;
  String? _error;

  // Cached once resolved in build() so `_submit` (and its graduation dialog
  // copy) can use them without re-deriving from providers mid-callback.
  List<SrhiItem>? _resolvedItems;
  String _resolvedLabel = '';

  bool _allAnswered(List<SrhiItem> items) =>
      _touched.length == items.length;

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    final items = _resolvedItems ?? const <SrhiItem>[];
    if (!_allAnswered(items)) {
      setState(() => _error = l10n.srhiSubmitIncomplete);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(myHabitsServiceProvider).submitSrhi(
            intentionId: widget.intentionId,
            weekNumber: widget.weekNumber,
            items: Map<String, int>.from(_answers),
          );
      ref.invalidate(dueSrhiProvider);
      ref.invalidate(srhiTrajectoryProvider(widget.intentionId));
      // The new SRHI score changes the adaptive reminder plan — resync.
      try {
        await ReminderSchedulerService(dio: ref.read(dioProvider))
            .syncReminders();
      } catch (_) {
        // Non-fatal: resynced on next app start.
      }

      // Automaticity-graduation flow — this submission was strong enough,
      // after a silent week, to retire the habit from active tracking. Known
      // right away (no need to wait for the next gamification sync), so
      // celebrate immediately and refresh the habits list (status changed).
      if (result.graduation?.graduated == true) {
        ref.invalidate(intentionsProvider);
        try {
          await ReminderSchedulerService(dio: ref.read(dioProvider))
              .showPraiseNotifications(['habit_graduate']);
        } catch (_) {
          // Non-fatal: praise is a nicety.
        }
        if (mounted) {
          await showDialog<void>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              title: const Text('🎓 Habit graduated!'),
              content: Text(
                '$_resolvedLabel is now fully self-sustained — you '
                "don't need to track it in the app anymore. It's moved to "
                'Graduated habits, and you can always reactivate it later.',
              ),
              actions: [
                FilledButton(
                  onPressed: () => Navigator.pop(dialogContext),
                  child: const Text('Nice!'),
                ),
              ],
            ),
          );
        }
      }

      if (mounted) context.pop();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    // The normal in-app path: my_habits_screen.dart's `_SrhiPromptCard`
    // already has both values on hand and passes them via router `extra`.
    if (widget.srhiItems != null) {
      _resolvedItems = widget.srhiItems;
      _resolvedLabel = widget.behaviorLabel ?? '';
      return _buildForm(context, widget.srhiItems!, _resolvedLabel);
    }

    // Deep-link path (a tapped SRHI notification carries only a route
    // string) — resolve the same data from providers instead.
    final configAsync = ref.watch(habitConfigProvider);
    final intentionsAsync = ref.watch(intentionsProvider);
    if (configAsync.isLoading || intentionsAsync.isLoading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.srhiFormTitle)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (configAsync.hasError || intentionsAsync.hasError) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.srhiFormTitle)),
        body: Center(
          child: Text((configAsync.error ?? intentionsAsync.error).toString()),
        ),
      );
    }
    final items = configAsync.value!.srhiItems;
    final label = intentionsAsync.value!
            .where((i) => i.id == widget.intentionId)
            .firstOrNull
            ?.behaviorLabel ??
        '';
    _resolvedItems = items;
    _resolvedLabel = label;
    return _buildForm(context, items, label);
  }

  Widget _buildForm(
    BuildContext context,
    List<SrhiItem> items,
    String behaviorLabel,
  ) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.srhiFormTitle)),
      body: Column(
        children: [
          // ── Stem + question sliders (one scrollable region) ────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.srhiStem(behaviorLabel),
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  for (int i = 0; i < items.length; i++)
                    Builder(builder: (context) {
                      final item = items[i];
                      final text = locale == 'de' ? item.de : item.en;
                      final value = _answers[item.id] ?? 1;
                      final touched = _touched.contains(item.id);
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${i + 1}. $text',
                              style: Theme.of(context).textTheme.bodyLarge,
                            ),
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                overlayShape:
                                    SliderComponentShape.noOverlay,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 10,
                                ),
                                trackHeight: 4,
                              ),
                              child: Slider(
                                min: 1,
                                max: 7,
                                divisions: 6,
                                value: value.toDouble(),
                                onChanged: (v) => setState(() {
                                  _answers[item.id] = v.round();
                                  _touched.add(item.id);
                                }),
                              ),
                            ),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    l10n.srhiScaleMin,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium
                                        ?.copyWith(
                                          color: colorScheme.onSurfaceVariant,
                                        ),
                                  ),
                                ),
                                Text(
                                  touched ? '$value' : '–',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.w800,
                                        color: touched
                                            ? context.appColors.primary
                                            : colorScheme.onSurfaceVariant,
                                      ),
                                ),
                                Expanded(
                                  child: Text(
                                    l10n.srhiScaleMax,
                                    textAlign: TextAlign.end,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium
                                        ?.copyWith(
                                          color: colorScheme.onSurfaceVariant,
                                        ),
                                  ),
                                ),
                              ],
                            ),
                            if (i < items.length - 1)
                              const Padding(
                                padding: EdgeInsets.only(top: 12),
                                child: Divider(height: 1),
                              ),
                          ],
                        ),
                      );
                    }),
                ],
              ),
            ),
          ),
          // ── Submit footer ─────────────────────────────────────────────
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontSize: 13,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            child: FilledButton(
              onPressed: (_allAnswered(items) && !_submitting) ? _submit : null,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(l10n.srhiSubmit),
            ),
          ),
        ],
      ),
    );
  }
}
