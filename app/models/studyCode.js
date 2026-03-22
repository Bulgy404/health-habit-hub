/**
 * StudyCode model — MongoDB collection 'studyCodes'.
 *
 * Schema:
 *   _id              ObjectId  Auto-generated
 *   code             string    Unique. Format: HHH-XXXXX (5 uppercase alphanumeric chars).
 *   studyId          ObjectId  Ref to studies._id
 *   groupId          ObjectId  Ref to studies.groups[].id
 *   maxRedemptions   int|null  Maximum number of redemptions; null = unlimited.
 *   redemptionCount  int       Current number of times the code has been redeemed. Default 0.
 *   expiresAt        Date|null Expiry date; null = no expiry.
 *   createdAt        Date
 */

export const COLLECTION = 'studyCodes';

/** MongoDB JSON Schema validator for the studyCodes collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['code', 'studyId', 'groupId', 'redemptionCount', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      code: { bsonType: 'string' },
      studyId: { bsonType: 'objectId' },
      groupId: { bsonType: 'objectId' },
      maxRedemptions: { bsonType: ['int', 'null'] },
      redemptionCount: { bsonType: 'int', minimum: 0 },
      expiresAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the studyCodes collection.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  // Unique index on code for fast lookups and deduplication.
  await col.createIndex(
    { code: 1 },
    { unique: true, name: 'studyCodes_code_unique' }
  );
  // Index for fetching all codes belonging to a study.
  await col.createIndex({ studyId: 1 }, { name: 'studyCodes_studyId' });
}
