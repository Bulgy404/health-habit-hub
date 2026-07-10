/// Local (per-device) persistence for the first-run habit-creation onboarding.
library;

import 'package:shared_preferences/shared_preferences.dart';

/// Tracks whether the user has already seen the first-time educational
/// explainers in the habit-creation flow (what a habit is, what cues are).
///
/// Gating is per-device (SharedPreferences) per the product decision: each
/// explainer shows once and then stays out of the way. Reinstalling the app
/// resets it. The study/group `onboardingEnabled` flag is checked
/// separately — this only records the "already seen" state.
///
/// The habit-creation flow has two separate explainer cards (step 1: "what's
/// a habit?", step 2: "what's a cue?"), each independently dismissible
/// within a single pass through the flow — so each is tracked under its own
/// key rather than a single combined flag, which would incorrectly suppress
/// the step-2 card the first time a user dismisses the step-1 card.
class HabitOnboardingPrefs {
  const HabitOnboardingPrefs._();

  static const _habitIntroKey = 'habit_onboarding_seen_v1';
  static const _cueIntroKey = 'cue_onboarding_seen_v1';

  /// Returns true if the "what's a habit?" explainer has already been
  /// dismissed once.
  static Future<bool> hasSeenHabitIntro() => _hasSeen(_habitIntroKey);

  /// Marks the "what's a habit?" explainer as seen so it is not shown again.
  static Future<void> markHabitIntroSeen() => _markSeen(_habitIntroKey);

  /// Returns true if the "what's a cue?" explainer has already been
  /// dismissed once.
  static Future<bool> hasSeenCueIntro() => _hasSeen(_cueIntroKey);

  /// Marks the "what's a cue?" explainer as seen so it is not shown again.
  static Future<void> markCueIntroSeen() => _markSeen(_cueIntroKey);

  static Future<bool> _hasSeen(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(key) ?? false;
  }

  static Future<void> _markSeen(String key) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, true);
  }
}
