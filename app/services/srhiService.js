import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/srhiResponse.js';
import { SRHI_ITEM_IDS } from '../utils/srhi.js';
import { setEnrollmentField } from './enrollmentNeo4j.js';

const WINDOW_DAYS = 3;
const GENERATE_AHEAD = 4;

/**
 * Generate SRHI survey windows for a new intention (one per week for GENERATE_AHEAD weeks).
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

/**
 * Return all pending SRHI windows that are due within the 3-day submission window.
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
  return docs.map(serialize);
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

  return serialize(result);
}

/**
 * Return the SRHI score trajectory for an intention, sorted by week number.
 * @param {{ db: object, intentionId: string, userId: string }} deps
 * @returns {Promise<Array<{ weekNumber: number, scheduledFor: Date, submittedAt: Date|null, score: number|null }>>}
 */
export async function getTrajectory({ db, intentionId, userId }) {
  const oid = new ObjectId(intentionId);
  const docs = await db
    .collection(COLLECTION)
    .find({ intentionId: oid, userId: String(userId) })
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
