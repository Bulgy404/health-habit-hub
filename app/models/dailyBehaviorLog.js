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
 *   inCueContext string    Optional. Whether an enacted behaviour happened in
 *                          the planned cue situation (#64): 'yes' | 'no' |
 *                          'unsure'. Null or absent when not asked or not
 *                          answered (the prompt is skippable), on older logs,
 *                          and on misses (enacted: false).
 */

/** Answers to "In the planned situation?" (#64). */
export const CUE_CONTEXT_ANSWERS = /** @type {const} */ ([
  'yes',
  'no',
  'unsure',
]);

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
      inCueContext: {
        bsonType: ['string', 'null'],
        enum: ['yes', 'no', 'unsure', null],
      },
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
