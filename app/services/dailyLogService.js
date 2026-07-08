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
      $set: { enacted, loggedAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  await touchEnrollmentActivity({ db, userId });
}

/**
 * Retrieve daily log entries for an intention, optionally filtered by date range.
 * @param {{ db: object, intentionId: string, from?: string, to?: string }} deps
 * @returns {Promise<Array<{ date: string, enacted: boolean, loggedAt: Date }>>}
 */
export async function getLogs({ db, intentionId, from, to }) {
  const oid = new ObjectId(intentionId);
  const filter = { intentionId: oid };
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
