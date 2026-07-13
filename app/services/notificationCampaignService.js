import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/notificationCampaign.js';
import { getUsersForStudy } from './enrollmentNeo4j.js';

const DEVICE_TOKENS = 'deviceTokens';

/**
 * Create a new notification campaign document.
 * @param {{ db: object, createdBy: string, studyId?: string, title: string, body: string, targetType: string, targetIds?: Array, scheduledFor?: string|null }} deps
 * @returns {Promise<object>} The created campaign document with its generated id.
 */
export async function createCampaign({
  db,
  createdBy,
  studyId,
  title,
  body,
  targetType,
  targetIds = [],
  scheduledFor = null,
}) {
  const now = new Date();
  const doc = {
    studyId: studyId ? new ObjectId(studyId) : null,
    createdBy,
    title,
    body,
    targetType,
    targetIds,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    sentAt: null,
    recipientCount: null,
    status: scheduledFor ? 'scheduled' : 'draft',
    createdAt: now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

/**
 * List notification campaigns, optionally filtered by study and status (paginated).
 * @param {{ db: object, studyId?: string, status?: string, page?: number, limit?: number }} deps
 * @returns {Promise<Array>} Serialized campaign objects.
 */
export async function listCampaigns({
  db,
  studyId,
  status,
  page = 1,
  limit = 20,
}) {
  const filter = {};
  if (studyId) filter.studyId = new ObjectId(studyId);
  if (status) filter.status = String(status);
  const docs = await db
    .collection(COLLECTION)
    .find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  return docs.map(serialize);
}

/**
 * Cancel an unsent notification campaign by id.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<{ cancelled: boolean }|{ notFound: boolean }>}
 */
export async function cancelCampaign({ db, id }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }
  const result = await db
    .collection(COLLECTION)
    .findOneAndUpdate(
      { _id: oid, sentAt: null },
      { $set: { status: 'cancelled' } },
      { returnDocument: 'after' }
    );
  return result ? { cancelled: true } : { notFound: true };
}

/**
 * Resolve target user FCM tokens and dispatch via injected `send` callback.
 * `send` is injected so tests can mock it; production passes the Firebase sender.
 * @param {{ db: object, id: string, send: function(string[], string, string): Promise<number>, neo4jRun?: Function }} deps
 * @returns {Promise<{ recipientCount: number, sentAt: Date }|{ notFound: boolean }>}
 */
export async function sendCampaign({ db, id, send, neo4jRun }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }
  const campaign = await db.collection(COLLECTION).findOne({ _id: oid });
  if (!campaign) return { notFound: true };

  let userIds = [];
  if (campaign.targetType === 'individual') {
    userIds = campaign.targetIds;
  } else if (campaign.targetType === 'group') {
    if (neo4jRun) {
      const rows = await neo4jRun(
        `MATCH (u:User)-[e:ENROLLED_IN]->(:Study)
         WHERE e.groupId IN $groupIds
         RETURN u.userID AS userId`,
        { groupIds: campaign.targetIds }
      );
      userIds = (rows || []).map((r) => r.userId);
    }
  } else {
    // 'all' target type
    if (neo4jRun) {
      if (campaign.studyId) {
        const enrolled = await getUsersForStudy(
          neo4jRun,
          campaign.studyId.toString()
        );
        userIds = enrolled.map((e) => e.userId);
      } else {
        const rows = await neo4jRun(
          `MATCH (u:User)-[:ENROLLED_IN]->(:Study) RETURN u.userID AS userId`
        );
        userIds = (rows || []).map((r) => r.userId);
      }
    }
  }

  const tokenDocs = await db
    .collection(DEVICE_TOKENS)
    .find({ userId: { $in: userIds } })
    .toArray();
  const tokens = tokenDocs.map((t) => t.token).filter(Boolean);

  // Diagnostics so callers (and the admin UI) can tell *why* a send reached
  // nobody: no enrolled users vs. enrolled users with no registered device vs.
  // devices present but every push failed. Persisted on the campaign doc too.
  const resolvedUserCount = userIds.length;
  const tokenCount = tokens.length;

  const recipientCount =
    tokenCount > 0 ? await send(tokens, campaign.title, campaign.body) : 0;
  const now = new Date();
  await db.collection(COLLECTION).findOneAndUpdate(
    { _id: oid },
    {
      $set: {
        sentAt: now,
        recipientCount,
        resolvedUserCount,
        tokenCount,
        status: 'sent',
      },
    },
    { returnDocument: 'after' }
  );
  return { recipientCount, resolvedUserCount, tokenCount, sentAt: now };
}

/**
 * Dispatch every campaign whose scheduled time has arrived. Called on a timer
 * by the notification scheduler. Each due campaign is resolved and sent exactly
 * like an immediate send (`sendCampaign` flips its status to 'sent', so it is
 * never picked up twice). Cancelled campaigns are excluded by the status
 * filter.
 * @param {{ db: object, send: function(string[], string, string): Promise<number>, neo4jRun?: Function, now?: Date }} deps
 * @returns {Promise<Array<{ id: string, recipientCount: number, resolvedUserCount: number, tokenCount: number }>>}
 */
export async function dispatchDueCampaigns({
  db,
  send,
  neo4jRun,
  now = new Date(),
}) {
  const due = await db
    .collection(COLLECTION)
    .find({ status: 'scheduled', scheduledFor: { $lte: now } })
    .toArray();

  const results = [];
  for (const campaign of due) {
    const result = await sendCampaign({
      db,
      id: campaign._id.toString(),
      send,
      neo4jRun,
    });
    if (!result.notFound) {
      results.push({ id: campaign._id.toString(), ...result });
    }
  }
  return results;
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    studyId: doc.studyId?.toString() ?? null,
    createdBy: doc.createdBy,
    title: doc.title,
    body: doc.body,
    targetType: doc.targetType,
    targetIds: doc.targetIds,
    scheduledFor: doc.scheduledFor,
    sentAt: doc.sentAt,
    recipientCount: doc.recipientCount,
    resolvedUserCount: doc.resolvedUserCount ?? null,
    tokenCount: doc.tokenCount ?? null,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}
