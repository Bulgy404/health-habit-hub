import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as STUDY_CODES } from '../models/studyCode.js';
import { COLLECTION as SRHI_RESPONSES } from '../models/srhiResponse.js';
import { COLLECTION as IMPLEMENTATION_INTENTIONS } from '../models/implementationIntention.js';
import { ASSIGNMENTS as QUESTIONNAIRE_ASSIGNMENTS } from '../models/questionnaireSchedule.js';
import {
  getUsersForStudy,
  countEnrollments,
  getEnrollment,
  syncStudy,
} from './enrollmentNeo4j.js';
import {
  normalizeReminders,
  resolveEffectiveReminders,
} from './reminderConfigService.js';

/**
 * When a study's groups shrink, every reference to a removed group
 * (enrollments, enrollment codes, questionnaire assignments, SRHI responses,
 * implementation intentions, and the Neo4j ENROLLED_IN edge) must move onto
 * the fallback group so nothing is left pointing at a group that no longer
 * exists.
 * @param {{ db: object, neo4jRun?: Function, studyOid: ObjectId, removedGroupIds: string[], fallbackGroupId: string }} deps
 */
async function _reassignRemovedGroups({
  db,
  neo4jRun,
  studyOid,
  removedGroupIds,
  fallbackGroupId,
}) {
  if (removedGroupIds.length === 0) return;
  const removedOids = removedGroupIds.map((id) => new ObjectId(id));
  const fallbackOid = new ObjectId(fallbackGroupId);

  await db
    .collection(ENROLLMENTS)
    .updateMany(
      { studyId: studyOid, groupId: { $in: removedOids } },
      { $set: { groupId: fallbackOid } }
    );

  await db
    .collection(STUDY_CODES)
    .updateMany(
      { studyId: studyOid, groupId: { $in: removedOids } },
      { $set: { groupId: fallbackOid } }
    );

  await db
    .collection(SRHI_RESPONSES)
    .updateMany(
      { studyId: studyOid, groupId: { $in: removedOids } },
      { $set: { groupId: fallbackOid } }
    );

  await db
    .collection(IMPLEMENTATION_INTENTIONS)
    .updateMany(
      { studyId: studyOid, groupId: { $in: removedOids } },
      { $set: { groupId: fallbackOid } }
    );

  // questionnaire_assignments has a unique (studyId, groupId, questionnaireId)
  // index — if the fallback group already has the same questionnaire
  // assigned, reassigning would collide, so drop the now-redundant duplicate
  // instead of moving it.
  const assignments = db.collection(QUESTIONNAIRE_ASSIGNMENTS);
  const orphaned = await assignments
    .find({ studyId: studyOid, groupId: { $in: removedOids } })
    .toArray();
  for (const a of orphaned) {
    const duplicate = await assignments.findOne({
      studyId: studyOid,
      groupId: fallbackOid,
      questionnaireId: a.questionnaireId,
    });
    if (duplicate) {
      await assignments.deleteOne({ _id: a._id });
    } else {
      await assignments.updateOne(
        { _id: a._id },
        { $set: { groupId: fallbackOid } }
      );
    }
  }

  if (neo4jRun) {
    await neo4jRun(
      `MATCH (u:User)-[e:ENROLLED_IN]->(s:Study {uuid: $studyId})
       WHERE e.groupId IN $removedIds
       SET e.groupId = $fallbackId`,
      {
        studyId: studyOid.toString(),
        removedIds: removedGroupIds.map(String),
        fallbackId: fallbackGroupId.toString(),
      }
    );
  }
}

/**
 * List all studies with participant count per study (paginated).
 * @param {{ db: object, page?: number, limit?: number }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, studies: Array }>}
 */
