/**
 * §7.5 Gamification — user-level badge state, MongoDB collection
 * 'user_gamification'.
 *
 * Per-habit badges live on `implementation_intentions.earnedBadges` (see
 * gamificationService.js). Some badges aren't scoped to one habit — e.g.
 * Community Contributor, earned from sharing/donating habits, which isn't
 * tied to any single tracked intention — so those need a user-level home.
 * This collection holds only that: enough to avoid re-notifying a badge that
 * was already earned. Everything else (XP, level, share counts) is
 * recomputed fresh on every read, same as the rest of gamificationService.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   userId       string     Required. Keycloak `sub`.
 *   earnedBadges Array<{    Required (may be empty).
 *     badgeKey:  string
 *     earnedAt:  Date
 *   }>
 *   updatedAt    Date       Required.
 */

export const COLLECTION = 'user_gamification';

/** MongoDB JSON Schema validator for the user_gamification collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'earnedBadges', 'updatedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      earnedBadges: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['badgeKey', 'earnedAt'],
          properties: {
            badgeKey: { bsonType: 'string' },
            earnedAt: { bsonType: 'date' },
          },
        },
      },
      updatedAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the user_gamification collection.
 * Safe to call multiple times — createIndex is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { userId: 1 },
    { name: 'user_gamification_userId', unique: true }
  );
}
