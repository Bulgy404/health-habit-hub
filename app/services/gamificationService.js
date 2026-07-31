/**
 * §7.5 Gamification — Praise Rewards, Challenges & Levels, and Praise Messages,
 * combined into one system.
 *
 * Design intent (per §7.5): badges are the reward, tier progress is the
 * "level," and praise text is the copy that accompanies a badge/tier-up — not
 * three separate systems, and deliberately NOT the market's fire-on-every-log
 * "Overinvested" pattern.
 *
 * Everything here is a *reinterpretation of data the app already computes*
 * (reminderPlanService's autonomyScore / frequency tier / streak / adherence)
 * — no new tracking. XP and levels are recomputed fresh on every read (like
 * reminderPlanService); only earnedBadges are persisted per user/habit, and
 * only so a badge isn't re-notified.
 */

import { COLLECTION } from '../models/implementationIntention.js';
import {
  FREQUENCIES,
  readReminderConfig,
  computeReminderPlan,
  currentStreakDays,
  adherenceRate,
} from './reminderPlanService.js';

/** Badge keys, tied to meaningful states (not arbitrary counts). */
export const BADGES = {
  FIRST_STEP: 'first_step', // habit created
  BUILDING_MOMENTUM: 'building_momentum', // first reminder tier-up
  STEADY_HABIT: 'steady_habit', // 14-day streak
  SECOND_NATURE: 'second_nature', // habit reaches the 'off' tier
  HABIT_ARCHITECT: 'habit_architect', // created via habit stacking (§7.1)
  QUIT_CHAMPION: 'quit_champion', // a quit habit reaches 'off'
};

export const DEFAULT_GAMIFICATION_CONFIG = {
  xpPerEnactedLog: 10,
  xpPerSrhiSubmission: 25,
  // Streak milestone bonuses (awarded once the streak reaches the day count).
  streakMilestones: { 7: 50, 14: 120, 30: 300 },
  // A tier-up is worth far more than routine logging — advancing automaticity
  // is the point. Awarded per tier index reached above 'daily'.
  xpPerTierUp: 200,
  // Level curve: xpForLevel(n) = round(levelCurveBase * n^levelCurveExp).
  levelCurveBase: 100,
  levelCurveExp: 1.5,
};

/**
 * Read gamification tuning from admin_settings (keys: gamification_*), so
 * thresholds are an experimental factor per study rather than fixed game
 * design. Falls back to DEFAULT_GAMIFICATION_CONFIG.
 * @param {import('mongodb').Db} db
 * @returns {Promise<typeof DEFAULT_GAMIFICATION_CONFIG>}
 */
export async function readGamificationConfig(db) {
  try {
    const docs = await db
      .collection('admin_settings')
      .find({
        key: {
          $in: [
            'gamification_xp_per_log',
            'gamification_xp_per_srhi',
            'gamification_xp_per_tier_up',
            'gamification_level_curve_base',
            'gamification_level_curve_exp',
          ],
        },
      })
      .toArray();
    const byKey = Object.fromEntries(docs.map((d) => [d.key, Number(d.value)]));
    const num = (key, fallback) =>
      Number.isFinite(byKey[key]) ? byKey[key] : fallback;
    return {
      ...DEFAULT_GAMIFICATION_CONFIG,
      xpPerEnactedLog: num(
        'gamification_xp_per_log',
        DEFAULT_GAMIFICATION_CONFIG.xpPerEnactedLog
      ),
      xpPerSrhiSubmission: num(
        'gamification_xp_per_srhi',
        DEFAULT_GAMIFICATION_CONFIG.xpPerSrhiSubmission
      ),
      xpPerTierUp: num(
        'gamification_xp_per_tier_up',
        DEFAULT_GAMIFICATION_CONFIG.xpPerTierUp
      ),
      levelCurveBase: num(
        'gamification_level_curve_base',
        DEFAULT_GAMIFICATION_CONFIG.levelCurveBase
      ),
      levelCurveExp: num(
        'gamification_level_curve_exp',
        DEFAULT_GAMIFICATION_CONFIG.levelCurveExp
      ),
    };
  } catch {
    return { ...DEFAULT_GAMIFICATION_CONFIG };
  }
}

/** Cumulative XP required to have reached level n (n >= 1 → 0 at level 1). */
export function xpForLevel(n, config = DEFAULT_GAMIFICATION_CONFIG) {
  if (n <= 1) return 0;
  return Math.round(
    config.levelCurveBase * Math.pow(n - 1, config.levelCurveExp)
  );
}

/**
 * Resolve a total XP into { level, xpIntoLevel, xpToNextLevel }.
 * @param {number} totalXp
 * @param {typeof DEFAULT_GAMIFICATION_CONFIG} config
 */
export function levelForXp(totalXp, config = DEFAULT_GAMIFICATION_CONFIG) {
  let level = 1;
  while (xpForLevel(level + 1, config) <= totalXp) level += 1;
  const currentThreshold = xpForLevel(level, config);
  const nextThreshold = xpForLevel(level + 1, config);
  return {
    level,
    xpIntoLevel: totalXp - currentThreshold,
    xpToNextLevel: Math.max(nextThreshold - totalXp, 0),
    nextLevelXp: nextThreshold,
  };
}

/** Streak-milestone XP for a given streak length. */
function streakMilestoneXp(streakDays, config) {
  let xp = 0;
  for (const [days, bonus] of Object.entries(config.streakMilestones)) {
    if (streakDays >= Number(days)) xp += bonus;
  }
  return xp;
}

