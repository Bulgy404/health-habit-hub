// app/services/studyAnalyticsService.js
import { ObjectId } from 'mongodb';

const ENROLLMENTS = 'enrollments';
const DAILY_LOGS = 'daily_behavior_logs';
const SRHI = 'srhi_responses';
const FORM_RESPONSES = 'form_responses';
const STUDIES = 'studies';
const QUESTIONNAIRES = 'questionnaires';

/**
 * Return per-group weekly active rate: percentage of enrolled participants with at least one log in the last 7 days.
 * @param {{ db: object, studyId: string }} deps
 * @returns {Promise<Array<{ groupId: string, enrolled: number, active: number, rate: number }>>}
 */
export async function getWeeklyActiveRate({ db, studyId }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return [];
  }

  const enrollments = await db
    .collection(ENROLLMENTS)
    .find({ studyId: oid })
    .toArray();

  if (enrollments.length === 0) return [];

  const byGroup = {};
  for (const e of enrollments) {
    const gid = e.groupId?.toString() ?? 'unknown';
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
 * @param {{ db: object, studyId: string }} deps
 * @returns {Promise<Array<{ groupId: string, date: string, cumulative: number }>>}
 */
export async function getDropoutCurve({ db, studyId }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return [];
  }

  const dropped = await db
    .collection(ENROLLMENTS)
    .find({ studyId: oid, droppedOutAt: { $ne: null } })
    .toArray();

  if (dropped.length === 0) return [];

  const byGroup = {};
  for (const e of dropped) {
    const gid = e.groupId?.toString() ?? 'unknown';
    const date = e.droppedOutAt.toISOString().split('T')[0];
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
 * @param {{ db: object, studyId: string }} deps
 * @returns {Promise<Array<{ questionnaireId: string, slug: string, title: string, enrolled: number, completed: number, rate: number }>>}
 */
export async function getQuestionnaireCompletionRates({ db, studyId }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return [];
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study || !Array.isArray(study.questionnaires) || study.questionnaires.length === 0) {
    return [];
  }

  const questionnaireIds = study.questionnaires.map((id) =>
    id instanceof ObjectId ? id : new ObjectId(id)
  );

  const [questionnaires, enrollments] = await Promise.all([
    db.collection(QUESTIONNAIRES).find({ _id: { $in: questionnaireIds } }).toArray(),
    db.collection(ENROLLMENTS).find({ studyId: oid }).toArray(),
  ]);

  const enrolledUserIds = enrollments.map((e) => e.userId);
  const enrolled = enrolledUserIds.length;
  if (enrolled === 0 || questionnaires.length === 0) return [];

  return Promise.all(
    questionnaires.map(async (q) => {
      const slug = q.slug ?? q._id.toString();
      const uniqueRespondents = await db
        .collection(FORM_RESPONSES)
        .aggregate([
          { $match: { userId: { $in: enrolledUserIds }, questionnaireSlug: slug } },
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
