// app/services/questionnaireScheduleService.js
import { ObjectId } from 'mongodb';
import { ASSIGNMENTS, WINDOWS } from '../models/questionnaireSchedule.js';
import { getUsersForStudy, syncStudy } from './enrollmentNeo4j.js';
import { resolveLocaleText } from '../utils/localeText.js';
import {
  defaultReminders,
  resolveEffectiveReminders,
} from './reminderConfigService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Rolling buffer size for continuous cadences — how many future/open windows
// are kept materialized at a time instead of generating a giant upfront batch.
const CONTINUOUS_TOPUP_CAP = 12;
// Delay applied to a habit-scoped questionnaire's first occurrence, anchored
// at habit (intention) creation — shared with srhiService.js so both
// "anchor at habit creation" implementations stay in sync.
export const HABIT_ANCHOR_DELAY_MS = 5000;

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
    // Continuous cadences never generate all occurrences upfront — only the
    // initial rolling buffer; topUpContinuousWindows() extends it over time.
    const occ =
      cadence.continuous === true
        ? CONTINUOUS_TOPUP_CAP
        : Math.min(200, Math.max(1, Math.round(cadence.occurrences ?? 1)));
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
  const iv = cadence.intervalDays ?? 7;
  const start = cadence.startOffsetDays ?? 0;
  const every = iv === 7 ? 'weekly' : iv === 1 ? 'daily' : `every ${iv} days`;
  if (cadence.continuous === true) {
    return `${every}, continuous${start ? `, from day ${start}` : ''}`;
  }
  const occ = cadence.occurrences ?? 1;
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
 * Maps each of [questionnaireIds] (ObjectId) to its questionnaire's scope —
 * `'habit'` or `'study'` (the default for missing/undefined `scope`).
 * Single source of truth for the habit-vs-study split so
 * [resolveHabitScopeAssignments] and [generateWindowsForUser] can't drift.
 *
 * `'donation'`-scoped questionnaires (offered ad-hoc right after a habit
 * donation — see habitDonationService) are bucketed alongside `'habit'`
 * here: neither should ever receive an enrollment-anchored recurring
 * window. A `'donation'`-scoped questionnaire is not expected to be
 * assigned via `questionnaire_assignments` at all (it's triggered directly
 * by the donation flow, not the cadence system) — this is a defensive
 * exclusion in case one is assigned anyway, not a supported combination.
 * @param {{ db, questionnaireIds: import('mongodb').ObjectId[] }} deps
 * @returns {Promise<Map<string, 'habit' | 'study'>>}
 */
