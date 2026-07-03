// app/services/devToolsService.js
//
// Local-only test helpers. Gated by ENABLE_TEST_TOOLS at the route layer —
// never enable in production.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shift the date fields of every matching document backward by [ms].
 * @returns {Promise<number>} number of documents updated
 */
async function shiftCollection(db, collection, filter, dateFields, dayStrFields, ms) {
  const docs = await db.collection(collection).find(filter).toArray();
  const ops = [];
  for (const doc of docs) {
    const $set = {};
    for (const f of dateFields) {
      if (doc[f]) $set[f] = new Date(new Date(doc[f]).getTime() - ms);
    }
    for (const f of dayStrFields) {
      if (doc[f]) {
        const shifted = new Date(new Date(`${doc[f]}T00:00:00Z`).getTime() - ms);
        $set[f] = shifted.toISOString().slice(0, 10);
      }
    }
    if (Object.keys($set).length > 0) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } });
    }
  }
  if (ops.length > 0) {
    await db.collection(collection).bulkWrite(ops, { ordered: false });
  }
  return ops.length;
}

/**
 * "Fast-forward" a participant by [days]: shift every timestamp associated with
 * them backward by that many days so their timeline appears further along.
 * Windows / SRHI / logs that were in the future become due now, letting you
 * exercise time-based flows without waiting.
 *
 * @param {{ db: object, neo4jRun?: Function|null, userId: string, days: number }} deps
 * @returns {Promise<Record<string, number>>} per-collection update counts
 */
export async function fastForwardParticipant({ db, neo4jRun, userId, days }) {
  const ms = days * DAY_MS;
  const uf = { userId: String(userId) };

  const shifted = {
    enrollments: await shiftCollection(db, 'enrollments', uf, ['enrolledAt', 'lastActiveAt'], [], ms),
    participants: await shiftCollection(db, 'participants', uf, ['enrolledAt', 'lastActive'], [], ms),
    intentions: await shiftCollection(db, 'implementation_intentions', uf, ['createdAt', 'updatedAt'], [], ms),
    dailyLogs: await shiftCollection(db, 'daily_behavior_logs', uf, ['loggedAt'], ['date'], ms),
    srhi: await shiftCollection(db, 'srhi_responses', uf, ['scheduledFor', 'submittedAt', 'createdAt'], [], ms),
    questionnaireWindows: await shiftCollection(db, 'questionnaire_windows', uf, ['scheduledFor', 'submittedAt'], [], ms),
    formResponses: await shiftCollection(db, 'form_responses', uf, ['submittedAt'], [], ms),
  };

  // Neo4j enrollment timestamps (stored as ISO strings on the ENROLLED_IN edge).
  if (neo4jRun) {
    try {
      await neo4jRun(
        `MATCH (u:User {userID: $userId})-[e:ENROLLED_IN]->(:Study)
         SET e.enrolledAt = CASE WHEN e.enrolledAt IS NULL THEN e.enrolledAt
               ELSE toString(datetime(e.enrolledAt) - duration({days: $days})) END,
             e.lastActiveAt = CASE WHEN e.lastActiveAt IS NULL THEN e.lastActiveAt
               ELSE toString(datetime(e.lastActiveAt) - duration({days: $days})) END`,
        { userId: String(userId), days }
      );
      shifted.neo4jEnrollment = 1;
    } catch {
      shifted.neo4jEnrollment = 0;
    }
  }

  return shifted;
}