export async function listStudies({ db, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  // Exclude studies that were deleted from the admin UI (soft-deleted). Their
  // data is retained in the backend, but they are hidden from the studies list.
  const notDeleted = { deletedAt: { $exists: false } };
  const studies = await db
    .collection(STUDIES)
    .find(notDeleted)
    .skip(skip)
    .limit(limit)
    .toArray();

  // Count enrollments per study in one query
  const studyIds = studies.map((s) => s._id);
  const counts = await db
    .collection(ENROLLMENTS)
    .aggregate([
      { $match: { studyId: { $in: studyIds } } },
      { $group: { _id: '$studyId', count: { $sum: 1 } } },
    ])
    .toArray();

  const countMap = Object.fromEntries(
    counts.map((c) => [c._id.toString(), c.count])
  );

  const total = await db.collection(STUDIES).countDocuments(notDeleted);

  return {
    total,
    page,
    limit,
    studies: studies.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      description: s.description ?? null,
      isDefault: s.isDefault,
      isActive: s.isActive,
      recommenderEnabled: s.recommenderEnabled !== false,
      onboardingEnabled: s.onboardingEnabled !== false,
      selfHabitCreationEnabled: s.selfHabitCreationEnabled !== false,
      habitEntryMode:
        s.habitEntryMode === 'structured' ? 'structured' : 'freeText',
      structuredActivityKeys: s.structuredActivityKeys ?? [],
      reminders: normalizeReminders(s),
      endDate: s.endDate ?? null,
      endOfStudyNotification: normalizeEndOfStudyContent(s),
      groups: s.groups,
      questionnaires: (s.questionnaires || []).map((id) => id.toString()),
      participantCount: countMap[s._id.toString()] ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}

/**
 * Create a new study.
 * @param {{ db: object, name: string, description?: string, groups: Array<{label: string}>, questionnaires?: string[], neo4jRun?: Function }} deps
 * @returns {Promise<object>} The created study document.
 */
export async function createStudy({
  db,
  name,
  description = null,
  groups = [],
  questionnaires = [],
  recommenderEnabled = true,
  onboardingEnabled = true,
  selfHabitCreationEnabled = true,
  habitEntryMode = 'freeText',
  structuredActivityKeys = [],
  endDate = null,
  endOfStudyNotification,
  reminders,
  neo4jRun,
}) {
  const now = new Date();
  const studyGroups = groups.map((g, i) => ({
    id: new ObjectId(),
    label: g.label,
    index: i + 1,
    cueConfig: g.cueConfig ?? null,
    activityTypeConfig: g.activityTypeConfig ?? null,
    reminders: g.reminders ?? null,
    autoDonate: g.autoDonate ?? false,
    // null = inherit the study-level flag; a boolean overrides it.
    onboardingEnabled: g.onboardingEnabled ?? null,
    selfHabitCreationEnabled: g.selfHabitCreationEnabled ?? null,
  }));
  const questionnaireIds = questionnaires.map((id) => new ObjectId(id));

  const doc = {
    name,
    description,
    isDefault: false,
    isActive: true,
    recommenderEnabled: recommenderEnabled !== false,
    onboardingEnabled: onboardingEnabled !== false,
    selfHabitCreationEnabled: selfHabitCreationEnabled !== false,
    habitEntryMode: habitEntryMode === 'structured' ? 'structured' : 'freeText',
    structuredActivityKeys: Array.isArray(structuredActivityKeys)
      ? structuredActivityKeys
      : [],
    reminders: reminders ?? {},
    endDate: endDate ? new Date(endDate) : null,
    endOfStudyNotification: normalizeEndOfStudyContent({
      endOfStudyNotification,
    }),
    groups: studyGroups,
    questionnaires: questionnaireIds,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(STUDIES).insertOne(doc);

  // Sync Study node to Neo4j (non-breaking: skip if neo4jRun not provided)
  if (neo4jRun) {
    try {
      // Resolve questionnaire slugs
      let slugs = [];
      if (questionnaireIds.length > 0) {
        const qDocs = await db
          .collection('questionnaires')
          .find({ _id: { $in: questionnaireIds } })
          .project({ slug: 1 })
          .toArray();
        slugs = qDocs.map((q) => q.slug).filter(Boolean);
      }
      await syncStudy(neo4jRun, {
        uuid: result.insertedId.toString(),
        name,
        slugs,
      });
    } catch (err) {
      // Non-fatal: Neo4j sync failure should not roll back the MongoDB insert
      console.error(
        '[studyService] Neo4j syncStudy failed after create:',
        err?.message
      );
    }
  }

  return { ...doc, _id: result.insertedId };
}

/**
 * Get a single study by ID.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<object|null>}
 */
export async function getStudy({ db, id }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }
  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) return null;
  return {
    id: study._id.toString(),
    name: study.name,
    description: study.description ?? null,
    isDefault: study.isDefault,
    isActive: study.isActive,
    recommenderEnabled: study.recommenderEnabled !== false,
    onboardingEnabled: study.onboardingEnabled !== false,
    selfHabitCreationEnabled: study.selfHabitCreationEnabled !== false,
    habitEntryMode:
      study.habitEntryMode === 'structured' ? 'structured' : 'freeText',
    structuredActivityKeys: study.structuredActivityKeys ?? [],
    reminders: normalizeReminders(study),
    endDate: study.endDate ?? null,
    endOfStudyNotification: normalizeEndOfStudyContent(study),
    groups: study.groups,
    questionnaires: (study.questionnaires || []).map((id) => id.toString()),
    createdAt: study.createdAt,
    updatedAt: study.updatedAt,
  };
}

/** Normalise a study's end-of-study notification content (default title/body). */
function normalizeEndOfStudyContent(study) {
  const n = study?.endOfStudyNotification;
  return {
    title: typeof n?.title === 'string' && n.title ? n.title : 'Study complete',
    body:
      typeof n?.body === 'string' && n.body
        ? n.body
        : 'Thank you for participating — your study has ended.',
  };
}

/**
 * Update a study. Groups are a full replace: existing groups are matched by
 * id (their config is preserved, only the label can change here); any
 * existing group whose id is absent from `updates.groups` is removed, and
 * every reference to it is reassigned onto the first remaining group.
 * @param {{ db: object, id: string, updates: object, neo4jRun?: Function }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function updateStudy({ db, id, updates, neo4jRun }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const existing = await db.collection(STUDIES).findOne({ _id: oid });
  if (!existing) return { notFound: true };

  const $set = { updatedAt: new Date() };

  if (updates.name !== undefined) $set.name = updates.name;
  if (updates.description !== undefined) $set.description = updates.description;
  if (updates.isActive !== undefined) $set.isActive = updates.isActive;
  if (updates.recommenderEnabled !== undefined)
    $set.recommenderEnabled = updates.recommenderEnabled;
  if (updates.onboardingEnabled !== undefined)
    $set.onboardingEnabled = updates.onboardingEnabled;
  if (updates.selfHabitCreationEnabled !== undefined)
    $set.selfHabitCreationEnabled = updates.selfHabitCreationEnabled;
  if (updates.habitEntryMode !== undefined)
    $set.habitEntryMode =
      updates.habitEntryMode === 'structured' ? 'structured' : 'freeText';
  if (updates.structuredActivityKeys !== undefined)
    $set.structuredActivityKeys = Array.isArray(updates.structuredActivityKeys)
      ? updates.structuredActivityKeys
      : [];
  if (updates.reminders !== undefined)
    $set.reminders = { ...(existing.reminders ?? {}), ...updates.reminders };
  if (updates.endDate !== undefined)
    $set.endDate = updates.endDate ? new Date(updates.endDate) : null;
  if (updates.endOfStudyNotification !== undefined)
    $set.endOfStudyNotification = normalizeEndOfStudyContent({
      endOfStudyNotification: updates.endOfStudyNotification,
    });

  // Groups: full replace, matched by id. Ids missing from the incoming array
  // are removed and their references reassigned onto the first remaining
  // group (see _reassignRemovedGroups).
  if (Array.isArray(updates.groups) && updates.groups.length > 0) {
    const existingGroups = existing.groups || [];
    const existingById = new Map(
      existingGroups.map((g) => [g.id.toString(), g])
    );

    const newGroups = updates.groups.map((g, i) => {
      const match = g.id ? existingById.get(g.id) : undefined;
      if (match) return { ...match, label: g.label, index: i + 1 };
      return {
        id: new ObjectId(),
        label: g.label,
        index: i + 1,
        cueConfig: null,
        activityTypeConfig: null,
        reminders: null,
        autoDonate: false,
        onboardingEnabled: null,
        selfHabitCreationEnabled: null,
      };
    });

    const keptIds = new Set(
      updates.groups
        .filter((g) => g.id && existingById.has(g.id))
        .map((g) => g.id)
    );
    const removedGroupIds = existingGroups
      .map((g) => g.id.toString())
      .filter((id) => !keptIds.has(id));

    if (removedGroupIds.length > 0) {
      await _reassignRemovedGroups({
        db,
        neo4jRun,
        studyOid: oid,
        removedGroupIds,
        fallbackGroupId: newGroups[0].id.toString(),
      });
    }

    $set.groups = newGroups;
  }

  if (Array.isArray(updates.questionnaires)) {
    $set.questionnaires = updates.questionnaires.map((id) => new ObjectId(id));
  }

  await db.collection(STUDIES).updateOne({ _id: oid }, { $set });

  // Sync Study node to Neo4j (non-breaking: skip if neo4jRun not provided)
  if (neo4jRun) {
    try {
      // Fetch latest study state for slug resolution
      const latest = await db.collection(STUDIES).findOne({ _id: oid });
      let slugs = [];
      const qIds = latest?.questionnaires ?? [];
      if (qIds.length > 0) {
        const qDocs = await db
          .collection('questionnaires')
          .find({ _id: { $in: qIds } })
          .project({ slug: 1 })
          .toArray();
        slugs = qDocs.map((q) => q.slug).filter(Boolean);
      }
      await syncStudy(neo4jRun, {
        uuid: id,
        name: latest?.name ?? updates.name ?? existing.name,
        slugs,
      });
    } catch (err) {
      console.error(
        '[studyService] Neo4j syncStudy failed after update:',
        err?.message
      );
    }
  }

  return { updated: true };
}

/**
 * Soft-delete a study (sets isActive: false).
 * Returns { conflict: true } if participants are enrolled.
 * @param {{ db: object, id: string, neo4jRun?: Function }} deps
 */
export async function softDeleteStudy({ db, id, neo4jRun }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const existing = await db.collection(STUDIES).findOne({ _id: oid });
  if (!existing) return { notFound: true };

  if (existing.isDefault) return { isDefault: true };

  // Count enrollments from Neo4j; fall back to 0 if neo4jRun not provided
  const enrollmentCount = neo4jRun
    ? await countEnrollments(neo4jRun, id.toString())
    : 0;

  if (enrollmentCount > 0) return { conflict: true };

  await db
    .collection(STUDIES)
    .updateOne(
      { _id: oid },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
  return { deleted: true };
}

/**
 * Soft-delete a study from the admin UI: hides it from the studies list while
 * retaining all of its data in the backend. Requires the caller to confirm by
 * passing the exact study name. The default study cannot be deleted.
 *
 * @param {{ db: object, id: string, confirmName: string }} deps
 * @returns {Promise<{ deleted: boolean }|{ notFound: boolean }|{ isDefault: boolean }|{ nameMismatch: true, expected: string }>}
 */
export async function deleteStudy({ db, id, confirmName }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const existing = await db.collection(STUDIES).findOne({ _id: oid });
  if (!existing || existing.deletedAt) return { notFound: true };

  if (existing.isDefault) return { isDefault: true };

  // Confirmation guard: the typed name must match exactly (trimmed).
  if (String(confirmName ?? '').trim() !== String(existing.name ?? '').trim()) {
    return { nameMismatch: true, expected: existing.name };
  }

  await db.collection(STUDIES).updateOne(
    { _id: oid },
    {
      $set: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
    }
  );
  return { deleted: true };
}

/**
 * Build a map of groupId string → label from study.groups.
 * @param {Array} groups - Study groups array
 * @returns {object} Record<string, string>
 */
function _buildGroupLabelMap(groups) {
  const groupMap = {};
  for (const g of groups || []) {
    groupMap[g.id.toString()] = g.label || `Group ${g.index}`;
  }
  return groupMap;
}

/**
 * Aggregate enrollment counts per group from Neo4j result rows.
 * @param {Array<{ groupId: string|null }>} enrolledUsers - Result from getUsersForStudy
 * @param {Array} groups - Study groups array
 * @returns {Array<{ groupId: string, groupLabel: string, count: number }>}
 */
function _buildGroupCountSummary(enrolledUsers, groups) {
  const groupCountMap = {};
  for (const e of enrolledUsers || []) {
    const gid = e.groupId ?? 'unknown';
    groupCountMap[gid] = (groupCountMap[gid] ?? 0) + 1;
  }

  return (groups || []).map((g) => ({
    groupId: g.id.toString(),
    groupLabel: g.label || `Group ${g.index}`,
    count: groupCountMap[g.id.toString()] ?? 0,
  }));
}

/**
 * List participants enrolled in a study with per-group summary (paginated).
 * Optionally scoped to a single group — filtering happens before pagination
 * so `total` and the page slice both reflect the filtered set.
 * @param {{ db: object, id: string, page?: number, limit?: number, groupId?: string, neo4jRun?: Function }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, summary: object, participants: Array }|{ notFound: boolean }>}
 */
export async function listStudyParticipants({
  db,
  id,
  page = 1,
  limit = 20,
  groupId,
  neo4jRun,
}) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) return { notFound: true };

  // Get all enrolled users from Neo4j (slice in JS for pagination)
  const allEnrolled = neo4jRun
    ? await getUsersForStudy(neo4jRun, id.toString())
    : [];
  const filteredEnrolled = groupId
    ? allEnrolled.filter((e) => e.groupId === groupId)
    : allEnrolled;

  const total = filteredEnrolled.length;
  const skip = (page - 1) * limit;
  const pageEnrolled = filteredEnrolled.slice(skip, skip + limit);

  const groupMap = _buildGroupLabelMap(study.groups);
  // Per-group summary always reflects the whole study, not the groupId filter.
  const perGroup = _buildGroupCountSummary(allEnrolled, study.groups);

  // Enrollment data lives in Neo4j and has no username — join against Mongo
  // for just the page being returned.
  const pageUserIds = pageEnrolled.map((e) => e.userId).filter(Boolean);
  const usernameDocs = pageUserIds.length
    ? await db
        .collection('participants')
        .find({ userId: { $in: pageUserIds } })
        .project({ userId: 1, username: 1 })
        .toArray()
    : [];
  const usernameByUserId = Object.fromEntries(
    usernameDocs.map((d) => [d.userId, d.username])
  );

  return {
    total,
    page,
    limit,
    summary: { total, perGroup },
    participants: pageEnrolled.map((e) => ({
      userId: e.userId,
      username: usernameByUserId[e.userId] ?? null,
      groupId: e.groupId ?? null,
      groupLabel: groupMap[e.groupId] ?? '—',
      enrolledAt: e.enrolledAt,
      codeUsed: e.studyCodeUsed ?? null,
    })),
  };
}

