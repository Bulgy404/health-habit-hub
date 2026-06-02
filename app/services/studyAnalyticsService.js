// app/services/studyAnalyticsService.js
import { ObjectId } from 'mongodb';

const ENROLLMENTS = 'enrollments';
const DAILY_LOGS = 'daily_behavior_logs';
const SRHI = 'srhi_responses';

/**
 * Per-group weekly active rate: % of enrolled participants with ≥1 log in the last 7 days.
 */
export async function getWeeklyActiveRate({ db, studyId }) {
  let oid;
  try { oid = new ObjectId(studyId); } catch { return []; }

  const enrollments = await db.collection(ENROLLMENTS)
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
    const activeDocs = await db.collection(DAILY_LOGS)
      .aggregate([
        { $match: { userId: { $in: userIds }, date: { $gte: cutoffStr } } },
        { $group: { _id: '$userId' } },
      ])
      .toArray();
    const active = activeDocs.length;
    const enrolled = userIds.length;
    results.push({ groupId, enrolled, active, rate: enrolled > 0 ? active / enrolled : 0 });
  }
  return results;
}

/**
 * Mean SRHI score per group per week (submitted responses only).
 */
export async function getMeanSrhiTrajectory({ db, studyId }) {
  let oid;
  try { oid = new ObjectId(studyId); } catch { return []; }

  const docs = await db.collection(SRHI)
    .aggregate([
      { $match: { studyId: oid, submittedAt: { $ne: null }, score: { $ne: null } } },
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

  return docs.map(d => ({
    groupId: d._id.groupId?.toString() ?? null,
    weekNumber: d._id.weekNumber,
    meanScore: Math.round(d.meanScore * 100) / 100,
    count: d.count,
  }));
}

/**
 * Cumulative dropout count per group by date (sorted ascending).
 */
export async function getDropoutCurve({ db, studyId }) {
  let oid;
  try { oid = new ObjectId(studyId); } catch { return []; }

  const dropped = await db.collection(ENROLLMENTS)
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
