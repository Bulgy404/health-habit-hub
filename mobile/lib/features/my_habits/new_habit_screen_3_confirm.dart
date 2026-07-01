/// Step 3 of 3 in the new habit flow: confirming and creating the intention.
library;

// mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart
import 'package:flutter/cupertino.dart' show CupertinoDatePicker, CupertinoDatePickerMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dio_provider.dart';
import '../../core/exceptions.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/study_config_provider.dart';
import '../../services/reminder_scheduler_service.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

/// Review screen that shows the full habit plan before the user creates it.
class ConfirmPlanScreen extends ConsumerStatefulWidget {
  /// Creates a [ConfirmPlanScreen].
  const ConfirmPlanScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    required this.cues,
    this.stitchedSentence,
    super.key,
  });

  /// The selected behaviour key.
  final String behaviorKey;

  /// Human-readable label for the selected behaviour.
  final String behaviorLabel;

  /// Habit configuration loaded from the backend.
  final HabitConfig config;

  /// Implementation intention cues entered in the previous step.
  final List<IntentionCue> cues;

  /// LLM-stitched intention sentence (from /habits/stitch-intention), if available.
  final String? stitchedSentence;

  @override
  ConsumerState<ConfirmPlanScreen> createState() => _ConfirmPlanScreenState();
}

class _ConfirmPlanScreenState extends ConsumerState<ConfirmPlanScreen> {
  int _durationMinutes = 20;
  TimeOfDay _reminderTime = const TimeOfDay(hour: 19, minute: 0);
  bool _reminderEnabled = true;
  bool _submitting = false;
  String? _error;
  late String _intentionStatementEditable;

  @override
  void initState() {
    super.initState();
    _intentionStatementEditable =
        widget.stitchedSentence ?? _buildFallbackStatement();
  }

  String _buildFallbackStatement() {
    final cueText = widget.cues.map((c) => c.text).join(', ');
    return '$cueText, I will ${widget.behaviorLabel.toLowerCase()} for $_durationMinutes minutes.';
  }

  String get _reminderTimeString =>
      '${_reminderTime.hour.toString().padLeft(2, '0')}:'
      '${_reminderTime.minute.toString().padLeft(2, '0')}';

  /// iOS-style wheel picker for the daily reminder time. Reminders start
  /// daily and automatically become less frequent as the habit strengthens
  /// (adaptive plan from the backend, see reminder_scheduler_service.dart).
  Future<void> _pickReminderTime() async {
    var pending = _reminderTime;
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: 280,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _reminderTime = pending);
                    Navigator.of(sheetContext).pop();
                  },
                  child: Text(AppLocalizations.of(context)!.doneButton),
                ),
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.time,
                  use24hFormat: true,
                  initialDateTime: DateTime(
                    2026,
                    1,
                    1,
                    _reminderTime.hour,
                    _reminderTime.minute,
                  ),
                  onDateTimeChanged: (dt) =>
                      pending = TimeOfDay(hour: dt.hour, minute: dt.minute),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    final studyConfig = ref.read(studyConfigProvider).value;
    final reminderCfg = studyConfig?.reminderConfig;

    // Determine effective reminder state from study config overrides.
    final effectiveReminderEnabled =
        reminderCfg != null ? reminderCfg.enabled : _reminderEnabled;
    final effectiveReminderTime = reminderCfg?.fixedTime ?? _reminderTimeString;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(myHabitsServiceProvider).createIntention(
            behaviorKey: widget.behaviorKey,
            behaviorLabel: widget.behaviorLabel,
            durationMinutes: _durationMinutes,
            cues: widget.cues,
            intentionStatement: _intentionStatementEditable,
            reminderTime:
                effectiveReminderEnabled ? effectiveReminderTime : null,
          );
      ref.invalidate(intentionsProvider);
      // Schedule the (initially daily) local reminders for the new habit.
      try {
        await ReminderSchedulerService(dio: ref.read(dioProvider))
            .syncReminders();
      } catch (_) {
        // Non-fatal: rescheduled on next app start.
      }
      if (mounted) context.go('/habits');
    } on ValidationException {
      setState(() => _error = l10n.habitLimitReached);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final studyConfig = ref.watch(studyConfigProvider).value;
    final reminderCfg = studyConfig?.reminderConfig;

    // Study-override: if study has fixedTime, show it read-only.
    final hasFixedTime = reminderCfg?.fixedTime != null;
    final reminderControlledByStudy = reminderCfg != null;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.confirmPlanTitle)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.confirmPlanSubtitle,
                style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            // Editable intention statement card
            Card(
              color: const Color(0xFFEDF7E5),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  controller: TextEditingController(
                    text: _intentionStatementEditable,
                  )..selection = TextSelection.collapsed(
                      offset: _intentionStatementEditable.length),
                  onChanged: (v) => _intentionStatementEditable = v,
                  maxLines: null,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.5,
                      ),
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: 'Edit your intention…',
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(l10n.durationLabel,
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Row(
              children: [15, 20, 30, 45, 60].map((mins) {
                final selected = _durationMinutes == mins;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('$mins min'),
                    selected: selected,
                    onSelected: (_) => setState(() => _durationMinutes = mins),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 24),
            Text(l10n.dailyReminderLabel,
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            if (reminderControlledByStudy)
              // Study controls reminder — show read-only status
              Row(
                children: [
                  Icon(
                    reminderCfg!.enabled ? Icons.notifications_active : Icons.notifications_off,
                    size: 20,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    reminderCfg.enabled
                        ? hasFixedTime
                            ? 'Reminder at ${reminderCfg.fixedTime} (set by study)'
                            : 'Reminders enabled (set by study)'
                        : 'No reminders (set by study)',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              )
            else
              Row(
                children: [
                  Switch(
                    value: _reminderEnabled,
                    onChanged: (v) => setState(() => _reminderEnabled = v),
                  ),
                  const SizedBox(width: 8),
                  if (_reminderEnabled)
                    ActionChip(
                      avatar: const Icon(Icons.schedule, size: 18),
                      label: Text(_reminderTimeString),
                      onPressed: _pickReminderTime,
                    )
                  else
                    Text(l10n.noReminders),
                ],
              ),
            if (!reminderControlledByStudy && _reminderEnabled)
              Text(
                l10n.reminderFadingHint,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const Spacer(),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l10n.createHabit),
            ),
          ],
        ),
      ),
    );
  }
}
