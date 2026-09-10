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
 *   documentSlug    string|null Which consent document this record is for.
 *                              null (or absent) = the platform-wide document,
 *                              which is the only one that existed historically.
 *                              A named slug identifies an additional document,
 *                              e.g. a study-specific consent that a participant
 *                              accepts *in addition to* the platform one.
 *                              Without this field the two are indistinguishable:
 *                              `consentVersion` is a bare semver, so a second
 *                              document's "1.0.0" would satisfy a check for the
 *                              platform document's "1.0.0" and vice versa.
 *   locale          string     Locale the document was read in
 *                              ('en'|'de'|'ja'|'fr'|'nl') or null when unknown.
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
      documentSlug: {
        bsonType: ['string', 'null'],
        pattern: '^[a-z0-9][a-z0-9-]{0,63}$',
      },
      locale: {
        bsonType: ['string', 'null'],
        enum: ['en', 'de', 'ja', 'fr', 'nl', null],
      },
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
  // "latest consent for this user *for this document*". Kept alongside the
  // index above rather than replacing it: per-user erasure and the legacy
  // "latest consent overall" read still want the two-field form.
  await col.createIndex(
    { userId: 1, documentSlug: 1, consentedAt: -1 },
    { name: 'consents_userId_documentSlug_consentedAt' }
  );
}
