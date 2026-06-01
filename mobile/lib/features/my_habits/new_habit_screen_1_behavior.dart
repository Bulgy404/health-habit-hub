// mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import 'my_habits_provider.dart';

/// Labels for the behavior keys returned by the backend.
const _behaviorLabels = {
  'walking': 'Walking',
  'light_jogging': 'Light jogging',
  'cycling': 'Cycling',
  'structured_calisthenics': 'Structured calisthenics',
  'yoga': 'Yoga',
};

class PickBehaviorScreen extends ConsumerWidget {
  const PickBehaviorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final configAsync = ref.watch(habitConfigProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.newHabit)),
      body: configAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
        data: (config) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: config.behaviorOptions.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final key = config.behaviorOptions[i];
                    final label = _behaviorLabels[key] ?? key;
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
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
