import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import {
  getUsersForStudy,
  countEnrollments,
  getEnrollment,
  syncStudy,
} from './enrollmentNeo4j.js';

/**
 * List all studies with participant count per study (paginated).
 * @param {{ db: object, page?: number, limit?: number }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, studies: Array }>}
 */
export async function listStudies({ db, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const studies = await db
    .collection(STUDIES)
    .find()
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

  const total = await db.collection(STUDIES).countDocuments();

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
  neo4jRun,
}) {
  const now = new Date();
  const studyGroups = groups.map((g, i) => ({
    id: new ObjectId(),
    label: g.label,
    index: i + 1,
    cueConfig: g.cueConfig ?? null,
    activityTypeConfig: g.activityTypeConfig ?? null,
    reminderConfig: g.reminderConfig ?? null,
    autoDonate: g.autoDonate ?? false,
  }));
  const questionnaireIds = questionnaires.map((id) => new ObjectId(id));

  const doc = {
    name,
    description,
    isDefault: false,
    isActive: true,
    recommenderEnabled: recommenderEnabled !== false,
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
      console.error('[studyService] Neo4j syncStudy failed after create:', err?.message);
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
    groups: study.groups,
    questionnaires: (study.questionnaires || []).map((id) => id.toString()),
    createdAt: study.createdAt,
    updatedAt: study.updatedAt,
  };
}

/**
 * Update a study. Groups are additive — existing groups are kept and new ones are appended.
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

  // Groups are additive: append new groups, keep existing ones
  if (Array.isArray(updates.groups) && updates.groups.length > 0) {
    const existingGroups = existing.groups || [];
    const existingLabels = new Set(existingGroups.map((g) => g.label));
    const newGroups = updates.groups
      .filter((g) => !existingLabels.has(g.label))
      .map((g, i) => ({
        id: new ObjectId(),
        label: g.label,
        index: existingGroups.length + i + 1,
        cueConfig: g.cueConfig ?? null,
        activityTypeConfig: g.activityTypeConfig ?? null,
        reminderConfig: g.reminderConfig ?? null,
        autoDonate: g.autoDonate ?? false,
      }));
    $set.groups = [...existingGroups, ...newGroups];
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
        name: latest?.name ?? (updates.name ?? existing.name),
        slugs,
      });
    } catch (err) {
      console.error('[studyService] Neo4j syncStudy failed after update:', err?.message);
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
 * @param {{ db: object, id: string, page?: number, limit?: number, neo4jRun?: Function }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, summary: object, participants: Array }|{ notFound: boolean }>}
 */
export async function listStudyParticipants({
  db,
  id,
  page = 1,
  limit = 20,
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

  const total = allEnrolled.length;
  const skip = (page - 1) * limit;
  const pageEnrolled = allEnrolled.slice(skip, skip + limit);

  const groupMap = _buildGroupLabelMap(study.groups);
  const perGroup = _buildGroupCountSummary(allEnrolled, study.groups);

  return {
    total,
    page,
    limit,
    summary: { total, perGroup },
    participants: pageEnrolled.map((e) => ({
      userId: e.userId,
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
 * Update the full per-group config (cueConfig, activityTypeConfig, reminderConfig, autoDonate).
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
  if (config.reminderConfig !== undefined)
    updated.reminderConfig = config.reminderConfig;
  if (config.autoDonate !== undefined) updated.autoDonate = config.autoDonate;

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
    reminderConfig: group?.reminderConfig ?? null,
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
