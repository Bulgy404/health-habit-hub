/// Step 1 of 3 in the new habit flow: picking the target behaviour.
library;

// mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
import 'habit_onboarding_widgets.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';

/// Localized labels for the behavior keys returned by the backend. Mirrors
/// the platform activity-type catalog's `label_en`/`label_de`/`label_ja`
/// (see `app/models/activityType.js`); falls back to the raw key for any
/// behavior option outside this fixed catalog set.
Map<String, String> _behaviorLabels(AppLocalizations l10n) => {
      'walking': l10n.behaviorWalking,
      'light_jogging': l10n.behaviorLightJogging,
      'cycling': l10n.behaviorCycling,
      'structured_calisthenics': l10n.behaviorStructuredCalisthenics,
      'yoga': l10n.behaviorYoga,
    };

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
  // Session-only dismiss: the explainer shows whenever onboarding is enabled,
  // until the user taps the card's close button on this screen.
  bool _introDismissed = false;

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
          final showIntro = config.onboardingEnabled && !_introDismissed;
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
                    onDismiss: () => setState(() => _introDismissed = true),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
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
                    ? _FreeEntryBehaviorForm(config: config)
                    : _BehaviorList(config: config),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Catalog picker shown when the study restricts behavior options.
class _BehaviorList extends StatelessWidget {
  const _BehaviorList({required this.config});

  final HabitConfig config;

  @override
  Widget build(BuildContext context) {
    final labels = _behaviorLabels(AppLocalizations.of(context)!);
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: config.behaviorOptions.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final key = config.behaviorOptions[i];
        final label = labels[key] ?? key;
        return Card(
          child: ListTile(
            title: Text(label),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: () => context.push(
              '/habits/new/cue',
              extra: {
                'behaviorKey': key,
                'behaviorLabel': label,
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
  const _FreeEntryBehaviorForm({required this.config});

  final HabitConfig config;

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
