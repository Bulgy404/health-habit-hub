/**
 * Consent model — MongoDB collection 'consents'.
 *
 * Append-only audit trail of informed-consent acceptances (HabConnect IC).
 * One document per accepted document version per user; the latest record
 * (by consentedAt) is the user's current consent state.
 *
 * Schema:
 *   _id             ObjectId   Auto-generated
 *   userId          string     Required. Keycloak `sub`.
 *   consentVersion  string     Required. Front-matter version of the accepted
 *                              consent document (e.g. "1.0.0").
 *   locale          string     Locale the document was read in ('en'|'de'|'ja')
 *                              or null when unknown.
 *   consentedAt     Date       Required. Acceptance timestamp (server time).
 */

export const COLLECTION = 'consents';

/** MongoDB JSON Schema validator for the consents collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'consentVersion', 'consentedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      consentVersion: {
        bsonType: 'string',
        pattern: '^\\d+\\.\\d+\\.\\d+$',
      },
      locale: { bsonType: ['string', 'null'], enum: ['en', 'de', 'ja', null] },
      consentedAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the consents collection.
 * Safe to call multiple times — createIndex is idempotent.
 * Supports the two access patterns: "latest consent for user" (read) and
 * per-user deletion on account erasure.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { userId: 1, consentedAt: -1 },
    { name: 'consents_userId_consentedAt' }
  );
}