async function scopeByQuestionnaireId({ db, questionnaireIds }) {
  const qDocs = await db
    .collection('questionnaires')
    .find({ _id: { $in: questionnaireIds } }, { projection: { scope: 1 } })
    .toArray();
  return new Map(
    qDocs.map((q) => [
      q._id.toString(),
      q.scope === 'habit' || q.scope === 'donation' ? 'habit' : 'study',
    ])
  );
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

  // Habit-scoped assignments (e.g. SRHI) anchor to each habit's own creation
  // time instead of enrollment — see generateHabitCreationWindows. Exclude
  // them here so a habit-scoped questionnaire never gets an
  // enrollment-anchored window in the generic pipeline.
  const scopeById = await scopeByQuestionnaireId({
    db,
    questionnaireIds: effective.map((a) => a.questionnaireId),
  });
  const studyScope = effective.filter(
    (a) => scopeById.get(a.questionnaireId.toString()) !== 'habit'
  );
  if (studyScope.length === 0) return 0;

  const base = enrolledAt ? new Date(enrolledAt) : new Date();
  const sOid = toOid(studyId);
  const gOid = groupId ? toOid(groupId) : null;

  const ops = [];
  for (const a of studyScope) {
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
 * Effective assignments whose questionnaire is habit-scoped
 * (`questionnaires.scope === 'habit'`) — these anchor to each habit's
 * creation time rather than enrollment, and generate one independent window
 * series per habit instead of per participant.
 * @param {{ db, studyId, groupId }} deps
 * @returns {Promise<Array>}
 */
export async function resolveHabitScopeAssignments({ db, studyId, groupId }) {
  const effective = await resolveEffectiveAssignments({ db, studyId, groupId });
  if (effective.length === 0) return [];
  const scopeById = await scopeByQuestionnaireId({
    db,
    questionnaireIds: effective.map((a) => a.questionnaireId),
  });
  return effective.filter(
    (a) => scopeById.get(a.questionnaireId.toString()) === 'habit'
  );
}

/**
 * Create the window series for a freshly created habit. For every active,
 * habit-scoped assignment (`questionnaires.scope === 'habit'`) on the
 * participant's study/group, the assignment's full cadence is expanded and
 * anchored at the habit's creation time + HABIT_ANCHOR_DELAY_MS. SRHI has its
 * own separate, unconditional pipeline (srhiService.generateWindows, invoked
 * directly from intentionsRouter.js) and no `questionnaires` document of its
 * own, so it can never appear in `habitScope` here — this covers any other,
 * admin-defined habit-scoped questionnaire.
 * @param {{ db, userId, studyId, groupId, intentionId, createdAt }} deps
 * @returns {Promise<Array<{ questionnaireSlug: string, questionnaireTitle: string }>>}
 *   The questionnaires for which windows were created (for push messaging).
 */
export async function generateHabitCreationWindows({
  db,
  userId,
  studyId,
  groupId,
  intentionId,
  createdAt,
}) {
  const habitScope = await resolveHabitScopeAssignments({
    db,
    studyId,
    groupId,
  });
  if (habitScope.length === 0) return [];
  const sOid = toOid(studyId);
  const gOid = groupId ? toOid(groupId) : null;
  const iOid = toOid(intentionId);
  const base = new Date(
    (createdAt ? new Date(createdAt) : new Date()).getTime() +
      HABIT_ANCHOR_DELAY_MS
  );

  const ops = [];
  for (const a of habitScope) {
    scheduleOffsets(a.cadence).forEach((offDays, i) => {
      ops.push({
        updateOne: {
          filter: {
            userId: String(userId),
            assignmentId: a._id,
            occurrence: i + 1,
            intentionId: iOid,
          },
          update: {
            $setOnInsert: {
              userId: String(userId),
              studyId: sOid,
              groupId: gOid,
              assignmentId: a._id,
              questionnaireId: a.questionnaireId,
              questionnaireSlug: a.questionnaireSlug,
              intentionId: iOid,
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
  return habitScope.map((a) => ({
    questionnaireSlug: a.questionnaireSlug,
    questionnaireTitle: a.questionnaireTitle ?? a.questionnaireSlug,
  }));
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
 * link it to the stored response.
 *
 * Returns the closed window's scheduling context so callers can record *which*
 * scheduled occurrence a response belongs to (e.g. "study week 4"), which is
 * what lets a recurring questionnaire be analysed by study week rather than by
 * calendar date. Returns `null` when no window matches — an ad-hoc
 * questionnaire that was never scheduled. (Still truthy/falsy-compatible with
 * the previous boolean return.)
 *
 * @param {{ db, userId, questionnaireSlug, responseId, submittedAt }} deps
 * @returns {Promise<null|{occurrence: number|null, scheduledFor: Date|null,
 *   assignmentId: *, studyId: *, intentionId: *}>}
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
  if (!updated) return null;

  // Best-effort: replenish the continuous buffer now that one window
  // closed. Never blocks the caller's response on this.
  topUpContinuousWindows({
    db,
    userId,
    assignmentId: updated.assignmentId,
    intentionId: updated.intentionId ?? null,
  }).catch(() => {});

  return {
    occurrence:
      typeof updated.occurrence === 'number' ? updated.occurrence : null,
    scheduledFor: updated.scheduledFor ?? null,
    assignmentId: updated.assignmentId ?? null,
    studyId: updated.studyId ?? null,
    intentionId: updated.intentionId ?? null,
  };
}

/**
 * Per-slug completion/availability status for a participant, derived from
 * `questionnaire_windows`. Powers both the Profile "Health Questionnaires"
 * list (`available` decides green/tappable vs. greyed-out, `completedAt`
 * drives the "Completed on ..." label, `nextDueAt` a "next due" hint when
 * not currently available) and the resubmission guard in
 * `POST /questionnaire-responses` (a slug absent from the returned map has
 * no scheduled window at all — an ad-hoc questionnaire, left ungated).
 * @param {{ db, userId, slugs: string[] }} deps
 * @returns {Promise<Map<string, { available: boolean, completedAt: Date|null, nextDueAt: Date|null }>>}
 */
export async function getQuestionnaireCompletionStatus({ db, userId, slugs }) {
  const bySlug = new Map();
  if (slugs.length === 0) return bySlug;
  const now = new Date();
  const windows = await db
    .collection(WINDOWS)
    .find(
      { userId: String(userId), questionnaireSlug: { $in: slugs } },
      { projection: { questionnaireSlug: 1, submittedAt: 1, scheduledFor: 1 } }
    )
    .sort({ scheduledFor: 1 })
    .toArray();

  for (const w of windows) {
    const entry = bySlug.get(w.questionnaireSlug) ?? {
      available: false,
      completedAt: null,
      nextDueAt: null,
    };
    if (w.submittedAt) {
      if (!entry.completedAt || w.submittedAt > entry.completedAt) {
        entry.completedAt = w.submittedAt;
      }
    } else if (entry.nextDueAt === null) {
      // Windows are sorted by scheduledFor ascending, so the first open one
      // seen per slug is the earliest — no need to compare later ones.
      entry.nextDueAt = w.scheduledFor;
      entry.available = w.scheduledFor <= now;
    }
    bySlug.set(w.questionnaireSlug, entry);
  }
  return bySlug;
}

/**
 * Top up a continuous cadence's rolling window buffer for one
 * (user, assignment, intention) series, up to CONTINUOUS_TOPUP_CAP open
 * windows. No-op for inactive assignments or non-continuous cadences.
 * Extends from the last existing window's `scheduledFor` rather than
 * recomputing from the original enrollment/habit-creation anchor, so the
 * windows collection stays self-sufficient — no need to thread the anchor
 * date through every call site.
 * @param {{ db, userId, assignmentId, intentionId? }} deps
 * @returns {Promise<number>} number of windows created
 */
export async function topUpContinuousWindows({
  db,
  userId,
  assignmentId,
  intentionId = null,
}) {
  const aOid = toOid(assignmentId);
  if (!aOid) return 0;
  const assignment = await db.collection(ASSIGNMENTS).findOne({ _id: aOid });
  if (!assignment || assignment.active === false) return 0;
  if (
    assignment.cadence?.mode !== 'interval' ||
    assignment.cadence?.continuous !== true
  ) {
    return 0;
  }

  const iOid = intentionId ? toOid(intentionId) : null;
  const filter = {
    userId: String(userId),
    assignmentId: aOid,
    intentionId: iOid,
    submittedAt: null,
  };
  const openCount = await db.collection(WINDOWS).countDocuments(filter);
  if (openCount >= CONTINUOUS_TOPUP_CAP) return 0;
  const need = CONTINUOUS_TOPUP_CAP - openCount;

  const [last] = await db
    .collection(WINDOWS)
    .find({ userId: String(userId), assignmentId: aOid, intentionId: iOid })
    .sort({ occurrence: -1 })
    .limit(1)
    .toArray();
  if (!last) return 0; // nothing to extend from — initial generation always seeds ≥1

  const interval = Math.max(
    1,
    Math.round(assignment.cadence.intervalDays ?? 7)
  );
  const ops = Array.from({ length: need }, (_, k) => ({
    updateOne: {
      filter: {
        userId: String(userId),
        assignmentId: aOid,
        occurrence: last.occurrence + k + 1,
        intentionId: iOid,
      },
      update: {
        $setOnInsert: {
          userId: String(userId),
          studyId: last.studyId,
          groupId: last.groupId,
          assignmentId: aOid,
          questionnaireId: last.questionnaireId,
          questionnaireSlug: last.questionnaireSlug,
          intentionId: iOid,
          occurrence: last.occurrence + k + 1,
          scheduledFor: new Date(
            last.scheduledFor.getTime() + (k + 1) * interval * DAY_MS
          ),
          submittedAt: null,
          responseId: null,
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
  await db.collection(WINDOWS).bulkWrite(ops, { ordered: false });
  return ops.length;
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
 * Keep the Neo4j `Study -[:HAS_QUESTIONNAIRE]-> Questionnaire` edge in sync
 * with currently-active assignments. This is the single writer of that edge
 * (assignment create/update/delete) — study name/CRUD no longer derives it
 * from the legacy `study.questionnaires` array.
 * @param {{ db, studyId, neo4jRun }} deps
 */
export async function syncStudyQuestionnaireGraph({ db, studyId, neo4jRun }) {
  if (!neo4jRun) return;
  const sOid = toOid(studyId);
  if (!sOid) return;
  const active = await db
    .collection(ASSIGNMENTS)
    .find({ studyId: sOid, active: { $ne: false } })
    .project({ questionnaireSlug: 1 })
    .toArray();
  const slugs = [
    ...new Set(active.map((a) => a.questionnaireSlug).filter(Boolean)),
  ];
  const study = await db
    .collection('studies')
    .findOne({ _id: sOid }, { projection: { name: 1 } });
  if (!study) return;
  await syncStudy(neo4jRun, { uuid: sOid.toString(), name: study.name, slugs });
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
  await syncStudyQuestionnaireGraph({ db, studyId: sOid, neo4jRun });

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
  await syncStudyQuestionnaireGraph({ db, studyId: sOid, neo4jRun });
  return { updated: true };
}

/** Delete an assignment and its open (unsubmitted) windows. */
export async function deleteAssignment({
  db,
  studyId,
  assignmentId,
  neo4jRun,
}) {
  const sOid = toOid(studyId);
  const aOid = toOid(assignmentId);
  if (!sOid || !aOid) return { notFound: true };
  const res = await db
    .collection(ASSIGNMENTS)
    .deleteOne({ _id: aOid, studyId: sOid });
  if (res.deletedCount === 0) return { notFound: true };
  await deleteAssignmentWindows({ db, assignmentId: aOid, onlyOpen: true });
  await syncStudyQuestionnaireGraph({ db, studyId: sOid, neo4jRun });
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
  const defaultEffective = defaultReminders();
  const defaultResult = {
    reminders: defaultEffective.questionnaire,
    questionnaires: [],
    studyEndDate: null,
    endOfStudyNotification: {
      ...defaultEffective.endOfStudy,
      title: '',
      body: '',
    },
  };

  // Reminder / end-of-study config live on the participant's study (and,
  // per-type, may be overridden per group) — resolved via their enrollment,
  // not via a due window, since a participant may have no due questionnaires
  // left yet still need their study's end-date config.
  const enrollment = await db
    .collection('enrollments')
    .findOne(
      { userId: String(userId) },
      { projection: { studyId: 1, groupId: 1 } }
    );
  if (!enrollment) return defaultResult;

  const study = await db
    .collection('studies')
    .findOne({ _id: enrollment.studyId });
  if (!study) return defaultResult;

  const group = (study.groups || []).find(
    (g) => g.id?.toString() === enrollment.groupId?.toString()
  );
  const effective = resolveEffectiveReminders({ study, group });

  const reminders = effective.questionnaire;
  const studyEndDate = study.endDate ?? null;
  const endOfStudyNotification = {
    ...effective.endOfStudy,
    title: study.endOfStudyNotification?.title ?? '',
    body: study.endOfStudyNotification?.body ?? '',
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

  // Best-effort: replenish any continuous cadences' rolling buffers on read.
  // Newly created windows land beyond `horizon` in the common case, so this
  // doesn't affect the response below — it only tops up the buffer for next
  // time. Never let a top-up failure break this read.
  const openSeries = new Map();
  for (const w of wins) {
    openSeries.set(`${w.assignmentId}|${w.intentionId ?? ''}`, {
      assignmentId: w.assignmentId,
      intentionId: w.intentionId ?? null,
    });
  }
  await Promise.all(
    [...openSeries.values()].map((s) =>
      topUpContinuousWindows({ db, userId, ...s }).catch(() => {})
    )
  );

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
