/**
 * Habit comment ownership model — MongoDB collection 'habit_comments'.
 *
 * The comment TEXT lives as an anonymous `Comment` node in Neo4j
 * (`(:Comment)-[:COMMENT_ON]->(:Habit)`); this collection only maps comment
 * ids to their authors so that rate limiting works and account deletion can
 * erase a participant's comments without de-anonymising the public graph.
 *
 * Schema:
 *   _id        ObjectId   Auto-generated
 *   commentId  string     Required. UUID of the Neo4j Comment node.
 *   habitId    string     Required. UUID of the commented Habit node.
 *   userId     string     Required. Keycloak `sub` of the author.
 *   createdAt  Date       Required.
 */

export const COLLECTION = 'habit_comments';

/** MongoDB JSON Schema validator for the habit_comments collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['commentId', 'habitId', 'userId', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      commentId: { bsonType: 'string' },
      habitId: { bsonType: 'string' },
      userId: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the habit_comments collection.
 * Safe to call multiple times — createIndex is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { commentId: 1 },
    { name: 'habit_comments_commentId', unique: true }
  );
  await col.createIndex({ userId: 1 }, { name: 'habit_comments_userId' });
}
