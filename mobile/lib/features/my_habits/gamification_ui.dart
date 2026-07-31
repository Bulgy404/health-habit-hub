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
  'community_contributor':
      BadgeMeta('Community Contributor', Icons.diversity_3_outlined),
  'habit_graduate': BadgeMeta('Habit Graduate', Icons.school_outlined),
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
  'community_contributor': [
    'Community Contributor — thanks for sharing, week after week.',
    'Your shared habits are helping others find theirs. Keep it up.',
  ],
  'habit_graduate': [
    "Habit Graduate — this one's fully yours now. You don't need us anymore.",
    "Graduated! This habit runs on its own now — truly second nature.",
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

/// A badge that was revoked because its tier/streak regressed (see
/// `REVOCABLE_BADGES` in `gamificationService.js`) — never for `first_step`,
/// `habit_architect`, or `community_contributor`, which aren't revocable.
/// Deliberately supportive, not shaming: a lapse is normal, not a failure.
const Map<String, List<String>> kGetBackOnTrackMessages = {
  'building_momentum': [
    'A quieter week for this habit — reminders are back to help you restart.',
    'This one slipped a little. Let\'s pick it back up.',
  ],
  'steady_habit': [
    'The streak broke, but the habit hasn\'t — let\'s start a new one today.',
    'Fourteen days is still within reach. Back on track starts now.',
  ],
  'second_nature': [
    'This habit needs a bit more support again — that\'s completely normal.',
    'Automatic habits can wobble too. A few reminders will help it stick again.',
  ],
  'quit_champion': [
    'This one crept back in — no judgment, just a fresh restart.',
    'Slips happen on the way to quitting for good. Let\'s get back to it.',
  ],
};

/// Pick a "get back on track" line for a revoked [badgeKey], rotating by
/// [rotation]. Falls back to a generic, still-supportive nudge.
String getBackOnTrackFor(String badgeKey, {int rotation = 0}) {
  final options = kGetBackOnTrackMessages[badgeKey];
  if (options == null || options.isEmpty) {
    return 'This habit could use a little support again — let\'s get back to it.';
  }
  return options[rotation % options.length];
}
