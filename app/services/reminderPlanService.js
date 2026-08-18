/**
 * Adaptive reminder planning — computes how often a participant should be
 * reminded of an implementation intention, fading reminders as the habit
 * becomes automatic.
 *
 * Rationale (habit-formation literature, e.g. Lally et al. 2010): reminders
 * are scaffolding. As self-reported habit strength (SRHI) and observed
 * adherence rise, automaticity replaces the external cue and reminders should
 * fade — keeping them constant risks reactance and reminder blindness, while
 * removing them too early collapses fragile habits. We therefore use a
 * transparent, pre-registerable score instead of an opaque ML model (per-user
 * samples are far too small to train on, and researchers must be able to
 * explain and tune the fading rule per study arm).
 *
 *   autonomy = wSrhi · srhiNorm + wAdherence · adherence14d + wStreak · streakNorm
 *
 *   srhiNorm     — latest weekly SRHI score mapped from the 1–7 scale to 0–1
 *   adherence14d — fraction of the last 14 days with an `enacted: true` log
 *   streakNorm   — current consecutive-day streak capped at 14, scaled to 0–1
 *
 * The score maps to a reminder tier with HYSTERESIS:
 *   - stepping DOWN in frequency (fewer reminders) additionally requires the
 *     two most recent SRHI scores to support the tier — one good week is not
 *     yet a habit;
 *   - stepping UP happens immediately: if 7-day adherence falls below the
 *     recovery threshold, the plan returns to daily reminders regardless of
 *     SRHI.
 *
 * All weights and thresholds are overridable via `admin_settings` keys
 * (`reminder_*`), making reminder fading itself an experimental factor.
 */

/** Tier order: most → least frequent. */
export const FREQUENCIES = [
  'daily',
  'every_2_days',
  'twice_weekly',
  'weekly',
  'off',
];

export const DEFAULT_CONFIG = {
  weightSrhi: 0.5,
  weightAdherence: 0.35,
  weightStreak: 0.15,
  // Autonomy-score lower bounds per tier (index-aligned with FREQUENCIES[1..])
  tierThresholds: [0.45, 0.6, 0.75, 0.9],
  // 7-day adherence below this snaps the plan back to daily reminders
  recoveryAdherence: 0.5,
  streakCapDays: 14,
  // Weekly-cadence (§ weekly-frequency habits) equivalents of the two
  // constants above. Plain constants, not admin_settings-tunable — matches
  // streakCapDays, which also isn't tunable today; weekly cadence shouldn't
  // get more tunable surface than daily already has.
  streakCapWeeks: 8,
  weeklyAdherenceWindowWeeks: 2,
};

/**
 * Normalizes a raw `intention.cadence` value (possibly absent, null, or
 * malformed — e.g. a legacy document predating this field) into the shape
 * every consumer can rely on. This is the single backward-compatibility
 * point: a missing/invalid cadence and an explicit `{type:'daily'}` are
 * indistinguishable from here on, so every daily-cadence code path this
 * feature touches behaves identically for old and new documents.
 * @param {{type?: string, targetPerWeek?: number}|null|undefined} cadence
 * @returns {{type: 'daily'|'weekly', targetPerWeek: number|null}}
 */
export function normalizeCadence(cadence) {
  if (cadence?.type === 'weekly' && Number.isInteger(cadence.targetPerWeek)) {
    return { type: 'weekly', targetPerWeek: cadence.targetPerWeek };
  }
  return { type: 'daily', targetPerWeek: null };
}

/**
 * Read reminder configuration, applying admin_settings overrides
 * (keys: reminder_weight_srhi, reminder_weight_adherence,
 * reminder_weight_streak, reminder_recovery_adherence).
 * @param {import('mongodb').Db} db
 * @returns {Promise<typeof DEFAULT_CONFIG>}
 */
export async function readReminderConfig(db) {
  const docs = await db
    .collection('admin_settings')
    .find({
      key: {
        $in: [
          'reminder_weight_srhi',
          'reminder_weight_adherence',
          'reminder_weight_streak',
          'reminder_recovery_adherence',
        ],
      },
    })
    .toArray();
  const byKey = Object.fromEntries(docs.map((d) => [d.key, Number(d.value)]));
  const num = (key, fallback) =>
    Number.isFinite(byKey[key]) ? byKey[key] : fallback;
  return {
    ...DEFAULT_CONFIG,
    weightSrhi: num('reminder_weight_srhi', DEFAULT_CONFIG.weightSrhi),
    weightAdherence: num(
      'reminder_weight_adherence',
      DEFAULT_CONFIG.weightAdherence
    ),
    weightStreak: num('reminder_weight_streak', DEFAULT_CONFIG.weightStreak),
    recoveryAdherence: num(
      'reminder_recovery_adherence',
      DEFAULT_CONFIG.recoveryAdherence
    ),
  };
}

