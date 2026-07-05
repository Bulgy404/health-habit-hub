// app/services/studyAnalyticsService.js
import { ObjectId } from 'mongodb';
import { getUsersForStudy } from './enrollmentNeo4j.js';

const DAILY_LOGS = 'daily_behavior_logs';
const SRHI = 'srhi_responses';
const FORM_RESPONSES = 'form_responses';
const STUDIES = 'studies';
const QUESTIONNAIRES = 'questionnaires';
const INTENTIONS = 'implementation_intentions';

/** Normalise a Neo4j Integer (or plain value) to a JS number. */
function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'object' && typeof v.toNumber === 'function') {
    return v.toNumber();
  }
  return Number(v) || 0;
}

/** Coerce a Neo4j date/string to a YYYY-MM-DD string, or null. */
function toDay(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

/**
 * Return per-group weekly active rate: percentage of enrolled participants with at least one log in the last 7 days.
 * @param {{ db: object, studyId: string, neo4jRun: Function }} deps
 * @returns {Promise<Array<{ groupId: string, enrolled: number, active: number, rate: number }>>}
 */
export async function getWeeklyActiveRate({ db, studyId, neo4jRun }) {
  const enrollments = neo4jRun ? await getUsersForStudy(neo4jRun, studyId) : [];

  if (enrollments.length === 0) return [];

  const byGroup = {};
  for (const e of enrollments) {
    const gid = e.groupId ?? 'unknown';
    byGroup[gid] = byGroup[gid] ?? { groupId: gid, userIds: [] };
    byGroup[gid].userIds.push(e.userId);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const results = [];
  for (const { groupId, userIds } of Object.values(byGroup)) {
    const activeDocs = await db
      .collection(DAILY_LOGS)
      .aggregate([
        { $match: { userId: { $in: userIds }, date: { $gte: cutoffStr } } },
        { $group: { _id: '$userId' } },
      ])
      .toArray();
    const active = activeDocs.length;
    const enrolled = userIds.length;
    results.push({
      groupId,
      enrolled,
      active,
      rate: enrolled > 0 ? active / enrolled : 0,
    });
  }
  return results;
}

/**
 * Return mean SRHI score per group per week for submitted responses only.
 * @param {{ db: object, studyId: string }} deps
 * @returns {Promise<Array<{ groupId: string|null, weekNumber: number, meanScore: number, count: number }>>}
 */
export async function getMeanSrhiTrajectory({ db, studyId }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return [];
  }

  const docs = await db
    .collection(SRHI)
    .aggregate([
      {
        $match: {
          studyId: oid,
          submittedAt: { $ne: null },
          score: { $ne: null },
        },
      },
      {
        $group: {
          _id: { groupId: '$groupId', weekNumber: '$weekNumber' },
          meanScore: { $avg: '$score' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.weekNumber': 1 } },
    ])
    .toArray();

  return docs.map((d) => ({
    groupId: d._id.groupId?.toString() ?? null,
    weekNumber: d._id.weekNumber,
    meanScore: Math.round(d.meanScore * 100) / 100,
    count: d.count,
  }));
}

/**
 * Return cumulative dropout count per group by date, sorted ascending.
 * @param {{ db: object, studyId: string, neo4jRun: Function }} deps
 * @returns {Promise<Array<{ groupId: string, date: string, cumulative: number }>>}
 */
export async function getDropoutCurve({ db: _db, studyId, neo4jRun }) {
  if (!neo4jRun) return [];

  const rows = await neo4jRun(
    `MATCH (u:User)-[e:ENROLLED_IN]->(s:Study {uuid: $studyId})
     WHERE e.droppedOutAt IS NOT NULL
     RETURN e.groupId AS groupId, e.droppedOutAt AS droppedOutAt`,
    { studyId: String(studyId) }
  );

  if (!rows || rows.length === 0) return [];

  const byGroup = {};
  for (const e of rows) {
    const gid = e.groupId ?? 'unknown';
    const raw = e.droppedOutAt;
    const date =
      raw instanceof Date
        ? raw.toISOString().split('T')[0]
        : String(raw).split('T')[0];
    byGroup[gid] = byGroup[gid] ?? [];
    byGroup[gid].push(date);
  }

  const result = [];
  for (const [groupId, dates] of Object.entries(byGroup)) {
    dates.sort();
    let cumulative = 0;
    for (const date of dates) {
      cumulative++;
      result.push({ groupId, date, cumulative });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Return completion rates for each questionnaire assigned to a study.
 *
 * For every questionnaire linked to the study, counts how many enrolled
 * participants have at least one response.
 *
 * @param {{ db: object, studyId: string, neo4jRun: Function }} deps
 * @returns {Promise<Array<{ questionnaireId: string, slug: string, title: string, enrolled: number, completed: number, rate: number }>>}
 */
export async function getQuestionnaireCompletionRates({
  db,
  studyId,
  neo4jRun,
}) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return [];
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (
    !study ||
    !Array.isArray(study.questionnaires) ||
    study.questionnaires.length === 0
  ) {
    return [];
  }

  const questionnaireIds = study.questionnaires.map((id) =>
    id instanceof ObjectId ? id : new ObjectId(id)
  );

  const enrollments = neo4jRun ? await getUsersForStudy(neo4jRun, studyId) : [];

  const questionnaires = await db
    .collection(QUESTIONNAIRES)
    .find({ _id: { $in: questionnaireIds } })
    .toArray();

  const enrolledUserIds = enrollments.map((e) => e.userId);
  const enrolled = enrolledUserIds.length;
  if (enrolled === 0 || questionnaires.length === 0) return [];

  return Promise.all(
    questionnaires.map(async (q) => {
      const slug = q.slug ?? q._id.toString();
      const uniqueRespondents = await db
        .collection(FORM_RESPONSES)
        .aggregate([
          {
            $match: {
              userId: { $in: enrolledUserIds },
              questionnaireSlug: slug,
            },
          },
          { $group: { _id: '$userId' } },
          { $count: 'n' },
        ])
        .toArray();
      const completed = uniqueRespondents[0]?.n ?? 0;
      return {
        questionnaireId: q._id.toString(),
        slug,
        title: q.title ?? slug,
        enrolled,
        completed,
        rate: enrolled > 0 ? completed / enrolled : 0,
      };
    })
  );
}

/**
 * Cumulative enrolment count per group over time (recruitment progress).
 * @param {{ studyId: string, neo4jRun: Function }} deps
 * @returns {Promise<Array<{ groupId: string, date: string, cumulative: number }>>}
 */
export async function getEnrollmentTrend({ studyId, neo4jRun }) {
  if (!neo4jRun) return [];
  const rows = await neo4jRun(
    `MATCH (u:User)-[e:ENROLLED_IN]->(:Study {uuid: $studyId})
     WHERE e.enrolledAt IS NOT NULL
     RETURN e.groupId AS groupId, e.enrolledAt AS enrolledAt`,
    { studyId: String(studyId) }
  );
  if (!rows || rows.length === 0) return [];

  const byGroup = {};
  for (const r of rows) {
    const gid = r.groupId ?? 'unknown';
    const date = toDay(r.enrolledAt);
    if (!date) continue;
    byGroup[gid] = byGroup[gid] ?? [];
    byGroup[gid].push(date);
  }

  const result = [];
  for (const [groupId, dates] of Object.entries(byGroup)) {
    dates.sort();
    let cumulative = 0;
    // Collapse to one point per date (cumulative at end of that day).
    const perDay = {};
    for (const d of dates) perDay[d] = (perDay[d] ?? 0) + 1;
    for (const d of Object.keys(perDay).sort()) {
      cumulative += perDay[d];
      result.push({ groupId, date: d, cumulative });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Distinct active participants (≥1 log) per day over the last [days] days.
 * @param {{ db, studyId, neo4jRun, days? }} deps
 * @returns {Promise<Array<{ date: string, count: number }>>}
 */
export async function getDailyActive({ db, studyId, neo4jRun, days = 30 }) {
  const enrollments = neo4jRun ? await getUsersForStudy(neo4jRun, studyId) : [];
  const userIds = enrollments.map((e) => e.userId).filter(Boolean);
  if (userIds.length === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .collection(DAILY_LOGS)
    .aggregate([
      { $match: { userId: { $in: userIds }, date: { $gte: cutoffStr } } },
      { $group: { _id: { date: '$date', userId: '$userId' } } },
      { $group: { _id: '$_id.date', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return rows.map((r) => ({ date: r._id, count: r.count }));
}

/**
 * Donated-habit count per group.
 * @param {{ studyId: string, neo4jRun: Function }} deps
 * @returns {Promise<Array<{ groupId: string, habits: number }>>}
 */
export async function getHabitsByGroup({ studyId, neo4jRun }) {
  if (!neo4jRun) return [];
  const rows = await neo4jRun(
    `MATCH (u:User)-[e:ENROLLED_IN]->(:Study {uuid: $studyId})
     OPTIONAL MATCH (u)-[:DONATED]->(h:Habit)
     WHERE h IS NULL OR coalesce(h.is_habit, true) = true
     RETURN e.groupId AS groupId, count(h) AS habits`,
    { studyId: String(studyId) }
  );
  return (rows || []).map((r) => ({
    groupId: r.groupId ?? 'unknown',
    habits: toNum(r.habits),
  }));
}

/**
 * Engagement totals for a study's enrolled participants.
 * @param {{ db, studyId, neo4jRun }} deps
 * @returns {Promise<{ totalHabits, totalLogs, totalIntentions, avgLogsPerActive, avgIntentionsPerParticipant }>}
 */
export async function getEngagementSummary({ db, studyId, neo4jRun }) {
  const enrollments = neo4jRun ? await getUsersForStudy(neo4jRun, studyId) : [];
  const userIds = enrollments.map((e) => e.userId).filter(Boolean);
  const empty = {
    totalHabits: 0,
    totalLogs: 0,
    totalIntentions: 0,
    avgLogsPerActive: 0,
    avgIntentionsPerParticipant: 0,
  };
  if (userIds.length === 0) return empty;

  const [totalLogs, totalIntentions, activeAgg] = await Promise.all([
    db.collection(DAILY_LOGS).countDocuments({ userId: { $in: userIds } }),
    db.collection(INTENTIONS).countDocuments({ userId: { $in: userIds } }),
    db
      .collection(DAILY_LOGS)
      .aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId' } },
        { $count: 'n' },
      ])
      .toArray(),
  ]);

  let totalHabits = 0;
  if (neo4jRun) {
    const hr = await neo4jRun(
      `MATCH (u:User)-[:DONATED]->(h:Habit)
       WHERE u.userID IN $userIds AND coalesce(h.is_habit, true) = true
       RETURN count(h) AS n`,
      { userIds }
    );
    totalHabits = toNum(hr?.[0]?.n);
  }

  const activeLoggers = activeAgg[0]?.n ?? 0;
  return {
    totalHabits,
    totalLogs,
    totalIntentions,
    avgLogsPerActive: activeLoggers > 0 ? totalLogs / activeLoggers : 0,
    avgIntentionsPerParticipant:
      userIds.length > 0 ? totalIntentions / userIds.length : 0,
  };
}
