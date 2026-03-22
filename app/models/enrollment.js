/**
 * Enrollment model — MongoDB collection 'enrollments'.
 *
 * One enrollment per user (unique index on userId).
 *
 * Schema:
 *   _id            ObjectId  Auto-generated
 *   userId         string    Keycloak UUID of the enrolled participant.
 *   studyId        ObjectId  Ref to studies._id
 *   groupId        ObjectId  Ref to studies.groups[].id
 *   studyCodeUsed  string|null  The study code used during enrollment; null if skipped.
 *   enrolledAt     Date
 */

export const COLLECTION = 'enrollments';

/** MongoDB JSON Schema validator for the enrollments collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'studyId', 'groupId', 'enrolledAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      studyId: { bsonType: 'objectId' },
      groupId: { bsonType: 'objectId' },
      studyCodeUsed: { bsonType: ['string', 'null'] },
      enrolledAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the enrollments collection.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  // Unique index on userId — one active enrollment per user.
  await col.createIndex(
    { userId: 1 },
    { unique: true, name: 'enrollments_userId_unique' }
  );
  // Index for fetching all enrollments belonging to a study.
  await col.createIndex({ studyId: 1 }, { name: 'enrollments_studyId' });
}
