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
class SrhiFormScreen extends ConsumerStatefulWidget {
  /// Creates a [SrhiFormScreen] for [intentionId] at [weekNumber].
  const SrhiFormScreen({
    required this.intentionId,
    required this.weekNumber,
    required this.behaviorLabel,
    required this.srhiItems,
    super.key,
  });

  /// The habit intention being assessed.
  final String intentionId;

  /// Study week number for this check-in.
  final int weekNumber;

  /// Human-readable behaviour label shown in the form header.
  final String behaviorLabel;

  /// SRHI question items to present.
  final List<SrhiItem> srhiItems;

  @override
  ConsumerState<SrhiFormScreen> createState() => _SrhiFormScreenState();
}

class _SrhiFormScreenState extends ConsumerState<SrhiFormScreen> {
  // Stores 1–7 rating for each item; initially all 1 (slider minimum).
  late final Map<String, int> _answers;
  // Tracks which items have been explicitly touched by the user.
  final Set<String> _touched = {};
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _answers = {for (final item in widget.srhiItems) item.id: 1};
  }

  bool get _allAnswered => _touched.length == widget.srhiItems.length;

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    if (!_allAnswered) {
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
                '${widget.behaviorLabel} is now fully self-sustained — you '
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
                    l10n.srhiStem(widget.behaviorLabel),
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  for (int i = 0; i < widget.srhiItems.length; i++)
                    Builder(builder: (context) {
                      final item = widget.srhiItems[i];
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
                            if (i < widget.srhiItems.length - 1)
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
              onPressed: (_allAnswered && !_submitting) ? _submit : null,
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