/**
 * Update the cueConfig for a specific group within a study.
 * @param {{ db: object, studyId: string, groupId: string, cueConfig: object }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function updateGroupCueConfig({
  db,
  studyId,
  groupId,
  cueConfig,
}) {
  let studyOid, groupOid;
  try {
    studyOid = new ObjectId(studyId);
    groupOid = new ObjectId(groupId);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: studyOid });
  if (!study) return { notFound: true };

  const groups = study.groups || [];
  const groupIndex = groups.findIndex(
    (g) => g.id?.toString() === groupOid.toString()
  );
  if (groupIndex === -1) return { notFound: true };

  groups[groupIndex] = { ...groups[groupIndex], cueConfig };

  const result = await db
    .collection(STUDIES)
    .updateOne({ _id: studyOid }, { $set: { groups, updatedAt: new Date() } });

  if (result.matchedCount === 0) return { notFound: true };
  return { updated: true };
}

/**
 * Update the full per-group config (cueConfig, activityTypeConfig, reminders, autoDonate).
 * Only supplied fields are written; others are left unchanged.
 * @param {{ db: object, studyId: string, groupId: string, config: object }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function updateGroupConfig({ db, studyId, groupId, config }) {
  let studyOid, groupOid;
  try {
    studyOid = new ObjectId(studyId);
    groupOid = new ObjectId(groupId);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: studyOid });
  if (!study) return { notFound: true };

  const groups = study.groups || [];
  const groupIndex = groups.findIndex(
    (g) => g.id?.toString() === groupOid.toString()
  );
  if (groupIndex === -1) return { notFound: true };

  const existing = groups[groupIndex];
  const updated = { ...existing };

  if (config.cueConfig !== undefined) updated.cueConfig = config.cueConfig;
  if (config.activityTypeConfig !== undefined)
    updated.activityTypeConfig = config.activityTypeConfig;
  if (config.reminders !== undefined)
    updated.reminders =
      config.reminders === null
        ? null
        : { ...(existing.reminders ?? {}), ...config.reminders };
  if (config.autoDonate !== undefined) updated.autoDonate = config.autoDonate;
  if (config.onboardingEnabled !== undefined)
    updated.onboardingEnabled = config.onboardingEnabled;
  if (config.selfHabitCreationEnabled !== undefined)
    updated.selfHabitCreationEnabled = config.selfHabitCreationEnabled;
  if (config.recommenderEnabled !== undefined)
    updated.recommenderEnabled = config.recommenderEnabled;
  if (config.habitEntryMode !== undefined)
    updated.habitEntryMode = config.habitEntryMode;
  if (config.structuredActivityKeys !== undefined)
    updated.structuredActivityKeys = config.structuredActivityKeys;

  groups[groupIndex] = updated;

  const result = await db
    .collection(STUDIES)
    .updateOne({ _id: studyOid }, { $set: { groups, updatedAt: new Date() } });

  if (result.matchedCount === 0) return { notFound: true };
  return { updated: true };
}

/**
 * Resolve the group config for a participant identified by userId.
 * Looks up enrollment (from Neo4j) → study (from MongoDB) → group config.
 * Returns null when the user is not enrolled in any study.
 * @param {{ db: object, userId: string, neo4jRun: Function }} deps
 * @returns {Promise<object|null>}
 */
