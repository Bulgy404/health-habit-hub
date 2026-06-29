import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';

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
 * @param {{ db: object, name: string, description?: string, groups: Array<{label: string}>, questionnaires?: string[] }} deps
 * @returns {Promise<object>} The created study document.
 */
export async function createStudy({
  db,
  name,
  description = null,
  groups = [],
  questionnaires = [],
  recommenderEnabled = true,
}) {
  const now = new Date();
  const studyGroups = groups.map((g, i) => ({
    id: new ObjectId(),
    label: g.label,
    index: i + 1,
    cueConfig: g.cueConfig ?? null,
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
 * @param {{ db: object, id: string, updates: object }} deps
 * @returns {Promise<{ updated: boolean }|{ notFound: boolean }>}
 */
export async function updateStudy({ db, id, updates }) {
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
      }));
    $set.groups = [...existingGroups, ...newGroups];
  }

  if (Array.isArray(updates.questionnaires)) {
    $set.questionnaires = updates.questionnaires.map((id) => new ObjectId(id));
  }

  await db.collection(STUDIES).updateOne({ _id: oid }, { $set });
  return { updated: true };
}

/**
 * Soft-delete a study (sets isActive: false).
 * Returns { conflict: true } if participants are enrolled.
 * @param {{ db: object, id: string }} deps
 */
export async function softDeleteStudy({ db, id }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const existing = await db.collection(STUDIES).findOne({ _id: oid });
  if (!existing) return { notFound: true };

  if (existing.isDefault) return { isDefault: true };

  const enrollmentCount = await db
    .collection(ENROLLMENTS)
    .countDocuments({ studyId: oid });

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
 * Aggregate enrollment counts per group and return the per-group summary array.
 * @param {object} db
 * @param {ObjectId} studyOid
 * @param {Array} groups - Study groups array
 * @returns {Promise<Array<{ groupId: string, groupLabel: string, count: number }>>}
 */
async function _buildGroupCountSummary(db, studyOid, groups) {
  const groupCounts = await db
    .collection(ENROLLMENTS)
    .aggregate([
      { $match: { studyId: studyOid } },
      { $group: { _id: '$groupId', count: { $sum: 1 } } },
    ])
    .toArray();

  return (groups || []).map((g) => {
    const found = groupCounts.find(
      (c) => c._id?.toString() === g.id.toString()
    );
    return {
      groupId: g.id.toString(),
      groupLabel: g.label || `Group ${g.index}`,
      count: found?.count ?? 0,
    };
  });
}

/**
 * List participants enrolled in a study with per-group summary (paginated).
 * @param {{ db: object, id: string, page?: number, limit?: number }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, summary: object, participants: Array }|{ notFound: boolean }>}
 */
export async function listStudyParticipants({ db, id, page = 1, limit = 20 }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) return { notFound: true };

  const total = await db
    .collection(ENROLLMENTS)
    .countDocuments({ studyId: oid });

  const skip = (page - 1) * limit;
  const enrollments = await db
    .collection(ENROLLMENTS)
    .find({ studyId: oid })
    .sort({ enrolledAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const groupMap = _buildGroupLabelMap(study.groups);
  const perGroup = await _buildGroupCountSummary(db, oid, study.groups);

  return {
    total,
    page,
    limit,
    summary: { total, perGroup },
    participants: enrollments.map((e) => ({
      userId: e.userId,
      groupId: e.groupId?.toString() ?? null,
      groupLabel: groupMap[e.groupId?.toString()] ?? '—',
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
