import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';

/**
 * List all studies with participant count per study (paginated).
 * @param {{ db: object, page?: number, limit?: number }} deps
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
}) {
  const now = new Date();
  const studyGroups = groups.map((g, i) => ({
    id: new ObjectId(),
    label: g.label,
    index: i + 1,
  }));
  const questionnaireIds = questionnaires.map((id) => new ObjectId(id));

  const doc = {
    name,
    description,
    isDefault: false,
    isActive: true,
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
    groups: study.groups,
    questionnaires: (study.questionnaires || []).map((id) => id.toString()),
    createdAt: study.createdAt,
    updatedAt: study.updatedAt,
  };
}

/**
 * Update a study. Groups are additive (existing groups are kept).
 * @param {{ db: object, id: string, updates: object }} deps
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
 * Mark a study as default, clearing isDefault on the previous default atomically.
 * @param {{ db: object, id: string }} deps
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