/**
 * Compute XP and the set of *currently-earned* badge keys for a single habit,
 * from data the app already has. Pure — no persistence, no clock reads beyond
 * `now`.
 *
 * @param {object} params
 * @param {object} params.intention  Mongo doc (habitType, creationMode)
 * @param {Array}  params.logs       daily_behavior_logs docs
 * @param {Array}  params.srhiScores weekly SRHI composites, newest first
 * @param {number} params.srhiSubmissionCount  number of submitted SRHI windows
 * @param {object} params.config
 * @param {Date}   params.now
 * @returns {{ xp: number, frequency: string, badges: string[] }}
 */
export function computeHabitGamification({
  intention,
  logs = [],
  srhiScores = [],
  srhiSubmissionCount = 0,
  reminderConfig,
  config = DEFAULT_GAMIFICATION_CONFIG,
  now = new Date(),
}) {
  const plan = computeReminderPlan({
    intention: {
      id: String(intention._id ?? intention.id),
      reminderTime: intention.reminderTime ?? null,
      createdAt: intention.createdAt,
    },
    srhiScores,
    logs,
    config: reminderConfig,
    now,
  });
  const tierIndex = Math.max(FREQUENCIES.indexOf(plan.frequency), 0);
  const streakDays = currentStreakDays(logs, now);
  const enactedCount = logs.filter((l) => l.enacted).length;

  const xp =
    enactedCount * config.xpPerEnactedLog +
    srhiSubmissionCount * config.xpPerSrhiSubmission +
    streakMilestoneXp(streakDays, config) +
    tierIndex * config.xpPerTierUp;

  const badges = [BADGES.FIRST_STEP];
  if (tierIndex >= 1) badges.push(BADGES.BUILDING_MOMENTUM);
  if (streakDays >= 14) badges.push(BADGES.STEADY_HABIT);
  if (plan.frequency === 'off') badges.push(BADGES.SECOND_NATURE);
  if (intention.creationMode === 'stacked') badges.push(BADGES.HABIT_ARCHITECT);
  if (intention.habitType === 'quit' && plan.frequency === 'off') {
    badges.push(BADGES.QUIT_CHAMPION);
  }

  return {
    xp,
    frequency: plan.frequency,
    badges,
    streakDays,
    adherence14d: adherenceRate(logs, 14, now),
  };
}

/**
 * Compute the whole-user gamification summary across active habits, persisting
 * any *newly* earned badges onto each habit's `earnedBadges` (so they are not
 * re-notified) and returning the aggregate plus the list of badges earned this
 * read (for a praise notification client-side).
 *
 * @param {{ db: import('mongodb').Db, userId: string, now?: Date, persist?: boolean }} deps
 * @returns {Promise<{ totalXp: number, level: number, xpIntoLevel: number, xpToNextLevel: number, nextLevelXp: number, badges: Array, newlyEarned: Array, perHabit: Array }>}
 */
export async function computeUserGamification({
  db,
  userId,
  now = new Date(),
  persist = true,
}) {
  const [config, reminderConfig] = await Promise.all([
    readGamificationConfig(db),
    readReminderConfig(db),
  ]);

  const intentions = await db
    .collection(COLLECTION)
    .find({ userId: String(userId), status: 'active' })
    .toArray();

  let totalXp = 0;
  const allBadges = [];
  const newlyEarned = [];
  const perHabit = [];

  for (const doc of intentions) {
    const [srhi, logs] = await Promise.all([
      db
        .collection('srhi_responses')
        .find({ intentionId: doc._id, userId: String(userId) })
        .sort({ weekNumber: -1 })
        .toArray(),
      db
        .collection('daily_behavior_logs')
        .find({ intentionId: doc._id, userId: String(userId) })
        .toArray(),
    ]);
    const srhiScores = srhi
      .filter((s) => s.score != null)
      .map((s) => Number(s.score));
    const srhiSubmissionCount = srhi.filter(
      (s) => s.submittedAt != null || s.score != null
    ).length;

    const result = computeHabitGamification({
      intention: doc,
      logs,
      srhiScores,
      srhiSubmissionCount,
      reminderConfig,
      config,
      now,
    });
    totalXp += result.xp;

    const already = new Set((doc.earnedBadges ?? []).map((b) => b.badgeKey));
    const habitNew = result.badges.filter((k) => !already.has(k));
    for (const badgeKey of habitNew) {
      const entry = { badgeKey, earnedAt: now };
      newlyEarned.push({ intentionId: String(doc._id), ...entry });
      if (persist) {
        await db
          .collection(COLLECTION)
          .updateOne(
            { _id: doc._id },
            { $push: { earnedBadges: entry }, $set: { updatedAt: now } }
          );
      }
    }

    for (const badgeKey of result.badges) {
      allBadges.push({ intentionId: String(doc._id), badgeKey });
    }
    perHabit.push({
      intentionId: String(doc._id),
      behaviorLabel: doc.behaviorLabel ?? null,
      xp: result.xp,
      frequency: result.frequency,
      badges: result.badges,
    });
  }

  const { level, xpIntoLevel, xpToNextLevel, nextLevelXp } = levelForXp(
    totalXp,
    config
  );

  return {
    totalXp,
    level,
    xpIntoLevel,
    xpToNextLevel,
    nextLevelXp,
    badges: allBadges,
    newlyEarned,
    perHabit,
  };
}