/**
 * §7.2 Implementation Intention Reminder — default rotating phrasing templates.
 *
 * Repeating the exact intention sentence verbatim every time risks its own
 * habituation / reminder-blindness, so the app rotates through a small set of
 * phrasings. Templates use {cue} and {behavior} placeholders. Kept in an
 * admin-editable collection (admin_settings, same spirit as reminder_weight_*)
 * so researchers can vary/test phrasing per study arm.
 */
export const DEFAULT_II_REMINDER_TEMPLATES = [
  'Remember: {cue} → {behavior}',
  'Your plan for today: when {cue}, {behavior}',
  'Time to check in — {cue} means: {behavior}',
];

/**
 * Read the admin-editable §7.2 reminder phrasing templates from admin_settings
 * (key: reminder_ii_templates, a JSON array of strings). Falls back to
 * DEFAULT_II_REMINDER_TEMPLATES when unset, empty, or malformed.
 * @param {import('mongodb').Db} db
 * @returns {Promise<string[]>}
 */
export async function readReminderTemplates(db) {
  try {
    const doc = await db
      .collection('admin_settings')
      .findOne({ key: 'reminder_ii_templates' });
    const raw = doc?.value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((t) => typeof t === 'string' && t.trim())
    ) {
      return parsed;
    }
  } catch {
    // Fall through to defaults on any read/parse error.
  }
  return DEFAULT_II_REMINDER_TEMPLATES;
}

/** Map an SRHI composite (1–7) to 0–1; null → 0 (no measurement yet). */
function srhiNorm(score) {
  if (score == null || !Number.isFinite(score)) return 0;
  return Math.min(Math.max((score - 1) / 6, 0), 1);
}

/**
 * Current consecutive-day streak ending today/yesterday, from log documents.
 * @param {Array<{date: string, enacted: boolean}>} logs
 * @param {Date} now
 */
