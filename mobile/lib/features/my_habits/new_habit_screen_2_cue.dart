/// Step 2 of 3 in the new habit flow: setting the implementation intention cues.
library;

// mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../services/study_config_service.dart';
import 'my_habits_models.dart';

/// Screen for entering the "when" and "where" implementation intention cues.
class SetCueScreen extends ConsumerStatefulWidget {
  /// Creates a [SetCueScreen] for [behaviorKey].
  const SetCueScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    super.key,
  });

  /// The selected behaviour key from the previous step.
  final String behaviorKey;

  /// Human-readable label for the selected behaviour.
  final String behaviorLabel;

  /// Habit configuration loaded from the backend.
  final HabitConfig config;

  @override
  ConsumerState<SetCueScreen> createState() => _SetCueScreenState();
}

class _SetCueScreenState extends ConsumerState<SetCueScreen> {
  final _cue1Controller = TextEditingController();
  final _cue2Controller = TextEditingController();
  String? _error;
  bool _stitching = false;

  @override
  void dispose() {
    _cue1Controller.dispose();
    _cue2Controller.dispose();
    super.dispose();
  }

  Future<void> _onNext() async {
    final l10n = AppLocalizations.of(context)!;
    final isPreRated = widget.config.cueSource != 'self_selected';

    if (!isPreRated) {
      if (_cue1Controller.text.trim().length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
      if (widget.config.cueCount == 'multi' &&
          _cue2Controller.text.trim().isNotEmpty &&
          _cue2Controller.text.trim().length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
    }

    setState(() {
      _error = null;
      _stitching = true;
    });

    final List<IntentionCue> cues;
    if (isPreRated) {
      if (widget.config.assignedCues.isNotEmpty) {
        cues = widget.config.assignedCues;
      } else {
        cues = [
          IntentionCue(
            text: 'Your assigned cue for ${widget.behaviorLabel}',
            source: 'pre_rated',
          ),
        ];
      }
    } else {
      cues = [
        IntentionCue(
          text: _cue1Controller.text.trim(),
          source: 'self_selected',
        ),
        if (widget.config.cueCount == 'multi' &&
            _cue2Controller.text.trim().isNotEmpty)
          IntentionCue(
            text: _cue2Controller.text.trim(),
            source: 'self_selected',
          ),
      ];
    }

    // Call stitch-intention LLM (non-blocking: falls back to local assembly on failure).
    final stitchedSentence =
        await ref.read(studyConfigServiceProvider).stitchIntention(
              action: widget.behaviorLabel,
              cues: cues.map((c) => c.text).toList(),
            );

    if (!mounted) return;
    setState(() => _stitching = false);

    context.push(
      '/habits/new/confirm',
      extra: {
        'behaviorKey': widget.behaviorKey,
        'behaviorLabel': widget.behaviorLabel,
        'config': widget.config,
        'cues': cues,
        ?'stitchedSentence': stitchedSentence,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isPreRated = widget.config.cueSource != 'self_selected';
    final isMulti = widget.config.cueCount == 'multi';

    return Scaffold(
      appBar: AppBar(title: Text(l10n.setCueTitle)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Instruction ────────────────────────────────────────────
            Text(
              isPreRated
                  ? l10n.setCuePreRatedInstruction
                  : l10n.setCueSelfSelectedInstruction,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            // ── Cue input / assigned cues ──────────────────────────────
            if (isPreRated) ...[
              if (widget.config.assignedCues.isEmpty)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.hourglass_empty),
                    title: Text('No cues available yet'),
                    subtitle: Text('Your study coordinator will assign cues soon'),
                  ),
                )
              else
                ...widget.config.assignedCues.asMap().entries.map((entry) {
                  final index = entry.key;
                  final cue = entry.value;
                  final total = widget.config.assignedCues.length;
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.location_on),
                      title: Text(cue.text),
                      subtitle: Text(
                        total > 1
                            ? 'Cue ${index + 1} of $total (assigned by study)'
                            : 'Assigned by study',
                      ),
                    ),
                  );
                }),
            ] else ...[
              TextField(
                controller: _cue1Controller,
                decoration: InputDecoration(
                  labelText: isMulti ? 'Cue 1' : 'Your cue',
                  hintText: l10n.setCuePlaceholder,
                  border: const OutlineInputBorder(),
                ),
                maxLength: 200,
                onChanged: (_) => setState(() => _error = null),
              ),
              if (isMulti) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _cue2Controller,
                  decoration: const InputDecoration(
                    labelText: 'Cue 2 (optional context)',
                    hintText: 'e.g. at home on weekdays',
                    border: OutlineInputBorder(),
                  ),
                  maxLength: 200,
                  onChanged: (_) => setState(() => _error = null),
                ),
              ],
            ],
            // ── Validation error / submit ──────────────────────────────
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const Spacer(),
            FilledButton(
              onPressed: _stitching ? null : _onNext,
              child: _stitching
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Next'),
            ),
          ],
        ),
      ),
    );
  }
}
