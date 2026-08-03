/// Step 2 of the new habit flow: setting the implementation intention cues.
library;

// mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
import '../../theme/app_icons.dart';
import 'habit_onboarding_prefs.dart';
import 'habit_onboarding_widgets.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';

/// Maximum number of self-selected cues a user can attach to one habit.
const int kMaxCues = 7;

/// Screen for entering the "when" and "where" implementation intention cues.
class SetCueScreen extends ConsumerStatefulWidget {
  /// Creates a [SetCueScreen] for [behaviorKey].
  const SetCueScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    required this.habitType,
    this.initialCue,
    super.key,
  });

  /// The selected behaviour key from the previous step.
  final String behaviorKey;

  /// Human-readable label for the selected behaviour.
  final String behaviorLabel;

  /// Habit configuration loaded from the backend.
  final HabitConfig config;

  /// Whether the participant is building or quitting a habit (§7.4). Carried
  /// through so it reaches the create call, and so cue guidance can differ.
  final HabitType habitType;

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
  // §7.1 Habit Stacking — when the user stacks onto an existing habit, the
  // anchor intention's id (null = standalone). Set by the stacking picker.
  String? _stackedOnId;
  // Free-typed anchor habit text to donate through /habits/share, tagged as an
  // anchor (§7.1). The anchor need not already be tracked in the app.
  final TextEditingController _anchorController = TextEditingController();
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
    _anchorController.dispose();
    super.dispose();
  }

  /// Effective cap on self-selected cues: an admin-configured `'single'`
  /// study allows exactly one, while `'multi'` just means "more than one"
  /// with no specific configured count, so it falls back to the general
  /// sanity ceiling [kMaxCues].
  int get _maxCues => widget.config.cueCount == 'single' ? 1 : kMaxCues;

  void _addCue() {
    if (_cueControllers.length >= _maxCues) return;
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

    final anchorText = _anchorController.text.trim();
    // §7.1 — stacked if the user picked an existing anchor OR free-typed one.
    final isStacked = _stackedOnId != null || anchorText.isNotEmpty;
    final extra = <String, dynamic>{
      'behaviorKey': widget.behaviorKey,
      'behaviorLabel': widget.behaviorLabel,
      'config': widget.config,
      'habitType': widget.habitType.wire,
      'cues': cues,
      // §7.1 Habit Stacking — anchor reference (when tracked), free-typed
      // anchor text (donated as an anchor), and the creation mode.
      'stackedOn': ?_stackedOnId,
      'anchorText': anchorText.isNotEmpty ? anchorText : null,
      'creationMode': isStacked ? 'stacked' : 'standalone',
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
            // ── §7.1 Habit Stacking — "stack onto an existing habit" ────
            if (widget.config.habitStackingEnabled) ...[
              _buildStackingCard(context),
              const SizedBox(height: 16),
            ],
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

  /// §7.1 Habit Stacking — lets the user anchor this new habit onto one they
  /// already have. Picking an existing active habit sets [_stackedOnId] to its
  /// id (a real STACKED_WITH edge in the graph) and prefills the first cue with
  /// "After I [anchor]". The anchor need not be tracked: the free-text field
  /// records an anchor the app doesn't know about, still tagging this habit as
  /// stacked so the research signal (creationMode) is captured.
  Widget _buildStackingCard(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final intentionsAsync = ref.watch(intentionsProvider);
    final active = intentionsAsync.maybeWhen(
      data: (list) => list.where((i) => i.status == 'active').toList(),
      orElse: () => const <Intention>[],
    );

    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.link),
        title: Text(l10n.stackOntoExistingHabitTitle),
        subtitle: Text(l10n.stackOntoExistingHabitSubtitle),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          if (active.isNotEmpty)
            DropdownButtonFormField<String>(
              initialValue: _stackedOnId,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: l10n.stackAnchorPickLabel,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem<String>(
                  value: null,
                  child: Text(l10n.stackAnchorNone),
                ),
                for (final i in active)
                  DropdownMenuItem<String>(
                    value: i.id,
                    child: Text(
                      i.behaviorLabel,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (id) {
                setState(() {
                  _stackedOnId = id;
                  if (id != null) {
                    final anchor =
                        active.firstWhere((i) => i.id == id).behaviorLabel;
                    _anchorController.text = anchor;
                    // Prefill the first cue as the anchor trigger.
                    if (widget.config.cueSource == 'self_selected') {
                      _cueControllers.first.text = 'After I $anchor';
                    }
                  }
                });
              },
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _anchorController,
            decoration: InputDecoration(
              labelText: l10n.stackAnchorFreeTextLabel,
              hintText: l10n.stackAnchorFreeTextHint,
              border: const OutlineInputBorder(),
            ),
            textCapitalization: TextCapitalization.sentences,
            maxLength: 100,
          ),
        ],
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
    if (_cueControllers.length < _maxCues) {
      widgets.add(
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _addCue,
            icon: const Icon(AppIcons.addMore),
            label: Text(
              l10n.addAnotherCueCount(_cueControllers.length, _maxCues),
            ),
          ),
        ),
      );
    } else {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            l10n.setCueMaxReachedNote(_maxCues),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    return widgets;
  }
}
