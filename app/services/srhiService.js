import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/srhiResponse.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { SRHI_ITEM_IDS } from '../utils/srhi.js';

const WINDOW_DAYS = 3;
const GENERATE_AHEAD = 4;

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
  const docs = [];
  for (let w = 1; w <= GENERATE_AHEAD; w++) {
    const scheduledFor = new Date(
      createdAt.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000
    );
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

export async function getDueWindows({ db, userId }) {
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const docs = await db
    .collection(COLLECTION)
    .find({
      userId,
      submittedAt: null,
      scheduledFor: { $lte: now, $gte: windowCutoff },
    })
    .toArray();
  return docs.map(serialize);
}

export async function submitSrhi({
  db,
  intentionId,
  userId,
  weekNumber,
  items,
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

  await db
    .collection(ENROLLMENTS)
    .updateOne({ userId }, { $set: { lastActiveAt: now } });
  return serialize(result);
}

export async function getTrajectory({ db, intentionId, userId }) {
  const oid = new ObjectId(intentionId);
  const docs = await db
    .collection(COLLECTION)
    .find({ intentionId: oid, userId })
    .sort({ weekNumber: 1 })
    .toArray();
  return docs.map((d) => ({
    weekNumber: d.weekNumber,
    scheduledFor: d.scheduledFor,
    submittedAt: d.submittedAt,
    score: d.score,
  }));
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
