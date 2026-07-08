/// Step 3 of 3 in the new habit flow: confirming and creating the intention.
library;

// mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/cupertino.dart' show CupertinoDatePicker, CupertinoDatePickerMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../core/exceptions.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
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
  // Duration is no longer chosen on this screen (kept fixed for the payload).
  static const int _durationMinutes = 20;
  TimeOfDay _reminderTime = const TimeOfDay(hour: 19, minute: 0);
  bool _reminderEnabled = true;
  bool _submitting = false;
  String? _error;
  late String _intentionStatementEditable;
  late final TextEditingController _statementController;
  late bool _shareWithCommunity;

  @override
  void initState() {
    super.initState();
    _intentionStatementEditable =
        widget.stitchedSentence ?? _buildFallbackStatement();
    // A single, persistent controller — recreating it on every build (the
    // previous behaviour) reset the cursor and fought the user's typing.
    _statementController =
        TextEditingController(text: _intentionStatementEditable);
    // The opt-in is only shown (and pre-selected) when the platform-wide
    // communityShareDefault flag is enabled in the admin portal.
    _shareWithCommunity = widget.config.communityShareDefault;
  }

  @override
  void dispose() {
    _statementController.dispose();
    super.dispose();
  }

  String _buildFallbackStatement() {
    final cueText = widget.cues.map((c) => c.text).join(', ');
    return '$cueText, I will ${widget.behaviorLabel.toLowerCase()}.';
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
    // Capture service handles and values up front so the background work below
    // does not touch `ref`/`context` after we navigate away and dispose.
    final dio = ref.read(dioProvider);
    final shouldShare =
        widget.config.communityShareDefault && _shareWithCommunity;
    final sentence = _intentionStatementEditable;
    final language = ref.read(localeProvider).languageCode;

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

      // The habit is now created — navigate immediately. Community sharing and
      // reminder scheduling are best-effort and can be slow (a network call
      // plus many native notification writes), so run them in the background
      // rather than blocking the "Create habit" button on them.
      if (mounted) context.go('/habits');
      _runPostCreateTasks(
        dio: dio,
        shouldShare: shouldShare,
        sentence: sentence,
        language: language,
      );
    } on ValidationException {
      setState(() => _error = l10n.habitLimitReached);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Fire-and-forget best-effort work after the habit is created. Failures are
  /// non-fatal: sharing is optional, and reminders re-sync on next app start.
  void _runPostCreateTasks({
    required Dio dio,
    required bool shouldShare,
    required String sentence,
    required String language,
  }) {
    if (shouldShare) {
      unawaited(_shareQuietly(dio, sentence, language));
    }
    unawaited(_syncRemindersQuietly(dio));
  }

  Future<void> _shareQuietly(Dio dio, String sentence, String language) async {
    try {
      await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/share',
        data: {'sentence': sentence, 'language': language},
      );
    } catch (_) {
      // Non-fatal: sharing is optional and anonymous.
    }
  }

  Future<void> _syncRemindersQuietly(Dio dio) async {
    try {
      await ReminderSchedulerService(dio: dio).syncReminders();
    } catch (_) {
      // Non-fatal: rescheduled on next app start.
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
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
            Text(l10n.confirmPlanSubtitle,
                style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            // Editable intention statement card
            Card(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  controller: _statementController,
                  onChanged: (v) => _intentionStatementEditable = v,
                  maxLines: null,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.5,
                      ),
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: l10n.confirmPlanEditHint,
                  ),
                ),
              ),
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
                    reminderCfg.enabled ? Icons.notifications_active : Icons.notifications_off,
                    size: 20,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    reminderCfg.enabled
                        ? hasFixedTime
                            ? l10n.confirmPlanReminderAtTime(
                                reminderCfg.fixedTime!,
                              )
                            : l10n.confirmPlanRemindersEnabledByStudy
                        : l10n.confirmPlanNoRemindersByStudy,
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
            if (widget.config.communityShareDefault) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Switch(
                    value: _shareWithCommunity,
                    onChanged: (v) => setState(() => _shareWithCommunity = v),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(l10n.confirmPlanShareWithCommunity),
                  ),
                ],
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
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
            ),
            ],
          ),
        ),
      ),
    );
  }
}
