/// §7.5 Gamification — presentation helpers: badge metadata and the rotating
/// praise messages that accompany a badge/tier-up notification.
library;

import 'package:flutter/material.dart';

/// Static display metadata for a badge key.
class BadgeMeta {
  const BadgeMeta(this.label, this.icon);

  /// Human-readable badge name.
  final String label;

  /// Icon shown on the badge chip.
  final IconData icon;
}

/// §7.5 — the closed set of badge keys the backend can award, with display
/// metadata. Kept in one place so the profile grid, notifications, and any
/// future surfaces stay consistent. Unknown keys fall back to a generic medal.
const Map<String, BadgeMeta> kBadgeMeta = {
  'first_step': BadgeMeta('First Step', Icons.flag_outlined),
  'building_momentum': BadgeMeta('Building Momentum', Icons.trending_up),
  'steady_habit': BadgeMeta('Steady Habit', Icons.calendar_month),
  'second_nature': BadgeMeta('Second Nature', Icons.auto_awesome),
  'habit_architect': BadgeMeta('Habit Architect', Icons.account_tree_outlined),
  'quit_champion': BadgeMeta('Quit Champion', Icons.emoji_events_outlined),
};

/// Resolve badge metadata, with a safe fallback for unknown keys.
BadgeMeta badgeMetaFor(String key) =>
    kBadgeMeta[key] ??
    BadgeMeta(
      key.replaceAll('_', ' '),
      Icons.military_tech_outlined,
    );

/// §7.5 — a small rotating set of praise lines per badge, so the notification
/// copy for a repeatedly-earned kind of badge doesn't repeat verbatim (same
/// "don't repeat the same line" principle as §7.2). Deliberately scoped to
/// real milestones, not every log.
const Map<String, List<String>> kPraiseMessages = {
  'first_step': [
    'You took the first step — your habit is underway!',
    'First step done. This is how habits begin.',
  ],
  'building_momentum': [
    'Momentum! Your reminders are easing off as the habit sticks.',
    'Nice — this habit is starting to run on its own.',
  ],
  'steady_habit': [
    'Two weeks steady. That consistency is doing real work.',
    '14 days in a row — this is becoming automatic.',
  ],
  'second_nature': [
    "Second nature: you barely need reminders anymore.",
    'This habit is now on autopilot. Beautifully done.',
  ],
  'habit_architect': [
    'Habit Architect — you built this one onto an existing routine.',
    'Smart stacking. Anchored habits stick better.',
  ],
  'quit_champion': [
    'Quit Champion — you broke the pattern. Huge.',
    "You've left that habit behind for good. Champion.",
  ],
};

/// Pick a praise line for [badgeKey], rotating by [rotation] so repeats vary.
/// Falls back to a generic congratulation for unknown keys.
String praiseFor(String badgeKey, {int rotation = 0}) {
  final options = kPraiseMessages[badgeKey];
  if (options == null || options.isEmpty) {
    return 'New badge earned — nice work!';
  }
  return options[rotation % options.length];
}
