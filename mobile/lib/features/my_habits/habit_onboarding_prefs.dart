/// Local (per-device) persistence for the first-run habit-creation onboarding.
library;

import 'package:shared_preferences/shared_preferences.dart';

/// Tracks whether the user has already seen the first-time educational
/// explainers in the habit-creation flow (what a habit is, what cues are).
///
/// Gating is per-device (SharedPreferences) per the product decision: the
/// intro shows once and then stays out of the way. Reinstalling the app resets
/// it. The study/group `onboardingEnabled` flag is checked separately — this
/// only records the "already seen" state.
class HabitOnboardingPrefs {
  const HabitOnboardingPrefs._();

  static const _seenKey = 'habit_onboarding_seen_v1';

  /// Returns true if the educational intro has already been shown once.
  static Future<bool> hasSeenIntro() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_seenKey) ?? false;
  }

  /// Marks the educational intro as seen so it is not shown again.
  static Future<void> markIntroSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_seenKey, true);
  }
}
