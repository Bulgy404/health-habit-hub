import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/srhiResponse.js';
import { COLLECTION as INTENTIONS_COLLECTION } from '../models/implementationIntention.js';
import { SRHI_ITEM_IDS } from '../utils/srhi.js';
import { setEnrollmentField } from './enrollmentNeo4j.js';
import { HABIT_ANCHOR_DELAY_MS } from './questionnaireScheduleService.js';
import {
  readReminderConfig,
  computeAutonomyScore,
  currentStreakDays,
  adherenceRate,
} from './reminderPlanService.js';
import {
  BADGES,
  readGamificationConfig,
  computeHabitGamification,
} from './gamificationService.js';

const WINDOW_DAYS = 3;
const GENERATE_AHEAD = 4;
// Rolling buffer size for the indefinite weekly cadence — mirrors the
// CONTINUOUS_TOPUP_CAP pattern in questionnaireScheduleService.js. Kept small
// since topUpSrhiWindows() replenishes it on every due-window read.
const SRHI_TOPUP_CAP = 4;

/**
 * Generate SRHI survey windows for a new intention (one per week for GENERATE_AHEAD weeks).
 * The first window is anchored HABIT_ANCHOR_DELAY_MS after habit creation,
 * matching the general habit-scope anchor used by generic questionnaires.
 * @param {{ db: object, intentionId: string, userId: string, createdAt: Date, studyId?: string|null, groupId?: string|null }} deps
 * @returns {Promise<Array>} The inserted window documents.
 */
export async function generateWindows({
  db,
  intentionId,
  userId,
  createdAt,
  studyId,
  groupId,
}) {
  const oid = new ObjectId(intentionId);
  const sOid = studyId ? new ObjectId(studyId) : null;
  const gOid = groupId ? new ObjectId(groupId) : null;
  const now = new Date();
  const anchor = createdAt.getTime() + HABIT_ANCHOR_DELAY_MS;
  const docs = [];
  for (let w = 1; w <= GENERATE_AHEAD; w++) {
    const scheduledFor = new Date(anchor + (w - 1) * 7 * 24 * 60 * 60 * 1000);
    docs.push({
      intentionId: oid,
      userId,
      studyId: sOid,
      groupId: gOid,
      weekNumber: w,
      scheduledFor,
      submittedAt: null,
      items: null,
      score: null,
      createdAt: now,
    });
  }
  await db.collection(COLLECTION).insertMany(docs);
  return docs;
}

/**
 * Extend an intention's SRHI windows so the weekly cadence keeps going for as
 * long as the habit stays active, rather than stopping after GENERATE_AHEAD
 * weeks. Extends from the last existing window's `scheduledFor` (not the
 * original habit-creation anchor), so the collection stays self-sufficient.
 * No-op once the intention is no longer 'active' (paused/completed/abandoned)
 * or if it can't be found — callers treat this as best-effort.
 * @param {{ db: object, intentionId: string, userId: string }} deps
 * @returns {Promise<number>} number of windows created
 */
export async function topUpSrhiWindows({ db, intentionId, userId }) {
  const oid = new ObjectId(intentionId);
  const intention = await db
    .collection(INTENTIONS_COLLECTION)
    .findOne(
      { _id: oid, userId: String(userId) },
      { projection: { status: 1, studyId: 1, groupId: 1 } }
    );
  if (!intention || intention.status !== 'active') return 0;

  const openCount = await db.collection(COLLECTION).countDocuments({
    intentionId: oid,
    userId: String(userId),
    submittedAt: null,
  });
  if (openCount >= SRHI_TOPUP_CAP) return 0;
  const need = SRHI_TOPUP_CAP - openCount;

  const [last] = await db
    .collection(COLLECTION)
    .find({ intentionId: oid, userId: String(userId) })
    .sort({ weekNumber: -1 })
    .limit(1)
    .toArray();
  if (!last) return 0; // nothing to extend from — initial generation always seeds ≥1

  const now = new Date();
  const docs = Array.from({ length: need }, (_, k) => ({
    intentionId: oid,
    userId: String(userId),
    studyId: last.studyId,
    groupId: last.groupId,
    weekNumber: last.weekNumber + k + 1,
    scheduledFor: new Date(
      last.scheduledFor.getTime() + (k + 1) * 7 * 24 * 60 * 60 * 1000
    ),
    submittedAt: null,
    items: null,
    score: null,
    createdAt: now,
  }));
  await db.collection(COLLECTION).insertMany(docs);
  return docs.length;
}

