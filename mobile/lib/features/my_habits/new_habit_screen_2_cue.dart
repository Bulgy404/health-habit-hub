/// Step 2 of the new habit flow: setting the implementation intention cues.
library;

// mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
import 'package:flutter/cupertino.dart' show CupertinoSwitch;
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
  // §7.1 — opt-in: when stacking onto a free-typed (not already tracked)
  // anchor, offers to also start tracking the anchor itself as a habit.
  // Only meaningful while _stackedOnId is null (an already-tracked anchor
  // has nothing to add).
  bool _alsoTrackAnchor = false;
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

    final anchorText = _anchorController.text.trim();
    // §7.1 — stacked if the user picked an existing anchor OR free-typed one.
    final isStacked = _stackedOnId != null || anchorText.isNotEmpty;

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
      if (isStacked) {
        // Stacking anchors the habit to an existing routine — that anchor
        // *is* the trigger (see anchorText below), so a cue is genuinely
        // optional here, not auto-derived to satisfy a hidden requirement.
        cues = [
          for (final t in texts) IntentionCue(text: t, source: 'self_selected'),
        ];
      } else {
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
    }

    setState(() => _error = null);

    final extra = <String, dynamic>{
      'behaviorKey': widget.behaviorKey,
      'behaviorLabel': widget.behaviorLabel,
      'config': widget.config,
      'habitType': widget.habitType.wire,
      'cues': cues,
      // §7.1 Habit Stacking — anchor reference (when tracked), free-typed
      // anchor text (donated as an anchor), the opt-in to also track the
      // anchor as its own habit, and the creation mode.
      'stackedOn': ?_stackedOnId,
      'anchorText': anchorText.isNotEmpty ? anchorText : null,
      'alsoTrackAnchor': _stackedOnId == null && _alsoTrackAnchor,
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
                body: HabitOnboardingCopy.cueBodyFor(
                  lang,
                  includeStackingHint: widget.config.habitStackingEnabled,
                ),
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
  /// already have. Picking an existing active habit sets [_stackedOnId] to
  /// its id (a real STACKED_WITH edge in the graph); the anchor's label is
  /// kept as its own field ([_anchorController]) rather than folded into the
  /// cue text, so stacking reads as a distinct mechanism from typing a cue —
  /// it's shown separately on the confirm/detail screens. The anchor need
  /// not be tracked: the free-text field records an anchor the app doesn't
  /// know about, still tagging this habit as stacked so the research signal
  /// (creationMode) is captured.
  Widget _buildStackingCard(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final intentionsAsync = ref.watch(intentionsProvider);
    final active = intentionsAsync.maybeWhen(
      data: (list) => list.where((i) => i.status == 'active').toList(),
      orElse: () => const <Intention>[],
    );

    return Card(
      child: ExpansionTile(
        // ExpansionTile draws its own top/bottom divider border by default
        // (shape/collapsedShape), which shows up as two thin lines inside
        // the Card that already provides its own border — suppress it.
        shape: const RoundedRectangleBorder(side: BorderSide.none),
        collapsedShape: const RoundedRectangleBorder(side: BorderSide.none),
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
                    // Picking a tracked habit fills the free-text field with
                    // its label (kept as its own field, not a cue) and
                    // clears any opt-in from a previous free-typed anchor —
                    // an already-tracked anchor never needs re-creating.
                    _anchorController.text =
                        active.firstWhere((i) => i.id == id).behaviorLabel;
                    _alsoTrackAnchor = false;
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
            onChanged: (_) => setState(() {
              // A tracked pick and a free-typed anchor are mutually
              // exclusive — typing here after picking from the dropdown
              // means the user is overriding that choice. Always rebuild
              // (not just when clearing the pick) so the opt-in checkbox
              // below shows/hides as the anchor text is typed/cleared.
              _stackedOnId = null;
            }),
          ),
          // Opt-in: only offered for a free-typed anchor that isn't already
          // one of the user's tracked habits — picking from the dropdown
          // above means it's tracked already, nothing to add.
          if (_stackedOnId == null && _anchorController.text.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.stackAlsoTrackAnchor(_anchorController.text.trim()),
                  ),
                ),
                const SizedBox(width: 8),
                CupertinoSwitch(
                  value: _alsoTrackAnchor,
                  onChanged: (v) => setState(() => _alsoTrackAnchor = v),
                ),
              ],
            ),
          ],
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
