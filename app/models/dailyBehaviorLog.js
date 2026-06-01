/**
 * Daily Behavior Log model — MongoDB collection 'daily_behavior_logs'.
 *
 * Schema:
 *   _id         ObjectId   Auto-generated
 *   intentionId ObjectId   Required. Reference to implementation intention.
 *   userId      string     Required. User identifier.
 *   date        string     Required. Date in YYYY-MM-DD format.
 *   enacted     boolean    Required. Whether behavior was performed.
 *   loggedAt    Date       Required. When the log entry was created.
 */

export const COLLECTION = 'daily_behavior_logs';

/** MongoDB JSON Schema validator for the daily_behavior_logs collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['intentionId', 'userId', 'date', 'enacted', 'loggedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      intentionId: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      date: { bsonType: 'string' },
      enacted: { bsonType: 'bool' },
      loggedAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the daily_behavior_logs collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { intentionId: 1, date: 1 },
    { unique: true, name: 'daily_logs_intentionId_date_unique' }
  );
  await col.createIndex(
    { userId: 1, date: 1 },
    { name: 'daily_logs_userId_date' }
  );
}
