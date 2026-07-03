import { randomUUID, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateTokenCard } from './tokenCardService.js';
import { recoveryPhrasesEnabled } from '../utils/recoveryPhrase.js';

// Whitelist of valid Neo4j group labels (prevents Cypher label injection)
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

  // Recovery phrases are account secrets; only surface them when explicitly
  // enabled (local test/verification), never in production.
  const exposePhrase = recoveryPhrasesEnabled();

  return participants.map((p) => ({
    userId: p.userId,
    username: p.username,
    group: p.group || null,
    enrolledAt: p.enrolledAt,
    lastActive: p.lastActive || null,
    surveyCompletionPct: p.surveyCompletionPct || 0,
    // Recovery phrase for self-onboarded/seeded accounts (null for admin
    // token-card accounts). hasTokenCard signals a downloadable card exists.
    recoveryPhrase: exposePhrase ? p.recoveryPhrase || null : null,
    hasTokenCard: !!p.tokenCardPdf,
  }));
}

/**
 * Create a new participant in Keycloak and MongoDB.
 * @param {{ db: object, kc: object }} deps
 * @returns {Promise<{ userId: string, username: string, tokenCardUrl: string }>}
 */
export async function createParticipant({ db, kc }) {
  const userId = randomUUID();
  const username = `p-${userId}`;
  const password = randomPassword();

  const keycloakUserId = await kc.createUser({ userId, username, password });
  await kc.assignRole(keycloakUserId || userId, 'user');

  // Generate PDF while we still have the plaintext password
  const tokenCardPdf = await generateTokenCard(
    userId,
    username,
    password,
    'both'
  );

  // Hash password — never store plaintext
  const passwordHash = await bcrypt.hash(password, 10);

  const now = new Date();
  await db.collection('participants').insertOne({
    userId,
    username,
    passwordHash,
    tokenCardPdf,
    group: null,
    enrolledAt: now,
    lastActive: null,
    surveyCompletionPct: 0,
  });

  return {
    userId,
    username,
    tokenCardUrl: `/api/v1/admin/participants/${userId}/token-card`,
  };
}

/**
 * Assign a study group to a participant (MongoDB + Keycloak).
 * The legacy Neo4j hhh__GroupN label write was removed with the old n10s
 * schema — group membership lives in MongoDB and the Keycloak `group`
 * attribute only.
 * Returns null if participant not found.
 * @param {{ db: object, kc: object, id: string, group: string }} deps
 * @returns {Promise<{ ok: boolean, userId: string, group: string }|null>}
 */
export async function assignGroup({ db, kc, id, group }) {
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
