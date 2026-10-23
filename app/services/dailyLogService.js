import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/dailyBehaviorLog.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';

/**
 * Upsert the daily behavior log entry for a given intention and date.
 * @param {{ db: object, intentionId: string, userId: string, date: string, enacted: boolean }} deps
 * @returns {Promise<void>}
 */
export async function upsertLog({ db, intentionId, userId, date, enacted }) {
  const oid = new ObjectId(intentionId);
  const now = new Date();
  await db.collection(COLLECTION).findOneAndUpdate(
    { intentionId: oid, date: String(date) },
    {
      // loggedAt must not appear in both $setOnInsert and $set — MongoDB rejects
      // the update with a path conflict (HTTP 500). It lives in $set so it is
      // written on both insert and re-log.
      $setOnInsert: { intentionId: oid, userId, date },
      // A miss has no situation to report, so re-logging a day as missed
      // clears any earlier "in the planned situation?" answer (#64).
      // Re-logging it as enacted keeps the answer.
      $set: enacted
        ? { enacted, loggedAt: now }
        : { enacted, loggedAt: now, inCueContext: null },
    },
    { upsert: true, returnDocument: 'after' }
  );
  await touchEnrollmentActivity({ db, userId });
}

/**
 * Record whether an enacted day happened in the planned cue situation (#64):
 * the answer to the optional "In the planned situation?" follow-up the app
 * shows after logging. `inCueContext` null clears the answer.
 *
 * Only an existing, enacted log can carry an answer, so this never creates a
 * log and reports `notFound` for a missing day or a miss. `userId` is in the
 * filter for the same IDOR reason as [deleteLog].
 * @param {{ db: object, intentionId: string, userId: string, date: string, inCueContext: 'yes'|'no'|'unsure'|null }} deps
 * @returns {Promise<{ notFound: boolean }>}
 */
export async function setCueContext({
  db,
  intentionId,
  userId,
  date,
  inCueContext,
}) {
  const result = await db.collection(COLLECTION).updateOne(
    {
      intentionId: new ObjectId(intentionId),
      userId: String(userId),
      date: String(date),
      enacted: true,
    },
    { $set: { inCueContext } }
  );
  return { notFound: result.matchedCount === 0 };
}

/**
 * Delete the daily behavior log entry for a given intention and date,
 * reverting it to "not logged" — distinct from `upsertLog({ enacted: false })`,
 * which records an explicit miss rather than clearing the entry.
 *
 * `userId` is required and included in the delete filter so that a request
 * for an `intentionId` owned by a different user matches (and deletes)
 * nothing — see IDOR fix in intentionsRouter.js.
 * @param {{ db: object, intentionId: string, userId: string, date: string }} deps
 * @returns {Promise<void>}
 */
export async function deleteLog({ db, intentionId, userId, date }) {
  const oid = new ObjectId(intentionId);
  await db.collection(COLLECTION).deleteOne({
    intentionId: oid,
    userId: String(userId),
    date: String(date),
  });
}

/**
 * Retrieve daily log entries for an intention, optionally filtered by date range.
 *
 * `userId` is required and included in the query filter so that a request
 * for an `intentionId` owned by a different user returns no entries — see
 * IDOR fix in intentionsRouter.js.
 * @param {{ db: object, intentionId: string, userId: string, from?: string, to?: string }} deps
 * @returns {Promise<Array<{ date: string, enacted: boolean, loggedAt: Date, inCueContext: string|null }>>}
 */
export async function getLogs({ db, intentionId, userId, from, to }) {
  const oid = new ObjectId(intentionId);
  const filter = { intentionId: oid, userId: String(userId) };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  const docs = await db.collection(COLLECTION).find(filter).toArray();
  return docs.map((d) => ({
    intentionId: d.intentionId.toString(),
    date: d.date,
    enacted: d.enacted,
    loggedAt: d.loggedAt,
    inCueContext: d.inCueContext ?? null,
  }));
}

/**
 * Update the lastActiveAt timestamp on a participant's enrollment record.
 * @param {{ db: object, userId: string }} deps
 * @returns {Promise<void>}
 */
export async function touchEnrollmentActivity({ db, userId }) {
  await db
    .collection(ENROLLMENTS)
    .updateOne(
      { userId: String(userId) },
      { $set: { lastActiveAt: new Date() } }
    );
}
