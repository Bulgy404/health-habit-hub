import { logger } from '../utils/logger.js';
import { countHabitsByUser } from '../db/adminQueries.js';
import { getParticipantWindows } from './questionnaireScheduleService.js';
import { listIntentions } from './intentionService.js';
import { COLLECTION as SRHI_COLLECTION } from '../models/srhiResponse.js';

/**
 * Build a chronological timeline of participant events.
 * @param {object} participant - Participant document
 * @param {Array} surveyResponses - Survey response documents
 * @param {Array} recDocs - Recommendation log documents
 * @returns {Array} Sorted timeline events
 */
const log = logger.child({ module: 'adminStatsService' });

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
  // Try admin-created participant first; fall back to any study enrollment
  const participant = await db
    .collection('participants')
    .findOne({ userId: id, deletedAt: { $exists: false } });

  if (!participant) {
    const enrollment = await db
      .collection('enrollments')
      .findOne({ userId: id });
    if (!enrollment) return null;
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
      log.error({ err: err }, '[adminStatsService] error');
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

  // Use participant doc if available, otherwise synthesise a minimal object for the timeline
  const timelineSource = participant ?? {};
  const timeline = buildTimeline(timelineSource, surveyResponses, recDocs);

  // Scheduled questionnaire windows + completion for this participant.
  let questionnaires = [];
  try {
    questionnaires = await getParticipantWindows({ db, userId: id });
  } catch (err) {
    log.error({ err }, '[adminStatsService] questionnaire windows error');
  }

  // Habits the participant actually created in-app (implementation
  // intentions). Distinct from the Neo4j *donated* Habit nodes counted above
  // — a participant can create habits without ever donating one.
  let createdHabits = [];
  try {
    createdHabits = await listIntentions({ db, userId: id });
  } catch (err) {
    log.error({ err }, '[adminStatsService] intentions error');
  }

  // SRHI check-in summary: completed = actually submitted. `total` counts every
  // scheduled window (submitted or not); the headline number the admin cares
  // about is `completed`.
  let srhi = { completed: 0, total: 0, latestScore: null };
  try {
    const rows = await db
      .collection(SRHI_COLLECTION)
      .find({ userId: String(id) })
      .sort({ scheduledFor: 1 })
      .toArray();
    const submitted = rows.filter((r) => r.submittedAt != null);
    const latest = submitted[submitted.length - 1];
    srhi = {
      completed: submitted.length,
      total: rows.length,
      latestScore: latest?.score ?? null,
    };
  } catch (err) {
    log.error({ err }, '[adminStatsService] srhi summary error');
  }

  return {
    profile: {
      completed: participant?.profileCompleted || false,
      completedAt: participant?.profileCompletedAt || null,
    },
    surveys: surveyResponses.map((sr) => ({
      id: sr.surveyId,
      title: sr.surveyTitle || '',
      completedAt: sr.completedAt,
    })),
    habitsCount,
    createdHabits: createdHabits.map((h) => ({
      id: h.id,
      behaviorLabel: h.behaviorLabel,
      intentionStatement: h.intentionStatement,
      status: h.status,
      createdAt: h.createdAt,
    })),
    srhi,
    recommendations: { accepted, dismissed },
    questionnaires,
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

const VALID_SETTINGS_KEYS = new Set(['token_card_format']);

/**
 * Upsert a single admin setting.
 * @param {{ db: object, key: string, value: string }} deps
 * @returns {Promise<{ ok: boolean, key: string, value: string }>}
 */
export async function updateSetting({ db, key, value }) {
  if (!VALID_SETTINGS_KEYS.has(key)) {
    return { error: `Unknown setting key: ${key}`, status: 400 };
  }
  await db
    .collection('admin_settings')
    .updateOne(
      { key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  return { ok: true, key, value };
}
