import { stringify } from 'csv-stringify/sync';
import { ObjectId } from 'mongodb';
import { COLLECTION as SRHI } from '../models/srhiResponse.js';
import { COLLECTION as LOGS } from '../models/dailyBehaviorLog.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as INTENTIONS } from '../models/implementationIntention.js';

async function enrollmentMap(db, studyId) {
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const docs = await db.collection(ENROLLMENTS).find(filter).toArray();
  return Object.fromEntries(docs.map((e) => [e.userId, e]));
}

export async function buildSrhiCsv({ db, studyId }) {
  const eMap = await enrollmentMap(db, studyId);
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const rows = await db.collection(SRHI).find(filter).toArray();

  const records = rows.map((r) => {
    const e = eMap[r.userId] ?? {};
    return {
      userId: r.userId,
      studyId: r.studyId?.toString() ?? 'NA',
      groupLabel: e.cueConfig?.cueSource ?? 'NA',
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
      groupLabel: e.cueConfig?.cueSource ?? 'NA',
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

export async function buildDropoutCsv({ db, studyId }) {
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const enrollments = await db.collection(ENROLLMENTS).find(filter).toArray();

  const records = enrollments.map((e) => ({
    userId: e.userId,
    studyId: e.studyId?.toString() ?? 'NA',
    groupLabel: e.cueConfig?.cueSource ?? 'NA',
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
