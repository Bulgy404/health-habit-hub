import { stringify } from 'csv-stringify/sync';
import { ObjectId } from 'mongodb';
import { COLLECTION as SRHI } from '../models/srhiResponse.js';
import { COLLECTION as LOGS } from '../models/dailyBehaviorLog.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as INTENTIONS } from '../models/implementationIntention.js';

const FORM_RESPONSES = 'form_responses';

async function enrollmentMap(db, studyId) {
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const docs = await db.collection(ENROLLMENTS).find(filter).toArray();
  return Object.fromEntries(docs.map((e) => [e.userId, e]));
}

/**
 * Build a CSV string of all SRHI survey responses for a study.
 * @param {{ db: object, studyId?: string }} deps
 * @returns {Promise<string>} CSV content including header row.
 */
export async function buildSrhiCsv({ db, studyId }) {
  const eMap = await enrollmentMap(db, studyId);
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const rows = await db.collection(SRHI).find(filter).toArray();

  const records = rows.map((r) => {
    const e = eMap[r.userId] ?? {};
    return {
      userId: r.userId,
      studyId: r.studyId?.toString() ?? 'NA',
      groupLabel: e.cueConfig
        ? `${e.cueConfig.cueSource}/${e.cueConfig.cueCount}`
        : 'NA',
      cueSource: e.cueConfig?.cueSource ?? 'NA',
      cueCount: e.cueConfig?.cueCount ?? 'NA',
      weekNumber: r.weekNumber,
      scheduledFor: r.scheduledFor?.toISOString() ?? 'NA',
      submittedAt: r.submittedAt?.toISOString() ?? 'NA',
      score: r.score ?? 'NA',
      missed: r.submittedAt == null ? 'TRUE' : 'FALSE',
    };
  });

  return stringify(records, { header: true });
}

/**
 * Build a CSV string of all daily behavior log entries for a study.
 * @param {{ db: object, studyId?: string }} deps
 * @returns {Promise<string>} CSV content including header row.
 */
export async function buildDailyLogsCsv({ db, studyId }) {
  const eMap = await enrollmentMap(db, studyId);
  const intentionFilter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const intentions = await db
    .collection(INTENTIONS)
    .find(intentionFilter)
    .toArray();
  const intentionIds = intentions.map((i) => i._id);

  const logFilter = intentionIds.length
    ? { intentionId: { $in: intentionIds } }
    : {};
  const logs = await db.collection(LOGS).find(logFilter).toArray();

  const iMap = Object.fromEntries(intentions.map((i) => [i._id.toString(), i]));

  const records = logs.map((l) => {
    const intention = iMap[l.intentionId?.toString()] ?? {};
    const e = eMap[l.userId] ?? {};
    const dayNumber = intention.createdAt
      ? Math.floor((new Date(l.date) - intention.createdAt) / 86400000) + 1
      : 'NA';
    return {
      userId: l.userId,
      studyId: intention.studyId?.toString() ?? 'NA',
      groupLabel: e.cueConfig
        ? `${e.cueConfig.cueSource}/${e.cueConfig.cueCount}`
        : 'NA',
      cueSource: e.cueConfig?.cueSource ?? 'NA',
      cueCount: e.cueConfig?.cueCount ?? 'NA',
      date: l.date,
      dayNumber,
      enacted: l.enacted == null ? 'NA' : l.enacted ? 'TRUE' : 'FALSE',
      loggedAt: l.loggedAt?.toISOString() ?? 'NA',
    };
  });

  return stringify(records, { header: true });
}

/**
 * Build a CSV string of all questionnaire (form) responses for a study.
 *
 * Each row is one participant's submission for one questionnaire. Answers are
 * flattened: every unique answer key across all responses becomes a column.
 *
 * @param {{ db: object, studyId?: string }} deps
 * @returns {Promise<string>} CSV content including header row.
 */
export async function buildQuestionnaireResponsesCsv({ db, studyId }) {
  const eMap = await enrollmentMap(db, studyId);
  const userIds = Object.keys(eMap);

  const filter = userIds.length ? { userId: { $in: userIds } } : {};
  const rows = await db
    .collection(FORM_RESPONSES)
    .find(filter)
    .sort({ submittedAt: 1 })
    .toArray();

  if (rows.length === 0) return stringify([], { header: true });

  // Collect all answer keys across all responses to build a stable column set.
  const answerKeys = new Set();
  for (const r of rows) {
    for (const key of Object.keys(r.answers ?? {})) answerKeys.add(key);
  }
  const sortedKeys = [...answerKeys].sort();

  const records = rows.map((r) => {
    const e = eMap[r.userId] ?? {};
    const base = {
      userId: r.userId,
      studyId: studyId ?? 'NA',
      group: e.group ?? 'NA',
      questionnaireSlug: r.questionnaireSlug ?? 'NA',
      submittedAt: r.submittedAt?.toISOString() ?? 'NA',
    };
    for (const key of sortedKeys) {
      base[`answer_${key}`] = r.answers?.[key] ?? 'NA';
    }
    return base;
  });

  return stringify(records, { header: true });
}

/**
 * Build a CSV string of dropout statistics for all enrollments in a study.
 * @param {{ db: object, studyId?: string }} deps
 * @returns {Promise<string>} CSV content including header row.
 */
export async function buildDropoutCsv({ db, studyId }) {
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const enrollments = await db.collection(ENROLLMENTS).find(filter).toArray();

  const records = enrollments.map((e) => ({
    userId: e.userId,
    studyId: e.studyId?.toString() ?? 'NA',
    groupLabel: e.cueConfig
      ? `${e.cueConfig.cueSource}/${e.cueConfig.cueCount}`
      : 'NA',
    enrolledAt: e.enrolledAt?.toISOString() ?? 'NA',
    lastActiveDate: e.lastActiveAt?.toISOString() ?? 'NA',
    droppedOutAt: e.droppedOutAt?.toISOString() ?? 'NA',
    daysObserved:
      e.enrolledAt && e.lastActiveAt
        ? Math.floor((e.lastActiveAt - e.enrolledAt) / 86400000)
        : 'NA',
    dropped: e.droppedOutAt ? 'TRUE' : 'FALSE',
  }));

  return stringify(records, { header: true });
}
