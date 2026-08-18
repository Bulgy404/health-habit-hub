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
import '../../models/study_group_config.dart';
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
    required this.habitType,
    this.stackedOn,
    this.creationMode = 'standalone',
    this.anchorText,
    this.alsoTrackAnchor = false,
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

  /// Whether the participant is building or quitting a habit (§7.4).
  final HabitType habitType;

  /// The anchor intention id when this habit was stacked (§7.1); else null.
  final String? stackedOn;

  /// `'standalone'` or `'stacked'` (§7.1).
  final String creationMode;

  /// Free-typed anchor habit text when the anchor isn't a tracked habit (§7.1).
  /// Donated to the community first (best-effort) so a STACKED_WITH edge can
  /// form between it and this new habit in the graph. Also shown as its own
  /// "Stacked onto" field (not folded into the intention sentence).
  final String? anchorText;

  /// Opt-in: when stacking onto a free-typed anchor (stackedOn is null),
  /// also create a standalone tracked habit for the anchor itself and link
  /// this habit's stackedOn to it (§7.1).
  final bool alsoTrackAnchor;

  /// LLM-stitched intention sentence (from /habits/stitch-intention), if available.
  final String? stitchedSentence;

  @override
  ConsumerState<ConfirmPlanScreen> createState() => _ConfirmPlanScreenState();
}

class _ConfirmPlanScreenState extends ConsumerState<ConfirmPlanScreen> {
  // Duration is no longer chosen on this screen (kept fixed for the payload).
  static const int _durationMinutes = 20;
  // § weekly-frequency habits — daily is the pre-selected default, so a
  // participant who never touches this control gets identical behavior to
  // every habit created before this existed.
  CadenceType _cadenceType = CadenceType.daily;
  int _targetPerWeek = 3;
  TimeOfDay _reminderTime = const TimeOfDay(hour: 19, minute: 0);
  bool _reminderEnabled = true;
  bool _submitting = false;
  String? _error;
  /// Whether [_error] came from the §7.3 information-overload guard and the
  /// participant's study condition allows opting out — shows a link to the
  /// Settings toggle rather than leaving the block a dead end.
  bool _errorIsOverloadOptOutEligible = false;
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
    final anchor = widget.anchorText?.trim();
    if (widget.cues.isEmpty && anchor != null && anchor.isNotEmpty) {
      // §7.1 — stacked with no separate cue: the anchor is the trigger.
      return 'After I $anchor, I will ${widget.behaviorLabel.toLowerCase()}.';
    }
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

