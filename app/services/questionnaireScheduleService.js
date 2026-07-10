// app/services/questionnaireScheduleService.js
import { ObjectId } from 'mongodb';
import { ASSIGNMENTS, WINDOWS } from '../models/questionnaireSchedule.js';
import { getUsersForStudy } from './enrollmentNeo4j.js';
import { resolveLocaleText } from '../utils/localeText.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toOid(v) {
  if (!v) return null;
  if (v instanceof ObjectId) return v;
  try {
    return new ObjectId(String(v));
  } catch {
    return null;
  }
}

/**
 * Expand a cadence into a list of day-offsets from enrollment.
 * - interval: startOffsetDays + k·intervalDays for k in 0..occurrences-1
 * - fixed:    each configured week × 7 (week 0 = baseline / at enrollment)
 * @param {object} cadence
 * @returns {number[]} sorted, de-duplicated day offsets
 */
export function scheduleOffsets(cadence) {
  if (!cadence) return [];
  let offsets = [];
  if (cadence.mode === 'fixed') {
    // Fixed timepoints can be given as whole weeks and/or exact days after
    // enrollment; the schedule is the union of both.
    const fromWeeks = (cadence.weeks || []).map(
      (w) => Math.max(0, Math.round(w)) * 7
    );
    const fromDays = (cadence.days || []).map((d) =>
      Math.max(0, Math.round(d))
    );
    offsets = [...fromWeeks, ...fromDays];
  } else {
    const start = Math.max(0, Math.round(cadence.startOffsetDays ?? 0));
    const interval = Math.max(1, Math.round(cadence.intervalDays ?? 7));
    const occ = Math.min(
      200,
      Math.max(1, Math.round(cadence.occurrences ?? 1))
    );
    offsets = Array.from({ length: occ }, (_, k) => start + k * interval);
  }
  return [...new Set(offsets)].sort((a, b) => a - b);
}

/**
 * Human-readable cadence summary for the admin UI.
 * @param {object} cadence
 * @returns {string}
 */
export function cadenceSummary(cadence) {
  if (!cadence) return '—';
  if (cadence.mode === 'fixed') {
    const weeks = (cadence.weeks || []).slice().sort((a, b) => a - b);
    const days = (cadence.days || []).slice().sort((a, b) => a - b);
    const parts = [];
    if (weeks.length) parts.push(`weeks ${weeks.join(', ')}`);
    if (days.length) parts.push(`days ${days.join(', ')}`);
    return parts.length ? parts.join(' + ') : 'No timepoints';
  }
  const occ = cadence.occurrences ?? 1;
  const iv = cadence.intervalDays ?? 7;
  const start = cadence.startOffsetDays ?? 0;
  const every = iv === 7 ? 'weekly' : iv === 1 ? 'daily' : `every ${iv} days`;
  return `${occ}× ${every}${start ? `, from day ${start}` : ''}`;
}

/**
 * Effective assignments for a participant: study-wide (groupId null) plus any
 * group-specific ones, where a group-specific assignment for a questionnaire
 * overrides the study-wide assignment for that same questionnaire.
 * @param {{ db: object, studyId: any, groupId: any }} deps
 * @returns {Promise<Array>}
 */
export async function resolveEffectiveAssignments({ db, studyId, groupId }) {
  const sOid = toOid(studyId);
  if (!sOid) return [];
  const gOid = groupId ? toOid(groupId) : null;
  const query = {
    studyId: sOid,
    active: { $ne: false },
    $or: [{ groupId: null }, ...(gOid ? [{ groupId: gOid }] : [])],
  };
  const all = await db.collection(ASSIGNMENTS).find(query).toArray();
  const byQuestionnaire = new Map();
  for (const a of all) {
    const key = a.questionnaireId.toString();
    const existing = byQuestionnaire.get(key);
    if (!existing || (a.groupId && !existing.groupId)) {
      byQuestionnaire.set(key, a);
    }
  }
  return [...byQuestionnaire.values()];
}

/**
 * Create (idempotently) the scheduled windows for one participant based on the
 * assignments that apply to them.
 * @param {{ db, userId, studyId, groupId, enrolledAt }} deps
 * @returns {Promise<number>} number of window upserts issued
 */