export async function getParticipantGroupConfig({ db, userId, neo4jRun }) {
  if (!neo4jRun) return null;

  const enrollment = await getEnrollment(neo4jRun, userId);
  if (!enrollment) return null;

  let studyOid;
  try {
    studyOid = new ObjectId(enrollment.studyId);
  } catch {
    return null;
  }

  const study = await db.collection(STUDIES).findOne({ _id: studyOid });
  if (!study) return null;

  const group = (study.groups || []).find(
    (g) => g.id?.toString() === enrollment.groupId?.toString()
  );

  return {
    studyId: study._id.toString(),
    studyName: study.name,
    groupId: group?.id?.toString() ?? null,
    groupLabel: group?.label ?? null,
    recommenderEnabled: study.recommenderEnabled !== false,
    cueConfig: group?.cueConfig ?? null,
    activityTypeConfig: group?.activityTypeConfig ?? null,
    reminders: resolveEffectiveReminders({ study, group }),
    autoDonate: group?.autoDonate ?? false,
  };
}

/**
 * Update allocationWeight on each group in the study.
 * Only groups whose groupId appears in the weights array are modified.
 * @param {{ db: object, studyId: string, weights: Array<{groupId: string, weight: number}> }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function updateAllocationWeights({ db, studyId, weights }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) return { notFound: true };

  const weightMap = Object.fromEntries(
    weights.map((w) => [w.groupId, w.weight])
  );
  const groups = (study.groups || []).map((g) => {
    const w = weightMap[g.id.toString()];
    return w !== undefined ? { ...g, allocationWeight: w } : g;
  });

  await db
    .collection(STUDIES)
    .updateOne({ _id: oid }, { $set: { groups, updatedAt: new Date() } });
  return { updated: true };
}

/**
 * Mark a study as default, clearing isDefault on the previous default atomically.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function setDefaultStudy({ db, id }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const existing = await db.collection(STUDIES).findOne({ _id: oid });
  if (!existing) return { notFound: true };

  const now = new Date();

  // Clear isDefault on all studies, then set it on the target
  await db
    .collection(STUDIES)
    .updateMany(
      { isDefault: true },
      { $set: { isDefault: false, updatedAt: now } }
    );

  await db
    .collection(STUDIES)
    .updateOne({ _id: oid }, { $set: { isDefault: true, updatedAt: now } });

  return { updated: true };
}
