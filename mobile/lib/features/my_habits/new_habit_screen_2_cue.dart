/// Step 2 of the new habit flow: setting the implementation intention cues.
library;

// mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
import 'habit_onboarding_prefs.dart';
import 'habit_onboarding_widgets.dart';
import 'my_habits_models.dart';

/// Maximum number of self-selected cues a user can attach to one habit.
const int kMaxCues = 7;

/// Screen for entering the "when" and "where" implementation intention cues.
class SetCueScreen extends ConsumerStatefulWidget {
  /// Creates a [SetCueScreen] for [behaviorKey].
  const SetCueScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    this.initialCue,
    super.key,
  });

  /// The selected behaviour key from the previous step.
  final String behaviorKey;

  /// Human-readable label for the selected behaviour.
  final String behaviorLabel;

  /// Habit configuration loaded from the backend.
  final HabitConfig config;

  /// Optional cue text to prefill the first cue field (e.g. suggested by the
  /// recommender). The user can freely edit or replace it.
  final String? initialCue;

  @override
  ConsumerState<SetCueScreen> createState() => _SetCueScreenState();
}

class _SetCueScreenState extends ConsumerState<SetCueScreen> {
  /// One controller per self-selected cue field. Starts with a single cue.
  final List<TextEditingController> _cueControllers = [TextEditingController()];
  String? _error;
  // Persisted per-device (see HabitOnboardingPrefs): once dismissed, the
  // explainer stays dismissed across app restarts, not just this session.
  // Null while the stored value is still loading — showIntro treats that as
  // "don't show yet" so the card doesn't flash in then disappear.
  bool? _hasSeenIntro;

  @override
  void initState() {
    super.initState();
    final cue = widget.initialCue?.trim();
    if (cue != null && cue.isNotEmpty) {
      _cueControllers.first.text = cue;
    }
    HabitOnboardingPrefs.hasSeenCueIntro().then((seen) {
      if (mounted) setState(() => _hasSeenIntro = seen);
    });
  }

  void _dismissIntro() {
    setState(() => _hasSeenIntro = true);
    HabitOnboardingPrefs.markCueIntroSeen();
  }

  @override
  void dispose() {
    for (final c in _cueControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _addCue() {
    if (_cueControllers.length >= kMaxCues) return;
    setState(() {
      _cueControllers.add(TextEditingController());
      _error = null;
    });
  }

  void _removeCue(int index) {
    if (_cueControllers.length <= 1) return;
    setState(() {
      _cueControllers.removeAt(index).dispose();
      _error = null;
    });
  }

  /// Collects the non-empty, trimmed self-selected cues.
  List<String> _collectSelfCues() => _cueControllers
      .map((c) => c.text.trim())
      .where((t) => t.isNotEmpty)
      .toList();

  Future<void> _onNext() async {
    final l10n = AppLocalizations.of(context)!;
    final isPreRated = widget.config.cueSource != 'self_selected';

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
      final texts = _collectSelfCues();
      if (texts.isEmpty || texts.first.length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
      // Any additional cue that was typed must be substantive.
      if (texts.skip(1).any((t) => t.length < 3)) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
      cues = [
        for (final t in texts) IntentionCue(text: t, source: 'self_selected'),
      ];
    }

    setState(() => _error = null);

    final extra = <String, dynamic>{
      'behaviorKey': widget.behaviorKey,
      'behaviorLabel': widget.behaviorLabel,
      'config': widget.config,
      'cues': cues,
    };

    // When the guided wizard is enabled, hand off to the animated stitch
    // screen which calls the LLM and reveals the implementation intention.
    // Otherwise go straight to the confirm screen (free-text compose).
    if (widget.config.guidedHabitCreationEnabled) {
      context.push('/habits/new/stitching', extra: extra);
    } else {
      context.push('/habits/new/confirm', extra: extra);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final lang = ref.watch(localeProvider).languageCode;
    final isPreRated = widget.config.cueSource != 'self_selected';
    final showIntro =
        widget.config.onboardingEnabled && _hasSeenIntro == false;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.setCueTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (showIntro) ...[
              OnboardingExplainerCard(
                icon: Icons.alarm_on,
                title: HabitOnboardingCopy.cueTitleFor(lang),
                body: HabitOnboardingCopy.cueBodyFor(lang),
                onDismiss: _dismissIntro,
              ),
              const SizedBox(height: 16),
            ],
            // ── Instruction ────────────────────────────────────────────
            Text(
              isPreRated
                  ? l10n.setCuePreRatedInstruction
                  : l10n.setCueSelfSelectedInstruction,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            // ── Cue input / assigned cues ──────────────────────────────
            if (isPreRated)
              ..._buildAssignedCues(context)
            else
              ..._buildSelfCueFields(context),
            // ── Validation error ───────────────────────────────────────
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _onNext,
              child: Text(l10n.setCueNextButton),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildAssignedCues(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    if (widget.config.assignedCues.isEmpty) {
      return [
        Card(
          child: ListTile(
            leading: const Icon(Icons.hourglass_empty),
            title: Text(l10n.setCueNoneAvailableTitle),
            subtitle: Text(l10n.setCueNoneAvailableSubtitle),
          ),
        ),
      ];
    }
    final total = widget.config.assignedCues.length;
    return [
      ...widget.config.assignedCues.asMap().entries.map((entry) {
        final index = entry.key;
        final cue = entry.value;
        return Card(
          child: ListTile(
            leading: const Icon(Icons.location_on),
            title: Text(cue.text),
            subtitle: Text(
              total > 1
                  ? l10n.setCueAssignedNumbered(index + 1, total)
                  : l10n.setCueAssignedByStudy,
            ),
          ),
        );
      }),
    ];
  }

  List<Widget> _buildSelfCueFields(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final widgets = <Widget>[];
    for (var i = 0; i < _cueControllers.length; i++) {
      widgets.add(
        Padding(
          padding: EdgeInsets.only(top: i == 0 ? 0 : 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  controller: _cueControllers[i],
                  decoration: InputDecoration(
                    labelText: _cueControllers.length == 1
                        ? l10n.setCueLabelSingle
                        : l10n.setCueLabelNumbered(i + 1),
                    hintText: i == 0
                        ? l10n.setCuePlaceholder
                        : l10n.setCueExtraPlaceholder,
                    border: const OutlineInputBorder(),
                  ),
                  maxLength: 200,
                  onChanged: (_) {
                    if (_error != null) setState(() => _error = null);
                  },
                ),
              ),
              if (_cueControllers.length > 1)
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline),
                  tooltip: l10n.setCueRemoveTooltip,
                  onPressed: () => _removeCue(i),
                ),
            ],
          ),
        ),
      );
    }
    // ── Add-cue button (hidden once the max is reached) ──────────────────
    if (_cueControllers.length < kMaxCues) {
      widgets.add(
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _addCue,
            icon: const Icon(Icons.add),
            label: Text(
              l10n.addAnotherCueCount(_cueControllers.length, kMaxCues),
            ),
          ),
        ),
      );
    } else {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            l10n.setCueMaxReachedNote(kMaxCues),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    return widgets;
  }
}