export async function generateWindowsForUser({
  db,
  userId,
  studyId,
  groupId,
  enrolledAt,
}) {
  const effective = await resolveEffectiveAssignments({ db, studyId, groupId });
  if (effective.length === 0) return 0;
  const base = enrolledAt ? new Date(enrolledAt) : new Date();
  const sOid = toOid(studyId);
  const gOid = groupId ? toOid(groupId) : null;

  const ops = [];
  for (const a of effective) {
    const offsets = scheduleOffsets(a.cadence);
    offsets.forEach((offDays, i) => {
      ops.push({
        updateOne: {
          filter: {
            userId: String(userId),
            assignmentId: a._id,
            occurrence: i + 1,
          },
          update: {
            $setOnInsert: {
              userId: String(userId),
              studyId: sOid,
              groupId: gOid,
              assignmentId: a._id,
              questionnaireId: a.questionnaireId,
              questionnaireSlug: a.questionnaireSlug,
              occurrence: i + 1,
              scheduledFor: new Date(base.getTime() + offDays * DAY_MS),
              submittedAt: null,
              responseId: null,
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
  }
  if (ops.length) {
    await db.collection(WINDOWS).bulkWrite(ops, { ordered: false });
  }
  return ops.length;
}

/**
 * Regenerate windows for every enrolled participant of a study (used after an
 * assignment is created or changed). Reads enrolled users from Neo4j.
 * @param {{ db, studyId, neo4jRun }} deps
 * @returns {Promise<number>}
 */
export async function regenerateStudyWindows({ db, studyId, neo4jRun }) {
  if (!neo4jRun) return 0;
  const users = await getUsersForStudy(neo4jRun, String(studyId));
  let total = 0;
  for (const u of users) {
    total += await generateWindowsForUser({
      db,
      userId: u.userId,
      studyId,
      groupId: u.groupId,
      enrolledAt: u.enrolledAt,
    });
  }
  return total;
}

/**
 * Mark the earliest still-open window for (user, questionnaire) as submitted and
 * link it to the stored response. No-op (returns false) if no window matches
 * (e.g. an ad-hoc questionnaire that was never scheduled).
 * @param {{ db, userId, questionnaireSlug, responseId, submittedAt }} deps
 * @returns {Promise<boolean>}
 */
export async function markWindowSubmitted({
  db,
  userId,
  questionnaireSlug,
  responseId,
  submittedAt,
}) {
  const updated = await db.collection(WINDOWS).findOneAndUpdate(
    { userId: String(userId), questionnaireSlug, submittedAt: null },
    {
      $set: {
        submittedAt: submittedAt ?? new Date(),
        responseId: responseId ? toOid(responseId) : null,
      },
    },
    { sort: { scheduledFor: 1 }, returnDocument: 'after' }
  );
  return !!updated;
}

/** Remove windows for an assignment. By default only open (unsubmitted) ones. */
export async function deleteAssignmentWindows({
  db,
  assignmentId,
  onlyOpen = true,
}) {
  const filter = { assignmentId: toOid(assignmentId) };
  if (onlyOpen) filter.submittedAt = null;
  await db.collection(WINDOWS).deleteMany(filter);
}

/**
 * Per-questionnaire completion totals across all participants of a study.
 * @param {{ db, studyId }} deps
 * @returns {Promise<Array<{ questionnaireId, questionnaireSlug, total, completed }>>}
 */
export async function getStudyCompletion({ db, studyId }) {
  const sOid = toOid(studyId);
  if (!sOid) return [];
  const rows = await db
    .collection(WINDOWS)
    .aggregate([
      { $match: { studyId: sOid } },
      {
        $group: {
          _id: { qid: '$questionnaireId', slug: '$questionnaireSlug' },
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $ne: ['$submittedAt', null] }, 1, 0] },
          },
        },
      },
    ])
    .toArray();
  return rows.map((r) => ({
    questionnaireId: r._id.qid?.toString() ?? null,
    questionnaireSlug: r._id.slug,
    total: r.total,
    completed: r.completed,
  }));
}

// ── Assignment CRUD ─────────────────────────────────────────────────────────

/** List all assignments for a study (study-wide + per-group), with a summary. */
export async function listAssignments({ db, studyId }) {
  const sOid = toOid(studyId);
  if (!sOid) return [];
  const rows = await db
    .collection(ASSIGNMENTS)
    .find({ studyId: sOid })
    .sort({ createdAt: 1 })
    .toArray();
  return rows.map((a) => ({
    id: a._id.toString(),
    groupId: a.groupId ? a.groupId.toString() : null,
    questionnaireId: a.questionnaireId.toString(),
    questionnaireSlug: a.questionnaireSlug,
    questionnaireTitle: a.questionnaireTitle ?? a.questionnaireSlug,
    cadence: a.cadence,
    cadenceSummary: cadenceSummary(a.cadence),
    active: a.active !== false,
    occurrences: scheduleOffsets(a.cadence).length,
  }));
}

/**
 * Create a questionnaire assignment for a study (groupId null = all groups).
 * Returns { conflict } if the same questionnaire is already assigned to the
 * same scope, or { notFound } for a missing study/questionnaire.
 */
export async function createAssignment({
  db,
  studyId,
  groupId,
  questionnaireId,
  cadence,
  neo4jRun,
}) {
  const sOid = toOid(studyId);
  const qOid = toOid(questionnaireId);
  if (!sOid || !qOid) return { notFound: true };

  const study = await db.collection('studies').findOne({ _id: sOid });
  if (!study) return { notFound: true };
  const gOid = groupId ? toOid(groupId) : null;
  if (
    gOid &&
    !(study.groups || []).some((g) => g.id?.toString() === gOid.toString())
  ) {
    return { groupNotFound: true };
  }
  // Re-wrap in ObjectId at the query site so the value is provably a BSON
  // ObjectId — never a user-supplied query operator object (NoSQL-injection
  // barrier that static analysis recognises in place).
  const questionnaire = await db
    .collection('questionnaires')
    .findOne({ _id: new ObjectId(qOid) });
  if (!questionnaire) return { notFound: true };
  // Completion tracking matches responses by slug; refuse to schedule a
  // questionnaire that has none (legacy custom questionnaires may lack one).
  if (!questionnaire.slug) return { missingSlug: true };

  const now = new Date();
  const doc = {
    studyId: sOid,
    groupId: gOid,
    questionnaireId: qOid,
    questionnaireSlug: questionnaire.slug,
    // Denormalized admin-facing snapshot label — English default, since this
    // is only ever displayed in the admin schedule calendar, not to
    // participants (who get a properly locale-resolved title elsewhere).
    questionnaireTitle:
      resolveLocaleText(
        questionnaire.title,
        'en',
        questionnaire.languages || ['en']
      ) || questionnaire.slug,
    cadence,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const { insertedId } = await db.collection(ASSIGNMENTS).insertOne(doc);
    doc._id = insertedId;
  } catch (err) {
    if (err?.code === 11000) return { conflict: true };
    throw err;
  }

  // Backfill windows for everyone already enrolled in this study.
  await regenerateStudyWindows({ db, studyId: sOid, neo4jRun });

  return { id: doc._id.toString() };
}

/** Update an assignment's cadence / active flag, then regenerate windows. */
export async function updateAssignment({
  db,
  studyId,
  assignmentId,
  updates,
  neo4jRun,
}) {
  const sOid = toOid(studyId);
  const aOid = toOid(assignmentId);
  if (!sOid || !aOid) return { notFound: true };
  const $set = { updatedAt: new Date() };
  if (updates.cadence !== undefined) $set.cadence = updates.cadence;
  if (updates.active !== undefined) $set.active = updates.active;
  const res = await db
    .collection(ASSIGNMENTS)
    .updateOne({ _id: aOid, studyId: sOid }, { $set });
  if (res.matchedCount === 0) return { notFound: true };
  await regenerateStudyWindows({ db, studyId: sOid, neo4jRun });
  return { updated: true };
}

/** Delete an assignment and its open (unsubmitted) windows. */
export async function deleteAssignment({ db, studyId, assignmentId }) {
  const sOid = toOid(studyId);
  const aOid = toOid(assignmentId);
  if (!sOid || !aOid) return { notFound: true };
  const res = await db
    .collection(ASSIGNMENTS)
    .deleteOne({ _id: aOid, studyId: sOid });
  if (res.deletedCount === 0) return { notFound: true };
  await deleteAssignmentWindows({ db, assignmentId: aOid, onlyOpen: true });
  return { deleted: true };
}

/**
 * Open questionnaire windows for a participant that are due now or coming up
 * within [withinDays] — powers the participant "today's tasks" cards and
 * scheduled reminders. Skips windows whose questionnaire is inactive/removed.
 * Also carries the participant's study end date / end-of-study notification
 * config so the mobile app can schedule that notification locally, even when
 * there are no due questionnaires left (e.g. near the end of the study).
 * @param {{ db, userId, withinDays?, lang? }} deps
 */
export async function getDueQuestionnaires({
  db,
  userId,
  withinDays = 30,
  lang = 'en',
}) {
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * DAY_MS);
  const defaultReminders = { enabled: true, hour: 9 };
  const defaultResult = {
    reminders: defaultReminders,
    questionnaires: [],
    studyEndDate: null,
    endOfStudyNotification: { enabled: false, title: '', body: '' },
  };

  // Reminder / end-of-study config live on the participant's study, resolved
  // via their enrollment — not via a due window, since a participant may have
  // no due questionnaires left yet still need their study's end-date config.
  const enrollment = await db
    .collection('enrollments')
    .findOne({ userId: String(userId) }, { projection: { studyId: 1 } });
  if (!enrollment) return defaultResult;

  const study = await db.collection('studies').findOne(
    { _id: enrollment.studyId },
    {
      projection: {
        questionnaireReminders: 1,
        endDate: 1,
        endOfStudyNotification: 1,
      },
    }
  );

  let reminders = defaultReminders;
  if (study?.questionnaireReminders) {
    reminders = {
      enabled: study.questionnaireReminders.enabled !== false,
      hour: Number.isInteger(study.questionnaireReminders.hour)
        ? study.questionnaireReminders.hour
        : 9,
    };
  }
  const studyEndDate = study?.endDate ?? null;
  const endOfStudyNotification = {
    enabled: study?.endOfStudyNotification?.enabled === true,
    title: study?.endOfStudyNotification?.title ?? '',
    body: study?.endOfStudyNotification?.body ?? '',
  };

  const wins = await db
    .collection(WINDOWS)
    .find({
      userId: String(userId),
      submittedAt: null,
      scheduledFor: { $lte: horizon },
    })
    .sort({ scheduledFor: 1 })
    .toArray();
  if (wins.length === 0) {
    return {
      reminders,
      questionnaires: [],
      studyEndDate,
      endOfStudyNotification,
    };
  }

  const slugs = [...new Set(wins.map((w) => w.questionnaireSlug))];
  const qDocs = await db
    .collection('questionnaires')
    .find({ slug: { $in: slugs } })
    .toArray();
  const bySlug = Object.fromEntries(
    qDocs.map((q) => [
      q.slug,
      {
        title: resolveLocaleText(q.title, lang, q.languages || ['en']),
        active: q.active !== false,
      },
    ])
  );

  const questionnaires = wins
    .filter((w) => bySlug[w.questionnaireSlug]?.active !== false)
    .map((w) => ({
      windowId: w._id.toString(),
      questionnaireSlug: w.questionnaireSlug,
      questionnaireTitle:
        bySlug[w.questionnaireSlug]?.title ?? w.questionnaireSlug,
      occurrence: w.occurrence,
      scheduledFor: w.scheduledFor,
      isDue: w.scheduledFor <= now,
    }));

  return { reminders, questionnaires, studyEndDate, endOfStudyNotification };
}

/**
 * Scheduled questionnaire occurrences across a study, grouped by calendar date
 * — powers the admin schedule calendar. Combines two sources:
 *  - real windows already materialized for enrolled participants
 *  - projected occurrences (tagged `projected: true`) for assignments that
 *    have no enrolled participants yet, anchored as if someone enrolled today
 * Both are filtered to active (non-deactivated) questionnaires, and projected
 * occurrences are cut off at the study's endDate, if set.
 * @param {{ db, studyId }} deps
 * @returns {Promise<Array<{ date: string, items: Array<{ questionnaireSlug, total, completed, projected? }> }>>}
 */
export async function getStudyScheduleCalendar({ db, studyId }) {
  const sOid = toOid(studyId);
  if (!sOid) return [];

  const study = await db
    .collection('studies')
    .findOne({ _id: sOid }, { projection: { endDate: 1 } });
  const endDate = study?.endDate ? new Date(study.endDate) : null;

  const wins = await db.collection(WINDOWS).find({ studyId: sOid }).toArray();
  const assignments = await db
    .collection(ASSIGNMENTS)
    .find({ studyId: sOid, active: { $ne: false } })
    .toArray();

  const slugs = [
    ...new Set([
      ...wins.map((w) => w.questionnaireSlug),
      ...assignments.map((a) => a.questionnaireSlug),
    ]),
  ];
  const qDocs = await db
    .collection('questionnaires')
    .find({ slug: { $in: slugs } })
    .toArray();
  const activeBySlug = Object.fromEntries(
    qDocs.map((q) => [q.slug, q.active !== false])
  );

  const byDate = new Map();
  const addItem = (date, item) => {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(item);
  };

  // Real, per-participant windows — grouped by (date, slug).
  const realTotals = new Map();
  const assignmentIdsWithRealWindows = new Set();
  for (const w of wins) {
    if (activeBySlug[w.questionnaireSlug] === false) continue;
    assignmentIdsWithRealWindows.add(w.assignmentId.toString());
    const date = w.scheduledFor.toISOString().slice(0, 10);
    const key = `${date}|${w.questionnaireSlug}`;
    const entry = realTotals.get(key) ?? {
      date,
      questionnaireSlug: w.questionnaireSlug,
      total: 0,
      completed: 0,
    };
    entry.total += 1;
    if (w.submittedAt) entry.completed += 1;
    realTotals.set(key, entry);
  }
  for (const { date, ...item } of realTotals.values()) addItem(date, item);

  // Projected occurrences for assignments with no enrolled participants yet,
  // anchored at "today" as a preview of what a new enrollee would see.
  const today = new Date();
  for (const a of assignments) {
    if (activeBySlug[a.questionnaireSlug] === false) continue;
    if (assignmentIdsWithRealWindows.has(a._id.toString())) continue;
    for (const offDays of scheduleOffsets(a.cadence)) {
      const projectedDate = new Date(today.getTime() + offDays * DAY_MS);
      if (endDate && projectedDate > endDate) continue;
      addItem(projectedDate.toISOString().slice(0, 10), {
        questionnaireSlug: a.questionnaireSlug,
        total: 1,
        completed: 0,
        projected: true,
      });
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, items]) => ({ date, items }));
}

/**
 * All questionnaire responses (with the actual answers) for one participant,
 * newest first — powers the admin answer viewer.
 * @param {{ db, userId }} deps
 */
export async function getParticipantResponses({ db, userId }) {
  const docs = await db
    .collection('form_responses')
    .find({ userId: String(userId) })
    .sort({ submittedAt: -1 })
    .toArray();
  return docs.map((d) => ({
    responseId: d._id.toString(),
    questionnaireSlug: d.questionnaireSlug,
    answers: d.answers ?? {},
    submittedAt: d.submittedAt ?? null,
  }));
}

/** All scheduled windows for one participant (for the admin detail view). */
export async function getParticipantWindows({ db, userId }) {
  const wins = await db
    .collection(WINDOWS)
    .find({ userId: String(userId) })
    .sort({ scheduledFor: 1 })
    .toArray();
  return wins.map((w) => ({
    questionnaireSlug: w.questionnaireSlug,
    occurrence: w.occurrence,
    scheduledFor: w.scheduledFor,
    submittedAt: w.submittedAt ?? null,
    responseId: w.responseId?.toString() ?? null,
  }));
}