  /// Derives a stable snake_case key from a free-typed label, matching
  /// new_habit_screen_1_behavior.dart's `_slugify` for custom behaviours.
  String _slugify(String label) {
    final slug = label
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), '_')
        .replaceAll(RegExp(r'[^a-z0-9_]'), '');
    return slug.isEmpty ? 'anchor' : slug;
  }

  /// §7.1 — opt-in: when stacking onto a free-typed anchor, create a minimal
  /// standalone tracked habit for the anchor itself and return its id so the
  /// main habit's `stackedOn` can link to it, upgrading a "just a name" free
  /// text anchor into a real tracked+linked one. Best-effort: on any failure
  /// (including the anchor alone hitting a habit-limit cap) this falls back
  /// to `widget.stackedOn` (the free-typed anchor is still recorded via
  /// anchorLabel either way) rather than blocking the habit the user is
  /// actually here to create.
  Future<String?> _resolveStackedOn() async {
    if (widget.stackedOn != null) return widget.stackedOn;
    final anchor = widget.anchorText?.trim();
    if (!widget.alsoTrackAnchor || anchor == null || anchor.isEmpty) {
      return widget.stackedOn;
    }
    try {
      final anchorIntention = await ref.read(myHabitsServiceProvider).createIntention(
            behaviorKey: _slugify(anchor),
            behaviorLabel: anchor,
            // No dedicated duration UI for an anchor created this way — a
            // short default; the participant can edit it like any habit
            // afterwards (My Habits > this habit > edit).
            durationMinutes: 5,
            cues: const [
              IntentionCue(
                text: 'Already part of my daily routine',
                source: 'self_selected',
              ),
            ],
            intentionStatement: '$anchor is already part of my routine.',
            habitType: HabitType.build,
            creationMode: 'standalone',
          );
      return anchorIntention.id;
    } catch (_) {
      return widget.stackedOn;
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    final studyConfig = ref.read(studyConfigProvider).value;
    final habitReminder = studyConfig?.reminders.habit;
    final mode = habitReminder?.mode ?? ReminderMode.participantChoice;

    // Determine the reminder time to submit from the resolved mode:
    //  - off: no reminder, regardless of local switch state.
    //  - adminFixed: the admin's locked time, regardless of local state.
    //  - participantChoice: the participant's own choice.
    final String? effectiveReminderTime = switch (mode) {
      ReminderMode.off => null,
      ReminderMode.adminFixed => habitReminder!.time,
      ReminderMode.participantChoice => _reminderEnabled ? _reminderTimeString : null,
    };

    setState(() {
      _submitting = true;
      _error = null;
      _errorIsOverloadOptOutEligible = false;
    });
    // Capture service handles and values up front so the background work below
    // does not touch `ref`/`context` after we navigate away and dispose.
    final dio = ref.read(dioProvider);
    final shouldShare =
        widget.config.communityShareDefault && _shareWithCommunity;
    final sentence = _intentionStatementEditable;
    final language = ref.read(localeProvider).languageCode;

    try {
      final resolvedStackedOn = await _resolveStackedOn();
      await ref.read(myHabitsServiceProvider).createIntention(
            behaviorKey: widget.behaviorKey,
            behaviorLabel: widget.behaviorLabel,
            durationMinutes: _durationMinutes,
            cues: widget.cues,
            intentionStatement: _intentionStatementEditable,
            habitType: widget.habitType,
            stackedOn: resolvedStackedOn,
            anchorLabel: widget.anchorText,
            creationMode: widget.creationMode,
            reminderTime: effectiveReminderTime,
            cadence: Cadence(
              type: _cadenceType,
              targetPerWeek:
                  _cadenceType == CadenceType.weekly ? _targetPerWeek : null,
            ),
          );
      ref.invalidate(intentionsProvider);
      // §7.5 — a new habit earns the First Step badge; refresh so Settings/
      // Profile don't show stale XP/badges until some other screen refetches.
      ref.invalidate(gamificationProvider);

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
    } on InformationOverloadException {
      // §7.3 — explain the block (focus on the current habit first) rather
      // than showing the generic limit message. If this participant's study
      // condition permits opting out, surface that here too — the only other
      // place it's mentioned (the info card on step 1) is long gone by the
      // time the block actually happens.
      setState(() {
        _error = l10n.informationOverloadBlocked;
        _errorIsOverloadOptOutEligible =
            widget.config.informationOverloadOptOutAllowed;
      });
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
    // §7.5 — refresh gamification and fire a praise notification for any badge
    // just unlocked (e.g. First Step, or Habit Architect for a stacked habit).
    unawaited(_praiseQuietly(dio));
  }

  Future<void> _praiseQuietly(Dio dio) async {
    try {
      final service = MyHabitsService(dio: dio);
      final g = await service.fetchGamification();
      final scheduler = ReminderSchedulerService(dio: dio);
      final earnedKeys = g.newlyEarned.map((b) => b.badgeKey).toList();
      if (earnedKeys.isNotEmpty) {
        await scheduler.showPraiseNotifications(earnedKeys);
      }
      // Unlikely right after creation, but kept symmetric with the app-start
      // sync in shell_screen.dart, which is where this normally fires.
      final lostKeys = g.newlyLost.map((b) => b.badgeKey).toList();
      if (lostKeys.isNotEmpty) {
        await scheduler.showGetBackOnTrackNotifications(lostKeys);
      }
    } catch (_) {
      // Non-fatal: praise is a nicety.
    }
  }

  Future<void> _shareQuietly(Dio dio, String sentence, String language) async {
    try {
      // §7.1 Habit Stacking — when a free-typed anchor was given, donate it
      // first so the new habit can reference its graph node by uuid, forming a
      // (:Habit)-[:STACKED_WITH]->(:Habit) edge. The share response's jobId is
      // the new node's uuid. Best-effort: on any failure we still donate the
      // new habit without the link.
      String? anchorUuid;
      final anchor = widget.anchorText?.trim();
      if (anchor != null && anchor.isNotEmpty) {
        try {
          final res = await dio.post<Map<String, dynamic>>(
            '${AppConfig.apiBaseUrl}/habits/share',
            data: {'sentence': anchor, 'language': language},
          );
          anchorUuid = res.data?['jobId']?.toString() ??
              res.data?['uuid']?.toString();
        } catch (_) {
          // Non-fatal: anchor donation failed; link is simply omitted.
        }
      }
      await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/share',
        data: {
          'sentence': sentence,
          'language': language,
          // §7.4/§7.1 — tag the donated node so the graph records build/quit
          // and the stacking relationship.
          'habitType': widget.habitType.wire,
          'creationMode': widget.creationMode,
          'stackedOnUuid': ?anchorUuid,
        },
      );
    } catch (_) {
      // Non-fatal: sharing is optional and anonymous.
    }
  }

  Future<void> _syncRemindersQuietly(Dio dio) async {
    final service = ReminderSchedulerService(dio: dio);
    try {
      await service.syncReminders();
    } catch (_) {
      // Non-fatal: rescheduled on next app start.
    }
    try {
      // Picks up this habit's first SRHI check-in reminder immediately,
      // rather than waiting for the next app cold start.
      await service.syncQuestionnaireReminders();
    } catch (_) {
      // Non-fatal: rescheduled on next app start.
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final studyConfig = ref.watch(studyConfigProvider).value;
    final habitReminder = studyConfig?.reminders.habit;
    final mode = habitReminder?.mode ?? ReminderMode.participantChoice;

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
            // §7.1 — the stacking anchor is shown as its own field, not
            // folded into the intention sentence, so stacking reads as a
            // distinct mechanism from typing a cue.
            if (widget.creationMode == 'stacked' &&
                (widget.anchorText?.trim().isNotEmpty ?? false)) ...[
              Chip(
                avatar: const Icon(Icons.link, size: 18),
                label: Text(
                  l10n.stackedOntoLabel(widget.anchorText!.trim()),
                ),
              ),
              const SizedBox(height: 16),
            ],
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
            if (mode == ReminderMode.off)
              // Study disables habit reminders entirely for this
              // participant — no switch, no picker, nothing to enter.
              Row(
                children: [
                  Icon(
                    Icons.notifications_off,
                    size: 20,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.confirmPlanNoRemindersByStudy,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              )
            else if (mode == ReminderMode.adminFixed)
              // Study locks the reminder to a fixed time — read-only,
              // participant has no input.
              Row(
                children: [
                  Icon(
                    Icons.notifications_active,
                    size: 20,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.confirmPlanReminderAtTime(habitReminder!.time!),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              )
            else
              // participantChoice: the participant picks their own reminder
              // time.
              Row(
                children: [
                  Switch(
                    key: const Key('reminderSwitch'),
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
            if (mode == ReminderMode.participantChoice && _reminderEnabled)
              Text(
                l10n.reminderFadingHint,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            const SizedBox(height: 24),
            Text(l10n.habitCadenceQuestion,
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            // Switch, not SegmentedButton — matches this screen's own
            // reminder-enabled/share-with-community toggles instead of
            // introducing a different control style just for this row.
            Row(
              children: [
                Switch(
                  key: const Key('cadenceSwitch'),
                  // On = daily (the default/pre-selected state), off = a
                  // weekly target — inverted from a naive "on = weekly"
                  // mapping, which read as backwards: flipping the switch
                  // *off* to mean daily (the more restrictive/frequent
                  // option) was confusing.
                  value: _cadenceType == CadenceType.daily,
                  onChanged: (isDaily) => setState(() {
                    _cadenceType =
                        isDaily ? CadenceType.daily : CadenceType.weekly;
                  }),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _cadenceType == CadenceType.weekly
                        ? l10n.habitCadenceWeeklyOption
                        : l10n.habitCadenceDaily,
                  ),
                ),
              ],
            ),
            if (_cadenceType == CadenceType.weekly) ...[
              Text(
                l10n.habitCadenceTargetLabel(_targetPerWeek),
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              Slider(
                value: _targetPerWeek.toDouble(),
                min: 1,
                max: 6,
                divisions: 5,
                label: l10n.habitCadenceTargetLabel(_targetPerWeek),
                onChanged: (v) =>
                    setState(() => _targetPerWeek = v.round()),
              ),
            ],
            if (widget.config.communityShareDefault) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Switch(
                    key: const Key('shareWithCommunitySwitch'),
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
              if (_errorIsOverloadOptOutEligible) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.informationOverloadBlockedOptOutHint,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => context.push('/settings'),
                      child: Text(l10n.informationOverloadBlockedOptOutAction),
                    ),
                  ],
                ),
              ],
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
