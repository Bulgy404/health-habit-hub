// mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/exceptions.dart';
import '../../l10n/app_localizations.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

class ConfirmPlanScreen extends ConsumerStatefulWidget {
  const ConfirmPlanScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    required this.cues,
    super.key,
  });

  final String behaviorKey;
  final String behaviorLabel;
  final HabitConfig config;
  final List<IntentionCue> cues;

  @override
  ConsumerState<ConfirmPlanScreen> createState() => _ConfirmPlanScreenState();
}

class _ConfirmPlanScreenState extends ConsumerState<ConfirmPlanScreen> {
  int _durationMinutes = 20;
  bool _submitting = false;
  String? _error;

  String get _intentionStatement {
    final cueText = widget.cues.map((c) => c.text).join(', ');
    return '$cueText, I will ${widget.behaviorLabel.toLowerCase()} for $_durationMinutes minutes.';
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
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
            intentionStatement: _intentionStatement,
          );
      ref.invalidate(intentionsProvider);
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
            Card(
              color: const Color(0xFFEDF7E5),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  _intentionStatement,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.5,
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
