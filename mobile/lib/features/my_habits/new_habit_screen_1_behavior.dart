/// Step 1 of 3 in the new habit flow: picking the target behaviour.
library;

// mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/motion.dart';
import 'habit_onboarding_prefs.dart';
import 'habit_onboarding_widgets.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';

/// Screen for selecting the target behaviour when creating a new habit
/// intention.
///
/// Study participants with a restricted behavior catalog pick from a list;
/// public users (empty [HabitConfig.behaviorOptions]) enter their habit as
/// free text instead.
class PickBehaviorScreen extends ConsumerStatefulWidget {
  /// Creates a [PickBehaviorScreen].
  const PickBehaviorScreen({super.key});

  @override
  ConsumerState<PickBehaviorScreen> createState() => _PickBehaviorScreenState();
}

class _PickBehaviorScreenState extends ConsumerState<PickBehaviorScreen> {
  // Persisted per-device (see HabitOnboardingPrefs): once dismissed, the
  // explainer stays dismissed across app restarts, not just this session.
  // Null while the stored value is still loading — showIntro treats that as
  // "don't show yet" so the card doesn't flash in then disappear.
  bool? _hasSeenIntro;

  // Same pattern, separate flag: the §7.3 information-overload explainer is
  // dismissed independently of the "what's a habit?" card above.
  bool? _hasSeenOverloadIntro;

  // §7.4 Habit Distinction — the build/quit choice is made here, up front,
  // because it changes downstream cue guidance (build → trigger cues; quit →
  // disruption/removal cues, per Verplanken & Wood 2006) and is a standard
  // research covariate. Defaults to build.
  HabitType _habitType = HabitType.build;

  @override
  void initState() {
    super.initState();
    HabitOnboardingPrefs.hasSeenHabitIntro().then((seen) {
      if (mounted) setState(() => _hasSeenIntro = seen);
    });
    HabitOnboardingPrefs.hasSeenOverloadGuardIntro().then((seen) {
      if (mounted) setState(() => _hasSeenOverloadIntro = seen);
    });
  }

  void _dismissIntro() {
    setState(() => _hasSeenIntro = true);
    HabitOnboardingPrefs.markHabitIntroSeen();
  }