/**
 * Return all pending SRHI windows that are due within the 3-day submission window.
 *
 * Excludes windows for a habit that's no longer active (paused/completed/
 * abandoned) — generateWindows/topUpSrhiWindows already stop *creating* new
 * windows once a habit leaves 'active' (see topUpSrhiWindows' doc comment),
 * but windows generated before that point are left in the collection with
 * submittedAt: null, so without this filter they'd keep showing as "due" for
 * up to WINDOW_DAYS after the habit was abandoned instead of disappearing
 * immediately. Mirrors the same active-only join already done in
 * getUpcomingSrhiQuestionnaireItems below.
 * @param {{ db: object, userId: string }} deps
 * @returns {Promise<Array>} Serialized due window documents.
 */
export async function getDueWindows({ db, userId }) {
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const docs = await db
    .collection(COLLECTION)
    .find({
      userId: String(userId),
      submittedAt: null,
      scheduledFor: { $lte: now, $gte: windowCutoff },
    })
    .toArray();
  if (docs.length === 0) return [];

  const activeIntentions = await db
    .collection(INTENTIONS_COLLECTION)
    .find(
      { _id: { $in: docs.map((d) => d.intentionId) }, status: 'active' },
      { projection: { _id: 1 } }
    )
    .toArray();
  const activeIds = new Set(activeIntentions.map((i) => i._id.toString()));

  return docs
    .filter((d) => activeIds.has(d.intentionId.toString()))
    .map(serialize);
}

/**
 * Return open SRHI windows scheduled within [now, horizon] shaped like
 * `questionnaireScheduleService.getDueQuestionnaires()`'s `questionnaires`
 * items, so `GET /questionnaires/due` can merge them in and the mobile app's
 * existing local-notification scheduler (`syncQuestionnaireReminders`) picks
 * them up the same way it does every other questionnaire type.
 *
 * Also replenishes each active intention's rolling SRHI window buffer on the
 * way (best-effort — see `topUpSrhiWindows`), so the weekly cadence keeps
 * going indefinitely while the habit stays active instead of stopping after
 * GENERATE_AHEAD weeks.
 *
 * The top-up candidates are every *active* intention for this user, not just
 * ones that already happen to have a pending window: deriving candidates
 * from existing pending windows (as this used to) means an intention whose
 * buffer ever drains to exactly zero — e.g. a run of failed/offline syncs
 * followed by catching up on the last due check-in — can never be
 * rediscovered, since nothing else ever looks at it again. Querying active
 * intentions directly closes that gap, and also means a habit whose history
 * was seeded with only past, already-submitted weeks (see
 * scripts/seed-test-user.js) gets a next check-in window the first time this
 * runs, exactly as a normally-created habit would.
 * @param {{ db: object, userId: string, horizon: Date }} deps
 * @returns {Promise<Array>}
 */
export async function getUpcomingSrhiQuestionnaireItems({
  db,
  userId,
  horizon,
}) {
  const now = new Date();

  const activeIntentions = await db
    .collection(INTENTIONS_COLLECTION)
    .find(
      { userId: String(userId), status: 'active' },
      { projection: { _id: 1, behaviorLabel: 1 } }
    )
    .toArray();
  await Promise.all(
    activeIntentions.map((i) =>
      topUpSrhiWindows({ db, intentionId: i._id.toString(), userId }).catch(
        () => {}
      )
    )
  );

  const wins = await db
    .collection(COLLECTION)
    .find({
      userId: String(userId),
      submittedAt: null,
      scheduledFor: { $lte: horizon },
    })
    .sort({ scheduledFor: 1 })
    .toArray();
  if (wins.length === 0) return [];

  const labelById = new Map(
    activeIntentions.map((i) => [i._id.toString(), i.behaviorLabel])
  );

  return wins
    .filter((w) => labelById.has(w.intentionId.toString()))
    .map((w) => ({
      windowId: w._id.toString(),
      questionnaireSlug: 'srhi',
      questionnaireTitle: `Weekly check-in: ${labelById.get(w.intentionId.toString())}`,
      occurrence: w.weekNumber,
      scheduledFor: w.scheduledFor,
      isDue: w.scheduledFor <= now,
      intentionId: w.intentionId.toString(),
    }));
}

