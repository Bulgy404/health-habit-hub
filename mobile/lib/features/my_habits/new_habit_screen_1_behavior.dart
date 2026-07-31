/// Step 1 of 3 in the new habit flow: picking the target behaviour.
library;

// mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
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
  }

  void _dismissIntro() {
    setState(() => _hasSeenIntro = true);
    HabitOnboardingPrefs.markHabitIntroSeen();
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
              if (config.informationOverloadEnabled)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Card(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.lightbulb_outline, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              l10n.informationOverloadInfo,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: _HabitTypeSelector(
                  value: _habitType,
                  onChanged: (t) => setState(() => _habitType = t),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                child: Text(
                  l10n.pickBehaviorTitle,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
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

/// §7.4 Habit Distinction — prominent build/quit choice. Rendered as a pair of
/// segmented buttons (not a buried field) so the distinction is deliberate.
class _HabitTypeSelector extends StatelessWidget {
  const _HabitTypeSelector({required this.value, required this.onChanged});

  final HabitType value;
  final ValueChanged<HabitType> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    return SegmentedButton<HabitType>(
      segments: [
        ButtonSegment(
          value: HabitType.build,
          icon: const Icon(Icons.add_circle_outline),
          label: Text(l10n.habitTypeBuild),
        ),
        ButtonSegment(
          value: HabitType.quit,
          icon: const Icon(Icons.do_not_disturb_alt),
          label: Text(l10n.habitTypeQuit),
        ),
      ],
      selected: {value},
      onSelectionChanged: (s) => onChanged(s.first),
      style: ButtonStyle(
        // Tint the selection to match the card colours used elsewhere
        // (green = build, red = quit) for a consistent visual language.
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (!states.contains(WidgetState.selected)) return null;
          return value == HabitType.build
              ? scheme.primaryContainer
              : scheme.errorContainer;
        }),
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
    return Padding(
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
          const Spacer(),
          FilledButton(
            onPressed: () => _onNext(l10n),
            child: Text(l10n.nextButton),
          ),
        ],
      ),
    );
  }
}
