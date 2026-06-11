/**
 * Implementation Intention model — MongoDB collection 'implementation_intentions'.
 *
 * Schema:
 *   _id                ObjectId   Auto-generated
 *   userId             string     Required. User identifier.
 *   enrollmentId       ObjectId   Optional. Reference to enrollment.
 *   studyId            ObjectId   Optional. Reference to study.
 *   groupId            ObjectId   Optional. Reference to group.
 *   behaviorKey        string     Required. Unique behavior identifier.
 *   behaviorLabel      string     Required. Display label for the behavior.
 *   durationMinutes    int        Required. Duration of behavior in minutes.
 *   cues               Array<{    Required. 1-2 cue objects.
 *     text:     string
 *     cueId:    ObjectId (optional)
 *     source:   'pre_rated' | 'self_selected'
 *   }>
 *   intentionStatement string     Required. User's "if-then" statement.
 *   status             string     Required. 'active' | 'paused' | 'completed' | 'abandoned'
 *   createdAt          Date
 *   updatedAt          Date
 */

export const COLLECTION = 'implementation_intentions';

/** MongoDB JSON Schema validator for the implementation_intentions collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'userId',
      'behaviorKey',
      'behaviorLabel',
      'durationMinutes',
      'cues',
      'intentionStatement',
      'status',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      enrollmentId: { bsonType: ['objectId', 'null'] },
      studyId: { bsonType: ['objectId', 'null'] },
      groupId: { bsonType: ['objectId', 'null'] },
      behaviorKey: { bsonType: 'string' },
      behaviorLabel: { bsonType: 'string' },
      durationMinutes: { bsonType: 'int' },
      cues: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 2,
        items: {
          bsonType: 'object',
          required: ['text', 'source'],
          properties: {
            text: { bsonType: 'string' },
            cueId: { bsonType: ['objectId', 'null'] },
            source: {
              bsonType: 'string',
              enum: ['pre_rated', 'self_selected'],
            },
          },
        },
      },
      intentionStatement: { bsonType: 'string' },
      reminderTime: {
        bsonType: ['string', 'null'],
        pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      },
      status: {
        bsonType: 'string',
        enum: ['active', 'paused', 'completed', 'abandoned'],
      },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the implementation_intentions collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { userId: 1, status: 1 },
    { name: 'intentions_userId_status' }
  );
  await col.createIndex(
    { enrollmentId: 1 },
    { name: 'intentions_enrollmentId', sparse: true }
  );
}