/**
 * Submit SRHI item responses for a given intention week, computing the mean score.
 * @param {{ db: object, intentionId: string, userId: string, weekNumber: number, items: object, neo4jRun?: Function }} deps
 * @returns {Promise<object|{ invalid: boolean, missing: Array }|{ notFound: boolean }>} Serialized window or error indicator.
 */
export async function submitSrhi({
  db,
  intentionId,
  userId,
  weekNumber,
  items,
  neo4jRun,
}) {
  const oid = new ObjectId(intentionId);
  const missing = SRHI_ITEM_IDS.filter(
    (id) => items[id] == null || items[id] < 1 || items[id] > 7
  );
  if (missing.length > 0) return { invalid: true, missing };

  const score =
    SRHI_ITEM_IDS.reduce((sum, id) => sum + Number(items[id]), 0) /
    SRHI_ITEM_IDS.length;
  const now = new Date();

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    {
      intentionId: oid,
      weekNumber: parseInt(weekNumber, 10),
      submittedAt: null,
    },
    { $set: { items, score, submittedAt: now } },
    { returnDocument: 'after' }
  );
  if (!result) return { notFound: true };

  // Update lastActiveAt on the ENROLLED_IN relationship (non-fatal)
  if (neo4jRun) {
    setEnrollmentField(neo4jRun, String(userId), 'lastActiveAt', now).catch(
      () => {}
    );
  }

  const graduation = await checkAutomaticityGraduation({
    db,
    intentionOid: oid,
    userId,
    score,
    now,
  }).catch(() => null); // best-effort — never let this block a normal submission

  return { ...serialize(result), ...(graduation ? { graduation } : {}) };
}

/**
 * Automaticity-graduation flow: a habit that has ever reached full
 * automaticity (`reachedAutomaticityAt` set by
 * `reminderPlanService.markAutomaticityReached`) and has since gone quiet —
 * no enacted daily log for `graduationSilenceDays` — is ambiguous. Silence
 * could mean it lapsed, or it could mean it's now so automatic the
 * participant no longer needs the app for it. Rather than assume lapse (the
 * default reading elsewhere — see the recovery rule in
 * `reminderPlanService.computeReminderPlan`), the next SRHI submission is
 * used to disambiguate:
 *
 *   - strong score (>= graduationScoreThreshold) → the habit graduates:
 *     marked `completed`/`graduated`, its current XP is frozen onto
 *     `bankedXp` (plus a one-time bonus) so graduating doesn't erase earned
 *     XP, and it earns the (never-revoked) Habit Graduate badge.
 *   - weak score → nothing special happens here. The habit stays active, and
 *     the *existing* recovery rule (tier snaps to `daily`) plus badge
 *     revocation (`REVOCABLE_BADGES`) already handle "this was actually a
 *     lapse" on the next reminder/gamification read — no new code needed for
 *     that branch.
 *
 * @param {{ db: object, intentionOid: ObjectId, userId: string, score: number, now: Date }} deps
 * @returns {Promise<{ candidate: boolean, graduated: boolean, badgeKey?: string, bonusXp?: number, bankedXp?: number }|null>}
 */
