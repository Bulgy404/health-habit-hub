/// §7.5 Gamification — full badge catalog, showing both earned badges and
/// the ones still to unlock (greyed out), opened by tapping the Progress
/// card in Settings.
library;

// mobile/lib/screens/achievements_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/my_habits/gamification_ui.dart';
import '../features/my_habits/my_habits_models.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../l10n/app_localizations.dart';

/// Shows every badge in [kBadgeMeta] — earned badges in full colour, locked
/// ones greyed out — rather than [ProfileScreen]'s compact "earned only"
/// chip row, so participants can see what's still achievable.
class AchievementsScreen extends ConsumerWidget {
  /// Creates an [AchievementsScreen].
  const AchievementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final gamificationAsync = ref.watch(gamificationProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.achievementsTitle)),
      body: gamificationAsync.when(
        data: (g) {
          final earnedKeys = g.distinctBadgeKeys;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _LevelHeader(gamification: g),
              const SizedBox(height: 20),
              Text(l10n.achievementsSubtitle,
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: Colors.grey)),
              const SizedBox(height: 16),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.5,
                children: [
                  for (final entry in kBadgeMeta.entries)
                    _BadgeTile(
                      meta: entry.value,
                      earned: earnedKeys.contains(entry.key),
                    ),
                ],
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }
}

class _LevelHeader extends StatelessWidget {
  const _LevelHeader({required this.gamification});
  final Gamification gamification;

  @override
  Widget build(BuildContext context) {
    final g = gamification;
    final total = g.xpIntoLevel + g.xpToNextLevel;
    final progress = total > 0 ? (g.xpIntoLevel / total).clamp(0.0, 1.0) : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.stars_outlined, size: 22),
            const SizedBox(width: 10),
            Text('Level ${g.level}',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16)),
            const Spacer(),
            Text('${g.xpToNextLevel} XP to next'),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(value: progress, minHeight: 8),
        ),
      ],
    );
  }
}

class _BadgeTile extends StatelessWidget {
  const _BadgeTile({required this.meta, required this.earned});
  final BadgeMeta meta;
  final bool earned;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final bg = earned ? scheme.primaryContainer : scheme.surfaceContainerLow;
    final fg = earned ? scheme.onPrimaryContainer : scheme.onSurfaceVariant;
    return Opacity(
      opacity: earned ? 1.0 : 0.55,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              earned ? meta.icon : Icons.lock_outline,
              color: fg,
              size: 28,
            ),
            const SizedBox(height: 8),
            Text(
              meta.label,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .labelMedium
                  ?.copyWith(color: fg, fontWeight: FontWeight.w600),
            ),
            if (!earned) ...[
              const SizedBox(height: 2),
              Text(
                l10n.achievementsLockedTag,
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: fg),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
