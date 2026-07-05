/**
 * Restore confirmation token model — MongoDB collection
 * 'restore_confirmation_tokens'.
 *
 * Short-lived, single-use tokens that gate the actual restore call. An admin
 * must first request a token scoped to one specific backup filename; the
 * restore request must then present that exact token. This closes the gap
 * where a stale or replayed restore request (a leaked URL, a buggy client
 * retry) could fire a destructive restore well after the admin's actual
 * intent — the token expires in a couple of minutes and is deleted on use.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   token        string     Required. Opaque random value, unique.
 *   filename     string     Required. The one backup this token authorizes
 *                            restoring from.
 *   byUserId     string     Required. Keycloak `sub` of the admin who
 *                            requested it — the restore call must come from
 *                            the same user.
 *   createdAt    Date       Required.
 *   expiresAt    Date       Required. TTL-indexed; MongoDB automatically
 *                            deletes the document once this passes.
 */

export const COLLECTION = 'restore_confirmation_tokens';
export const TOKEN_TTL_MS = 2 * 60 * 1000;

/** MongoDB JSON Schema validator for the restore_confirmation_tokens collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['token', 'filename', 'byUserId', 'createdAt', 'expiresAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      token: { bsonType: 'string' },
      filename: { bsonType: 'string' },
      byUserId: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
      expiresAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the restore_confirmation_tokens collection: a unique
 * index on the token itself, and a TTL index so expired tokens are reaped
 * automatically by MongoDB rather than requiring a cleanup job.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { token: 1 },
    { unique: true, name: 'restore_confirmation_tokens_token_unique' }
  );
  await col.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'restore_confirmation_tokens_ttl' }
  );
}
