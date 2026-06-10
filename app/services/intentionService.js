import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/implementationIntention.js';

/**
 * Create a new implementation intention for a user.
 * Returns { limitReached: true } if the user has reached the maxHabits cap.
 * @param {{ db: object, userId: string, enrollmentId?: string|null, studyId?: string|null, groupId?: string|null, behaviorKey: string, behaviorLabel: string, durationMinutes: number, cues: Array, intentionStatement: string, cueConfig?: object }} deps
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
  cueConfig,
}) {
  if (cueConfig?.maxHabits != null) {
    const count = await db
      .collection(COLLECTION)
      .countDocuments({ userId: String(userId), status: 'active' });
    if (count >= cueConfig.maxHabits) return { limitReached: true };
  }
  const now = new Date();
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
  const doc = await db.collection(COLLECTION).findOne({ _id: oid, userId });
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
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
