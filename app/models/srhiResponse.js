/**
 * SRHI Response model — MongoDB collection 'srhi_responses'.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   intentionId  ObjectId   Required. Reference to implementation intention.
 *   userId       string     Required. User identifier.
 *   studyId      ObjectId   Optional. Reference to study.
 *   groupId      ObjectId   Optional. Reference to group.
 *   weekNumber   int        Required. Week number (≥ 1).
 *   scheduledFor Date       Required. When the survey was scheduled.
 *   submittedAt  Date       Optional. When the survey was submitted.
 *   items        object     Optional. Survey response items.
 *   score        double     Optional. Computed SRHI score.
 *   createdAt    Date       Required.
 */

export const COLLECTION = 'srhi_responses';

/** MongoDB JSON Schema validator for the srhi_responses collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'intentionId',
      'userId',
      'weekNumber',
      'scheduledFor',
      'createdAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      intentionId: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      studyId: { bsonType: ['objectId', 'null'] },
      groupId: { bsonType: ['objectId', 'null'] },
      weekNumber: { bsonType: 'int', minimum: 1 },
      scheduledFor: { bsonType: 'date' },
      submittedAt: { bsonType: ['date', 'null'] },
      items: { bsonType: ['object', 'null'] },
      score: { bsonType: ['double', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the srhi_responses collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { intentionId: 1, weekNumber: 1 },
    { unique: true, name: 'srhi_intentionId_week_unique' }
  );
  await col.createIndex(
    { userId: 1, submittedAt: 1 },
    { name: 'srhi_userId_submittedAt' }
  );
}
