import { randomUUID, randomBytes, createHash } from 'node:crypto';

// Whitelist of valid Neo4j group labels (prevents Cypher label injection)
const VALID_GROUPS = new Set([
  'hhh__Group1',
  'hhh__Group2',
  'hhh__Group3',
  'hhh__Group4',
]);

const GROUP_LABEL_MAP = {
  G1: 'hhh__Group1',
  G2: 'hhh__Group2',
  G3: 'hhh__Group3',
  G4: 'hhh__Group4',
};

function randomPassword() {
  return randomBytes(12).toString('base64url');
}

/**
 * List all non-deleted participants.
 * @param {{ db: object }} deps
 * @returns {Promise<Array>}
 */
export async function listParticipants({ db }) {
  const participants = await db
    .collection('participants')
    .find({ deletedAt: { $exists: false } })
    .toArray();

  return participants.map((p) => ({
    userId: p.userId,
    username: p.username,
    group: p.group || null,
    enrolledAt: p.enrolledAt,
    lastActive: p.lastActive || null,
    surveyCompletionPct: p.surveyCompletionPct || 0,
  }));
}

/**
 * Create a new participant in Keycloak and MongoDB.
 * @param {{ db: object, kc: object }} deps
 * @returns {Promise<{ userId: string, username: string, password: string, tokenCardUrl: string }>}
 */
export async function createParticipant({ db, kc }) {
  const userId = randomUUID();
  const username = `p-${userId}`;
  const password = randomPassword();

  await kc.createUser({ userId, username, password });
  await kc.assignRole(userId, 'participant');

  const now = new Date();
  await db.collection('participants').insertOne({
    userId,
    username,
    password,
    group: null,
    enrolledAt: now,
    lastActive: null,
    surveyCompletionPct: 0,
  });

  return {
    userId,
    username,
    password,
    tokenCardUrl: `/api/v1/admin/participants/${userId}/token-card`,
  };
}

/**
 * Assign a study group to a participant (MongoDB + Keycloak + Neo4j).
 * Returns null if participant not found.
 * @param {{ db: object, neo4jRun: Function|null, kc: object, id: string, group: string }} deps
 * @returns {Promise<{ ok: boolean, userId: string, group: string }|null>}
 */
export async function assignGroup({ db, neo4jRun, kc, id, group }) {
  await kc.updateUserAttribute(id, 'group', group);

  const result = await db
    .collection('participants')
    .updateOne(
      { userId: id, deletedAt: { $exists: false } },
      { $set: { group } }
    );

  if (result.matchedCount === 0) {
    return null;
  }

  if (neo4jRun) {
    const newLabel = GROUP_LABEL_MAP[group];
    if (VALID_GROUPS.has(newLabel)) {
      const cypher = [
        'MATCH (d:hhh__Donor {hhh__id: $userId})',
        'REMOVE d:hhh__Group1 REMOVE d:hhh__Group2 REMOVE d:hhh__Group3 REMOVE d:hhh__Group4',
        `SET d:\`${newLabel}\``,
        'RETURN d',
      ].join(' ');
      await neo4jRun(cypher, { userId: id }).catch(() => {});
    }
  }

  return { ok: true, userId: id, group };
}

/**
 * Look up a single non-deleted participant by userId.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<object|null>}
 */
export async function getParticipant({ db, id }) {
  return db
    .collection('participants')
    .findOne({ userId: id, deletedAt: { $exists: false } });
}

/**
 * Soft-delete a participant (set deletedAt + anonymize username).
 * Returns null if participant not found.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<{ ok: boolean }|null>}
 */
export async function softDeleteParticipant({ db, id }) {
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
  const anonymizedUsername = `deleted-${hash}`;

  const result = await db
    .collection('participants')
    .updateOne(
      { userId: id, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date(), username: anonymizedUsername } }
    );

  if (result.matchedCount === 0) {
    return null;
  }

  return { ok: true };
}
