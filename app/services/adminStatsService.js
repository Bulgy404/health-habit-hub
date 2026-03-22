import { countHabitsByUser } from '../db/adminQueries.js';

/**
 * Build a chronological timeline of participant events.
 * @param {object} participant - Participant document
 * @param {Array} surveyResponses - Survey response documents
 * @param {Array} recDocs - Recommendation log documents
 * @returns {Array} Sorted timeline events
 */
function buildTimeline(participant, surveyResponses, recDocs) {
  const timeline = [];
  if (participant.enrolledAt) {
    timeline.push({
      type: 'enrolled',
      timestamp: participant.enrolledAt,
      detail: 'Participant enrolled',
    });
  }
  for (const sr of surveyResponses) {
    timeline.push({
      type: 'survey_completed',
      timestamp: sr.completedAt,
      detail: sr.surveyTitle || sr.surveyId,
    });
  }
  for (const rec of recDocs) {
    timeline.push({
      type: `recommendation_${rec.type}`,
      timestamp: rec.timestamp,
      detail: rec.recommendationId || '',
    });
  }
  timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return timeline;
}

/**
 * Aggregate progress statistics for a single participant.
 * Returns null if the participant is not found.
 * @param {{ db: object, neo4jRun: Function|null, id: string }} deps
 * @returns {Promise<object|null>}
 */
export async function getParticipantProgress({ db, neo4jRun, id }) {
  const participant = await db
    .collection('participants')
    .findOne({ userId: id, deletedAt: { $exists: false } });

  if (!participant) {
    return null;
  }

  const surveyResponses = await db
    .collection('survey_responses')
    .find({ participantId: id })
    .toArray();

  let habitsCount = 0;
  if (neo4jRun) {
    try {
      habitsCount = await countHabitsByUser(neo4jRun, id);
    } catch (err) {
      console.error('[adminStatsService] Neo4j error:', err);
      // Neo4j unavailable; habitsCount stays 0
    }
  } else {
    const habitDocs = await db
      .collection('habit_donations')
      .find({ participantId: id })
      .toArray();
    habitsCount = habitDocs.length;
  }

  const recDocs = await db
    .collection('recommendations_log')
    .find({ participantId: id })
    .toArray();
  const accepted = recDocs.filter((r) => r.type === 'accepted').length;
  const dismissed = recDocs.filter((r) => r.type === 'dismissed').length;

  const timeline = buildTimeline(participant, surveyResponses, recDocs);

  return {
    profile: {
      completed: participant.profileCompleted || false,
      completedAt: participant.profileCompletedAt || null,
    },
    surveys: surveyResponses.map((sr) => ({
      id: sr.surveyId,
      title: sr.surveyTitle || '',
      completedAt: sr.completedAt,
    })),
    habitsCount,
    recommendations: { accepted, dismissed },
    timeline,
  };
}

/**
 * Return all admin settings as a key→value map.
 * @param {{ db: object }} deps
 * @returns {Promise<object>}
 */
export async function getSettings({ db }) {
  const docs = await db.collection('admin_settings').find({}).toArray();
  const result = {};
  for (const doc of docs) {
    result[doc.key] = doc.value;
  }
  return result;
}

/**
 * Upsert a single admin setting.
 * @param {{ db: object, key: string, value: string }} deps
 * @returns {Promise<{ ok: boolean, key: string, value: string }>}
 */
export async function updateSetting({ db, key, value }) {
  await db
    .collection('admin_settings')
    .updateOne(
      { key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  return { ok: true, key, value };
}
