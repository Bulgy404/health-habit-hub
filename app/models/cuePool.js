/**
 * Cue Pool model — MongoDB collection 'cue_pools'.
 *
 * Schema:
 *   _id        ObjectId   Auto-generated
 *   text       string     Required. The cue text.
 *   quality    string     Required. 'low' | 'high'
 *   dimensions object     Required. Cue quality dimensions.
 *     stability    int    1-5 scale
 *     salience     int    1-5 scale
 *     specificity  int    1-5 scale
 *   domain     string     Required. Cue domain/category.
 *   language   string     Required. 'en' | 'de' | 'ja'
 *   createdAt  Date       Required.
 */

export const COLLECTION = 'cue_pools';

/** MongoDB JSON Schema validator for the cue_pools collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'text',
      'quality',
      'dimensions',
      'domain',
      'language',
      'createdAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      text: { bsonType: 'string' },
      quality: { bsonType: 'string', enum: ['low', 'high'] },
      dimensions: {
        bsonType: 'object',
        required: ['stability', 'salience', 'specificity'],
        properties: {
          stability: { bsonType: 'int', minimum: 1, maximum: 5 },
          salience: { bsonType: 'int', minimum: 1, maximum: 5 },
          specificity: { bsonType: 'int', minimum: 1, maximum: 5 },
        },
      },
      domain: { bsonType: 'string' },
      language: { bsonType: 'string', enum: ['en', 'de', 'ja'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the cue_pools collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { quality: 1, domain: 1, language: 1 },
    { name: 'cue_pools_quality_domain_lang' }
  );
}