async function checkAutomaticityGraduation({
  db,
  intentionOid,
  userId,
  score,
  now,
}) {
  const intention = await db
    .collection(INTENTIONS_COLLECTION)
    .findOne({ _id: intentionOid, userId: String(userId) });
  if (!intention || intention.status !== 'active') return null;
  if (!intention.reachedAutomaticityAt) return null;

  const logs = await db
    .collection('daily_behavior_logs')
    .find({ intentionId: intentionOid, userId: String(userId) })
    .toArray();
  const config = await readGamificationConfig(db);
  const silentDays = daysSinceLastEnactedLog(logs, now);
  if (silentDays < config.graduationSilenceDays) return null;

  if (score < config.graduationScoreThreshold) {
    return { candidate: true, graduated: false };
  }

  const reminderConfig = await readReminderConfig(db);
  const srhi = await db
    .collection(COLLECTION)
    .find({ intentionId: intentionOid, userId: String(userId) })
    .sort({ weekNumber: -1 })
    .toArray();
  const srhiScores = srhi
    .filter((s) => s.score != null)
    .map((s) => Number(s.score));
  const srhiSubmissionCount = srhi.filter(
    (s) => s.submittedAt != null || s.score != null
  ).length;
  const { xp: frozenXp } = computeHabitGamification({
    intention,
    logs,
    srhiScores,
    srhiSubmissionCount,
    reminderConfig,
    config,
    now,
  });
  const bankedXp = frozenXp + config.graduationBonusXp;

  await db.collection(INTENTIONS_COLLECTION).updateOne(
    { _id: intentionOid },
    {
      $set: {
        status: 'completed',
        completedReason: 'graduated',
        bankedXp,
        graduatedAt: now,
        updatedAt: now,
      },
      $push: {
        earnedBadges: { badgeKey: BADGES.HABIT_GRADUATE, earnedAt: now },
      },
    }
  );

  return {
    candidate: true,
    graduated: true,
    badgeKey: BADGES.HABIT_GRADUATE,
    bonusXp: config.graduationBonusXp,
    bankedXp,
  };
}

/**
 * Days since the most recent `enacted: true` daily log, as of `now`.
 * `Infinity` if there are no enacted logs at all.
 * @param {Array<{ date: string, enacted: boolean }>} logs
 * @param {Date} now
 * @returns {number}
 */
export function daysSinceLastEnactedLog(logs, now) {
  const enactedDates = logs
    .filter((l) => l.enacted)
    .map((l) => l.date)
    .sort();
  if (enactedDates.length === 0) return Infinity;
  const last = new Date(enactedDates[enactedDates.length - 1]);
  return Math.floor((now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Return the SRHI score trajectory for an intention, sorted by week number —
 * including a replayed `autonomyScore` (the automaticity index driving
 * reminder fading, see reminderPlanService.computeAutonomyScore) as of each
 * submitted checkpoint.
 *
 * `autonomyScore` is a pure function of the latest SRHI score, 14-day
 * adherence and current streak, so rather than needing a new persisted
 * historical series, it's recomputed here for each submitted week using only
 * the logs/SRHI scores that existed as of that week's `submittedAt` — giving
 * a genuine historical automaticity trend, not just today's snapshot.
 * `null` for weeks that haven't been submitted yet.
 *
 * @param {{ db: object, intentionId: string, userId: string }} deps
 * @returns {Promise<Array<{ weekNumber: number, scheduledFor: Date, submittedAt: Date|null, score: number|null, autonomyScore: number|null }>>}
 */
export async function getTrajectory({ db, intentionId, userId }) {
  const oid = new ObjectId(intentionId);
  const [docs, logs, reminderConfig] = await Promise.all([
    db
      .collection(COLLECTION)
      .find({ intentionId: oid, userId: String(userId) })
      .sort({ weekNumber: 1 })
      .toArray(),
    db
      .collection('daily_behavior_logs')
      .find({ intentionId: oid, userId: String(userId) })
      .toArray(),
    readReminderConfig(db),
  ]);

  const submitted = docs
    .filter((d) => d.submittedAt != null && d.score != null)
    .sort((a, b) => a.submittedAt - b.submittedAt);

  return docs.map((d) => {
    let autonomyScore = null;
    if (d.submittedAt != null && d.score != null) {
      const asOf = d.submittedAt;
      const priorScores = submitted
        .filter((s) => s.submittedAt <= asOf)
        .map((s) => Number(s.score));
      const latestSrhi = priorScores[priorScores.length - 1] ?? null;
      const logsUpToDate = logs.filter((l) => new Date(l.date) <= asOf);
      autonomyScore = computeAutonomyScore(
        {
          latestSrhi,
          adherence14d: adherenceRate(logsUpToDate, 14, asOf),
          streakDays: currentStreakDays(logsUpToDate, asOf),
        },
        reminderConfig
      ).autonomyScore;
    }
    return {
      weekNumber: d.weekNumber,
      scheduledFor: d.scheduledFor,
      submittedAt: d.submittedAt,
      score: d.score,
      autonomyScore,
    };
  });
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    intentionId: doc.intentionId.toString(),
    userId: doc.userId,
    weekNumber: doc.weekNumber,
    scheduledFor: doc.scheduledFor,
    submittedAt: doc.submittedAt,
    score: doc.score,
  };
}
