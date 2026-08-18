import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/implementationIntention.js';
import {
  FREQUENCIES,
  readReminderConfig,
  computeReminderPlan,
  normalizeCadence,
} from './reminderPlanService.js';

/**
 * Create a new implementation intention for a user.
 *
 * Returns a limit indicator instead of creating when a cap is hit:
 *   - { limitReached: true }                              — legacy maxHabits cap
 *   - { limitReached: true, unlockTier, currentTier }     — §7.3 Information
 *     Overload per-type build/quit cap (see checkOverloadGuard)
 *
 * @param {{ db: object, userId: string, enrollmentId?: string|null, studyId?: string|null, groupId?: string|null, behaviorKey: string, behaviorLabel: string, durationMinutes: number, cues: Array, intentionStatement: string, habitType?: string, stackedOn?: string|null, anchorLabel?: string|null, creationMode?: string, cadence?: {type: string, targetPerWeek?: number}|null, cueConfig?: object, overload?: object|null }} deps
 * @returns {Promise<object|{ limitReached: boolean }>} Serialized intention or limit indicator.
 */
export async function createIntention({
  db,
  userId,
  enrollmentId = null,
  studyId = null,
  groupId = null,
  behaviorKey,
  behaviorLabel,
  durationMinutes,
  cues,
  intentionStatement,
  habitType = 'build',
  stackedOn = null,
  anchorLabel = null,
  creationMode = 'standalone',
  reminderTime = null,
  cadence = null,
  cueConfig,
  overload = null,
}) {
  const normalizedType = habitType === 'quit' ? 'quit' : 'build';
  if (cueConfig?.maxHabits != null) {
    const count = await db
      .collection(COLLECTION)
      .countDocuments({ userId: String(userId), status: 'active' });
    if (count >= cueConfig.maxHabits) return { limitReached: true };
  }

  // §7.3 Information Overload — per-type (build/quit) cap that grows as the
  // participant's existing habits of that type become automatic. Evaluated
  // only when a study/group enables the guard, and skipped for a habit
  // stacked onto one the participant is already tracking — stacking is a
  // low-overhead extension of an established habit, not a new independent
  // commitment, so it shouldn't compete for the same capacity slot (and
  // blocking it would defeat the point of offering stacking at all).
  if (overload?.enabled && creationMode !== 'stacked') {
    const guard = await checkOverloadGuard({
      db,
      userId,
      habitType: normalizedType,
      overload,
    });
    if (guard.limitReached) return guard;
  }

  const now = new Date();
  let stackedOnOid = null;
  if (stackedOn) {
    try {
      stackedOnOid = new ObjectId(stackedOn);
    } catch {
      stackedOnOid = null;
    }
  }
  const doc = {
    userId,
    enrollmentId: enrollmentId ? new ObjectId(enrollmentId) : null,
    studyId: studyId ? new ObjectId(studyId) : null,
    groupId: groupId ? new ObjectId(groupId) : null,
    behaviorKey,
    behaviorLabel,
    durationMinutes: parseInt(durationMinutes, 10),
    cues,
    intentionStatement,
    habitType: normalizedType,
    stackedOn: stackedOnOid,
    anchorLabel: anchorLabel ? String(anchorLabel).trim() || null : null,
    creationMode: creationMode === 'stacked' ? 'stacked' : 'standalone',
    // Always stored explicitly (never omitted), even for daily — so only
    // pre-existing legacy documents ever rely on normalizeCadence()'s
    // absent-field fallback going forward.
    cadence: normalizeCadence(cadence),
    earnedBadges: [],
    reminderTime,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

/**
 * List all implementation intentions for a user.
 * @param {{ db: object, userId: string }} deps
 * @returns {Promise<Array>}
 */
export async function listIntentions({ db, userId }) {
  const docs = await db
    .collection(COLLECTION)
    .find({ userId: String(userId) })
    .toArray();
  return docs.map(serialize);
}

/**
 * Fetch a single implementation intention by id scoped to a user.
 * @param {{ db: object, id: string, userId: string }} deps
 * @returns {Promise<object|null>} Serialized intention or null if not found.
 */
export async function getIntention({ db, id, userId }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }
  const doc = await db
    .collection(COLLECTION)
    .findOne({ _id: oid, userId: String(userId) });
  return doc ? serialize(doc) : null;
}

/**
 * Update the status of an implementation intention owned by the given user.
 * @param {{ db: object, id: string, userId: string, status: string }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function updateIntentionStatus({ db, id, userId, status }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }
  const result = await db
    .collection(COLLECTION)
    .findOneAndUpdate(
      { _id: oid, userId: String(userId) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  if (!result) return { notFound: true };
  return { updated: true };
}

/**
 * §7.3 Information Overload guard.
 *
 * Behavioural rationale: focus a participant's limited attentional resources
 * on strengthening current habits before adding new ones of the same type.
 * The cap is not fixed — it *grows* as existing habits become automatic, so
 * the guard slows people down early and gets out of the way once a habit is
 * self-sustaining.
 *
 * Algorithm: each habit type (build/quit) starts with a cap of 1 active habit.
 * The cap is then raised by 1 for every active habit of that type that has
 * already reached `unlockTier` — the reminder-frequency tier from the Fading
 * Reminders signal (reminderPlanService), reused here rather than inventing a
 * new automaticity metric. So a participant whose only build habit has faded
 * to "weekly" reminders has unlocked a second build slot.
 *
 * @param {{ db: object, userId: string, habitType: 'build'|'quit', overload: { unlockTier: string } }} deps
 * @returns {Promise<{ limitReached: false }|{ limitReached: true, unlockTier: string, currentTier: string }>}
 */
export async function checkOverloadGuard({
  db,
  userId,
  habitType,
  overload,
  now = new Date(),
}) {
  const unlockTier = overload?.unlockTier ?? 'weekly';
  // 'off' means the guard never opens further slots — a hard cap of 1 per type.
  const unlockIndex =
    unlockTier === 'off'
      ? FREQUENCIES.length // unreachable — nothing counts as unlocked
      : Math.max(FREQUENCIES.indexOf(unlockTier), 0);

  const active = await db
    .collection(COLLECTION)
    .find({ userId: String(userId), habitType, status: 'active' })
    .sort({ createdAt: -1 })
    .toArray();

  const baseCap = 1;
  if (active.length < baseCap) return { limitReached: false };

  const config = await readReminderConfig(db);

  let unlockedCount = 0;
  let mostRecentTier = 'daily';
  for (let i = 0; i < active.length; i++) {
    const doc = active[i];
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
      },
      srhiScores: srhi
        .filter((s) => s.score != null)
        .map((s) => Number(s.score)),
      logs,
      config,
      now,
    });
    const tierIndex = Math.max(FREQUENCIES.indexOf(plan.frequency), 0);
    if (i === 0) mostRecentTier = plan.frequency;
    if (tierIndex >= unlockIndex) unlockedCount += 1;
  }

  const effectiveCap = baseCap + unlockedCount;
  if (active.length >= effectiveCap) {
    return {
      limitReached: true,
      unlockTier,
      currentTier: mostRecentTier,
    };
  }
  return { limitReached: false };
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    enrollmentId: doc.enrollmentId?.toString() ?? null,
    studyId: doc.studyId?.toString() ?? null,
    groupId: doc.groupId?.toString() ?? null,
    behaviorKey: doc.behaviorKey,
    behaviorLabel: doc.behaviorLabel,
    durationMinutes: doc.durationMinutes,
    cues: doc.cues,
    intentionStatement: doc.intentionStatement,
    // §7.4 / §7.1 — default legacy docs so the app always receives a value.
    habitType: doc.habitType ?? 'build',
    stackedOn: doc.stackedOn?.toString() ?? null,
    anchorLabel: doc.anchorLabel ?? null,
    creationMode: doc.creationMode ?? 'standalone',
    // Normalized so legacy docs (no `cadence` field) and explicit daily
    // intentions return the identical shape — see
    // reminderPlanService.normalizeCadence.
    cadence: normalizeCadence(doc.cadence),
    earnedBadges: (doc.earnedBadges ?? []).map((b) => ({
      badgeKey: b.badgeKey,
      earnedAt: b.earnedAt,
    })),
    reminderTime: doc.reminderTime ?? null,
    status: doc.status,
    // Automaticity-graduation flow (srhiService.submitSrhi): set only when
    // status is 'completed' via graduation, not a manual completion.
    completedReason: doc.completedReason ?? null,
    bankedXp: doc.bankedXp ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
