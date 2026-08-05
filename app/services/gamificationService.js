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

import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/implementationIntention.js';
import { COLLECTION as USER_GAMIFICATION } from '../models/userGamification.js';
import { getEnrollment } from './enrollmentNeo4j.js';
import { getDonationDatesByUser } from '../db/adminQueries.js';
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
  FIRST_SHARE: 'first_share', // shared/donated a habit for the first time
  COMMUNITY_CONTRIBUTOR: 'community_contributor', // shares habits regularly
  HABIT_GRADUATE: 'habit_graduate', // graduated: self-sustained, no longer tracked
};

/**
 * Per-habit badges whose predicate can become false again (tier drops, streak
 * breaks) and should therefore be *revoked* — as opposed to `FIRST_STEP` and
 * `HABIT_ARCHITECT`, which record a historical fact (the habit was created;
 * it was created via stacking) that never un-happens. Revoking one of these
 * fires a "get back on track" notification (mobile) instead of a praise one.
 * `FIRST_SHARE` and `COMMUNITY_CONTRIBUTOR` (sharing) are user-level and out
 * of scope here.
 */
export const REVOCABLE_BADGES = new Set([
  BADGES.BUILDING_MOMENTUM,
  BADGES.STEADY_HABIT,
  BADGES.SECOND_NATURE,
  BADGES.QUIT_CHAMPION,
]);

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
  // XP per habit shared/donated to the community. User-level, not tied to
  // any one tracked intention — a share contributes to the shared corpus,
  // it isn't a personal habit-formation event.
  xpPerShare: 20,
  // Consecutive weeks with >=1 share required for Community Contributor —
  // rewards sharing *regularly*, not a single one-off share.
  shareStreakWeeksForBadge: 4,
  // Automaticity-graduation flow (srhiService.submitSrhi): a habit that
  // reached 'off' at some point (reminderPlanService.markAutomaticityReached)
  // and has gone quiet for this many days gets its next SRHI submission
  // treated as a graduation check instead of a plain lapse.
  graduationSilenceDays: 7,
  // SRHI is a 1-7 scale; this is deliberately a bit above the ~4 commonly
  // cited as "habitual" (Verplanken & Orbell) — retiring a habit from active
  // tracking is a bigger, harder-to-reverse call than just noting habit
  // strength, so the bar for it is set higher.
  graduationScoreThreshold: 5,
  // Awarded once, on top of the XP the habit had already earned (which is
  // frozen/banked at graduation — a habit shouldn't lose its accumulated XP
  // just because it exits the active-habit sum).
  graduationBonusXp: 500,
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
            'gamification_xp_per_share',
            'gamification_share_streak_weeks_for_badge',
            'gamification_graduation_silence_days',
            'gamification_graduation_score_threshold',
            'gamification_graduation_bonus_xp',
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
      xpPerShare: num(
        'gamification_xp_per_share',
        DEFAULT_GAMIFICATION_CONFIG.xpPerShare
      ),
      shareStreakWeeksForBadge: num(
        'gamification_share_streak_weeks_for_badge',
        DEFAULT_GAMIFICATION_CONFIG.shareStreakWeeksForBadge
      ),
      graduationSilenceDays: num(
        'gamification_graduation_silence_days',
        DEFAULT_GAMIFICATION_CONFIG.graduationSilenceDays
      ),
      graduationScoreThreshold: num(
        'gamification_graduation_score_threshold',
        DEFAULT_GAMIFICATION_CONFIG.graduationScoreThreshold
      ),
      graduationBonusXp: num(
        'gamification_graduation_bonus_xp',
        DEFAULT_GAMIFICATION_CONFIG.graduationBonusXp
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
 * §7.5 — consecutive weeks (ending this week or last) with at least one
 * share/donation, for the Community Contributor badge. Mirrors
 * `currentStreakDays`'s day-based logic (reminderPlanService.js), one week
 * bucket at a time instead of one day, so "regularly" means sustained,
 * repeated sharing rather than a single one-off contribution.
 * @param {string[]} donationDates ISO timestamps
 * @param {Date} now
 * @returns {number}
 */
export function currentShareStreakWeeks(donationDates, now = new Date()) {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceNow = new Set(
    donationDates.map((d) =>
      Math.floor((now.getTime() - new Date(d).getTime()) / WEEK_MS)
    )
  );
  // A streak may not yet include "this week" (week 0) if nothing has been
  // shared since it started — allow it to instead start from last week, same
  // as currentStreakDays allowing yesterday to anchor an ongoing streak.
  let week = weeksSinceNow.has(0) ? 0 : 1;
  if (!weeksSinceNow.has(week)) return 0;
  let streak = 0;
  while (weeksSinceNow.has(week)) {
    streak += 1;
    week += 1;
  }
  return streak;
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
 * Resolve whether gamification is enabled for a participant, following the same
 * study→group nullable-override pattern as the other §7 feature flags (see
 * habitConfigService.resolveHabitConfig). Defaults to enabled for
 * public/unenrolled users and when no enrollment lookup is available.
 * @param {{ db: import('mongodb').Db, userId: string, neo4jRun?: Function }} deps
 * @returns {Promise<boolean>}
 */
export async function resolveGamificationEnabled({ db, userId, neo4jRun }) {
  if (!neo4jRun) return true;
  let enrollment = null;
  try {
    enrollment = await getEnrollment(neo4jRun, String(userId));
  } catch {
    return true;
  }
  if (!enrollment?.studyId) return true;

  let studyOid;
  try {
    studyOid = new ObjectId(enrollment.studyId);
  } catch {
    return true;
  }
  const study = await db.collection('studies').findOne({ _id: studyOid });
  if (!study) return true;

  let enabled = study.gamificationEnabled !== false;
  if (enrollment.groupId) {
    const group = (study.groups || []).find(
      (g) => g.id?.toString() === enrollment.groupId
    );
    // A non-null group override wins over the study-level baseline.
    if (group?.gamificationEnabled != null) {
      enabled = group.gamificationEnabled !== false;
    }
  }
  return enabled;
}

/** Disabled-state summary — same shape as an enabled read, but all-zero. */
function disabledGamificationSummary() {
  return {
    enabled: false,
    totalXp: 0,
    level: 1,
    xpIntoLevel: 0,
    xpToNextLevel: 0,
    nextLevelXp: 0,
    badges: [],
    newlyEarned: [],
    newlyLost: [],
    perHabit: [],
    shareCount: 0,
    shareStreakWeeks: 0,
  };
}

/**
 * §7.5 — XP and the First Share / Community Contributor badges for
 * sharing/donating habits. User-level (not tied to any one tracked
 * intention), so it reads Neo4j donation timestamps directly rather than a
 * Mongo per-habit doc, and persists any newly-earned badge onto a small
 * per-user Mongo doc (`user_gamification`) instead of onto an intention.
 *
 * Best-effort: with no `neo4jRun` (e.g. some test setups), or on a query
 * error, contributes zero XP/badges rather than failing the whole summary —
 * consistent with how the rest of this service treats missing dependencies.
 *
 * @param {{ db: import('mongodb').Db, userId: string, neo4jRun?: Function, config: typeof DEFAULT_GAMIFICATION_CONFIG, now: Date, persist: boolean }} deps
 * @returns {Promise<{ xp: number, shareCount: number, shareStreakWeeks: number, badges: string[], newlyEarned: Array }>}
 */
async function computeShareGamification({
  db,
  userId,
  neo4jRun,
  config,
  now,
  persist,
}) {
  if (!neo4jRun) {
    return {
      xp: 0,
      shareCount: 0,
      shareStreakWeeks: 0,
      badges: [],
      newlyEarned: [],
    };
  }

  let donationDates = [];
  try {
    donationDates = await getDonationDatesByUser(neo4jRun, String(userId));
  } catch {
    return {
      xp: 0,
      shareCount: 0,
      shareStreakWeeks: 0,
      badges: [],
      newlyEarned: [],
    };
  }

  const shareCount = donationDates.length;
  const shareStreakWeeks = currentShareStreakWeeks(donationDates, now);
  const xp = shareCount * config.xpPerShare;

  const badges = [];
  if (shareCount >= 1) badges.push(BADGES.FIRST_SHARE);
  if (shareStreakWeeks >= config.shareStreakWeeksForBadge) {
    badges.push(BADGES.COMMUNITY_CONTRIBUTOR);
  }

  const newlyEarned = [];
  if (badges.length > 0) {
    const existing = await db
      .collection(USER_GAMIFICATION)
      .findOne({ userId: String(userId) });
    const already = new Set(
      (existing?.earnedBadges ?? []).map((b) => b.badgeKey)
    );
    const userNew = badges.filter((k) => !already.has(k));
    for (const badgeKey of userNew) {
      const entry = { badgeKey, earnedAt: now };
      newlyEarned.push({ intentionId: null, ...entry });
      if (persist) {
        await db.collection(USER_GAMIFICATION).updateOne(
          { userId: String(userId) },
          {
            $push: { earnedBadges: entry },
            $set: { updatedAt: now },
            $setOnInsert: { userId: String(userId) },
          },
          { upsert: true }
        );
      }
    }
  }

  return { xp, shareCount, shareStreakWeeks, badges, newlyEarned };
}

/**
 * Compute the whole-user gamification summary across active habits, persisting
 * any *newly* earned badges onto each habit's `earnedBadges` (so they are not
 * re-notified) and returning the aggregate plus the list of badges earned this
 * read (for a praise notification client-side).
 *
 * Revocable badges (see `REVOCABLE_BADGES`) are also *revoked* when their
 * predicate stops holding (a tier or streak regressed) — `newlyLost` mirrors
 * `newlyEarned` so the client can fire a "get back on track" notification
 * instead of a praise one. `FIRST_STEP`/`HABIT_ARCHITECT` record historical
 * facts and are never revoked.
 *
 * @param {{ db: import('mongodb').Db, userId: string, now?: Date, persist?: boolean }} deps
 * @returns {Promise<{ totalXp: number, level: number, xpIntoLevel: number, xpToNextLevel: number, nextLevelXp: number, badges: Array, newlyEarned: Array, newlyLost: Array, perHabit: Array }>}
 */
export async function computeUserGamification({
  db,
  userId,
  neo4jRun,
  now = new Date(),
  persist = true,
}) {
  // §7.5 — respect the study/group gamification toggle. When off, return a
  // zeroed summary so the client can hide the feature without extra work.
  const enabled = await resolveGamificationEnabled({ db, userId, neo4jRun });
  if (!enabled) return disabledGamificationSummary();

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
  const newlyLost = [];
  const perHabit = [];

  // Automaticity-graduation flow (srhiService.submitSrhi): a graduated habit
  // is no longer 'active' so it drops out of the loop below entirely — fold
  // its frozen `bankedXp` and its (never-revoked) Habit Graduate badge back
  // in here, so graduating a habit doesn't make its earned XP disappear.
  const graduated = await db
    .collection(COLLECTION)
    .find({
      userId: String(userId),
      status: 'completed',
      completedReason: 'graduated',
    })
    .toArray();
  for (const doc of graduated) {
    totalXp += doc.bankedXp ?? 0;
    for (const b of doc.earnedBadges ?? []) {
      allBadges.push({ intentionId: String(doc._id), badgeKey: b.badgeKey });
    }
    perHabit.push({
      intentionId: String(doc._id),
      behaviorLabel: doc.behaviorLabel ?? null,
      xp: doc.bankedXp ?? 0,
      frequency: 'graduated',
      badges: (doc.earnedBadges ?? []).map((b) => b.badgeKey),
    });
  }

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
    const current = new Set(result.badges);
    const habitNew = result.badges.filter((k) => !already.has(k));
    // Revocable badges (see REVOCABLE_BADGES) that were earned before but
    // whose predicate no longer holds — e.g. a tier or streak regressed.
    // FIRST_STEP/HABIT_ARCHITECT are historical facts, never in this set.
    const habitLost = [...already].filter(
      (k) => REVOCABLE_BADGES.has(k) && !current.has(k)
    );

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
    for (const badgeKey of habitLost) {
      newlyLost.push({ intentionId: String(doc._id), badgeKey, lostAt: now });
      if (persist) {
        await db
          .collection(COLLECTION)
          .updateOne(
            { _id: doc._id },
            { $pull: { earnedBadges: { badgeKey } }, $set: { updatedAt: now } }
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

  // §7.5 — sharing/donating habits earns XP and (with sustained sharing) the
  // Community Contributor badge, on top of the per-habit signals above.
  const shareResult = await computeShareGamification({
    db,
    userId,
    neo4jRun,
    config,
    now,
    persist,
  });
  totalXp += shareResult.xp;
  for (const badgeKey of shareResult.badges) {
    allBadges.push({ intentionId: null, badgeKey });
  }
  newlyEarned.push(...shareResult.newlyEarned);

  const { level, xpIntoLevel, xpToNextLevel, nextLevelXp } = levelForXp(
    totalXp,
    config
  );

  return {
    enabled: true,
    totalXp,
    level,
    xpIntoLevel,
    xpToNextLevel,
    nextLevelXp,
    badges: allBadges,
    newlyEarned,
    newlyLost,
    perHabit,
    shareCount: shareResult.shareCount,
    shareStreakWeeks: shareResult.shareStreakWeeks,
  };
}