  void _dismissOverloadIntro() {
    setState(() => _hasSeenOverloadIntro = true);
    HabitOnboardingPrefs.markOverloadGuardIntroSeen();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final configAsync = ref.watch(habitConfigProvider);
    final lang = ref.watch(localeProvider).languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.newHabit)),
      body: configAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
        data: (config) {
          final showIntro = config.onboardingEnabled && _hasSeenIntro == false;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (showIntro)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: OnboardingExplainerCard(
                    icon: Icons.self_improvement,
                    title: HabitOnboardingCopy.habitTitleFor(lang),
                    body: HabitOnboardingCopy.habitBodyFor(lang),
                    onDismiss: _dismissIntro,
                  ),
                ),
              // §7.3 Information Overload — brief rationale so the growing
              // per-type cap doesn't feel arbitrary if it blocks creation.
              // Same dismissible explainer-card style as the "what's a
              // habit?" intro above, and tracked independently so
              // dismissing one doesn't hide the other.
              if (config.informationOverloadEnabled &&
                  _hasSeenOverloadIntro == false)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: OnboardingExplainerCard(
                    icon: Icons.lightbulb_outline,
                    title: l10n.informationOverloadTitle,
                    body: l10n.informationOverloadInfo,
                    onDismiss: _dismissOverloadIntro,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
                child: Center(
                  child: Text(
                    l10n.pickBehaviorTitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                child: Center(
                  child: _HabitTypeSelector(
                    value: _habitType,
                    onChanged: (t) => setState(() => _habitType = t),
                  ),
                ),
              ),
              Expanded(
                child: config.behaviorOptions.isEmpty
                    ? _FreeEntryBehaviorForm(
                        config: config, habitType: _habitType)
                    : _BehaviorList(config: config, habitType: _habitType),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// §7.4 Habit Distinction — prominent build/quit choice. Rendered as a pair
/// of tappable cards using the same green/red border accent as the habit
/// list cards (see `_HabitCard` in my_habits_screen.dart), rather than a
/// stock Material [SegmentedButton], to match this app's card-based
/// selection idiom (cf. the donate form's option picker).
class _HabitTypeSelector extends StatelessWidget {
  const _HabitTypeSelector({required this.value, required this.onChanged});

  final HabitType value;
  final ValueChanged<HabitType> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Row(
      children: [
        Expanded(
          child: _HabitTypeCard(
            icon: Icons.add_circle_outline,
            label: l10n.habitTypeBuild,
            color: Colors.green.shade500,
            selected: value == HabitType.build,
            onTap: () => onChanged(HabitType.build),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _HabitTypeCard(
            icon: Icons.do_not_disturb_alt,
            label: l10n.habitTypeQuit,
            color: Colors.red.shade400,
            selected: value == HabitType.quit,
            onTap: () => onChanged(HabitType.quit),
          ),
        ),
      ],
    );
  }
}

/// A single build/quit option card. Unselected uses the app's neutral card
/// border; selected tints the fill and border in [color], reusing the same
/// light/dark tint recipe as the "logged today" habit card background
/// (`Colors.X.shade50` in light mode, `Colors.X.shade900.withAlpha(90)` in
/// dark) so it holds up in both themes.
class _HabitTypeCard extends StatefulWidget {
  const _HabitTypeCard({
    required this.icon,
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_HabitTypeCard> createState() => _HabitTypeCardState();
}

class _HabitTypeCardState extends State<_HabitTypeCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller =
        AnimationController(vsync: this, value: widget.selected ? 1 : 0);
  }

  @override
  void didUpdateWidget(covariant _HabitTypeCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A user can flip between cards quickly — retarget from the live value
    // instead of restarting so a fast double-tap doesn't jump.
    // AppSpring.quick, not .standard: this is a plain selection color/border
    // change (state indication, not momentum-driven), so it wants to be
    // fast — not the reveal-grade timing .standard is tuned for.
    if (oldWidget.selected != widget.selected) {
      _controller.animateWithSpring(
        widget.selected ? 1 : 0,
        spring: AppSpring.quick,
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedFill =
        isDark ? widget.color.withAlpha(40) : widget.color.withAlpha(25);
    final unselectedBorder = context.appColors.border;
    final contentColor = widget.selected
        ? widget.color
        : Theme.of(context).textTheme.bodyMedium?.color;

    return Semantics(
      button: true,
      selected: widget.selected,
      label: widget.label,
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            final t = _controller.value;
            return Container(
              padding:
                  const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
              decoration: BoxDecoration(
                color: Color.lerp(Colors.transparent, selectedFill, t),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Color.lerp(unselectedBorder, widget.color, t)!,
                  width: 1 + 0.5 * t,
                ),
              ),
              child: child,
            );
          },
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(widget.icon, color: contentColor, size: 22),
              const SizedBox(height: 6),
              Text(
                widget.label,
                style: TextStyle(
                  color: contentColor,
                  fontWeight:
                      widget.selected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Catalog picker shown when the study restricts behavior options.
class _BehaviorList extends StatelessWidget {
  const _BehaviorList({required this.config, required this.habitType});

  final HabitConfig config;
  final HabitType habitType;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: config.behaviorOptions.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final option = config.behaviorOptions[i];
        return Card(
          child: ListTile(
            title: Text(option.label),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: () => context.push(
              '/habits/new/cue',
              extra: {
                'behaviorKey': option.key,
                'behaviorLabel': option.label,
                'habitType': habitType.wire,
                'config': config,
              },
            ),
          ),
        );
      },
    );
  }
}

/// Free-text habit entry for public users (no behavior catalog).
class _FreeEntryBehaviorForm extends StatefulWidget {
  const _FreeEntryBehaviorForm({required this.config, required this.habitType});

  final HabitConfig config;
  final HabitType habitType;

  @override
  State<_FreeEntryBehaviorForm> createState() => _FreeEntryBehaviorFormState();
}

class _FreeEntryBehaviorFormState extends State<_FreeEntryBehaviorForm> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Derives a stable snake_case key from the entered label, matching the
  /// normalisation used for catalog keys in the admin portal.
  String _slugify(String label) {
    final slug = label
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), '_')
        .replaceAll(RegExp(r'[^a-z0-9_]'), '');
    return slug.isEmpty ? 'custom' : slug;
  }

  void _onNext(AppLocalizations l10n) {
    final label = _controller.text.trim();
    if (label.length < 3) {
      setState(() => _error = l10n.describeYourHabitMinLength);
      return;
    }
    context.push(
      '/habits/new/cue',
      extra: {
        'behaviorKey': _slugify(label),
        'behaviorLabel': label,
        'habitType': widget.habitType.wire,
        'config': widget.config,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    // This form sits inside the pick-behaviour screen's Expanded slot, below
    // the (optional) "what's a habit?" and information-overload explainer
    // cards — when both are showing, they can leave too little height for a
    // plain fixed Column to fit its TextField + button. SingleChildScrollView
    // instead of a bare Column so the button is always reachable by
    // scrolling rather than getting clipped off-screen with no way back.
    // Spacer() only worked in the old fixed-height Column and doesn't apply
    // inside a scrollable's unbounded height, so it's replaced with a fixed
    // gap.
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _controller,
            decoration: InputDecoration(
              labelText: l10n.yourHabitLabel,
              hintText: l10n.yourHabitHint,
              border: const OutlineInputBorder(),
            ),
            textCapitalization: TextCapitalization.sentences,
            maxLength: 100,
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _onNext(l10n),
          ),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => _onNext(l10n),
            child: Text(l10n.nextButton),
          ),
        ],
      ),
    );
  }
}