export function currentStreakDays(logs, now = new Date()) {
  const enacted = new Set(
    logs.filter((l) => l.enacted).map((l) => String(l.date))
  );
  let streak = 0;
  const day = new Date(now);
  // A streak may end yesterday (today simply not logged yet)
  if (!enacted.has(day.toISOString().slice(0, 10))) {
    day.setDate(day.getDate() - 1);
  }
  while (enacted.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/**
 * Fraction of the trailing `days` with enacted logs. The window covers the
 * `days` calendar days BEFORE today (today is excluded — it may simply not be
 * logged yet and must not count against the participant).
 */
export function adherenceRate(logs, days, now = new Date()) {
  const window = new Set();
  for (let offset = 1; offset <= days; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    window.add(d.toISOString().slice(0, 10));
  }
  const enactedInWindow = logs.filter(
    (l) => l.enacted && window.has(String(l.date))
  );
  return Math.min(
    new Set(enactedInWindow.map((l) => String(l.date))).size / days,
    1
  );
}

// ---------------------------------------------------------------------------
// Weekly-cadence helpers (§ weekly-frequency habits)
// ---------------------------------------------------------------------------
//
// currentStreakDays/adherenceRate above mix a *local-time* `.setDate()` step
// with a *UTC* `.toISOString()` key — safe only by accident (as long as the
// process runs in UTC), and at risk of the same off-by-one-day DST bug
// documented in mobile/lib/widgets/contribution_graph_widget.dart. The
// helpers below are new code, so they avoid that mixing from the start:
// `now`'s local Y/M/D is read exactly once (toUtcMidnight), and every
// subsequent day-step happens in UTC.

/** UTC-midnight Date representing the same calendar day as `date`'s local Y/M/D. */
function toUtcMidnight(date) {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
}

/**
 * Monday-anchored week key for a date already normalized to UTC midnight
 * (via toUtcMidnight, or parsed from a `YYYY-MM-DD` log date string — those
 * parse as UTC midnight per the ISO 8601 date-only spec). Two dates in the
 * same Monday-Sunday week always produce the same key; the key itself is
 * just that week's Monday as `YYYY-MM-DD` — stable and comparable, not a
 * real ISO week number (which has gnarlier year-boundary edge cases we don't
 * need to solve for internal bucketing).
 */
function weekKeyUtc(utcDate) {
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = (dayOfWeek + 6) % 7; // Mon->0, Tue->1, ..., Sun->6
  const monday = new Date(utcDate);
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  return monday.toISOString().slice(0, 10);
}

/** Week key for a `YYYY-MM-DD` log date string. */
function logWeekKey(dateStr) {
  return weekKeyUtc(new Date(dateStr));
}

/**
 * Weekly-cadence adherence: fraction of the target met over the trailing
 * `weeks` COMPLETED calendar weeks (the current, still-in-progress week is
 * always excluded — mirrors adherenceRate's "today excluded" convention,
 * extended to "this week excluded").
 * @param {Array<{date: string, enacted: boolean}>} logs
 * @param {number} targetPerWeek
 * @param {number} [weeks]
 * @param {Date} [now]
 * @returns {number} 0..1
 */
export function weeklyAdherenceRate(
  logs,
  targetPerWeek,
  weeks = DEFAULT_CONFIG.weeklyAdherenceWindowWeeks,
  now = new Date()
) {
  const todayUtc = toUtcMidnight(now);
  const targetWeekKeys = new Set();
  for (let i = 1; i <= weeks; i++) {
    const d = new Date(todayUtc);
    d.setUTCDate(d.getUTCDate() - i * 7);
    targetWeekKeys.add(weekKeyUtc(d));
  }
  const enactedCount = logs.filter(
    (l) => l.enacted && targetWeekKeys.has(logWeekKey(l.date))
  ).length;
  const denom = targetPerWeek * weeks;
  if (denom <= 0) return 0;
  return Math.min(enactedCount / denom, 1);
}

/**
 * Consecutive completed calendar weeks (most recent first) where the
 * enacted-log count met `targetPerWeek`, capped at `streakCapWeeks`. The
 * current, still-in-progress week counts as the streak's most recent week
 * if it has already met target; otherwise the streak is evaluated starting
 * from the last fully-completed week (an in-progress week that simply
 * hasn't hit target *yet* must not break the streak — mirrors
 * currentStreakDays allowing a streak to "end yesterday").
 * @param {Array<{date: string, enacted: boolean}>} logs
 * @param {number} targetPerWeek
 * @param {number} streakCapWeeks
 * @param {Date} [now]
 * @returns {number}
 */
export function currentStreakWeeks(
  logs,
  targetPerWeek,
  streakCapWeeks,
  now = new Date()
) {
  const countsByWeek = new Map();
  for (const l of logs) {
    if (!l.enacted) continue;
    const wk = logWeekKey(l.date);
    countsByWeek.set(wk, (countsByWeek.get(wk) ?? 0) + 1);
  }
  const todayUtc = toUtcMidnight(now);
  const currentWeekMet =
    (countsByWeek.get(weekKeyUtc(todayUtc)) ?? 0) >= targetPerWeek;

  let streak = 0;
  const cursor = new Date(todayUtc);
  if (!currentWeekMet) cursor.setUTCDate(cursor.getUTCDate() - 7);
  while (streak < streakCapWeeks) {
    const met = (countsByWeek.get(weekKeyUtc(cursor)) ?? 0) >= targetPerWeek;
    if (!met) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

/**
 * True if the most recently *completed* week (never the current,
 * in-progress one — it hasn't had its full chance to hit target yet) missed
 * `targetPerWeek`. Weekly-cadence equivalent of the daily
 * `adherence7d < recoveryAdherence` snap-back-to-daily-reminders check.
 * @param {Array<{date: string, enacted: boolean}>} logs
 * @param {number} targetPerWeek
 * @param {Date} [now]
 * @returns {boolean}
 */
export function weeklyRecoveryTriggered(logs, targetPerWeek, now = new Date()) {
  const todayUtc = toUtcMidnight(now);
  const lastWeekStart = new Date(todayUtc);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const lastWeekKey = weekKeyUtc(lastWeekStart);
  const count = logs.filter(
    (l) => l.enacted && logWeekKey(l.date) === lastWeekKey
  ).length;
  return count < targetPerWeek;
}

/**
 * Weekly-cadence equivalent of `daysSinceLastEnactedLog` (srhiService.js):
 * number of consecutive completed weeks, most recent first, that missed
 * target. 0 when the most recently completed week hit target, or when there
 * are no enacted logs at all yet (nothing to judge silence against — a
 * brand-new habit isn't "silent").
 * @param {Array<{date: string, enacted: boolean}>} logs
 * @param {number} targetPerWeek
 * @param {Date} [now]
 * @returns {number}
 */
export function consecutiveMissedWeeks(logs, targetPerWeek, now = new Date()) {
  const enactedLogs = logs.filter((l) => l.enacted);
  if (enactedLogs.length === 0) return 0;

  const countsByWeek = new Map();
  for (const l of enactedLogs) {
    const wk = logWeekKey(l.date);
    countsByWeek.set(wk, (countsByWeek.get(wk) ?? 0) + 1);
  }

  const todayUtc = toUtcMidnight(now);
  const cursor = new Date(todayUtc);
  cursor.setUTCDate(cursor.getUTCDate() - 7); // start at the last completed week
  let missed = 0;
  // Defensive cap (~10 years) — callers only ever compare against a small
  // threshold (e.g. graduationSilenceWeeks), so this just bounds the loop
  // for a habit whose enacted history is entirely far in the past.
  while (missed <= 520) {
    const met = (countsByWeek.get(weekKeyUtc(cursor)) ?? 0) >= targetPerWeek;
    if (met) break;
    missed += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return missed;
}

/**
 * Pure scoring function.
 * @param {{streakCapDays: number}} config
 * @param {number} [streakCap] Overrides config.streakCapDays for the streak
 *   component's normalization denominator — used for weekly-cadence
 *   intentions to normalize against config.streakCapWeeks instead. Defaults
 *   to config.streakCapDays so existing daily-cadence call sites are
 *   unaffected.
 * @returns {{ autonomyScore: number, components: object }}
 */
export function computeAutonomyScore(
  { latestSrhi, adherence14d, streakDays },
  config = DEFAULT_CONFIG,
  streakCap = config.streakCapDays
) {
  const components = {
    srhi: srhiNorm(latestSrhi),
    adherence: Math.min(Math.max(adherence14d, 0), 1),
    streak: Math.min(streakDays / streakCap, 1),
  };
  const autonomyScore =
    config.weightSrhi * components.srhi +
    config.weightAdherence * components.adherence +
    config.weightStreak * components.streak;
  return { autonomyScore: Math.min(autonomyScore, 1), components };
}

/** Tier index from a score (0 = daily … 4 = off). */
function tierForScore(score, thresholds) {
  let tier = 0;
  for (const t of thresholds) {
    if (score >= t) tier += 1;
  }
  return tier;
}

/**
 * Full plan computation for one intention.
 *
 * @param {object} params
 * @param {object} params.intention   Serialized intention (id, reminderTime, createdAt)
 * @param {Array}  params.srhiScores  Weekly SRHI composites, newest first (numbers, may be empty)
 * @param {Array}  params.logs        daily_behavior_logs docs for this intention
 * @param {object} [params.config]    Resolved reminder config
 * @param {Date}   [params.now]
 * @returns {object} reminder plan
 */
export function computeReminderPlan({
  intention,
  srhiScores = [],
  logs = [],
  config = DEFAULT_CONFIG,
  now = new Date(),
}) {
  const latestSrhi = srhiScores[0] ?? null;
  const previousSrhi = srhiScores[1] ?? null;
  const cadence = normalizeCadence(intention.cadence);

  // Cadence dispatch: everything below this block (weighting, tier mapping,
  // hysteresis) is identical for both cadences — only how "adherence" and
  // "streak" are measured, and what counts as a recovery trigger, differ.
  // For cadence.type === 'daily' this reproduces the exact prior computation
  // (same functions, same arguments, same response shape) — legacy
  // intentions with no `cadence` field normalize to 'daily' and are
  // unaffected by this change.
  let adherenceWindow;
  let streakDays;
  let streakCap;
  let recoveryTriggered;
  let adherence7dForResponse;
  if (cadence.type === 'weekly') {
    adherenceWindow = weeklyAdherenceRate(
      logs,
      cadence.targetPerWeek,
      config.weeklyAdherenceWindowWeeks,
      now
    );
    streakDays = currentStreakWeeks(
      logs,
      cadence.targetPerWeek,
      config.streakCapWeeks,
      now
    );
    streakCap = config.streakCapWeeks;
    recoveryTriggered = weeklyRecoveryTriggered(
      logs,
      cadence.targetPerWeek,
      now
    );
    // No clean weekly analog to a literal "7-day adherence" — null rather
    // than a number computed against the wrong window.
    adherence7dForResponse = null;
  } else {
    adherenceWindow = adherenceRate(logs, 14, now);
    streakDays = currentStreakDays(logs, now);
    streakCap = config.streakCapDays;
    const adherence7d = adherenceRate(logs, 7, now);
    recoveryTriggered = adherence7d < config.recoveryAdherence;
    adherence7dForResponse = Number(adherence7d.toFixed(3));
  }

  const { autonomyScore, components } = computeAutonomyScore(
    { latestSrhi, adherence14d: adherenceWindow, streakDays },
    config,
    streakCap
  );

  let tier = tierForScore(autonomyScore, config.tierThresholds);

  // Hysteresis (slow down): tiers beyond every_2_days require the previous
  // week's SRHI to also support at least the same tier — one good week is
  // not yet automaticity.
  if (tier >= 2) {
    const previousScore = computeAutonomyScore(
      { latestSrhi: previousSrhi, adherence14d: adherenceWindow, streakDays },
      config,
      streakCap
    ).autonomyScore;
    const previousTier = tierForScore(previousScore, config.tierThresholds);
    if (previousTier < tier) tier = Math.max(previousTier, 1);
  }

  // Recovery (speed up immediately): collapsing adherence overrides fading.
  if (recoveryTriggered) tier = 0;

  return {
    intentionId: intention.id,
    reminderTime: intention.reminderTime ?? null,
    frequency: FREQUENCIES[tier],
    // §7.2 Implementation Intention Reminder — cue + behavior text so the app
    // can build "when {cue}, {behavior}" reminder copy without a second fetch.
    behaviorLabel: intention.behaviorLabel ?? null,
    cueText: intention.cueText ?? null,
    autonomyScore: Number(autonomyScore.toFixed(3)),
    components: {
      srhi: Number(components.srhi.toFixed(3)),
      adherence14d: Number(components.adherence.toFixed(3)),
      streak: Number(components.streak.toFixed(3)),
      adherence7d: adherence7dForResponse,
    },
    computedAt: now.toISOString(),
  };
}

/**
 * Automaticity-graduation flow — stamp `reachedAutomaticityAt` the first time
 * a habit's tier is observed at `off`. Sticky: never cleared once set, so it
 * records that the habit *has* reached full automaticity at least once, not
 * its current tier — a later lapse (which drops the tier back down, per the
 * recovery rule) must not erase that it happened. Read by
 * `srhiService.submitSrhi()`'s graduation check (a habit silent for a while
 * after reaching this marker gets an SRHI-gated "has it become self-sustained,
 * or has it lapsed?" check instead of being treated as a plain lapse).
 * Best-effort: a failed write here never breaks the reminder-plan response;
 * it's simply retried next time this is computed.
 * @param {{ db: import('mongodb').Db, intentionDoc: object, frequency: string, now: Date }} deps
 */
export async function markAutomaticityReached({
  db,
  intentionDoc,
  frequency,
  now,
}) {
  if (frequency !== 'off' || intentionDoc.reachedAutomaticityAt) return;
  try {
    await db
      .collection('implementation_intentions')
      .updateOne(
        { _id: intentionDoc._id },
        { $set: { reachedAutomaticityAt: now } }
      );
  } catch {
    // Non-fatal — best-effort, retried whenever this is next computed.
  }
}

/**
 * Compute reminder plans for all of a user's active intentions.
 * @param {{ db: import('mongodb').Db, userId: string, now?: Date }} deps
 * @returns {Promise<Array>}
 */
export async function computeReminderPlans({ db, userId, now = new Date() }) {
  const config = await readReminderConfig(db);
  const intentions = await db
    .collection('implementation_intentions')
    .find({ userId: String(userId), status: 'active' })
    .toArray();

  const plans = await Promise.all(
    intentions.map(async (doc) => {
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
      const plan = computeReminderPlan({
        intention: {
          id: String(doc._id),
          reminderTime: doc.reminderTime ?? null,
          createdAt: doc.createdAt,
          // §7.2 — surface the behavior label and the first cue's text.
          behaviorLabel: doc.behaviorLabel ?? null,
          cueText:
            Array.isArray(doc.cues) && doc.cues.length > 0
              ? (doc.cues[0]?.text ?? null)
              : null,
          cadence: doc.cadence ?? null,
        },
        srhiScores: srhi
          .filter((s) => s.score != null)
          .map((s) => Number(s.score)),
        logs,
        config,
        now,
      });
      await markAutomaticityReached({
        db,
        intentionDoc: doc,
        frequency: plan.frequency,
        now,
      });
      return plan;
    })
  );
  return plans;
}
