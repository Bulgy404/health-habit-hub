/**
 * Restore-attempt security log — MongoDB collection 'restore_attempts'.
 *
 * Append-only record of every POST /restore call, written by
 * app/routes/restoreRouter.js. Recovery phrases have no server-side secret
 * or KDF slowing down a guess (see restoreRouter.js's rate-limiter comment),
 * so this collection exists to give admins visibility into
 * enumeration/brute-force attempts that the per-IP rate limiter alone
 * doesn't surface — e.g. one IP cycling through many attempts just under
 * the 429 threshold, or hammering one specific decoded username.
 *
 * Schema:
 *   _id                ObjectId   Auto-generated
 *   ip                 string     Required. Rate-limiter's key for the
 *                                   request (matches ipKeyGenerator(req)),
 *                                   so grouping here lines up with the
 *                                   429 bucket the caller actually hit.
 *   usernameAttempted  string     Optional. The decoded UUID, when the
 *                                   phrase was well-formed enough to decode
 *                                   (even if Keycloak then rejected it).
 *                                   null when the phrase itself was
 *                                   malformed (wrong word count / bad word).
 *   outcome            string     Required. 'success' | 'invalid_phrase' |
 *                                   'invalid_credentials' | 'rate_limited' |
 *                                   'keycloak_unreachable'.
 *   createdAt          Date       Required.
 */

export const COLLECTION = 'restore_attempts';

/** MongoDB JSON Schema validator for the restore_attempts collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['ip', 'outcome', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      ip: { bsonType: 'string' },
      usernameAttempted: { bsonType: ['string', 'null'] },
      outcome: {
        bsonType: 'string',
        enum: [
          'success',
          'invalid_phrase',
          'invalid_credentials',
          'rate_limited',
          'keycloak_unreachable',
        ],
      },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the restore_attempts collection.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { createdAt: -1 },
    { name: 'restore_attempts_createdAt' }
  );
  await col.createIndex(
    { ip: 1, createdAt: -1 },
    { name: 'restore_attempts_ip' }
  );
  // TTL: these are operational security signal, not a permanent record —
  // 30 days is enough to spot a slow-burn enumeration campaign without the
  // collection growing unbounded from routine legitimate restores/retries.
  await col.createIndex(
    { createdAt: 1 },
    { name: 'restore_attempts_ttl', expireAfterSeconds: 60 * 60 * 24 * 30 }
  );
}
