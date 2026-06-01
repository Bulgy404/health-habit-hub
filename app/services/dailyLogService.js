import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/dailyBehaviorLog.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';

export async function upsertLog({ db, intentionId, userId, date, enacted }) {
  const oid = new ObjectId(intentionId);
  const now = new Date();
  await db.collection(COLLECTION).findOneAndUpdate(
    { intentionId: oid, date },
    {
      $setOnInsert: { intentionId: oid, userId, date, loggedAt: now },
      $set: { enacted, loggedAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  await touchEnrollmentActivity({ db, userId });
}

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
    date: d.date,
    enacted: d.enacted,
    loggedAt: d.loggedAt,
  }));
}

export async function touchEnrollmentActivity({ db, userId }) {
  await db
    .collection(ENROLLMENTS)
    .updateOne({ userId }, { $set: { lastActiveAt: new Date() } });
}
