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
};

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

/**
 * Pure scoring function.
 * @returns {{ autonomyScore: number, components: object }}
 */
export function computeAutonomyScore(
  { latestSrhi, adherence14d, streakDays },
  config = DEFAULT_CONFIG
) {
  const components = {
    srhi: srhiNorm(latestSrhi),
    adherence: Math.min(Math.max(adherence14d, 0), 1),
    streak: Math.min(streakDays / config.streakCapDays, 1),
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
  const adherence14d = adherenceRate(logs, 14, now);
  const adherence7d = adherenceRate(logs, 7, now);
  const streakDays = currentStreakDays(logs, now);

  const { autonomyScore, components } = computeAutonomyScore(
    { latestSrhi, adherence14d, streakDays },
    config
  );

  let tier = tierForScore(autonomyScore, config.tierThresholds);

  // Hysteresis (slow down): tiers beyond every_2_days require the previous
  // week's SRHI to also support at least the same tier — one good week is
  // not yet automaticity.
  if (tier >= 2) {
    const previousScore = computeAutonomyScore(
      { latestSrhi: previousSrhi, adherence14d, streakDays },
      config
    ).autonomyScore;
    const previousTier = tierForScore(previousScore, config.tierThresholds);
    if (previousTier < tier) tier = Math.max(previousTier, 1);
  }

  // Recovery (speed up immediately): collapsing adherence overrides fading.
  if (adherence7d < config.recoveryAdherence) tier = 0;

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
      adherence7d: Number(adherence7d.toFixed(3)),
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
